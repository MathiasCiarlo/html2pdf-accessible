import { PDFDocument, PDFName, PDFString } from "pdf-lib";

function escapeXml(value: string | undefined): string {
  return (
    (value || "")
      // XML 1.0 excludes these control characters even when escaped.
      .replace(
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,
        "\uFFFD"
      )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

/** Mirror the existing document information into a real XMP metadata stream.
 * The PDF/UA-1 identifier states the target standard; validation is still needed.
 */
export function addXmpMetadata(pdf: PDFDocument): void {
  const language = pdf.catalog
    .lookupMaybe(PDFName.of("Lang"), PDFString)
    ?.decodeText();
  const xml = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">
<pdfuaid:part>1</pdfuaid:part>
<dc:format>application/pdf</dc:format>
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(
    pdf.getTitle()
  )}</rdf:li></rdf:Alt></dc:title>
<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(
    pdf.getSubject()
  )}</rdf:li></rdf:Alt></dc:description>
<dc:creator><rdf:Seq><rdf:li>${escapeXml(
    pdf.getAuthor()
  )}</rdf:li></rdf:Seq></dc:creator>
<dc:language><rdf:Bag><rdf:li>${escapeXml(
    language
  )}</rdf:li></rdf:Bag></dc:language>
<pdf:Keywords>${escapeXml(pdf.getKeywords())}</pdf:Keywords>
<pdf:Producer>${escapeXml(pdf.getProducer())}</pdf:Producer>
<xmp:CreatorTool>${escapeXml(pdf.getCreator())}</xmp:CreatorTool>
</rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const stream = pdf.context.stream(
    new Uint8Array(new TextEncoder().encode(xml)),
    {
      Type: "Metadata",
      Subtype: "XML",
    }
  );
  pdf.catalog.set(PDFName.of("Metadata"), pdf.context.register(stream));
}
