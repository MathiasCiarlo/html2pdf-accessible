# html2pdf-accessible

Create accessible, searchable, and structured PDFs from HTML in the browser.
The renderer uses Skia / CanvasKit WASM for vector graphics and text, then adds PDF structure,
metadata and links. It is a fork of [html2pdf-skia](https://github.com/pushpagarwal/html2pdf-skia), which is based on html2canvas.

### Why this fork exists

html2pdf-skia already produced vector PDFs with selectable text and basic PDF
tagging. We needed more reliable structure for documents with tables, figures,
links and multiple pages. In particular, the upstream output did not provide
the table header associations and complete PDF structure relationships our
documents needed for navigation and validation.

This fork adds table header IDs and associations, caption handling, figure
bounds, link annotations, document metadata and outlines. It also finalizes PDF
structure after rendering, restores visually hidden captions as searchable text,
and adds browser, PDF and validator regression checks. The CanvasKit backend is
built from pinned source so the shipped WASM can be reproduced and audited.
These changes improve the generated PDF's accessibility, but each document
still needs validation and assistive-technology testing.

## Using the library

### 1. Install

With Node 22 or newer, install the package in your application:

```sh
npm install html2pdf-accessible
```

### 2. Serve the WASM file and a font

Copy `node_modules/html2pdf-accessible/lib/wasm/canvaskit-pdf.wasm` from the
consuming project to a public URL such as `/assets/canvaskit-pdf.wasm`. Also
serve a font you are licensed to use, for example at `/fonts/YourFont-Regular.ttf`.
The PDF renderer needs the font bytes in addition to any CSS `@font-face` rule.

### 3. Export a document

Call this code in a browser after the document is ready:

```ts
import {
  loadCanvasKit,
  createFontCollection,
  exportHTMLDocumentToPdf,
} from "html2pdf-accessible";

const kit = await loadCanvasKit({
  wasmBinaryUrl: "/assets/canvaskit-pdf.wasm",
});

const fonts = createFontCollection(kit);
const fontResponse = await fetch("/fonts/YourFont-Regular.ttf");
if (!fontResponse.ok) throw new Error("Could not load the PDF font");
fonts.addFont(await fontResponse.arrayBuffer(), "Your Font", {
  fontWeight: 400,
});
fonts.setDefaultFonts("sans-serif", ["Your Font"]);

const pdf = await exportHTMLDocumentToPdf(kit, document, {
  title: document.title,
  language: document.documentElement.lang || "en-US",
  pageSize: { width: 595, height: 842 },
  userToPdfScale: 0.75,
  fontCollection: fonts,
});

const url = URL.createObjectURL(pdf);
const link = document.createElement("a");
link.href = url;
link.download = "document.pdf";
link.click();
setTimeout(() => URL.revokeObjectURL(url), 30_000);
```

`exportHTMLDocumentToPdf` returns a PDF `Blob` and exports the supplied
`Document`'s body. If your page has buttons or navigation that should stay out
of the PDF, render the content in an iframe and pass its `contentDocument`
instead. Wait for its fonts and images to load before exporting. Page sizes use
PDF points; 595 × 842 is approximately A4. `userToPdfScale` converts CSS pixels
to PDF points; the default is `0.5`, while the example uses `0.75`. Register
additional font weights when your content uses them.

### Accessibility and limitations

Output has searchable text and a logical structure tree. Tests cover table
header IDs, category headers with colspan, repeated headers, multiple pages,
figures with alternative text/bounds, link annotations, XMP, outlines, hidden
captions and line wrapping. HTML must provide meaningful semantics, image
alternatives, document language and title.

Mark decorative `<img>` elements with `alt=""` and decorative inline `<svg>`
elements with `aria-hidden="true"` or `role="presentation"`. Give meaningful
images a non-empty `alt` and meaningful inline SVGs an `aria-label`.

Google SkPDF lacks some PDF structure operations. A final
pdf-lib pass adds the corresponding structure and annotations. Visually clipped
plain-text captions are restored as invisible embedded-font text. Custom font
collections must implement optional `getFontData(families, weight)` for these
captions; the supplied collection already implements it.

Passing veraPDF checks does **not** establish full PDF/UA or WCAG conformance for
every document. Reading order, descriptions and actual screen-reader table
navigation need manual testing. CSS support is limited by the DOM renderer;
browser layout remains the reference for supported content.

### Link and CSS safety

External PDF links allow only `https:` and `http:`. Relative web URLs are resolved
against the document base URL. Internal fragment links become PDF page destinations.
Other schemes, including `javascript:`, `data:`, `file:` and `mailto:`, remain
visible text without an active PDF link. URI policy is enforced at tag generation
and annotation serialization.

Relative color `calc()` expressions are evaluated as numbers, channel references,
parentheses and `+`, `-`, `*`, `/` operators. Unknown tokens, functions,
non-finite results and excessive nesting are rejected; CSS is never evaluated
as JavaScript. This does not make the library an HTML sanitizer.

### License

MIT; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development guide

### Build from source

Use Node 22 or newer. Build this checkout and create a tarball for local testing:

```sh
npm ci
npm run build
npm pack
```

To test the archive in another project, install the tarball path printed by
`npm pack`. This repository does not publish to npm automatically.

### Tests

Install the project's Chromium browser once, then run the checks:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:pdf
```

The local Inter Regular and SemiBold test fonts are licensed under SIL Open Font
License 1.1; see `tests/pdf/assets/OFL.txt` in the source checkout. Test fonts,
fixtures, browsers and validator binaries are not included in the npm package.
Playwright, PDF.js, the native canvas adapter, fast-xml-parser and veraPDF are
development or CI tools, with their own licenses.

`npm test` runs all unit tests, validator-wrapper tests and TypeScript checking.
`test:pdf` builds the library, exports five synthetic fixtures in Chromium, and
checks structure and text with pdf-lib and PDF.js. Only local assets are used;
external requests fail. No Python, installed Edge, Java or veraPDF is required.

| Command                     | Purpose                                                 |
| --------------------------- | ------------------------------------------------------- |
| `npm run test:pdf:serve`    | Interactive iframe runner on port 4001                  |
| `npm run test:pdf:visual`   | Compare pages with Linux reference images               |
| `npm run test:pdf:update`   | Explicitly replace references; review before committing |
| `npm run test:pdf:validate` | veraPDF PDF/UA-1 validation                             |
| `npm run test:package`      | Pack, install, import and export using the npm tarball  |
| `npm run lint:changed`      | Check changed files with zero lint findings        |

Results go to ignored `.cache/pdf-tests/`. Public tests, fixtures, assets and
reference images live under `tests/pdf/`; tools live under `scripts/pdf/`.
See [the test guide](tests/pdf/README.md) for the pinned Linux visual-test container,
manual release checks and lint policy. Windows/macOS developers use that container
for visual comparison and reference updates.

veraPDF uses Docker image `verapdf/cli:v1.30.2` by default. Alternatively set
`VERAPDF_PATH` to your local executable or Windows `verapdf.bat`. The wrapper
checks XML reports, completed jobs, parser errors and actual UA1 compliance;
exit status alone is insufficient. Missing tools/output fail instead of skipping.

GitHub Actions checks pull requests, main branches, release tags and manual runs,
including the actual packed library. PDFs, images and XML reports are artifacts.
The workflow checks release readiness and does not publish to npm.

### CanvasKit backend

The backend is built from [Google Skia CanvasKit](https://skia.googlesource.com/skia/+/e2def78fa232884d4aedcf3ad92d4a0dd673b898/modules/canvaskit/),
release 0.42.0, with our MIT-licensed C++ bridge to SkPDF. Official published
CanvasKit does not expose PDF generation; the bridge provides document creation,
page lifecycle, structure tags and stable font IDs. The existing public library
API and PDF layout are preserved.

Sources, licenses and provenance are under `deps/canvaskit-pdf/`. Every source
revision and the Emscripten build image are pinned. Normal installation uses the
included binaries; it does not download or compile Skia. Build hooks and tests
verify their hashes against the source manifest.

```sh
npm run verify:canvaskit
npm run build:canvaskit          # Docker: rebuild and replace included artifacts
npm run test:canvaskit:rebuild   # Docker: rebuild and compare, without replacing
```

Only rebuilding requires Docker and network access to official source repositories.
Python and the C++ toolchain run inside the pinned build image. Build commands
use a Docker volume for source/dependency and compilation caches. CI rebuilds
from source in a fresh runner and requires the JavaScript, WASM, types, licenses
and provenance to match the included files. The build scripts are also shipped
in the npm package. See [backend details](deps/canvaskit-pdf/README.md).

### Contributions

Do not add production snapshots, customer data or proprietary assets to tests.
