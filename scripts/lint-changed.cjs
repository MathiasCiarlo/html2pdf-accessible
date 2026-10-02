const { ESLint } = require("eslint");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function counts(result) {
  const rules = {};
  for (const message of result.messages) {
    const rule = message.ruleId || "parse-error";
    rules[rule] = (rules[rule] || 0) + 1;
  }
  return rules;
}
async function lint() {
  const eslint = new ESLint({ cwd: root });
  let base = process.env.LINT_BASE || "HEAD";
  if (/^0+$/.test(base)) {
    base = execFileSync("git", ["hash-object", "-t", "tree", "--stdin"], {
      cwd: root,
      input: "",
      encoding: "utf8",
    }).trim();
  }
  const modified = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", base],
    { cwd: root, encoding: "utf8" }
  );
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" }
  );
  const files = [
    ...new Set((modified + "\n" + untracked).trim().split(/\r?\n/)),
  ].filter((f) => /\.(ts|js|cjs)$/.test(f));
  const debt = JSON.parse(
    await fs.readFile(path.join(root, "scripts/lint-debt.json"), "utf8")
  );
  if (!files.length) {
    console.log("No changed JavaScript or TypeScript files");
    return;
  }
  let failures = 0;
  for (const result of await eslint.lintFiles(files)) {
    const relative = path
      .relative(root, result.filePath)
      .split(path.sep)
      .join("/");
    for (const [rule, count] of Object.entries(counts(result))) {
      if (count > (debt[relative]?.[rule] || 0)) {
        console.error(
          `${relative}: ${rule}: ${count} findings (historical allowance ${
            debt[relative]?.[rule] || 0
          })`
        );
        failures++;
      }
    }
  }
  if (failures)
    throw new Error(
      "Changed files introduce lint findings beyond the documented historical baseline"
    );
  console.log(
    `${files.length} changed files checked; no additional lint findings`
  );
}
module.exports = { counts };
if (require.main === module)
  lint().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
