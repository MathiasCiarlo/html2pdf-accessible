import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import { normalizeLogicalStructure } from "../../../src/pdf/logical-structure";
import { addLinkAnnotations } from "../../../src/pdf/link-annotations";
import {
  generateDocumentStructure,
  PDFStructureTag,
} from "../../../src/pdf/document-structure";

describe("Text and link structure", () => {
  it("keeps one root Document and paragraphs for standalone inline content", async () => {
    const pdf = await PDFDocument.create();
    const key = PDFName.of;
    const root = pdf.context.obj({ Type: "StructElem", S: "Document" });
    const rootRef = pdf.context.register(root);
    const body = pdf.context.obj({
      Type: "StructElem",
      S: "Document",
      P: rootRef,
    });
    const bodyRef = pdf.context.register(body);
    root.set(key("K"), bodyRef);
    const span = pdf.context.obj({
      Type: "StructElem",
      S: "Span",
      P: bodyRef,
      K: 7,
    });
    const spanRef = pdf.context.register(span);
    const inline = pdf.context.obj({
      Type: "StructElem",
      S: "Span",
      P: spanRef,
      K: 8,
    });
    const inlineRef = pdf.context.register(inline);
    span.set(key("K"), pdf.context.obj([7, inlineRef]));
    const link = pdf.context.obj({
      Type: "StructElem",
      S: "Link",
      P: bodyRef,
      K: 9,
    });
    const linkRef = pdf.context.register(link);
    body.set(key("K"), pdf.context.obj([spanRef, linkRef]));
    normalizeLogicalStructure(pdf);
    expect(root.get(key("S"))).toBe(key("Document"));
    expect(body.get(key("S"))).toBe(key("Div"));
    expect(span.get(key("S"))).toBe(key("P"));
    expect(inline.get(key("S"))).toBe(key("Span"));
    expect(
      span.lookup(key("K"), PDFArray).lookup(0, PDFNumber).asNumber()
    ).toBe(7);
    const paragraph = link.lookup(key("P"), PDFDict);
    expect(paragraph.get(key("S"))).toBe(key("P"));
    expect(paragraph.get(key("K"))).toEqual(linkRef);
    expect(body.lookup(key("K"), PDFArray).get(1)).toEqual(link.get(key("P")));
    expect(link.lookup(key("K"), PDFNumber).asNumber()).toBe(9);
  });

  it("preserves a hierarchical ParentTree and associates each page annotation with its Link", async () => {
    const pdf = await PDFDocument.create();
    const pages = [pdf.addPage([595, 842]), pdf.addPage([595, 842])];
    const key = PDFName.of;
    const link = pdf.context.obj({ Type: "StructElem", S: "Link", K: 12 });
    const ref = pdf.context.register(link);
    const mcids = pdf.context.register(pdf.context.obj([ref]));
    const leaf = pdf.context.register(
      pdf.context.obj({ Nums: [4, mcids], Limits: [4, 4] })
    );
    const tree = pdf.context.obj({
      ParentTree: { Kids: [leaf] },
      ParentTreeNextKey: 0,
    });
    const oldAnnotation = pdf.context.register(
      pdf.context.obj({ Type: "Annot", Subtype: "Text" })
    );
    pages[0].node.set(key("Annots"), pdf.context.obj([oldAnnotation]));
    const tag: PDFStructureTag = {
      id: 1,
      type: "Link",
      linkUri: "https://example.com/tilbud",
      linkText: "Tilbud Ø",
      renderedBounds: [
        { pageIndex: 0, rect: [10, 20, 50, 40] },
        { pageIndex: 1, rect: [10, 700, 70, 720] },
      ],
    };
    addLinkAnnotations(
      pdf,
      tree,
      [{ tag, node: link, ref }],
      new Map([[1, tag]])
    );
    const nums = tree
      .lookup(key("ParentTree"), PDFDict)
      .lookup(key("Nums"), PDFArray);
    expect(nums.get(1)).toEqual(mcids);
    expect(nums.lookup(2, PDFNumber).asNumber()).toBe(5);
    expect(nums.get(3)).toEqual(ref);
    expect(nums.lookup(4, PDFNumber).asNumber()).toBe(6);
    expect(nums.get(5)).toEqual(ref);
    expect(tree.lookup(key("ParentTreeNextKey"), PDFNumber).asNumber()).toBe(7);
    expect(pages[0].node.lookup(key("Annots"), PDFArray).get(0)).toEqual(
      oldAnnotation
    );
    const annotation = pages[0].node
      .lookup(key("Annots"), PDFArray)
      .lookup(1, PDFDict);
    expect(
      annotation
        .lookup(key("A"), PDFDict)
        .lookup(key("URI"), PDFString)
        .asString()
    ).toBe(tag.linkUri);
    expect(annotation.lookup(key("Contents"), PDFHexString).decodeText()).toBe(
      "Tilbud Ø"
    );
    const children = link.lookup(key("K"), PDFArray);
    expect(children.lookup(0, PDFNumber).asNumber()).toBe(12);
    expect(children.lookup(1, PDFDict).get(key("Obj"))).toEqual(
      pages[0].node.lookup(key("Annots"), PDFArray).get(1)
    );
    expect(children.lookup(2, PDFDict).get(key("Pg"))).toEqual(pages[1].ref);
  });

  it("uses a page destination instead of a localhost URI for internal links", async () => {
    document.body.innerHTML =
      '<p><a href="#target">Detaljer</a></p><section id="target">Innhold</section>';
    const structure = generateDocumentStructure(document.body)
      .structure as PDFStructureTag;
    const linkTag = structure.children?.[0].children?.[0];
    const target = structure.children?.[1];
    expect(target?.isLinkDestination).toBe(true);
    expect(linkTag?.linkDestinationIdentifier).toBe(target?.elementIdentifier);
    if (
      !linkTag ||
      !target ||
      linkTag.id === undefined ||
      target.id === undefined
    )
      throw new Error("Missing fixture link tags");
    const pdf = await PDFDocument.create();
    pdf.addPage([595, 842]);
    const page = pdf.addPage([595, 842]);
    linkTag.renderedBounds = [{ pageIndex: 0, rect: [10, 700, 100, 720] }];
    target.renderedBounds = [{ pageIndex: 1, rect: [40, 600, 200, 700] }];
    const node = pdf.context.obj({ Type: "StructElem", S: "Link", K: 0 });
    const ref = pdf.context.register(node);
    addLinkAnnotations(
      pdf,
      pdf.context.obj({}),
      [{ tag: linkTag, node, ref }],
      new Map([
        [linkTag.id, linkTag],
        [target.id, target],
      ])
    );
    const annotation = pdf
      .getPages()[0]
      .node.lookup(PDFName.of("Annots"), PDFArray)
      .lookup(0, PDFDict);
    expect(annotation.has(PDFName.of("A"))).toBe(false);
    const destination = annotation.lookup(PDFName.of("Dest"), PDFArray);
    expect(destination.get(0)).toEqual(page.ref);
    expect(destination.lookup(3, PDFNumber).asNumber()).toBe(700);
  });
});
