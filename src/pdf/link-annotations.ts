import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  PDFObject,
} from "pdf-lib";
import { PDFStructureTag } from "./document-structure";

/** Link text, annotation, OBJR and ParentTree must describe the same action. */
export function addLinkAnnotations(
  pdf: PDFDocument,
  tree: PDFDict,
  links: { tag: PDFStructureTag; node: PDFDict; ref: PDFRef }[],
  tags: Map<number, PDFStructureTag>
): void {
  if (!links.length) return;
  const key = PDFName.of;
  const entries = new Map<number, PDFObject>();
  const read = (node: PDFDict) => {
    const nums = node.lookupMaybe(key("Nums"), PDFArray);
    if (nums)
      for (let i = 0; i < nums.size(); i += 2)
        entries.set(nums.lookup(i, PDFNumber).asNumber(), nums.get(i + 1));
    const kids = node.lookupMaybe(key("Kids"), PDFArray);
    if (kids)
      for (const child of kids.asArray())
        read(pdf.context.lookup(child, PDFDict));
  };
  const previous = tree.lookupMaybe(key("ParentTree"), PDFDict);
  if (previous) read(previous);
  let nextKey = Math.max(
    tree.lookupMaybe(key("ParentTreeNextKey"), PDFNumber)?.asNumber() ?? 0,
    ...Array.from(entries.keys(), (n) => n + 1)
  );
  for (const { tag, node, ref } of links) {
    if (!tag.linkUri) continue;
    for (const bounds of tag.renderedBounds || []) {
      const page = pdf.getPages()[bounds.pageIndex];
      if (!page) throw new Error("Invalid link annotation page");
      const annotation = pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: bounds.rect,
        P: page.ref,
        F: 4,
        Border: [0, 0, 0],
        StructParent: nextKey,
        Contents: PDFHexString.fromText(tag.linkText || tag.linkUri),
        A: { S: "URI", URI: PDFString.of(tag.linkUri) },
      });
      if (tag.linkDestinationIdentifier) {
        const target = Array.from(tags.values()).find(
          (candidate) =>
            candidate.elementIdentifier === tag.linkDestinationIdentifier
        );
        const destination = target?.renderedBounds?.[0];
        if (!destination || !pdf.getPages()[destination.pageIndex])
          throw new Error("Internal PDF link destination was not rendered");
        annotation.delete(key("A"));
        annotation.set(
          key("Dest"),
          pdf.context.obj([
            pdf.getPages()[destination.pageIndex].ref,
            "XYZ",
            destination.rect[0],
            destination.rect[3],
            null,
          ])
        );
      }
      const annotationRef = pdf.context.register(annotation);
      const annotations = page.node.lookupMaybe(key("Annots"), PDFArray);
      const updated = pdf.context.obj(annotations?.asArray() || []);
      updated.push(annotationRef);
      page.node.set(key("Annots"), updated);
      page.node.set(key("Tabs"), key("S"));
      const children = node.get(key("K"));
      const resolvedChildren = node.lookup(key("K"));
      const contents =
        resolvedChildren instanceof PDFArray
          ? pdf.context.obj(resolvedChildren.asArray())
          : pdf.context.obj(children ? [children] : []);
      contents.push(
        pdf.context.obj({ Type: "OBJR", Obj: annotationRef, Pg: page.ref })
      );
      node.set(key("K"), contents);
      entries.set(nextKey++, ref);
    }
  }
  const nums = pdf.context.obj([]);
  for (const [index, value] of Array.from(entries).sort(([a], [b]) => a - b)) {
    nums.push(PDFNumber.of(index));
    nums.push(value);
  }
  tree.set(
    key("ParentTree"),
    pdf.context.register(pdf.context.obj({ Nums: nums }))
  );
  tree.set(key("ParentTreeNextKey"), PDFNumber.of(nextKey));
}
