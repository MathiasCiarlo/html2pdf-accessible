import { fillEmptyCaption } from "../../../src/pdf/hidden-captions";
import {
  generateDocumentStructure,
  PDFStructureTag,
} from "../../../src/pdf/document-structure";

describe("Clipped table captions", () => {
  it("keeps caption semantics and records text only for a zero clip", () => {
    document.body.innerHTML = `<table><caption style="position:absolute;clip:rect(0px, 0px, 0px, 0px);font-family:Inter;font-weight:600">Produkter i pristilbudet</caption><tbody><tr><td>Vare</td></tr></tbody></table>`;
    const table = document.querySelector("table");
    if (!table) throw new Error("Missing table fixture");
    const { structure } = generateDocumentStructure(table);
    const collect = (tag: PDFStructureTag): PDFStructureTag[] => [
      tag,
      ...(tag.children || []).flatMap(collect),
    ];
    const caption = collect(structure).find((tag) => tag.type === "Caption");
    expect(caption?.hiddenCaption).toEqual({
      text: "Produkter i pristilbudet",
      families: ["Inter"],
      weight: 600,
    });
    expect(caption?.elementIdentifier).toBeDefined();
    table.querySelector("caption")?.removeAttribute("style");
    const visible = generateDocumentStructure(table);
    expect(
      collect(visible.structure).find((tag) => tag.type === "Caption")
        ?.hiddenCaption
    ).toBeUndefined();
  });

  it("fills the original MCID and restores state before following visible text", () => {
    const source =
      "/Caption <</MCID 8>> BDC\nBT\nET\nEMC\n/P <</MCID 9>> BDC\nBT\n(visible text) Tj\nET\nEMC";
    const result = fillEmptyCaption(
      source,
      8,
      "/InterCaption",
      "<002A002B>",
      806
    );
    expect(result).toContain("BDC\nq\nBT\n3 Tr\n/InterCaption 12 Tf");
    expect(result).toContain("<002A002B> Tj\nET\nQ\nEMC");
    expect(result.slice(result.indexOf("/P "))).toBe(
      source.slice(source.indexOf("/P "))
    );
    expect((result.match(/\/MCID 8/g) || []).length).toBe(1);
  });

  it("does not overwrite a visible caption or a different MCID", () => {
    expect(() =>
      fillEmptyCaption(
        "/Caption <</MCID 8>> BDC BT (caption) Tj ET EMC",
        8,
        "/F1",
        "<01>",
        806
      )
    ).toThrow("Missing empty text object");
    expect(() =>
      fillEmptyCaption(
        "/Caption <</MCID 18>> BDC BT ET EMC",
        8,
        "/F1",
        "<01>",
        806
      )
    ).toThrow("Missing empty text object");
  });
});
