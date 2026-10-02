const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { createServer, root } = require("./server.cjs");
const { audit } = require("./audit.cjs");
const variants = ["minimal", "quote", "discount", "long", "long-no-discount"];
async function run(library) {
  const output = path.join(root, ".cache/pdf-tests");
  await fs.mkdir(output, { recursive: true });
  const server = createServer(library);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const variant of variants) {
      const page = await browser.newPage({
        viewport: { width: 1400, height: 1800 },
        deviceScaleFactor: 1,
      });
      const failures = [];
      page.on("pageerror", (error) => failures.push(error.message));
      page.on("requestfailed", (request) => failures.push(request.url()));
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.protocol === "http:" && url.hostname === "127.0.0.1")
          return route.continue();
        failures.push(`External asset: ${url.href}`);
        return route.abort();
      });
      await page.goto(
        `http://127.0.0.1:${
          server.address().port
        }/tests/pdf/fixtures/index.html?fixture=${variant}`
      );
      const fields = await page.evaluate(async () => {
        await window.ready;
        const doc = document.getElementById("fixture").contentDocument;
        return ["customer", "contact"].flatMap((id) => {
          const element = doc.getElementById(id);
          if (!element) return [];
          const node = element.firstChild,
            groups = [];
          for (let i = 0; i < node.length; i++) {
            const range = doc.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const box = range.getBoundingClientRect();
            let group = groups.find((g) => Math.abs(g.y - box.top) < 0.5);
            if (!group) {
              group = { y: box.top, text: "" };
              groups.push(group);
            }
            group.text += node.data[i];
          }
          return [
            {
              id,
              box: element.getBoundingClientRect().toJSON(),
              lines: groups.map((g) => g.text),
            },
          ];
        });
      });
      const bytes = await page.evaluate(async () =>
        Array.from(
          new Uint8Array(await (await window.exportFixture()).arrayBuffer())
        )
      );
      assert.deepEqual(failures, []);
      const filename = path.join(output, `${variant}.pdf`);
      await fs.writeFile(filename, Buffer.from(bytes));
      await fs.writeFile(
        path.join(output, `${variant}.browser.json`),
        JSON.stringify(fields, null, 2)
      );
      const result = await audit(filename, variant, fields);
      results.push(result);
      console.log(JSON.stringify(result));
      await page.close();
    }
    await fs.writeFile(
      path.join(output, "results.json"),
      JSON.stringify(
        { platform: process.platform, chromium: browser.version(), results },
        null,
        2
      )
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
module.exports = { run, variants };
if (require.main === module)
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
