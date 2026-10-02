const path = require("node:path");
const fs = require("node:fs/promises");
const { spawnSync } = require("node:child_process");
const { verify } = require("./verify.cjs");
const root = path.resolve(__dirname, "../..");
const image =
  "emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7";
async function build() {
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--mount",
      "type=volume,source=html2pdf-skia-source-build,target=/build",
      "--mount",
      `type=bind,source=${root},target=/work`,
      image,
      "python3",
      "/work/scripts/canvaskit/build.py",
    ],
    { stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("CanvasKit source build failed");
  const output = path.join(root, ".cache/canvaskit-built");
  const target = path.join(root, "deps/canvaskit-pdf");
  if (process.argv.includes("--check")) {
    await verify(output);
    for (const file of [
      "canvaskit.js",
      "canvaskit.wasm",
      "google-types.d.ts",
      "THIRD_PARTY_LICENSES.txt",
      "provenance.json",
    ]) {
      const actual = await fs.readFile(path.join(output, file));
      const expected = await fs.readFile(
        path.join(
          target,
          file.endsWith(".wasm") || file.endsWith(".js")
            ? "bin"
            : file.endsWith(".d.ts")
            ? "types"
            : "",
          file
        )
      );
      if (!actual.equals(expected))
        throw new Error(`Source rebuild differs: ${file}`);
    }
    console.log(
      "Source-rebuilt binaries, types, licenses and provenance match included artifacts"
    );
  } else {
    await fs.mkdir(path.join(target, "bin"), { recursive: true });
    for (const file of ["canvaskit.js", "canvaskit.wasm"])
      await fs.copyFile(
        path.join(output, file),
        path.join(target, "bin", file)
      );
    for (const file of ["provenance.json", "THIRD_PARTY_LICENSES.txt"])
      await fs.copyFile(path.join(output, file), path.join(target, file));
    await fs.copyFile(
      path.join(output, "google-types.d.ts"),
      path.join(target, "types/google-types.d.ts")
    );
    await verify();
  }
}
build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
