import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef } from "pdf-lib";
import { PDFStructureTag } from "./document-structure";

interface Bookmark {
  tag: PDFStructureTag;
  children: Bookmark[];
}

/** Follow the heading hierarchy and use the renderer's actual page positions. */
export function addBookmarks(
  pdf: PDFDocument,
  headings: PDFStructureTag[]
): void {
  const roots: Bookmark[] = [];
  const stack: { level: number; children: Bookmark[] }[] = [
    { level: 0, children: roots },
  ];
  for (const tag of headings) {
    if (!tag.bookmarkTitle || !tag.renderedBounds?.length) continue;
    const level = Number(tag.type?.slice(1)) || 1;
    while (stack.length > 1 && stack[stack.length - 1].level >= level)
      stack.pop();
    const bookmark: Bookmark = { tag, children: [] };
    stack[stack.length - 1].children.push(bookmark);
    stack.push({ level, children: bookmark.children });
  }
  if (!roots.length) return;
  const root = pdf.context.obj({ Type: "Outlines" });
  const rootRef = pdf.context.register(root);
  const key = PDFName.of;
  const addChildren = (
    parent: PDFDict,
    parentRef: PDFRef,
    bookmarks: Bookmark[]
  ): number => {
    const entries = bookmarks.map((bookmark) => {
      const bounds = bookmark.tag.renderedBounds?.[0];
      if (!bounds) throw new Error("Missing bookmark destination");
      const page = pdf.getPages()[bounds.pageIndex];
      if (!page) throw new Error("Invalid bookmark page");
      const node = pdf.context.obj({
        Title: PDFHexString.fromText(bookmark.tag.bookmarkTitle || ""),
        Parent: parentRef,
        Dest: [page.ref, "XYZ", bounds.rect[0], bounds.rect[3], null],
      });
      return {
        node,
        ref: pdf.context.register(node),
        children: bookmark.children,
      };
    });
    let count = entries.length;
    entries.forEach((entry, index) => {
      if (index) entry.node.set(key("Prev"), entries[index - 1].ref);
      if (index + 1 < entries.length)
        entry.node.set(key("Next"), entries[index + 1].ref);
      if (entry.children.length)
        count += addChildren(entry.node, entry.ref, entry.children);
    });
    parent.set(key("First"), entries[0].ref);
    parent.set(key("Last"), entries[entries.length - 1].ref);
    parent.set(key("Count"), pdf.context.obj(count));
    return count;
  };
  addChildren(root, rootRef, roots);
  pdf.catalog.set(key("Outlines"), rootRef);
}
