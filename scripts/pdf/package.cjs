const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { root, createServer } = require("./server.cjs");
const { chromium } = require("playwright");
const { run } = require("./run.cjs");
function npm(args, cwd) {
  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          [
            "/d",
            "/s",
            "/c",
            `npm ${args
              .map((arg) => {
                assert(!/["&|<>^%\r\n]/.test(arg));
                return `"${arg}"`;
              })
              .join(" ")}`,
          ],
          { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
        )
      : spawnSync("npm", args, {
          cwd,
          encoding: "utf8",
          maxBuffer: 20 * 1024 * 1024,
        });
  if (result.error || result.status !== 0)
    throw new Error(result.error?.message || result.stderr);
  return result.stdout;
}
async function packageTest() {
  const temporary = await fs.mkdtemp(path.join(root, ".cache/package-"));
  const packs = JSON.parse(
    npm(
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      root
    )
  );
  assert.equal(packs.length, 1);
  for (const file of packs[0].files) {
    assert(
      !file.path.endsWith(".tgz"),
      `Opaque archive in package: ${file.path}`
    );
    assert(
      !/(^|\/)(__tests__|__mocks__|test-data|tests)(\/|$)/.test(file.path),
      `Test material in package: ${file.path}`
    );
    assert(
      /^(lib\/|deps\/|scripts\/canvaskit\/|node_modules\/|package.json$|README.md$|LICENSE$|THIRD_PARTY_NOTICES.md$)/.test(
        file.path
      ),
      `Unexpected packaged file: ${file.path}`
    );
  }
  await fs.writeFile(
    path.join(temporary, "package.json"),
    JSON.stringify({
      private: true,
      name: "pdf-package-smoke-test",
      version: "1.0.0",
    })
  );
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      path.join(temporary, packs[0].filename),
    ],
    temporary
  );
  const packageRoot = path.join(temporary, "node_modules", packs[0].name);
  const module = require(packageRoot);
  assert.equal(typeof module.exportHTMLDocumentToPdf, "function");
  const manifest = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8")
  );
  await fs.access(path.join(packageRoot, manifest.typings));
  await fs.access(path.join(packageRoot, "lib/wasm/canvaskit-pdf.wasm"));
  await fs.access(path.join(packageRoot, "scripts/canvaskit/build.py"));
  await fs.access(
    path.join(packageRoot, "deps/canvaskit-pdf/pdf_bindings.cpp")
  );
  await require(path.join(
    packageRoot,
    "scripts/canvaskit/verify.cjs"
  )).verify();
  const server = createServer(path.join(packageRoot, "lib"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(
      `http://127.0.0.1:${server.address().port}/tests/pdf/fixtures/index.html`
    );
    const imported = await page.evaluate(async () => {
      const library = await import("/lib/html2pdf-skia.esm.js");
      return [
        "exportHTMLDocumentToPdf",
        "loadCanvasKit",
        "createFontCollection",
      ].every((name) => typeof library[name] === "function");
    });
    assert(imported, "Packed ESM module could not be imported in Chromium");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  await run(path.join(packageRoot, "lib"));
  console.log(
    "Packed package installs, imports, exposes declarations/WASM and exports all browser fixtures"
  );
}
module.exports = { packageTest };
if (require.main === module)
  packageTest().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
