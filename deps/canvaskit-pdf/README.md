# CanvasKit PDF source build

This package uses Google's BSD-3-Clause Skia CanvasKit 0.42.0 from
https://skia.googlesource.com/skia.git at
`e2def78fa232884d4aedcf3ad92d4a0dd673b898`.
The only additional native implementation is `pdf_bindings.cpp` (MIT).
It calls SkPDF and exposes `MakePDFDocument`, `SetPDFTagId` and `GetTypefaceId`.
PDF structure names and numeric attributes are checked before serialization.

The builder enables SkPDF in Google's CanvasKit build, adds the bridge, and uses
CPU rendering, paragraph/font providers and client Unicode (plus SkPDF's
ICU bidi subset). GPU, Skottie,
embedded fonts, WOFF2 and tracing are disabled. Consumers supply fonts.
The upstream mutable Path API became PathBuilder; the library adapts this
internally without changing PDF export options. Direct CanvasKit consumers
receive Google's 0.42 API.

From the repository root, run `npm run build:canvaskit` to rebuild using Docker.
`npm run test:canvaskit:rebuild` compares the rebuilt artifacts without replacing
them. `scripts/canvaskit/build.py` runs inside the pinned Emscripten image;
Python is not a host requirement. `scripts/canvaskit/build.cjs` starts that image.
The build overlays two pinned Google build files; it rejects other source edits
and verifies all selected dependency checkouts against Google's DEPS revisions.

`provenance.json` records source and dependency revisions, compiler image digest,
bridge/build-script hashes and artifact hashes. Hashes alone do not prove trust:
CI additionally recompiles the source and compares the actual output.
`LICENSE`, `CHROMIUM-LICENSE` and `THIRD_PARTY_LICENSES.txt` cover upstream code.
PartitionAlloc's exported repository omits Chromium's root license; the pinned
primary source URL and digest of that license are recorded separately.

The bridge supplies SkPDF tags. The library still finalizes table header links,
figure bounds, annotation structure, metadata and outlines with pdf-lib.
Automated fixture results do not establish conformance for every document;
manual PAC and screen-reader testing remain release checks.
