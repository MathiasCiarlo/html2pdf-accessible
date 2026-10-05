const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};
function createServer(library = path.join(root, "lib")) {
  return http.createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname
      );
      const base = name.startsWith("/lib/")
        ? library
        : path.join(root, "tests/pdf");
      const relative = name.startsWith("/lib/")
        ? name.slice(5)
        : name.replace(/^\/tests\/pdf\//, "");
      const file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep))
        return response.writeHead(403).end();
      response.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(await fs.readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
}
module.exports = { createServer, root };
if (require.main === module)
  createServer().listen(4001, "127.0.0.1", () =>
    console.log("http://127.0.0.1:4001/tests/pdf/fixtures/index.html")
  );
