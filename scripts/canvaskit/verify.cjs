const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const backend = path.join(root, "deps/canvaskit-pdf");
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
async function verify(output) {
  const manifest = JSON.parse(
    await fs.readFile(path.join(output || backend, "provenance.json"), "utf8")
  );
  assert.equal(
    manifest.skiaRevision,
    "e2def78fa232884d4aedcf3ad92d4a0dd673b898"
  );
  assert.equal(manifest.source, "https://skia.googlesource.com/skia.git");
  assert.equal(
    manifest.buildImage,
    "emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7"
  );
  assert.equal(
    digest(await fs.readFile(path.join(backend, "pdf_bindings.cpp"))),
    manifest.bridgeSha256,
    "PDF bridge changed without a source rebuild"
  );
  assert.equal(
    digest(await fs.readFile(path.join(__dirname, "build.py"))),
    manifest.buildScriptSha256,
    "Build script changed without a source rebuild"
  );
  assert.equal(
    digest(
      await fs.readFile(
        path.join(output || path.join(backend, "types"), "google-types.d.ts")
      )
    ),
    manifest.typeDefinitionsSha256,
    "Google type definitions differ"
  );
  assert.equal(
    digest(
      await fs.readFile(
        path.join(output || backend, "THIRD_PARTY_LICENSES.txt")
      )
    ),
    manifest.licensesSha256,
    "License notices differ"
  );
  const chromium = JSON.parse(
    await fs.readFile(
      path.join(backend, "chromium-license-source.json"),
      "utf8"
    )
  );
  assert.deepEqual(chromium, manifest.chromiumLicenseSource);
  assert.equal(
    digest(await fs.readFile(path.join(backend, "CHROMIUM-LICENSE"))),
    chromium.sha256
  );
  for (const file of ["canvaskit.js", "canvaskit.wasm"])
    assert.equal(
      digest(
        await fs.readFile(path.join(output || path.join(backend, "bin"), file))
      ),
      manifest.artifacts[file],
      `Artifact checksum mismatch: ${file}`
    );
  console.log("CanvasKit source manifest and artifact checksums verified");
}
module.exports = { verify };
if (require.main === module)
  verify().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
