import { CanvasKit, PDFMetadata, PDFTag } from "@html2pdf-skia/canvaskit-pdf";
import { parseBackgroundColor, parseTree } from "../dom/node-parser";
import { Context } from "../core/context";
import { SkiaRenderer } from "../render/skia/skia-renderer";
import { IFontCollection } from "../fonts/interfaces";
import { SkiaFontCollection } from "../fonts/font-collection";
import { finalizePDFStructure } from "./finalize-structure";
import { PDFStructureTag } from "./document-structure";

export const defaultUserToPdfScale = 0.5; // Default scale for PDF rendering
export interface IPageSize {
  width: number;
  height: number;
}
export interface IPdfInputProvider {
  getDocumentTitle(): string;
  getDocumentStructure(): PDFTag;
  getNextPageElement(): Promise<HTMLElement | null>;
}

export interface IPdfOptions {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  language?: string;
  userToPdfScale?: number;
  pageSize: { width: number; height: number };
  fontCollection?: IFontCollection;
}

export async function exportToPdf(
  canvasKit: CanvasKit,
  context: Context,
  inputProvider: IPdfInputProvider,
  pdfOptions?: Partial<IPdfOptions>
): Promise<Blob> {
  const rootTag = inputProvider.getDocumentStructure();
  const boundedTags = new Map<number, PDFStructureTag>();
  const collectBoundedTags = (tag: PDFStructureTag) => {
    if (
      tag.id !== undefined &&
      (tag.type === "Figure" ||
        tag.bookmarkTitle ||
        tag.linkUri ||
        tag.isLinkDestination)
    )
      boundedTags.set(tag.id, tag);
    tag.children?.forEach(collectBoundedTags);
  };
  collectBoundedTags(rootTag);
  let pageIndex = 0;
  const metadata: PDFMetadata = {
    title: pdfOptions?.title ?? inputProvider.getDocumentTitle(),
    author: pdfOptions?.author ?? "",
    subject: pdfOptions?.subject ?? "",
    keywords: pdfOptions?.keywords ?? "",
    creator: pdfOptions?.creator ?? "html2pdf-skia",
    producer: pdfOptions?.producer ?? "html2pdf-skia",
    language: pdfOptions?.language ?? "en-US",
    rootTag: rootTag,
  };
  const pdfDocument = canvasKit.MakePDFDocument(metadata);
  if (!pdfDocument) {
    throw new Error("Failed to create PDF document");
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextPageElement = await inputProvider.getNextPageElement();
    if (!nextPageElement) {
      break; // No more pages to process
    }
    const pageWidth = pdfOptions?.pageSize?.width ?? 595; // Default A4 width
    const pageHeight = pdfOptions?.pageSize?.height ?? 842; // Default A4 height
    // Create a new page in the PDF document
    const canvas = pdfDocument.beginPage(pageWidth, pageHeight);
    if (!canvas) {
      throw new Error("Failed to create PDF page canvas");
    }
    const documentElement = nextPageElement.ownerDocument.documentElement;
    const backgroundColor = parseBackgroundColor(context, documentElement);
    const userToPdfScale = pdfOptions?.userToPdfScale ?? defaultUserToPdfScale;
    const elementContainer = parseTree(context, nextPageElement);
    canvas.save();
    canvas.scale(userToPdfScale, userToPdfScale);
    const renderer = new SkiaRenderer(
      context,
      {
        canvasKit,
        canvas,
      },
      {
        scale: 1,
        x: 0,
        y: 0,
        width: pageWidth * window.devicePixelRatio,
        height: pageHeight * window.devicePixelRatio,
        backgroundColor: backgroundColor,
        document: nextPageElement.ownerDocument,
        fontCollection:
          (pdfOptions?.fontCollection as SkiaFontCollection) ??
          new SkiaFontCollection(canvasKit),
        onElementContent: (tagId, corners) => {
          const tag = boundedTags.get(tagId);
          if (!tag) return;
          const xs = corners.filter((_, i) => i % 2 === 0);
          const ys = corners.filter((_, i) => i % 2 === 1);
          const rect: [number, number, number, number] = [
            Math.max(0, Math.min(...xs)),
            Math.max(0, pageHeight - Math.max(...ys)),
            Math.min(pageWidth, Math.max(...xs)),
            Math.min(pageHeight, pageHeight - Math.min(...ys)),
          ];
          if (
            rect.some((value) => !Number.isFinite(value)) ||
            rect[2] <= rect[0] ||
            rect[3] <= rect[1]
          )
            return;
          tag.renderedBounds = tag.renderedBounds || [];
          const previous = tag.renderedBounds.find(
            (bounds) => bounds.pageIndex === pageIndex
          );
          if (previous)
            previous.rect = [
              Math.min(previous.rect[0], rect[0]),
              Math.min(previous.rect[1], rect[1]),
              Math.max(previous.rect[2], rect[2]),
              Math.max(previous.rect[3], rect[3]),
            ];
          else tag.renderedBounds.push({ pageIndex, rect });
        },
      }
    );
    await renderer.render(elementContainer);
    canvas.restore();
    // render the page content
    pdfDocument.endPage();
    pageIndex++;
  }
  const buffer = pdfDocument.close();
  pdfDocument.delete();
  const bytes = await finalizePDFStructure(
    new Uint8Array(buffer),
    rootTag,
    pdfOptions?.fontCollection
  );
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}
