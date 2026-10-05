# Third-party notices

This file identifies third-party code distributed with the npm package. The
project's own MIT license is in [LICENSE](LICENSE).

| Component | License | License text or attribution |
| --- | --- | --- |
| html2pdf-skia / html2canvas upstream code | MIT | [LICENSE](LICENSE); upstream attribution in [README.md](README.md) |
| Skia CanvasKit 0.42.0 and its native dependencies | BSD-3-Clause and component-specific licenses | [Skia license](deps/canvaskit-pdf/LICENSE), [native dependency notices](deps/canvaskit-pdf/THIRD_PARTY_LICENSES.txt), and [Chromium PartitionAlloc license](deps/canvaskit-pdf/CHROMIUM-LICENSE) |
| `@html2pdf-skia/canvaskit-pdf` PDF bridge (`pdf_bindings.cpp`) | MIT | [Bridge source](deps/canvaskit-pdf/pdf_bindings.cpp) and [project license](LICENSE) |
| `pdf-lib`, `@pdf-lib/fontkit`, `css-line-break`, `emoji-regex-xs`, `text-segmentation` | MIT | Their npm package metadata and license files where supplied; these libraries are bundled into `lib/` |

The CanvasKit source revision, build inputs, and artifact hashes are recorded in
[provenance.json](deps/canvaskit-pdf/provenance.json). The CanvasKit license files
above are included in the npm package alongside the JavaScript and WASM files.
