import { PDFTag, PDFTagAttribute } from "@rollerbird/canvaskit-wasm-pdf";
import { resolveTableHeaders, TableHeaderInfo } from "./table-headers";

// These properties are written by the final structure pass, not by CanvasKit.
export interface PDFStructureTag extends PDFTag {
  children?: PDFStructureTag[];
  elementIdentifier?: string;
  headerIdentifiers?: string[];
  bookmarkTitle?: string;
  linkUri?: string;
  linkText?: string;
  linkDestinationIdentifier?: string;
  isLinkDestination?: boolean;
  hiddenCaption?: { text: string; families: string[]; weight: number };
  renderedBounds?: {
    pageIndex: number;
    rect: [number, number, number, number];
  }[];
}

export const STRUCTURE_MARKER_OWNER = "html2pdf-skia";
export const STRUCTURE_MARKER_NAME = "NodeId";

// Predefined special tag IDs from SkPDF
export const PREDEFINED_TAG_IDS = {
  Nothing: 0,
  OtherArtifact: -1,
  PaginationArtifact: -2,
  PaginationHeaderArtifact: -3,
  PaginationFooterArtifact: -4,
  PaginationWatermarkArtifact: -5,
  LayoutArtifact: -6,
  PageArtifact: -7,
  BackgroundArtifact: -8,
} as const;

// Standard PDF structure types
export const PDF_STRUCTURE_TYPES = {
  // Document structure
  Document: "Document",
  Part: "Part",
  Art: "Art",
  Sect: "Sect",
  Div: "Div",

  // Block-level structure
  P: "P", // Paragraph
  H1: "H1",
  H2: "H2",
  H3: "H3",
  H4: "H4",
  H5: "H5",
  H6: "H6", // Headings
  BlockQuote: "BlockQuote",
  Caption: "Caption",
  TOC: "TOC", // Table of Contents
  TOCI: "TOCI", // Table of Contents Item
  Index: "Index",

  // Inline structure
  Span: "Span",
  Quote: "Quote",
  Note: "Note",
  Reference: "Reference",
  BibEntry: "BibEntry",
  Code: "Code",
  Link: "Link",
  Annot: "Annot",

  // List structure
  L: "L", // List
  LI: "LI", // List Item
  Lbl: "Lbl", // List Label
  LBody: "LBody", // List Body

  // Table structure
  Table: "Table",
  TR: "TR", // Table Row
  TH: "TH", // Table Header
  TD: "TD", // Table Data
  THead: "THead", // Table Head
  TBody: "TBody", // Table Body
  TFoot: "TFoot", // Table Foot

  // Illustration structure
  Figure: "Figure",
  Formula: "Formula",
  Form: "Form",
  NonStruct: "NonStruct",
  // Artifact (non-content elements)
  Artifact: "Artifact",
} as const;

// Custom PDF tag attribute name
export const PDF_TAG_ATTRIBUTE = "data-x-pdf-tag-id";

/**
 * Context for document structure generation
 */
interface DocumentStructureContext {
  nextId: number;
  tagIdMap: Map<Element, number>;
  tagMap: Map<Element, PDFStructureTag>;
  tableHeaders: Map<Element, TableHeaderInfo>;
}

/**
 * Generate unique tag ID
 */
function generateTagId(context: DocumentStructureContext): number {
  return context.nextId++;
}

/**
 * Apply PDF tag ID attribute to HTML element
 */
function applyTagIdToElement(element: Element, tagId: number): void {
  element.setAttribute(PDF_TAG_ATTRIBUTE, tagId.toString());
}

/**
 * Determine if element should be skipped entirely (not rendered in PDF)
 */
function shouldSkipElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");

  // Skip head elements and non-rendered elements entirely
  if (
    [
      "head",
      "style",
      "script",
      "meta",
      "link",
      "title",
      "noscript",
      "template",
    ].includes(tagName)
  ) {
    return true;
  }

  // Skip elements with presentation role (not content)
  if (role === "presentation" || role === "none") {
    return true;
  }

  // Skip hidden elements
  if (element.hasAttribute("hidden")) {
    return true;
  }

  return false;
}

/**
 * Determine if element should be treated as artifact (decorative/non-content)
 */
function isArtifactElement(element: Element): boolean {
  const classList = element.classList;

  // Common CSS classes that indicate decorative elements
  const artifactClasses = [
    "decoration",
    "ornament",
    "background",
    "watermark",
    "separator",
  ];
  if (artifactClasses.some((cls) => classList.contains(cls))) {
    return true;
  }

  return false;
}

/**
 * Determine specific artifact type based on element characteristics
 */
function getArtifactType(element: Element): number {
  const classList = element.classList;
  const tagName = element.tagName.toLowerCase();

  if (classList.contains("header") || tagName === "header") {
    return PREDEFINED_TAG_IDS.PaginationHeaderArtifact;
  }
  if (classList.contains("footer") || tagName === "footer") {
    return PREDEFINED_TAG_IDS.PaginationFooterArtifact;
  }
  if (classList.contains("watermark")) {
    return PREDEFINED_TAG_IDS.PaginationWatermarkArtifact;
  }
  if (classList.contains("background") || classList.contains("bg")) {
    return PREDEFINED_TAG_IDS.BackgroundArtifact;
  }
  if (classList.contains("layout") || classList.contains("container")) {
    return PREDEFINED_TAG_IDS.LayoutArtifact;
  }
  if (classList.contains("page")) {
    return PREDEFINED_TAG_IDS.PageArtifact;
  }

  return PREDEFINED_TAG_IDS.OtherArtifact;
}

/**
 * Map HTML element to PDF structure type
 */
function getStructureType(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");

  // Role attribute takes precedence
  switch (role) {
    case "document":
      return PDF_STRUCTURE_TYPES.Document;
    case "article":
      return PDF_STRUCTURE_TYPES.Art;
    case "section":
      return PDF_STRUCTURE_TYPES.Sect;
    case "paragraph":
      return PDF_STRUCTURE_TYPES.P;
    case "heading":
      return PDF_STRUCTURE_TYPES.H1; // Will be refined by level
    case "list":
      return PDF_STRUCTURE_TYPES.L;
    case "listitem":
      return PDF_STRUCTURE_TYPES.LI;
    case "table":
      return PDF_STRUCTURE_TYPES.Table;
    case "row":
      return PDF_STRUCTURE_TYPES.TR;
    case "cell":
      return PDF_STRUCTURE_TYPES.TD;
    case "columnheader":
    case "rowheader":
      return PDF_STRUCTURE_TYPES.TH;
    case "img":
    case "figure":
      return PDF_STRUCTURE_TYPES.Figure;
    case "link":
      return PDF_STRUCTURE_TYPES.Link;
    case "note":
      return PDF_STRUCTURE_TYPES.Note;
  }

  // Map based on HTML tag name
  switch (tagName) {
    case "html":
    case "body":
      return PDF_STRUCTURE_TYPES.Document;
    case "article":
      return PDF_STRUCTURE_TYPES.Art;
    case "section":
      return PDF_STRUCTURE_TYPES.Sect;
    case "div":
      return PDF_STRUCTURE_TYPES.Div;
    case "p":
      return PDF_STRUCTURE_TYPES.P;
    case "h1":
      return PDF_STRUCTURE_TYPES.H1;
    case "h2":
      return PDF_STRUCTURE_TYPES.H2;
    case "h3":
      return PDF_STRUCTURE_TYPES.H3;
    case "h4":
      return PDF_STRUCTURE_TYPES.H4;
    case "h5":
      return PDF_STRUCTURE_TYPES.H5;
    case "h6":
      return PDF_STRUCTURE_TYPES.H6;
    case "blockquote":
      return PDF_STRUCTURE_TYPES.BlockQuote;
    case "caption":
      return PDF_STRUCTURE_TYPES.Caption;
    case "span":
    case "em":
    case "strong":
    case "b":
    case "i":
      return PDF_STRUCTURE_TYPES.Span;
    case "q":
    case "cite":
      return PDF_STRUCTURE_TYPES.Quote;
    case "code":
    case "pre":
    case "kbd":
    case "samp":
      return PDF_STRUCTURE_TYPES.Code;
    case "a":
      return element.hasAttribute("href")
        ? PDF_STRUCTURE_TYPES.Link
        : PDF_STRUCTURE_TYPES.Span;
    case "ol":
    case "ul":
    case "dl":
      return PDF_STRUCTURE_TYPES.L;
    case "li":
    case "dt":
    case "dd":
      return PDF_STRUCTURE_TYPES.LI;
    case "table":
      return PDF_STRUCTURE_TYPES.Table;
    case "thead":
      return PDF_STRUCTURE_TYPES.THead;
    case "tbody":
      return PDF_STRUCTURE_TYPES.TBody;
    case "tfoot":
      return PDF_STRUCTURE_TYPES.TFoot;
    case "tr":
      return PDF_STRUCTURE_TYPES.TR;
    case "th":
      return PDF_STRUCTURE_TYPES.TH;
    case "td":
      return PDF_STRUCTURE_TYPES.TD;
    case "img":
    case "svg":
    case "canvas":
    case "figure":
      return PDF_STRUCTURE_TYPES.Figure;
    case "form":
      return PDF_STRUCTURE_TYPES.Form;
    case "aside":
      return PDF_STRUCTURE_TYPES.Note;
    default:
      return PDF_STRUCTURE_TYPES.NonStruct; // Non-structured content
  }
}

/**
 * Create attributes for table elements
 */
function createTableAttributes(
  element: Element,
  context: DocumentStructureContext
): PDFTagAttribute[] {
  const attributes: PDFTagAttribute[] = [];
  const tagName = element.tagName.toLowerCase();

  // RowCount and ColCount are not standard PDF table attributes.
  if (tagName === "th" || tagName === "td") {
    const cell = element as HTMLTableCellElement;
    const colspan = cell.colSpan;
    // HTML rowspan=0 extends to the end of the current row group.
    const row = cell.parentElement;
    const rows = row?.parentElement
      ? Array.from(row.parentElement.children).filter(
          (child) => child.tagName.toLowerCase() === "tr"
        )
      : [];
    const remaining = row ? rows.length - rows.indexOf(row) : 1;
    const rowspan = Math.min(
      cell.rowSpan === 0 ? remaining : cell.rowSpan,
      remaining
    );

    if (colspan > 1) {
      attributes.push({
        owner: "Table",
        name: "ColSpan",
        type: "int",
        value: colspan,
      });
    }
    if (rowspan > 1) {
      attributes.push({
        owner: "Table",
        name: "RowSpan",
        type: "int",
        value: rowspan,
      });
    }

    // Determine if it's a header cell
    if (
      tagName === "th" ||
      element.getAttribute("role") === "columnheader" ||
      element.getAttribute("role") === "rowheader"
    ) {
      attributes.push({
        owner: "Table",
        name: "Scope",
        type: "name",
        value:
          context.tableHeaders.get(element)?.scope ||
          (element.getAttribute("role") === "rowheader" ? "Row" : "Column"),
      });
    }
  }

  return attributes;
}

/**
 * Create attributes for list elements
 */
function createListAttributes(element: Element): PDFTagAttribute[] {
  const attributes: PDFTagAttribute[] = [];
  const tagName = element.tagName.toLowerCase();

  if (tagName === "ol") {
    const start = element.getAttribute("start");
    if (start) {
      attributes.push({
        owner: "List",
        name: "Start",
        type: "int",
        value: parseInt(start),
      });
    }

    const type = element.getAttribute("type");
    if (type) {
      attributes.push({
        owner: "List",
        name: "NumberFormat",
        type: "name",
        value: type,
      });
    }
  } else if (tagName === "ul") {
    const style = getComputedStyle(element).listStyleType;
    if (style && style !== "none") {
      attributes.push({
        owner: "List",
        name: "ListStyleType",
        type: "name",
        value: style,
      });
    }
  }

  return attributes;
}

/**
 * Create attributes for image elements
 */
function createImageAttributes(element: Element): PDFTagAttribute[] {
  const attributes: PDFTagAttribute[] = [];

  if (
    ["img", "svg", "canvas", "figure"].includes(element.tagName.toLowerCase())
  ) {
    // Dimensions and BBox must use PDF coordinates, not HTML pixel dimensions.
    // The renderer records them for the final structure pass.
    const requestedPlacement = element.getAttribute("data-placement");
    const display =
      element.ownerDocument.defaultView?.getComputedStyle(element).display;
    const parentType = element.parentElement
      ? getStructureType(element.parentElement)
      : undefined;
    // CSS block/flex/grid items are standalone graphics. Otherwise retain
    // inline placement inside text structure, including paragraph SVGs.
    const blockDisplay = [
      "block",
      "flex",
      "grid",
      "table",
      "flow-root",
    ].includes(display || "");
    const inlineParent =
      parentType !== undefined &&
      [
        "P",
        "Span",
        "Link",
        "Lbl",
        "Quote",
        "Code",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
      ].includes(parentType);
    const placement =
      requestedPlacement &&
      ["Block", "Inline", "Before", "Start", "End"].includes(requestedPlacement)
        ? requestedPlacement
        : blockDisplay || !inlineParent
        ? "Block"
        : "Inline";
    attributes.push({
      owner: "Layout",
      name: "Placement",
      type: "name",
      value: placement,
    });
  }

  return attributes;
}

/**
 * Create attributes based on element type
 */
function createElementAttributes(
  element: Element,
  context: DocumentStructureContext
): PDFTagAttribute[] {
  const attributes: PDFTagAttribute[] = [];
  const tagName = element.tagName.toLowerCase();

  // /ID is a byte string on the structure element, not a Standard name attribute.
  // It is written by finalizePDFStructure along with /IDTree and /Headers.

  // CSS classes belong to the HTML rendering layer, not PDF structure attributes.
  // CanvasKit writes name attributes verbatim; whitespace in className produces
  // invalid PDF dictionaries. Leave the DOM classes intact for styling.

  // Specific element attributes
  if (
    ["table", "th", "td", "thead", "tbody", "tfoot", "tr"].includes(tagName)
  ) {
    attributes.push(...createTableAttributes(element, context));
  } else if (["ol", "ul", "li"].includes(tagName)) {
    attributes.push(...createListAttributes(element));
  } else if (["img", "figure", "svg", "canvas"].includes(tagName)) {
    attributes.push(...createImageAttributes(element));
  }

  return attributes;
}

/**
 * Process a single HTML element and create corresponding PDF tag
 */
function processElement(
  element: Element,
  context: DocumentStructureContext
): PDFTag | null {
  // Skip elements that shouldn't be rendered in PDF
  if (shouldSkipElement(element)) {
    return null;
  }

  let tagId: number;
  let structureType: string;

  // Handle artifacts
  if (isArtifactElement(element)) {
    tagId = getArtifactType(element);
    structureType = PDF_STRUCTURE_TYPES.Artifact;
  } else {
    tagId = generateTagId(context);
    structureType = getStructureType(element);
  }

  // Apply tag ID to HTML element
  applyTagIdToElement(element, tagId);
  context.tagIdMap.set(element, tagId);

  // Create PDF tag
  const pdfTag: PDFStructureTag = {
    id: tagId,
    type: structureType,
    alt:
      element.getAttribute("alt") ||
      element.getAttribute("aria-label") ||
      undefined,
    language: element.getAttribute("lang") || undefined,
    attributes: createElementAttributes(element, context),
    children: [],
  };
  if (/^H[1-6]$/.test(structureType)) {
    pdfTag.bookmarkTitle =
      element.textContent?.replace(/\s+/g, " ").trim() || undefined;
  }
  // A zero clip hides the caption visually, while its text still names the table.
  // Native Skia drops all glyphs under that clip; restore invisible text later.
  if (structureType === PDF_STRUCTURE_TYPES.Caption) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const text = element.textContent?.replace(/\s+/g, " ").trim();
    if (
      style &&
      text &&
      !element.children.length &&
      /^rect\(0px,?\s+0px,?\s+0px,?\s+0px\)$/.test(style.clip)
    ) {
      pdfTag.hiddenCaption = {
        text,
        families: style.fontFamily
          .split(",")
          .map((family) => family.trim().replace(/^["']|["']$/g, "")),
        weight: Number.parseInt(style.fontWeight, 10) || 400,
      };
    }
  }
  if (
    structureType === PDF_STRUCTURE_TYPES.Link &&
    element.hasAttribute("href")
  ) {
    pdfTag.linkUri = (element as HTMLAnchorElement).href;
    pdfTag.linkText =
      element.getAttribute("aria-label") ||
      element.textContent?.replace(/\s+/g, " ").trim() ||
      pdfTag.linkUri;
  }
  context.tagMap.set(element, pdfTag);

  // Process child elements
  const childElements = Array.from(element.children);
  for (const child of childElements) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childTag = processElement(child, context);
      // Only add non-null child tags
      if (childTag) {
        pdfTag.children?.push(childTag);
      }
    }
  }

  return pdfTag;
}

/**
 * Generate document structure from HTML tree
 */
export function generateDocumentStructure(htmlElement: Element | Element[]): {
  structure: PDFTag;
  tagIdMap: Map<Element, number>;
} {
  const context: DocumentStructureContext = {
    nextId: 1, // Start from 1, as 0 is reserved for Nothing
    tagIdMap: new Map(),
    tagMap: new Map(),
    tableHeaders: new Map(),
  };
  for (const root of Array.isArray(htmlElement) ? htmlElement : [htmlElement]) {
    for (const [cell, info] of resolveTableHeaders(root))
      context.tableHeaders.set(cell, info);
  }

  const finalizeTags = () => {
    for (const [element, tag] of context.tagMap) {
      const href = element.getAttribute("href");
      if (!tag.linkUri || !href?.startsWith("#")) continue;
      const target =
        href === "#"
          ? element.ownerDocument.documentElement
          : element.ownerDocument.getElementById(
              decodeURIComponent(href.slice(1))
            );
      const targetTag = target ? context.tagMap.get(target) : undefined;
      if (!targetTag)
        throw new Error(`Missing internal PDF link destination '${href}'`);
      targetTag.isLinkDestination = true;
      tag.linkDestinationIdentifier = `html2pdf-${targetTag.id}`;
    }
    for (const [element, tag] of context.tagMap) {
      if (
        element.id ||
        tag.type === PDF_STRUCTURE_TYPES.TH ||
        tag.type === PDF_STRUCTURE_TYPES.Figure ||
        tag.bookmarkTitle ||
        tag.hiddenCaption ||
        tag.linkUri ||
        tag.isLinkDestination
      ) {
        // Internal identifiers remain unique even when separate HTML pages reuse IDs.
        tag.elementIdentifier = `html2pdf-${tag.id}`;
      }
      const headers = context.tableHeaders.get(element)?.headers || [];
      if (headers.length) {
        tag.headerIdentifiers = headers.map((header) => {
          const headerTag = context.tagMap.get(header);
          if (!headerTag || headerTag.type !== PDF_STRUCTURE_TYPES.TH)
            throw new Error(
              "A table header is excluded from the PDF structure"
            );
          return `html2pdf-${headerTag.id}`;
        });
      }
      if (tag.elementIdentifier || tag.headerIdentifiers) {
        if (tag.id === undefined)
          throw new Error("Missing PDF structure node ID");
        tag.attributes?.push({
          owner: STRUCTURE_MARKER_OWNER,
          name: STRUCTURE_MARKER_NAME,
          type: "int",
          value: tag.id,
        });
      }
    }
  };

  // Handle array of elements
  if (Array.isArray(htmlElement)) {
    const parentTag: PDFTag = {
      id: 0,
      type: PDF_STRUCTURE_TYPES.Document,
      children: [],
    };

    // Process each element in the array
    for (const element of htmlElement) {
      const childTag = processElement(element, context);
      if (childTag) {
        parentTag.children?.push(childTag);
      }
    }

    finalizeTags();
    return {
      structure: parentTag,
      tagIdMap: context.tagIdMap,
    };
  }

  // Handle single element (existing logic)
  const documentStructure = processElement(htmlElement, context);

  // If the root element was skipped, create a minimal document structure
  if (!documentStructure) {
    return {
      structure: {
        id: 0,
        type: PDF_STRUCTURE_TYPES.Document,
        children: [],
      },
      tagIdMap: context.tagIdMap,
    };
  }

  finalizeTags();
  return {
    structure: documentStructure,
    tagIdMap: context.tagIdMap,
  };
}

/**
 * Apply PDF structure to existing HTML document
 */
export function applyPDFStructureToDocument(document: Document): {
  structure: PDFTag;
  tagIdMap: Map<Element, number>;
} {
  const htmlElement = document.documentElement;
  return generateDocumentStructure(htmlElement);
}

/**
 * Get PDF tag for specific HTML element
 */
export function getPDFTagForElement(element: Element): number | undefined {
  const value = element.getAttribute(PDF_TAG_ATTRIBUTE);
  // Preserve negative Skia artifact IDs. An unsigned regex converted -6 to 6,
  // accidentally associating decorative elements with real structure nodes.
  return value !== null && /^-?\d+$/.test(value) ? Number(value) : undefined;
}

export function getPDFTagForElementFromMap(
  element: Element,
  tagIdMap: Map<Element, number>
): number | undefined {
  return tagIdMap.get(element);
}

/**
 * Serialize PDF structure to JSON for debugging
 */
export function serializePDFStructure(structure: PDFTag): string {
  return JSON.stringify(structure, null, 2);
}

/**
 * Validate PDF structure integrity
 */
export function validatePDFStructure(structure: PDFTag): boolean {
  const validateTag = (tag: PDFTag, visitedIds: Set<number>): boolean => {
    // Check for duplicate IDs (except predefined negative IDs)
    if (tag.id !== undefined && tag.id > 0 && visitedIds.has(tag.id)) {
      console.error(`Duplicate tag ID found: ${tag.id}`);
      return false;
    }

    if (tag.id !== undefined && tag.id > 0) {
      visitedIds.add(tag.id);
    }

    // Validate children
    if (tag.children) {
      for (const child of tag.children) {
        if (!validateTag(child, visitedIds)) {
          return false;
        }
      }
    }

    return true;
  };

  return validateTag(structure, new Set());
}
