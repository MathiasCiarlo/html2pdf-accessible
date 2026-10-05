import fontkit from "@pdf-lib/fontkit";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";
import { IFontCollection } from "../fonts/interfaces";
import { PDFStructureTag } from "./document-structure";

/** Replace only Skia's empty text object in this caption's existing MCID.
 * Graphics and text state are isolated so subsequent visible text is unchanged.
 */
export function fillEmptyCaption(
  content: string,
  mcid: number,
  font: string,
  encodedText: string,
  y: number
): string {
  const emptyText = new RegExp(
    `(/Caption\\s*<<\\s*/MCID\\s+${mcid}\\s*>>\\s*BDC\\s*)BT\\s+ET`
  );
  if (!emptyText.test(content))
    throw new Error(
      `Missing empty text object for hidden caption MCID ${mcid}`
    );
  return content.replace(
    emptyText,
    `$1q\nBT\n3 Tr\n${font} 12 Tf\n1 0 0 1 36 ${y} Tm\n${encodedText} Tj\nET\nQ`
  );
}

/** Keep visually clipped table captions readable, using invisible text (Tr 3).
 * Reuse the original MCID, structure node and ParentTree entry. Embed the supplied
 * font with a Unicode map; do not substitute alternate text for an empty node.
 */
export async function restoreHiddenCaptions(
  pdf: PDFDocument,
  nodes: Map<number, { node: PDFDict; ref: PDFRef }>,
  tags: Map<number, PDFStructureTag>,
  fonts?: IFontCollection
): Promise<void> {
  const hidden = Array.from(nodes).filter(
    ([id]) => tags.get(id)?.hiddenCaption
  );
  if (!hidden.length) return;
  pdf.registerFontkit(fontkit);
  const embedded = new Map<ArrayBuffer, PDFFont>();
  const key = PDFName.of;
  for (const [id, { node }] of hidden) {
    const caption = tags.get(id)?.hiddenCaption;
    if (!caption) continue;
    const buffer = fonts?.getFontData?.(caption.families, caption.weight);
    if (!buffer)
      throw new Error(
        `Missing source font for hidden caption '${caption.text}'`
      );
    let font = embedded.get(buffer);
    if (!font) {
      // fontkit's tiny subset for these captions fails to load in Acrobat.
      // Embed the complete source font; the text remains invisible (Tr 3).
      font = await pdf.embedFont(buffer, { subset: false });
      embedded.set(buffer, font);
    }
    const page = pdf
      .getPages()
      .find((page) => page.ref === node.get(key("Pg")));
    if (!page) throw new Error("Hidden caption has no PDF page");
    const mcid = node.lookup(key("K"), PDFNumber).asNumber();
    const contents = page.node.get(key("Contents"));
    const array = pdf.context.lookup(contents);
    const streams = array instanceof PDFArray ? array.asArray() : [contents];
    let filled = false;
    for (const ref of streams) {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream) || !(ref instanceof PDFRef))
        throw new Error("Unexpected native PDF page content stream");
      // Preserve every original byte, including bytes outside ASCII.
      const content = Array.from(decodePDFRawStream(stream).decode(), (byte) =>
        String.fromCharCode(byte)
      ).join("");
      const marker = new RegExp(
        `/Caption\\s*<<\\s*/MCID\\s+${mcid}\\s*>>\\s*BDC`
      );
      if (!marker.test(content)) continue;
      const fontName = page.node.newFontDictionary("HiddenCaption", font.ref);
      const replacement = fillEmptyCaption(
        content,
        mcid,
        fontName.toString(),
        font.encodeText(caption.text).toString(),
        page.getHeight() - 36
      );
      pdf.context.assign(
        ref,
        pdf.context.flateStream(
          Uint8Array.from(replacement, (character) => character.charCodeAt(0))
        )
      );
      filled = true;
    }
    if (!filled) throw new Error(`Missing content for hidden caption ${id}`);
  }
}
