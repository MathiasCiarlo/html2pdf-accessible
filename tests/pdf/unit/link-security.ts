import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import {
  generateDocumentStructure,
  PDFStructureTag,
} from "../../../src/pdf/document-structure";
import { addLinkAnnotations } from "../../../src/pdf/link-annotations";

describe("PDF link URI policy", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,hello",
    "file:///example",
    "vbscript:example",
    "mailto:person@example.com",
    "ftp://example.com",
    "about:blank",
    "http://",
  ])("retains text but removes the action for %s", async (uri) => {
    const anchor = document.createElement("a");
    anchor.href = uri;
    anchor.textContent = "Visible link text";
    const tag = generateDocumentStructure(anchor).structure as PDFStructureTag;
    const link = tag;
    expect(link?.type).toBe("Span");
    expect(link?.linkUri).toBeUndefined();
    expect(anchor.textContent).toBe("Visible link text");

    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const node = pdf.context.obj({ Type: "StructElem", S: "Link", K: 0 });
    const ref = pdf.context.register(node);
    addLinkAnnotations(
      pdf,
      pdf.context.obj({}),
      [
        {
          tag: {
            type: "Link",
            linkUri: uri,
            renderedBounds: [{ pageIndex: 0, rect: [0, 0, 10, 10] }],
          },
          node,
          ref,
        },
      ],
      new Map()
    );
    expect(page.node.has(PDFName.of("Annots"))).toBe(false);
    expect(node.get(PDFName.of("S"))).toBe(PDFName.of("Span"));
  });

  it.each([
    "https://example.com/path",
    "HTTP://example.com/path",
    "/relative",
    "//example.com/path",
  ])("resolves and preserves allowed URLs: %s", async (href) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = "Link";
    const root = generateDocumentStructure(anchor).structure as PDFStructureTag;
    const tag = root;
    if (!tag) throw new Error("Missing link tag");
    expect(tag.type).toBe("Link");
    expect(tag.linkUri).toBe(anchor.href);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    tag.renderedBounds = [{ pageIndex: 0, rect: [0, 0, 10, 10] }];
    const node = pdf.context.obj({ Type: "StructElem", S: "Link", K: 0 });
    const ref = pdf.context.register(node);
    addLinkAnnotations(
      pdf,
      pdf.context.obj({}),
      [{ tag, node, ref }],
      new Map()
    );
    const annotation = page.node
      .lookup(PDFName.of("Annots"), PDFArray)
      .lookup(0, PDFDict);
    expect(
      annotation
        .lookup(PDFName.of("A"), PDFDict)
        .lookup(PDFName.of("URI"), PDFString)
        .asString()
    ).toBe(anchor.href);
  });
});
