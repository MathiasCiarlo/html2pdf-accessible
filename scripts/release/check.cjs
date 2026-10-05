const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

function releasePlan(current, previous, lock) {
  const version = current.version;
  const numeric = "(?:0|[1-9][0-9]*)";
  const identifier = "(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)";
  const semver = new RegExp(
    `^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`
  );
  if (!semver.test(version || ""))
    throw new Error("Package version must be a SemVer without build metadata");
  if (
    lock.version !== version ||
    lock.packages?.[""]?.version !== version ||
    lock.name !== current.name ||
    lock.packages?.[""]?.name !== current.name
  )
    throw new Error("Package and lockfile names/versions must agree");
  return {
    publish: !previous || previous.version !== version,
    version,
    tag: version.includes("-") ? "next" : "latest",
  };
}

async function checkRegistry(current, fetcher = fetch) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(
    current.name
  )}/${encodeURIComponent(current.version)}`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) return;
  if (!response.ok)
    throw new Error(`npm registry lookup failed: HTTP ${response.status}`);
  throw new Error(`${current.name}@${current.version} already exists on npm`);
}

async function main() {
  const current = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (process.argv.includes("--registry-check")) {
    await checkRegistry(current);
    return;
  }
  const before = process.env.BEFORE_SHA;
  if (!/^[0-9a-f]{40}$/.test(before || ""))
    throw new Error("BEFORE_SHA must contain the push event's previous commit");
  const previous = /^0+$/.test(before)
    ? undefined
    : JSON.parse(
        execFileSync("git", ["show", `${before}:package.json`], {
          encoding: "utf8",
        })
      );
  const plan = releasePlan(
    current,
    previous,
    JSON.parse(fs.readFileSync("package-lock.json", "utf8"))
  );
  const output = `publish=${plan.publish}\nversion=${plan.version}\ntag=${plan.tag}\n`;
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
}

module.exports = { releasePlan, checkRegistry };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
