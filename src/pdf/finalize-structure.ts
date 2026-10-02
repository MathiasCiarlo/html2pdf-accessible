import { PDFTag } from "@html2pdf-skia/canvaskit-pdf";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from "pdf-lib";
import {
  PDFStructureTag,
  STRUCTURE_MARKER_NAME,
  STRUCTURE_MARKER_OWNER,
} from "./document-structure";
import { addXmpMetadata } from "./xmp-metadata";
import { addBookmarks } from "./bookmarks";
import { normalizeLogicalStructure } from "./logical-structure";
import { addLinkAnnotations } from "./link-annotations";
import { restoreHiddenCaptions } from "./hidden-captions";
import { IFontCollection } from "../fonts/interfaces";

/** Keep each native (revisionless) attribute owner in one dictionary.
 * Some consumers only inspect the first dictionary for a given owner.
 * Copy entries rather than mutating potentially shared native dictionaries.
 */
function addStructureAttribute(
  pdf: PDFDocument,
  node: PDFDict,
  added: PDFDict
): void {
  const key = PDFName.of;
  const previous = node.lookup(key("A"));
  const items =
    previous instanceof PDFArray
      ? previous.asArray()
      : previous
      ? [previous]
      : [];
  const merged = pdf.context.obj({});
  const retained = [];
  let insertionIndex: number | undefined;
  for (const item of items) {
    const attribute = pdf.context.lookup(item);
    if (attribute instanceof PDFNumber) {
      throw new Error("Unexpected revisioned CanvasKit structure attributes");
    }
    if (
      attribute instanceof PDFDict &&
      attribute.get(key("O")) === added.get(key("O"))
    ) {
      if (insertionIndex === undefined) insertionIndex = retained.length;
      for (const [name, value] of attribute.entries()) merged.set(name, value);
    } else retained.push(item);
  }
  for (const [name, value] of added.entries()) merged.set(name, value);
  retained.splice(insertionIndex ?? retained.length, 0, merged);
  node.set(key("A"), pdf.context.obj(retained));
}

/** Bridge the missing ID/Headers operations in Google SkPDF.
 * Also restore clipped captions as invisible, embedded-font text.
 */
export async function finalizePDFStructure(
  bytes: Uint8Array,
  root: PDFTag,
  fontCollection?: IFontCollection
): Promise<Uint8Array> {
  const tags = new Map<number, PDFStructureTag>();
  const collect = (tag: PDFStructureTag) => {
    if (tag.elementIdentifier || tag.headerIdentifiers) {
      if (tag.id === undefined)
        throw new Error("Missing PDF structure node ID");
      tags.set(tag.id, tag);
    }
    tag.children?.forEach(collect);
  };
  collect(root);
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  addXmpMetadata(pdf);
  normalizeLogicalStructure(pdf);
  const saveOptions = {
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: false,
  };
  if (!tags.size) return pdf.save(saveOptions);
  const key = PDFName.of;
  const tree = pdf.catalog.lookup(key("StructTreeRoot"), PDFDict);
  const nodes = new Map<number, { node: PDFDict; ref: PDFRef }>();
  // CanvasKit writes a separate /A dictionary for each attribute.
  for (const [ref, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFDict) ||
      object.get(key("Type")) !== key("StructElem")
    )
      continue;
    const attributes = object.lookup(key("A"));
    const items =
      attributes instanceof PDFArray
        ? attributes.asArray()
        : attributes
        ? [attributes]
        : [];
    const retained = [];
    for (const item of items) {
      const attribute = pdf.context.lookup(item);
      if (
        attribute instanceof PDFDict &&
        attribute.get(key("O")) === key(STRUCTURE_MARKER_OWNER)
      ) {
        const id = attribute
          .lookup(key(STRUCTURE_MARKER_NAME), PDFNumber)
          .asNumber();
        if (!tags.has(id) || nodes.has(id))
          throw new Error(`Invalid PDF structure marker ${id}`);
        nodes.set(id, { node: object, ref });
      } else retained.push(item);
    }
    if (retained.length) object.set(key("A"), pdf.context.obj(retained));
    else object.delete(key("A"));
  }
  const identifiers = new Map<string, PDFRef>();
  const links: { tag: PDFStructureTag; node: PDFDict; ref: PDFRef }[] = [];
  const headings: PDFStructureTag[] = [];
  for (const [id, { node, ref }] of nodes) {
    const tag = tags.get(id);
    if (!tag) throw new Error(`Unknown PDF structure node ${id}`);
    if (tag.elementIdentifier) {
      if (identifiers.has(tag.elementIdentifier))
        throw new Error("Duplicate PDF element identifier");
      node.set(key("ID"), PDFString.of(tag.elementIdentifier));
      identifiers.set(tag.elementIdentifier, ref);
    }
    if (tag.bookmarkTitle) headings.push(tag);
    if (tag.linkUri) links.push({ tag, node, ref });
    if (tag.type === "Figure" && tag.renderedBounds?.length === 1) {
      const box = tag.renderedBounds[0].rect;
      const attribute = pdf.context.obj({
        O: "Layout",
        BBox: box,
        Width: box[2] - box[0],
        Height: box[3] - box[1],
      });
      addStructureAttribute(pdf, node, attribute);
    }
  }
  for (const [id, { node }] of nodes) {
    const headers = tags.get(id)?.headerIdentifiers;
    if (!headers?.length) continue;
    for (const header of headers) {
      if (!identifiers.has(header))
        throw new Error(
          `Referenced PDF header '${header}' has no rendered structure element`
        );
    }
    const headerAttribute = pdf.context.obj({
      O: "Table",
      Headers: headers.map((header) => PDFString.of(header)),
    });
    addStructureAttribute(pdf, node, headerAttribute);
  }
  const names = pdf.context.obj([]);
  for (const [identifier, ref] of Array.from(identifiers).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    names.push(PDFString.of(identifier));
    names.push(ref);
  }
  if (identifiers.size)
    tree.set(
      key("IDTree"),
      pdf.context.register(pdf.context.obj({ Names: names }))
    );
  // Preserve source heading order, independently of the native object order.
  addLinkAnnotations(pdf, tree, links, tags);
  await restoreHiddenCaptions(pdf, nodes, tags, fontCollection);
  addBookmarks(
    pdf,
    Array.from(tags.values()).filter((tag) => headings.includes(tag))
  );
  return pdf.save(saveOptions);
}
