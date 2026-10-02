# Third-party notices

Upstream html2pdf-skia and html2canvas attribution and the MIT license are retained.
The bundled `@rollerbird/canvaskit-wasm-pdf` 0.1.3 archive contains Google Skia /
CanvasKit code. Its license is distributed in the dependency. The original
archive under `deps/` is required for installation and is retained.

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
