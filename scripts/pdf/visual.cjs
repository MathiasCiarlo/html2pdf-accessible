const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const canvas = require("@napi-rs/canvas");
const { pdfjs } = require("./audit.cjs");
const { variants } = require("./run.cjs");
const { root } = require("./server.cjs");
async function visual(update = process.argv.includes("--update")) {
  assert.equal(
    process.platform,
    "linux",
    "Visual baselines use Linux. Run the documented Playwright container on Windows/macOS."
  );
  const output = path.join(root, ".cache/pdf-tests"),
    expected = path.join(root, "tests/pdf/expected");
  const provenance = JSON.parse(
    await fs.readFile(path.join(output, "results.json"), "utf8")
  );
  assert.equal(
    provenance.platform,
    "linux",
    "Regenerate PDFs in the Linux container first"
  );
  const names = [];
  for (const variant of variants) {
    const doc = await (
      await pdfjs()
    ).getDocument({
      data: new Uint8Array(
        await fs.readFile(path.join(output, `${variant}.pdf`))
      ),
      useSystemFonts: false,
    }).promise;
    for (let index = 1; index <= doc.numPages; index++) {
      const page = await doc.getPage(index),
        viewport = page.getViewport({ scale: 1.5 });
      const surface = canvas.createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height)
      );
      await page.render({
        canvasContext: surface.getContext("2d"),
        canvas: surface,
        viewport,
      }).promise;
      const filename = `${variant}-${index}.png`;
      names.push(filename);
      const png = surface.toBuffer("image/png");
      await fs.writeFile(path.join(output, filename), png);
      if (update) await fs.writeFile(path.join(expected, filename), png);
      else {
        const reference = await canvas.loadImage(path.join(expected, filename));
        assert.equal(reference.width, surface.width);
        assert.equal(reference.height, surface.height);
        const comparison = canvas.createCanvas(surface.width, surface.height);
        comparison.getContext("2d").drawImage(reference, 0, 0);
        assert.deepEqual(
          surface
            .getContext("2d")
            .getImageData(0, 0, surface.width, surface.height).data,
          comparison
            .getContext("2d")
            .getImageData(0, 0, surface.width, surface.height).data,
          `Visual regression: ${filename}`
        );
      }
    }
    await doc.destroy();
  }
  const manifest = {
    platform: "linux",
    chromium: provenance.chromium,
    files: names,
  };
  if (update) {
    for (const filename of await fs.readdir(expected))
      if (filename.endsWith(".png") && !names.includes(filename))
        await fs.unlink(path.join(expected, filename));
    await fs.writeFile(
      path.join(expected, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
  } else
    assert.deepEqual(
      JSON.parse(
        await fs.readFile(path.join(expected, "manifest.json"), "utf8")
      ),
      manifest
    );
  console.log(
    `${names.length} PDF page images ${
      update ? "updated; review before committing" : "match their references"
    }`
  );
}
module.exports = { visual };
if (require.main === module)
  visual().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
