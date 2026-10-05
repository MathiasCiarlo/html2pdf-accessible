const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  PDFNumber,
  PDFString,
  PDFHexString,
  PDFRawStream,
  decodePDFRawStream,
} = require("pdf-lib");
const { XMLParser } = require("fast-xml-parser");
const canvas = require("@napi-rs/canvas");
Object.assign(global, {
  DOMMatrix: canvas.DOMMatrix,
  ImageData: canvas.ImageData,
  Path2D: canvas.Path2D,
});
const pdfjs = () => import("pdfjs-dist/legacy/build/pdf.mjs");

async function audit(filename, variant, browserFields) {
  const bytes = new Uint8Array(await fs.readFile(filename));
  const pdf = await PDFDocument.load(bytes, {
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  const key = PDFName.of,
    lookup = (value) => pdf.context.lookup(value);
  const list = (value) => {
    const object = lookup(value);
    return object instanceof PDFArray
      ? object.asArray()
      : object
      ? [object]
      : [];
  };
  const name = (dict, property) => dict.get(key(property))?.toString();
  const string = (value) => {
    const object = lookup(value);
    assert(object instanceof PDFString || object instanceof PDFHexString);
    return object.decodeText();
  };
  const tree = pdf.catalog.lookup(key("StructTreeRoot"), PDFDict);
  const nodes = [],
    ids = new Map(),
    headers = [];
  function contentPages(value, inherited) {
    const object = lookup(value);
    if (object instanceof PDFArray)
      return new Set(
        object.asArray().flatMap((child) => [...contentPages(child, inherited)])
      );
    if (object instanceof PDFNumber)
      return new Set(inherited ? [inherited.toString()] : []);
    if (!(object instanceof PDFDict)) return new Set();
    const page = object.get(key("Pg")) || inherited;
    if (name(object, "Type") === "/MCR")
      return new Set(page ? [page.toString()] : []);
    return contentPages(object.get(key("K")), page);
  }
  function walk(value) {
    const object = lookup(value);
    if (object instanceof PDFArray) return object.asArray().forEach(walk);
    if (!(object instanceof PDFDict) || name(object, "Type") !== "/StructElem")
      return;
    nodes.push(object);
    if (object.has(key("ID"))) {
      const id = string(object.get(key("ID")));
      assert(!ids.has(id), "Duplicate ID");
      ids.set(id, object);
    }
    const role = name(object, "S"),
      parent = object.lookup(key("P"), PDFDict);
    if (role === "/Document")
      assert.equal(name(parent, "Type"), "/StructTreeRoot");
    if (role === "/Span")
      assert(
        !["/Div", "/NonStruct", "/Sect", "/Art", "/Part", "/Document"].includes(
          name(parent, "S")
        )
      );
    let count = 0;
    const layouts = [];
    for (const value of list(object.get(key("A")))) {
      const attribute = lookup(value);
      if (!(attribute instanceof PDFDict)) continue;
      assert(!attribute.has(key("Class")), "CSS class leaked into PDF");
      assert.notEqual(name(attribute, "O"), "/html2pdf-skia");
      if (name(attribute, "O") === "/Layout") layouts.push(attribute);
      for (const property of ["Scope", "ColSpan", "RowSpan", "Headers"])
        if (attribute.has(key(property)))
          assert.equal(name(attribute, "O"), "/Table");
      if (attribute.has(key("Scope")))
        assert(["/Row", "/Column", "/Both"].includes(name(attribute, "Scope")));
      const values = list(attribute.get(key("Headers"))).map(string);
      headers.push(...values);
      count += values.length;
      if (attribute.has(key("BBox"))) {
        const box = attribute
          .lookup(key("BBox"), PDFArray)
          .asArray()
          .map((n) => lookup(n).asNumber());
        assert.equal(name(attribute, "O"), "/Layout");
        assert(
          box.length === 4 &&
            box[0] >= 0 &&
            box[1] >= 0 &&
            box[2] <= 595 &&
            box[3] <= 842 &&
            box[2] > box[0] &&
            box[3] > box[1]
        );
      }
      if (role === "/Figure" && name(attribute, "O") === "/Layout")
        assert(["/Block", "/Inline"].includes(name(attribute, "Placement")));
    }
    if (role === "/TD")
      assert(count > 0, "Data cell lacks header associations");
    if (role === "/Figure") {
      assert(object.has(key("Alt")), "Figure lacks alternative text");
      assert.equal(
        layouts.length,
        1,
        "Figure Layout attributes must share one dictionary"
      );
      if (contentPages(object).size === 1)
        assert(layouts[0].has(key("BBox")), "Single-page Figure lacks BBox");
    }
    list(object.get(key("K"))).forEach(walk);
  }
  walk(tree.get(key("K")));
  assert.equal(nodes.filter((n) => name(n, "S") === "/Document").length, 1);
  if (variant.startsWith("long"))
    assert(
      nodes.some(
        (node) => name(node, "S") === "/TH" && contentPages(node).size > 1
      ),
      "Repeated headers must retain one logical TH across pages"
    );
  for (const header of headers)
    assert.equal(
      name(ids.get(header), "S"),
      "/TH",
      `Unresolved header ${header}`
    );
  const idTree = tree
    .lookup(key("IDTree"), PDFDict)
    .lookup(key("Names"), PDFArray)
    .asArray();
  assert.equal(idTree.length, ids.size * 2);
  for (let i = 0; i < idTree.length; i += 2)
    assert.equal(lookup(idTree[i + 1]), ids.get(string(idTree[i])));
  const parents = new Map();
  function parentTree(value) {
    const node = lookup(value);
    const nums = list(node.get(key("Nums")));
    for (let i = 0; i < nums.length; i += 2)
      parents.set(lookup(nums[i]).asNumber(), lookup(nums[i + 1]));
    list(node.get(key("Kids"))).forEach(parentTree);
  }
  parentTree(tree.get(key("ParentTree")));
  for (const link of nodes.filter((n) => name(n, "S") === "/Link")) {
    const references = list(link.get(key("K")))
      .map(lookup)
      .filter((n) => n instanceof PDFDict && name(n, "Type") === "/OBJR");
    assert(references.length, "Missing Link OBJR");
    for (const reference of references) {
      const annotation = reference.lookup(key("Obj"), PDFDict);
      assert.equal(name(annotation, "Subtype"), "/Link");
      assert.equal(
        parents.get(
          annotation.lookup(key("StructParent"), PDFNumber).asNumber()
        ),
        link
      );
      const page = reference.lookup(key("Pg"), PDFDict);
      assert(
        list(page.get(key("Annots")))
          .map(lookup)
          .includes(annotation)
      );
      assert.equal(name(page, "Tabs"), "/S");
      assert(annotation.has(key("Contents")));
      assert(annotation.has(key("A")) || annotation.has(key("Dest")));
      if (variant === "discount") {
        const destination = annotation.lookup(key("Dest"), PDFArray);
        assert.equal(destination.get(0), pdf.getPages()[0].ref);
        assert.equal(destination.lookup(2, PDFNumber).asNumber(), 0);
        assert.equal(destination.lookup(3, PDFNumber).asNumber(), 842);
        assert(
          !annotation.has(key("A")),
          "Top link must use a PDF destination"
        );
      }
    }
  }
  if (variant === "discount")
    assert(
      nodes.some((node) => name(node, "S") === "/Link"),
      "Missing top link"
    );
  assert.equal(string(pdf.catalog.get(key("Lang"))), "nb-NO");
  for (const page of pdf.getPages()) {
    assert.equal(page.getWidth(), 595);
    assert.equal(page.getHeight(), 842);
  }
  const metadata = pdf.catalog.lookup(key("Metadata"), PDFRawStream);
  const xml = new XMLParser({ ignoreAttributes: false }).parse(
    Buffer.from(decodePDFRawStream(metadata).decode()).toString("utf8")
  );
  const description = xml["x:xmpmeta"]["rdf:RDF"]["rdf:Description"];
  assert.equal(String(description["pdfuaid:part"]), "1");
  assert.equal(
    description["dc:title"]["rdf:Alt"]["rdf:li"]["#text"],
    pdf.getTitle()
  );
  assert(pdf.catalog.has(key("Outlines")), "Missing bookmarks");
  const doc = await (
    await pdfjs()
  ).getDocument({ data: bytes, useSystemFonts: false }).promise;
  const pageCount = doc.numPages;
  assert.equal(pageCount, pdf.getPageCount());
  if (variant === "minimal") assert.equal(pageCount, 1);
  else if (variant.startsWith("long")) assert(pageCount > 2);
  else assert.equal(pageCount, 3);
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p),
      content = await page.getTextContent({ includeMarkedContent: true });
    assert(
      content.items.some((item) => item.str?.trim()),
      "Page has no text"
    );
    assert(
      !content.items.some((item) => item.str?.includes("Download test PDF"))
    );
    if (variant.startsWith("long"))
      assert(
        content.items.some((item) => item.str?.includes("Unit price")),
        "Repeated header missing"
      );
    const captions = (await page.getStructTree())?.children || [];
    assert(captions.length, "PDF.js cannot read structure tree");
    for (const caption of nodes.filter(
      (node) =>
        name(node, "S") === "/Caption" &&
        node.get(key("Pg")) === pdf.getPages()[p - 1].ref
    )) {
      const mcid = caption.lookup(key("K"), PDFNumber).asNumber();
      let active = false,
        captionText = "";
      for (const item of content.items) {
        if (item.type === "beginMarkedContentProps")
          active =
            item.tag === "Caption" &&
            Number(item.id?.match(/_mc(\d+)$/)?.[1]) === mcid;
        else if (item.type === "endMarkedContent") active = false;
        else if (active && item.str) captionText += item.str;
      }
      assert(
        captionText.includes("Items in this quotation"),
        "Caption MCID contains no meaningful text"
      );
    }
    if (p === 1) {
      assert(
        content.items.some((item) =>
          item.str?.includes("Items in this quotation")
        ),
        "Hidden caption has no extractable text"
      );
      for (const field of browserFields) {
        const box = field.box;
        const selected = content.items.filter(
          (item) =>
            item.str?.trim() &&
            item.transform[4] >= box.left * 0.75 - 1 &&
            item.transform[4] < box.right * 0.75 &&
            842 - item.transform[5] >= box.top * 0.75 &&
            842 - item.transform[5] < box.bottom * 0.75 + 3
        );
        const groups = [];
        for (const item of selected) {
          const y = item.transform[5];
          let group = groups.find((g) => Math.abs(g.y - y) < 1);
          if (!group) {
            group = { y, items: [] };
            groups.push(group);
          }
          group.items.push(item);
          assert(
            item.transform[4] + item.width <= box.right * 0.75 + 1,
            `${field.id} overflows column`
          );
        }
        const lines = groups
          .sort((a, b) => b.y - a.y)
          .map((g) =>
            g.items
              .sort((a, b) => a.transform[4] - b.transform[4])
              .map((i) => i.str)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
          );
        assert.deepEqual(
          lines,
          field.lines.map((l) => l.trim()),
          `Browser/PDF line mismatch: ${field.id}`
        );
      }
    }
  }
  await doc.destroy();
  return {
    variant,
    pages: pageCount,
    nodes: nodes.length,
    headers: headers.length,
    figures: nodes.filter((n) => name(n, "S") === "/Figure").length,
  };
}
module.exports = { audit, pdfjs };
