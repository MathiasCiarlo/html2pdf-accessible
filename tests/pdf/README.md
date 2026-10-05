# PDF regression tests

Fixtures are synthetic, use local Inter 400/600, language nb-NO and page size
595 × 842 points. They retain Vue-style attributes and multiple classes as
regression cases. The download button is outside the exported iframe document.

## Test layers

1. Jest tests cover structure mapping, annotations, captions and overlapping
   glyph bounds. Existing upstream tests remain enabled.
2. Chromium exports five fixtures. PDF.js and pdf-lib independently inspect
   text, structure, IDs/Headers, ParentTree/OBJR, figures, metadata, outlines,
   pagination, repeated headers and text within column boundaries.
3. PDF.js renders 23 pages against reference PNGs in the pinned Linux container.
   Pixels are compared exactly; PDF bytes are not compared.
4. veraPDF validates with `-f ua1`. Wrapper tests reject missing/malformed XML,
   noncompliance, parser failures, wrong profiles and incomplete jobs.

## Canonical visual environment

Run from the repository root:

```sh
docker build -t html2pdf-tests -f tests/pdf/Dockerfile .
docker run --rm --mount "type=bind,source=$(pwd),target=/work" \
  --mount type=volume,source=html2pdf-test-deps,target=/work/node_modules \
  html2pdf-tests bash -lc "npm ci --ignore-scripts && npm run test:pdf && npm run test:pdf:visual"
```

In PowerShell use `$($PWD.Path)` instead of `$(pwd)` and put the command on one
line. For intentional updates replace `test:pdf:visual` with `test:pdf:update`
in this same container. Inspect the changed images and commit their manifest.
CI never updates references automatically. No online validator receives PDFs.

## Lint policy

`npm run lint` checks all source, test and tool files with zero warnings allowed.
`npm run lint:changed` checks changed files against an empty baseline; historical
allowances were removed after the repository-wide lint cleanup.
Set `LINT_BASE` to the comparison commit in CI.

The package smoke test installs the tarball in a consumer project, resolves its
WebGPU types within that installation and compiles the public API with
`skipLibCheck: false`. Browser fixtures also cover configured generic font
families for hidden captions and a `href="#"` link from a later page to page one.
Generated reports belong in ignored `.cache/` or `output/`, never in Git.

## Manual release checks

Open synthetic quote/long-table PDFs in PAC and inspect PDF/UA, WCAG and Quality.
Navigate tables with a screen reader: check price/discount titles, categories,
colspan, repeated headers and reading order across pages. Record reader/viewer
versions and results. Automated checks alone do not prove accessible navigation.
