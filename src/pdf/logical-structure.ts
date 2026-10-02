import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from "pdf-lib";

/** Repair inline text directly inside grouping elements without changing MCIDs. */
export function normalizeLogicalStructure(pdf: PDFDocument): void {
  const key = PDFName.of;
  const groups = new Set([
    "Document",
    "Part",
    "Art",
    "Sect",
    "Div",
    "NonStruct",
  ]);
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFDict) ||
      object.get(key("Type")) !== key("StructElem")
    )
      continue;
    const parent = object.lookup(key("P"));
    if (
      !(parent instanceof PDFDict) ||
      parent.get(key("Type")) !== key("StructElem")
    )
      continue;
    const type = object.get(key("S"));
    const parentType = parent.get(key("S"));
    if (type === key("Document")) object.set(key("S"), key("Div"));
    if (
      !(parentType instanceof PDFName) ||
      !groups.has(parentType.decodeText())
    )
      continue;
    if (type === key("Span")) object.set(key("S"), key("P"));
    if (type === key("Link")) {
      const paragraph = pdf.context.obj({
        Type: "StructElem",
        S: "P",
        P: object.get(key("P")),
        K: ref,
      });
      const page = object.get(key("Pg"));
      if (page) paragraph.set(key("Pg"), page);
      const paragraphRef = pdf.context.register(paragraph);
      const children = parent.lookup(key("K"));
      if (children instanceof PDFArray) {
        const index = children
          .asArray()
          .findIndex(
            (child) =>
              child instanceof PDFRef && child.toString() === ref.toString()
          );
        if (index < 0) throw new Error("Link missing from structure parent");
        children.set(index, paragraphRef);
      } else if (
        children instanceof PDFDict &&
        parent.get(key("K"))?.toString() === ref.toString()
      ) {
        parent.set(key("K"), paragraphRef);
      } else throw new Error("Invalid Link structure parent");
      object.set(key("P"), paragraphRef);
    }
  }
}
