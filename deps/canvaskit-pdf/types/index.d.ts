import {
  CanvasKit as GoogleCanvasKit,
  Canvas,
  Typeface,
  EmbindObject,
} from "./google-types";
export * from "./google-types";
export default function CanvasKitInit(
  options?: import("./google-types").CanvasKitInitOptions
): Promise<CanvasKit>;

export interface PDFTagAttribute {
  owner: string;
  name: string;
  type: string;
  value: string | number;
}
export interface PDFTag {
  id?: number;
  type?: string;
  alt?: string;
  language?: string;
  attributes?: PDFTagAttribute[];
  children?: PDFTag[];
}
export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  language?: string;
  rasterDPI?: number;
  PDFA?: boolean;
  rootTag?: PDFTag;
}
export interface Document extends EmbindObject<"PDFDocument"> {
  beginPage(width: number, height: number): Canvas;
  endPage(): void;
  close(): Uint8Array;
  abort(): void;
}
export interface CanvasKit extends GoogleCanvasKit {
  MakePDFDocument(metadata: PDFMetadata): Document;
  SetPDFTagId(canvas: Canvas, id: number): void;
  GetTypefaceId(typeface: Typeface): number;
}
