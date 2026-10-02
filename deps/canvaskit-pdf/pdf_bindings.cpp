// Copyright 2026 html2pdf-skia contributors. SPDX-License-Identifier: MIT
// Small, reviewable bridge to Google's open-source SkPDF backend.
#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkStream.h"
#include "include/core/SkTypeface.h"
#include "include/docs/SkPDFDocument.h"
#include "include/codec/SkJpegDecoder.h"
#include "include/codec/SkCodec.h"
#include "include/encode/SkJpegEncoder.h"
#include <emscripten/bind.h>
#include <cmath>
#include <deque>
#include <limits>
#include <set>
#include <string>

namespace {
using emscripten::val;
[[noreturn]] void invalid(const char* message) {
    val::global("Error").new_(std::string(message)).throw_();
    __builtin_unreachable();
}
bool present(const val& value) { return !value.isUndefined() && !value.isNull(); }
std::string text(const val& object, const char* key, const char* fallback = "") {
    return present(object[key]) ? object[key].as<std::string>() : fallback;
}
std::string name(const val& object, const char* key, const char* fallback = "") {
    auto value = text(object, key, fallback);
    if (value.empty()) invalid("Empty PDF name");
    for (const unsigned char c : value) {
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.')) {
            invalid("Invalid PDF name");
        }
    }
    return value;
}
double number(const val& value) {
    if (value.typeOf().as<std::string>() != "number") invalid("Expected PDF number");
    const double result = value.as<double>();
    if (!std::isfinite(result)) invalid("Non-finite PDF number");
    return result;
}
int integer(const val& value) {
    const double result = number(value);
    if (result != std::trunc(result) || result < std::numeric_limits<int>::min() ||
        result > std::numeric_limits<int>::max()) invalid("Invalid PDF integer");
    return static_cast<int>(result);
}

class PDFDocument {
    // AttributeList retains char pointers: keep stable storage until document close.
    std::deque<std::string> names_;
    std::set<int> ids_;
    size_t nodes_ = 0;
    std::unique_ptr<SkPDF::StructureElementNode> root_;
    SkDynamicMemoryWStream stream_;
    sk_sp<SkDocument> document_;
    bool pageOpen_ = false;
    bool finished_ = false;

    const char* keep(std::string value) {
        names_.push_back(std::move(value));
        return names_.back().c_str();
    }
    std::unique_ptr<SkPDF::StructureElementNode> node(const val& tag, int depth) {
        if (depth > 128 || ++nodes_ > 50000) invalid("PDF structure limit exceeded");
        auto result = std::make_unique<SkPDF::StructureElementNode>();
        result->fTypeString = SkString(name(tag, "type", "Div"));
        result->fNodeId = present(tag["id"]) ? integer(tag["id"]) : 0;
        if (result->fNodeId > 0 && !ids_.insert(result->fNodeId).second)
            invalid("Duplicate PDF structure ID");
        result->fAlt = SkString(text(tag, "alt"));
        result->fLang = SkString(text(tag, "language"));
        if (present(tag["attributes"])) {
            const auto attributes = tag["attributes"];
            const unsigned count = attributes["length"].as<unsigned>();
            if (count > 1024) invalid("PDF attribute limit exceeded");
            for (unsigned i = 0; i < count; ++i) {
                const auto attribute = attributes[i];
                const char* owner = keep(name(attribute, "owner"));
                const char* key = keep(name(attribute, "name"));
                const auto type = text(attribute, "type");
                if (type == "int") {
                    result->fAttributes.appendInt(owner, key, integer(attribute["value"]));
                } else if (type == "float") {
                    const float value = static_cast<float>(number(attribute["value"]));
                    if (!std::isfinite(value)) invalid("PDF float overflow");
                    result->fAttributes.appendFloat(owner, key, value);
                } else if (type == "name") {
                    result->fAttributes.appendName(owner, key, keep(name(attribute, "value")));
                } else if (type == "string") {
                    result->fAttributes.appendTextString(owner, key, SkString(text(attribute, "value")));
                } else invalid("Unsupported PDF attribute type");
            }
        }
        if (present(tag["children"])) {
            const auto children = tag["children"];
            const unsigned count = children["length"].as<unsigned>();
            if (count > 50000) invalid("PDF child limit exceeded");
            for (unsigned i = 0; i < count; ++i)
                result->fChildVector.push_back(node(children[i], depth + 1));
        }
        return result;
    }
public:
    explicit PDFDocument(const val& options) {
        SkPDF::Metadata metadata;
        metadata.fTitle = SkString(text(options, "title"));
        metadata.fAuthor = SkString(text(options, "author"));
        metadata.fSubject = SkString(text(options, "subject"));
        metadata.fKeywords = SkString(text(options, "keywords"));
        metadata.fCreator = SkString(text(options, "creator"));
        metadata.fProducer = SkString(text(options, "producer", "html2pdf-skia / Google Skia"));
        metadata.fLang = SkString(text(options, "language"));
        if (present(options["rasterDPI"])) metadata.fRasterDPI = number(options["rasterDPI"]);
        if (metadata.fRasterDPI <= 0) invalid("Invalid PDF raster DPI");
        if (present(options["PDFA"])) metadata.fPDFA = options["PDFA"].as<bool>();
        metadata.jpegDecoder = [](sk_sp<const SkData> data) {
            return SkJpegDecoder::Decode(std::move(data), nullptr);
        };
        metadata.jpegEncoder = [](SkWStream* stream, const SkPixmap& pixmap, int quality) {
            SkJpegEncoder::Options options;
            options.fQuality = quality;
            return SkJpegEncoder::Encode(stream, pixmap, options);
        };
        if (present(options["rootTag"])) {
            root_ = node(options["rootTag"], 0);
            metadata.fStructureElementTreeRoot = root_.get();
        }
        document_ = SkPDF::MakeDocument(&stream_, metadata);
        if (!document_) invalid("Failed to create SkPDF document");
    }
    ~PDFDocument() { if (!finished_) document_->abort(); }
    SkCanvas* beginPage(double width, double height) {
        if (finished_ || pageOpen_ || !std::isfinite(width) || !std::isfinite(height) ||
            width <= 0 || height <= 0 || width > 14400 || height > 14400)
            invalid("Invalid PDF page or lifecycle");
        pageOpen_ = true;
        return document_->beginPage(width, height);
    }
    void endPage() {
        if (finished_ || !pageOpen_) invalid("No open PDF page");
        document_->endPage();
        pageOpen_ = false;
    }
    val close() {
        if (finished_ || pageOpen_) invalid("Invalid PDF close");
        document_->close();
        finished_ = true;
        auto data = stream_.detachAsData();
        // Copy before the C++ buffer is destroyed; never return a dangling heap view.
        return val::global("Uint8Array").new_(val(emscripten::typed_memory_view(
            data->size(), static_cast<const uint8_t*>(data->data()))));
    }
    void abort() {
        if (!finished_) document_->abort();
        finished_ = true;
        pageOpen_ = false;
    }
};
}

EMSCRIPTEN_BINDINGS(html2pdf_pdf) {
    emscripten::class_<PDFDocument>("PDFDocument")
        .constructor<val>()
        .function("beginPage", &PDFDocument::beginPage, emscripten::allow_raw_pointers())
        .function("endPage", &PDFDocument::endPage)
        .function("close", &PDFDocument::close)
        .function("abort", &PDFDocument::abort);
    emscripten::function("MakePDFDocument", +[](val options) -> PDFDocument* {
        return new PDFDocument(options);
    }, emscripten::return_value_policy::take_ownership());
    emscripten::function("SetPDFTagId", &SkPDF::SetNodeId, emscripten::allow_raw_pointers());
    emscripten::function("GetTypefaceId", +[](SkTypeface* typeface) -> uint32_t {
        return typeface->uniqueID();
    }, emscripten::allow_raw_pointers());
}
