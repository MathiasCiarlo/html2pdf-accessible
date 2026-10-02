# Third-party notices

Upstream html2pdf-skia and html2canvas attribution and the MIT license are retained.
The bundled `@html2pdf-skia/canvaskit-pdf` is built from Google's open-source
Skia CanvasKit 0.42.0, revision `e2def78fa232884d4aedcf3ad92d4a0dd673b898`.
Google Skia is BSD-3-Clause; our `pdf_bindings.cpp` bridge is MIT. Source URLs,
compiler image digest, dependency revisions and artifact hashes are recorded in
`deps/canvaskit-pdf/provenance.json`. The Skia license, Chromium PartitionAlloc
license and third-party notices are shipped alongside the bridge and binaries.
See `deps/canvaskit-pdf/THIRD_PARTY_LICENSES.txt` for the included notices.

Runtime dependencies include pdf-lib and @pdf-lib/fontkit (MIT), css-line-break,
emoji-regex-xs and text-segmentation. Their licenses accompany the dependencies.
Production webpack output retains applicable license comments.

Inter Regular and SemiBold test fonts are Copyright the Inter Project Authors,
under SIL Open Font License 1.1; see `tests/pdf/assets/OFL.txt`. Fonts and fixture
assets are not shipped in the npm package. `product.svg` is an original synthetic
illustration distributed under this project's MIT license.

veraPDF is an external development/CI tool under GPLv3/MPLv2 dual licensing,
not a runtime dependency. Playwright, PDF.js, the native canvas adapter and
fast-xml-parser have their own licenses. Browsers and validator binaries are
not shipped in the npm package.
