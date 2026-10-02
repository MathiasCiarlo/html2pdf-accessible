const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const init = require("@html2pdf-skia/canvaskit-pdf");
const { verify } = require("../../../scripts/canvaskit/verify.cjs");

test("source-built CanvasKit embeds tagged text and survives resource disposal", async () => {
  await verify();
  const kit = await init({
    locateFile: (file) =>
      path.join(
        path.dirname(require.resolve("@html2pdf-skia/canvaskit-pdf")),
        file
      ),
  });
  assert.throws(
    () => kit.MakePDFDocument({ rootTag: { type: "multiple names" } }),
    /Invalid PDF name/
  );
  assert.throws(
    () =>
      kit.MakePDFDocument({
        rootTag: { type: "Document", children: [{ id: 1 }, { id: 1 }] },
      }),
    /Duplicate PDF structure ID/
  );
  const provider = kit.TypefaceFontProvider.Make();
  const bytes = await fs.readFile(
    path.join(__dirname, "../assets/Inter-Regular.ttf")
  );
  provider.registerFont(bytes, "Inter");
  const typeface = provider.matchFamilyStyle("Inter", {
    weight: 400,
    width: 5,
    slant: 0,
  });
  assert(typeface);
  assert(kit.GetTypefaceId(typeface) > 0);
  const font = new kit.Font(typeface, 12);
  const paint = new kit.Paint();
  const doc = kit.MakePDFDocument({
    title: "Source build",
    rootTag: {
      id: 1,
      type: "Document",
      children: [{ id: 2, type: "P" }],
    },
  });
  assert.throws(() => doc.endPage(), /No open PDF page/);
  assert.throws(() => doc.beginPage(NaN, 842), /Invalid PDF page/);
  const canvas = doc.beginPage(595, 842);
  assert.throws(() => doc.close(), /Invalid PDF close/);
  kit.SetPDFTagId(canvas, 2);
  canvas.drawText("Tagged text", 20, 30, paint, font);
  doc.endPage();
  const pdf = doc.close();
  const snapshot = Buffer.from(pdf);
  assert.throws(() => doc.beginPage(595, 842), /Invalid PDF page/);
  doc.delete();
  paint.delete();
  font.delete();
  typeface.delete();
  provider.delete();
  assert(snapshot.equals(Buffer.from(pdf)), "PDF data outlives its C++ stream");
  const text = snapshot.toString("latin1");
  assert(text.startsWith("%PDF-"));
  assert(text.includes("/StructTreeRoot"));
  assert(text.includes("/ToUnicode"));
});
