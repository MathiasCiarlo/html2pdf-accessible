# html2pdf-skia

Generate vector PDFs from HTML in the browser with Skia / CanvasKit WASM.
This fork adds PDF syntax, table semantics, metadata, figure bounds, link
annotations, hidden-caption text and line-wrapping fixes to
[pushpagarwal/html2pdf-skia](https://github.com/pushpagarwal/html2pdf-skia), which
is based on html2canvas. Upstream attribution and the MIT license are retained.

The npm name, version and repository links still describe upstream. This checkout
is being prepared for a separate public fork; it does not publish a new package.

## Usage

```ts
import {
  loadCanvasKit,
  createFontCollection,
  exportHTMLDocumentToPdf,
} from "html2pdf-skia";
const kit = await loadCanvasKit({
  wasmBinaryUrl: "/assets/canvaskit-pdf.wasm",
});
const fonts = createFontCollection(kit);
for (const [weight, name] of [
  [400, "Regular"],
  [600, "SemiBold"],
] as const) {
  const data = await fetch(`/fonts/Inter-${name}.ttf`).then((r) =>
    r.arrayBuffer()
  );
  fonts.addFont(data, "Inter", { fontWeight: weight }, undefined, {
    weight: String(weight),
  });
}
fonts.setDefaultFonts("sans-serif", ["Inter"]);
const pdf = await exportHTMLDocumentToPdf(kit, document, {
  title: "Example quotation",
  language: "nb-NO",
  pageSize: { width: 595, height: 842 },
  userToPdfScale: 0.75,
  fontCollection: fonts,
});
```

Serve the WASM file from `lib/wasm/` and provide your own licensed fonts. Page
sizes use PDF points. The existing default `userToPdfScale` remains `0.5`; the
examples explicitly use `0.75`. Keep export controls outside the exported document.

## Accessibility and limitations

Output has searchable text and a logical structure tree. Tests cover table
header IDs, category headers with colspan, repeated headers, multiple pages,
figures with alternative text/bounds, link annotations, XMP, outlines, hidden
captions and line wrapping. HTML must provide meaningful semantics, image
alternatives, document language and title.

Google SkPDF lacks some PDF structure operations. A final
pdf-lib pass adds the corresponding structure and annotations. Visually clipped
plain-text captions are restored as invisible embedded-font text. Custom font
collections must implement optional `getFontData(families, weight)` for these
captions; the supplied collection already implements it.

Passing veraPDF checks does **not** establish full PDF/UA or WCAG conformance for
every document. Reading order, descriptions and actual screen-reader table
navigation need manual testing. CSS support is limited by the DOM renderer;
browser layout remains the reference for supported content.

## Auditable CanvasKit / WASM

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

## Link and CSS safety

External PDF links allow only `https:` and `http:`. Relative web URLs are resolved
against the document base URL. Internal fragment links become PDF page destinations.
Other schemes, including `javascript:`, `data:`, `file:` and `mailto:`, remain
visible text without an active PDF link. URI policy is enforced at tag generation
and annotation serialization.

Relative color `calc()` expressions are evaluated as numbers, channel references,
parentheses and `+`, `-`, `*`, `/` operators. Unknown tokens, functions,
non-finite results and excessive nesting are rejected; CSS is never evaluated
as JavaScript. This does not make the library an HTML sanitizer.

## Development and tests

Use Node 22 or newer for development. The existing published runtime declaration
is unchanged. Install dependencies and the project's Chromium browser once:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:pdf
```

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

## License and contributions

MIT; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Do not add production snapshots, customer data or proprietary assets to tests.
