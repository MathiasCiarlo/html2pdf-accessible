/* Public synthetic fixtures: no production snapshots or external assets. */
const params = new URLSearchParams(location.search);
const variant = params.get("fixture") || "quote";
const variants = ["minimal", "quote", "discount", "long", "long-no-discount"];
if (!variants.includes(variant)) throw new Error("Unknown fixture");
const iframe = document.getElementById("fixture");
const discounted = variant === "discount" || variant === "long";
const long = variant.startsWith("long");
const columns = discounted ? 4 : 3;
const rows = (count) =>
  Array.from(
    { length: count },
    (_, i) =>
      `${
        i % 7 === 0
          ? `<tr><th scope="rowgroup" colspan="${columns}">Category ${
              Math.floor(i / 7) + 1
            }</th></tr>`
          : ""
      }<tr><td><div class="product"><img src="/tests/pdf/assets/product.svg" alt="Illustration for item ${
        i + 1
      }"><span>Example item ${i + 1}</span></div></td><td>${
        100 + i
      },00</td><td>${10 + i},00 / unit</td>${
        discounted ? "<td>10 %</td>" : ""
      }</tr>`
  ).join("");
const table = (count) =>
  `<table class="products multiple-classes"><caption class="sr-only" style="font-family:sans-serif;font-weight:600" data-v-1a2b3c="">Items in this quotation</caption><thead><tr><th scope="col">Item</th><th scope="col">Price</th><th scope="col">Unit price</th>${
    discounted ? '<th scope="col">Discount</th>' : ""
  }</tr></thead><tbody>${rows(count)}</tbody></table>`;
const metadata = `<section class="metadata" aria-label="Quotation information"><div><p>Prepared for</p><span id="customer" data-v-1a2b3c="">Example Customer with a longer name</span></div><div><p>Date</p><span>01.01.2026</span></div><div><p>Valid until</p><span>31.12.2026</span></div><div><p>Contact</p><span id="contact">Example Contact in Customer Services</span></div></section>`;
const heading = `<header><svg role="img" aria-label="Example company emblem" width="60" height="40" viewBox="0 0 60 40"><rect width="60" height="40" rx="4" fill="#356987"/></svg><h1>Example quotation</h1></header>`;
const articles = long
  ? `<article>${heading}${table(130)}</article>`
  : Array.from(
      { length: variant === "minimal" ? 1 : 3 },
      (_, i) =>
        `<article class="pdf-sheet no-break multiple-classes" data-v-1a2b3c="">${
          i === 0 ? heading + metadata : "<h2>Quotation continued</h2>"
        }${table(
          variant === "minimal" ? 4 : 7
        )}<footer><p>Example document – page ${i + 1}</p>${
          i === 2
            ? `<p><a href="${
                variant === "discount" ? "#" : "https://example.com/contact"
              }">Contact information</a></p>`
            : ""
        }</footer></article>`
    ).join("");
iframe.srcdoc = `<!doctype html><html lang="nb-NO"><head><meta charset="utf-8"><title>Example quotation</title><style>
@font-face{font-family:Inter;src:url('/tests/pdf/assets/Inter-Regular.ttf');font-weight:400}
@font-face{font-family:Inter;src:url('/tests/pdf/assets/Inter-SemiBold.ttf');font-weight:600}
*{box-sizing:border-box}body{margin:0;font:13px/20px Inter,sans-serif;color:#243746}article{padding:32px}.pdf-sheet{height:1122.666666667px;position:relative}header{display:flex;align-items:center;justify-content:space-between}h1{font-size:26px;line-height:32px}h2{font-size:20px}.metadata{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:18px 0;border:1px solid #aab7bf}.metadata>div{padding:10px;min-width:0;border-right:1px solid #aab7bf}.metadata p{margin:0 0 6px;font-size:10px}.metadata span{display:block;font-size:15px;line-height:18px;font-weight:600}table{border-collapse:collapse;width:100%;margin-top:20px;table-layout:fixed}th,td{text-align:left;border-bottom:1px solid #aab7bf;padding:8px;font-size:12px;line-height:16px}thead th{font-weight:600;background:#e8eef2}th[colspan]{background:#f4f7f9;font-weight:600}th:first-child,td:first-child{width:45%}.product{display:flex;align-items:center;gap:8px}.product img{width:32px;height:40px}.product span{min-width:0;overflow-wrap:anywhere}footer{margin-top:25px}.pdf-sheet footer{position:absolute;bottom:32px;left:32px;right:32px}footer p{margin:6px 0}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style></head><body>${articles}</body></html>`;
window.ready = new Promise((resolve) =>
  iframe.addEventListener("load", resolve, { once: true })
).then(async () => {
  const doc = iframe.contentDocument;
  await doc.fonts.ready;
  await Promise.all([...doc.images].map((image) => image.decode()));
  window.kit = await html2pdf.loadCanvasKit({
    wasmBinaryUrl: "/lib/wasm/canvaskit-pdf.wasm",
  });
  window.fonts = html2pdf.createFontCollection(kit);
  for (const [weight, name] of [
    [400, "Regular"],
    [600, "SemiBold"],
  ]) {
    fonts.addFont(
      await (await fetch(`/tests/pdf/assets/Inter-${name}.ttf`)).arrayBuffer(),
      "Inter",
      { fontWeight: weight },
      undefined,
      { weight: String(weight) }
    );
  }
  fonts.setDefaultFonts("sans-serif", ["Inter"]);
  document.getElementById("download").disabled = false;
  document.getElementById("status").textContent = `Ready: ${variant}`;
});
window.exportFixture = async () => {
  await ready;
  return html2pdf.exportHTMLDocumentToPdf(kit, iframe.contentDocument, {
    pageSize: { width: 595, height: 842 },
    userToPdfScale: 0.75,
    language: "nb-NO",
    title: "Example quotation",
    fontCollection: fonts,
  });
};
document.getElementById("download").onclick = async () => {
  const url = URL.createObjectURL(await exportFixture());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${variant}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
