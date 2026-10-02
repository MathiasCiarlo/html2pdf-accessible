/* Fixture trees are deliberately asserted to exist in these tests. */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  generateDocumentStructure,
  getPDFTagForElement,
  PDFStructureTag,
  STRUCTURE_MARKER_OWNER,
} from "../../../src/pdf/document-structure";
import { resolveTableHeaders } from "../../../src/pdf/table-headers";
import { finalizePDFStructure } from "../../../src/pdf/finalize-structure";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFRawStream,
  PDFHexString,
} from "pdf-lib";
import { TextEncoder, TextDecoder } from "util";

// jsdom does not install the Encoding API that modern browsers provide.
Object.defineProperty(globalThis, "TextEncoder", { value: TextEncoder });

function fixture(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("PDF document structure", () => {
  it("distinguishes standalone figures from inline text illustrations", () => {
    const root = fixture(
      '<div><img alt="Product"><svg aria-label="Logo"></svg><canvas></canvas></div><p>Text <img alt="Inline"><svg aria-label="Inline SVG"></svg></p><div><img data-placement="Inline" alt="Override"></div>'
    );
    const { structure } = generateDocumentStructure(root);
    const figures: PDFStructureTag[] = [];
    const collect = (tag: PDFStructureTag) => {
      if (tag.type === "Figure") figures.push(tag);
      tag.children?.forEach(collect);
    };
    collect(structure);
    expect(
      figures.map(
        (tag) =>
          tag.attributes?.find((attribute) => attribute.name === "Placement")
            ?.value
      )
    ).toEqual(["Block", "Block", "Block", "Inline", "Inline", "Inline"]);
    const image = root.querySelector("p img") as HTMLElement;
    image.style.display = "block";
    const { structure: blockStructure } = generateDocumentStructure(root);
    figures.length = 0;
    collect(blockStructure);
    expect(
      figures[3].attributes?.find((attribute) => attribute.name === "Placement")
        ?.value
    ).toBe("Block");
  });
  it("preserves negative artifact IDs instead of treating them as real content", () => {
    const root = fixture("<div></div>");
    const element = root.firstElementChild!;
    for (const id of [-8, -6, -1, 0, 12]) {
      element.setAttribute("data-x-pdf-tag-id", String(id));
      expect(getPDFTagForElement(element)).toBe(id);
    }
    element.setAttribute("data-x-pdf-tag-id", "node-12");
    expect(getPDFTagForElement(element)).toBeUndefined();
  });
  it("keeps DOM styling without serializing CSS classes or HTML IDs as PDF names", () => {
    const root = fixture(
      '<article id="quote / #" class="price-quote-report pdf-sheet no-break" data-v-test=""><p class="a b">Text</p></article>'
    );
    const { structure } = generateDocumentStructure(root);
    const article = structure.children![0] as PDFStructureTag;
    expect(
      article.attributes?.some(
        (attr) => attr.name === "Class" || attr.name === "ID"
      )
    ).toBe(false);
    expect(article.elementIdentifier).toBeDefined();
    expect(root.firstElementChild?.getAttribute("class")).toBe(
      "price-quote-report pdf-sheet no-break"
    );
    expect(root.firstElementChild?.hasAttribute("data-v-test")).toBe(true);
  });

  it("writes standard Table ownership, PDF scopes and spans", () => {
    const root = fixture(
      '<table><thead><tr><th scope="colgroup" colspan="2">Prices</th></tr></thead><tbody><tr><th scope="row" rowspan="0">Item</th><td>1</td></tr><tr><td>2</td></tr></tbody></table>'
    );
    const { structure, tagIdMap } = generateDocumentStructure(root);
    const tags = new Map<number, PDFStructureTag>();
    const walk = (tag: PDFStructureTag) => {
      tags.set(tag.id!, tag);
      tag.children?.forEach(walk);
    };
    walk(structure);
    const attributes = (selector: string) =>
      tags.get(tagIdMap.get(root.querySelector(selector)!)!)!.attributes;
    expect(attributes("thead th")).toEqual(
      expect.arrayContaining([
        { owner: "Table", name: "Scope", type: "name", value: "Column" },
        { owner: "Table", name: "ColSpan", type: "int", value: 2 },
      ])
    );
    expect(attributes("tbody th")).toEqual(
      expect.arrayContaining([
        { owner: "Table", name: "Scope", type: "name", value: "Row" },
        { owner: "Table", name: "RowSpan", type: "int", value: 2 },
      ])
    );
    expect(attributes("table")).toEqual([]);
  });

  it("associates columns and bounded categories, with an optional discount column", () => {
    for (const discount of [false, true]) {
      const n = discount ? 3 : 2;
      const root = fixture(`<table><thead><tr><th>Item</th><th>Price</th>${
        discount ? "<th>Discount</th>" : ""
      }</tr></thead><tbody>
        <tr><th colspan="${n}">Fruit</th></tr><tr><td>Apple</td><td>20</td>${
        discount ? "<td>10%</td>" : ""
      }</tr>
        <tr><th colspan="${n}">Vegetables</th></tr><tr><td>Carrot</td><td>30</td>${
        discount ? "<td>0%</td>" : ""
      }</tr></tbody></table>`);
      const info = resolveTableHeaders(root);
      const rows = root.querySelectorAll("tbody tr");
      expect(
        info.get(rows[1].children[1])?.headers.map((h) => h.textContent)
      ).toEqual(["Price", "Fruit"]);
      expect(
        info.get(rows[3].children[1])?.headers.map((h) => h.textContent)
      ).toEqual(["Price", "Vegetables"]);
      if (discount)
        expect(
          info.get(rows[1].children[2])?.headers.map((h) => h.textContent)
        ).toEqual(["Discount", "Fruit"]);
    }
  });

  it("resolves explicit headers within each table even with reused page IDs", () => {
    const table =
      '<table><tr><th id="item">Item</th><th id="price">Price</th></tr><tr><td headers="item">Apple</td><td headers="price">20</td></tr></table>';
    const root = fixture(table + table);
    const { structure } = generateDocumentStructure(root);
    const first = structure.children![0].children![0].children![0]
      .children![1] as PDFStructureTag;
    const second = structure.children![1].children![0].children![0]
      .children![1] as PDFStructureTag;
    expect(first.elementIdentifier).not.toBe(second.elementIdentifier);
    const info = resolveTableHeaders(root);
    root
      .querySelectorAll("table")
      .forEach((t) =>
        expect(info.get(t.querySelectorAll("td")[1])?.headers).toEqual([
          t.querySelectorAll("th")[1],
        ])
      );
  });

  it("rejects unresolved explicit headers instead of silently dropping associations", () => {
    const root = fixture(
      '<table><tr><th id="name">Name</th></tr><tr><td headers="missing">Apple</td></tr></table>'
    );
    expect(() => generateDocumentStructure(root)).toThrow(
      "must identify exactly one TH"
    );
  });

  it("tracks column positions across rowspans and excludes nested tables", () => {
    const root = fixture(
      '<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody><tr><th rowspan="2" scope="row">Apple</th><td>20</td></tr><tr><td>30<table><tr><th>Inner</th></tr><tr><td>Inner value</td></tr></table></td></tr></tbody></table>'
    );
    const info = resolveTableHeaders(root);
    const data = root
      .querySelectorAll("table")[0]
      .querySelectorAll("tbody > tr")[1].firstElementChild!;
    expect(info.get(data)?.headers.map((h) => h.textContent)).toEqual([
      "Price",
      "Apple",
    ]);
  });
});

describe("CanvasKit structure bridge", () => {
  it("writes figure boxes in PDF points and nested Unicode bookmarks with actual page destinations", async () => {
    const original = await PDFDocument.create();
    const firstPage = original.addPage([595, 842]);
    const secondPage = original.addPage([595, 842]);
    const makeNode = (id: number, type: string) =>
      original.context.register(
        original.context.obj({
          Type: "StructElem",
          S: type,
          A: [{ O: STRUCTURE_MARKER_OWNER, NodeId: id }],
        })
      );
    const heading = makeNode(1, "H1");
    const figure = makeNode(2, "Figure");
    original.context.lookup(figure, PDFDict).set(
      PDFName.of("A"),
      original.context.obj([
        { O: "Layout", Placement: "Inline" },
        { O: STRUCTURE_MARKER_OWNER, NodeId: 2 },
        { O: "Layout", Width: 99 },
      ])
    );
    const subheading = makeNode(3, "H2");
    original.catalog.set(
      PDFName.of("StructTreeRoot"),
      original.context.register(
        original.context.obj({
          Type: "StructTreeRoot",
          K: [heading, figure, subheading],
        })
      )
    );
    const root: PDFStructureTag = {
      id: 0,
      children: [
        {
          id: 1,
          type: "H1",
          elementIdentifier: "heading-1",
          bookmarkTitle: "Tilbud Ø",
          renderedBounds: [{ pageIndex: 0, rect: [40, 760, 300, 790] }],
        },
        {
          id: 2,
          type: "Figure",
          elementIdentifier: "figure-2",
          renderedBounds: [{ pageIndex: 0, rect: [50, 600, 70, 620] }],
        },
        {
          id: 3,
          type: "H2",
          elementIdentifier: "heading-3",
          bookmarkTitle: "Detaljer",
          renderedBounds: [{ pageIndex: 1, rect: [40, 700, 300, 730] }],
        },
      ],
    };
    const output = await PDFDocument.load(
      await finalizePDFStructure(
        await original.save({ useObjectStreams: false }),
        root
      )
    );
    const figureBox = output.context
      .lookup(figure, PDFDict)
      .lookup(PDFName.of("A"), PDFArray)
      .lookup(0, PDFDict);
    expect(figureBox.get(PDFName.of("O"))).toBe(PDFName.of("Layout"));
    expect(
      output.context
        .lookup(figure, PDFDict)
        .lookup(PDFName.of("A"), PDFArray)
        .size()
    ).toBe(1);
    expect(figureBox.get(PDFName.of("Placement"))).toBe(PDFName.of("Inline"));
    expect(figureBox.lookup(PDFName.of("Width"), PDFNumber).asNumber()).toBe(
      20
    );
    expect(
      figureBox
        .lookup(PDFName.of("BBox"), PDFArray)
        .asArray()
        .map((value) => (value as PDFNumber).asNumber())
    ).toEqual([50, 600, 70, 620]);
    const outline = output.catalog.lookup(PDFName.of("Outlines"), PDFDict);
    expect(outline.lookup(PDFName.of("Count"), PDFNumber).asNumber()).toBe(2);
    const top = outline.lookup(PDFName.of("First"), PDFDict);
    expect(top.lookup(PDFName.of("Title"), PDFHexString).decodeText()).toBe(
      "Tilbud Ø"
    );
    expect(top.lookup(PDFName.of("Dest"), PDFArray).get(0)).toEqual(
      firstPage.ref
    );
    const child = top.lookup(PDFName.of("First"), PDFDict);
    const destination = child.lookup(PDFName.of("Dest"), PDFArray);
    expect(destination.get(0)).toEqual(secondPage.ref);
    expect(destination.lookup(3, PDFNumber).asNumber()).toBe(730);
  });
  it("writes parseable XMP with escaped document metadata and the target PDF/UA identifier", async () => {
    const original = await PDFDocument.create();
    original.addPage([595, 842]);
    original.setTitle('Tilbud & <priser> "Ø"');
    original.setAuthor("Ola & Kari");
    original.catalog.set(PDFName.of("Lang"), PDFString.of("nb-NO"));
    const bytes = await finalizePDFStructure(await original.save(), {
      id: 0,
      type: "Document",
    });
    const output = await PDFDocument.load(bytes);
    const metadata = output.catalog.lookup(PDFName.of("Metadata"));
    if (!(metadata instanceof PDFRawStream))
      throw new Error("Expected an XMP stream");
    expect(metadata.dict.get(PDFName.of("Type"))).toBe(PDFName.of("Metadata"));
    expect(metadata.dict.get(PDFName.of("Subtype"))).toBe(PDFName.of("XML"));
    const xml = new TextDecoder().decode(metadata.getContents());
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.getElementsByTagName("dc:title")[0].textContent).toBe(
      'Tilbud & <priser> "Ø"'
    );
    expect(parsed.getElementsByTagName("pdfuaid:part")[0].textContent).toBe(
      "1"
    );
  });
  it("writes byte string IDs, an IDTree, and Headers arrays while keeping page streams intact", async () => {
    const original = await PDFDocument.create();
    const page = original.addPage([595, 842]);
    page.drawText("Apple 20");
    const name = PDFName.of;
    const makeNode = (id: number, type: string) =>
      original.context.obj({
        Type: "StructElem",
        S: type,
        A: [{ O: STRUCTURE_MARKER_OWNER, NodeId: id }],
      });
    const header = makeNode(1, "TH");
    const data = makeNode(2, "TD");
    data
      .lookup(PDFName.of("A"), PDFArray)
      .push(original.context.obj({ O: "Table", ColSpan: 2 }));
    const headerRef = original.context.register(header);
    const dataRef = original.context.register(data);
    const tree = original.context.obj({
      Type: "StructTreeRoot",
      K: [headerRef, dataRef],
    });
    original.catalog.set(
      name("StructTreeRoot"),
      original.context.register(tree)
    );
    const root: PDFStructureTag = {
      id: 0,
      children: [
        {
          id: 1,
          type: "TH",
          elementIdentifier: "html2pdf-1",
        } as PDFStructureTag,
        {
          id: 2,
          type: "TD",
          headerIdentifiers: ["html2pdf-1"],
        } as PDFStructureTag,
      ],
    };
    const before = await original.save({ useObjectStreams: false });
    const output = await PDFDocument.load(
      await finalizePDFStructure(before, root)
    );
    const resultHeader = output.context.lookup(headerRef, PDFDict);
    const resultData = output.context.lookup(dataRef, PDFDict);
    expect(resultHeader.lookup(name("ID"), PDFString).asString()).toBe(
      "html2pdf-1"
    );
    expect(resultHeader.has(name("A"))).toBe(false);
    const attrs = resultData.lookup(name("A"), PDFArray).lookup(0, PDFDict);
    expect(resultData.lookup(name("A"), PDFArray).size()).toBe(1);
    expect(attrs.lookup(name("ColSpan"), PDFNumber).asNumber()).toBe(2);
    expect(attrs.get(name("O"))).toBe(name("Table"));
    expect(
      attrs.lookup(name("Headers"), PDFArray).lookup(0, PDFString).asString()
    ).toBe("html2pdf-1");
    const names = output.catalog
      .lookup(name("StructTreeRoot"), PDFDict)
      .lookup(name("IDTree"), PDFDict)
      .lookup(name("Names"), PDFArray);
    expect(names.get(1)).toEqual(headerRef);
    expect(
      output
        .getPage(0)
        .node.lookup(name("MediaBox"), PDFArray)
        .lookup(2, PDFNumber)
        .asNumber()
    ).toBe(595);
    expect(output.getPage(0).node.get(name("Contents"))?.toString()).toBe(
      page.node.get(name("Contents"))?.toString()
    );
  });
});
