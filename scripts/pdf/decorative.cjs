const assert = require("node:assert/strict");
const {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFName,
  decodePDFRawStream,
} = require("pdf-lib");

async function checkDecorativeGraphics(page) {
  const result = await page.evaluate(async () => {
    const doc = document.getElementById("fixture").contentDocument;
    const images = [...doc.images];
    images.forEach((image) => image.setAttribute("alt", ""));
    doc
      .querySelectorAll("svg")
      .forEach((svg) => svg.setAttribute("aria-hidden", "true"));
    return {
      imageCount: images.length,
      bytes: Array.from(
        new Uint8Array(await (await window.exportFixture()).arrayBuffer())
      ),
    };
  });
  const bytes = new Uint8Array(result.bytes);
  const pdf = await PDFDocument.load(bytes);
  const key = PDFName.of;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFDict &&
      object.get(key("Type")) === key("StructElem")
    ) {
      assert.notEqual(
        object.get(key("S")),
        key("Artifact"),
        "Artifact in structure tree"
      );
      assert.notEqual(
        object.get(key("S")),
        key("Figure"),
        "Decorative graphic tagged as Figure"
      );
    }
  }
  let imagePaints = 0;
  for (const pdfPage of pdf.getPages()) {
    const contents = pdfPage.node.lookup(key("Contents"));
    const streams =
      contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const entry of streams) {
      const stream = pdf.context.lookup(entry);
      const content = Buffer.from(decodePDFRawStream(stream).decode()).toString(
        "latin1"
      );
      assert(
        !/\/Artifact\s*<<[^>]*\/MCID\b/.test(content),
        "Artifact has a tagged MCID"
      );
      imagePaints += [...content.matchAll(/\/\S+\s+Do\b/g)].length;
    }
  }
  assert(
    imagePaints >= result.imageCount,
    "Decorative images disappeared from rendering"
  );
  return bytes;
}

module.exports = { checkDecorativeGraphics };
