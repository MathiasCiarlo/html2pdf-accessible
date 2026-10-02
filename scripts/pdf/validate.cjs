const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { XMLParser, XMLValidator } = require("fast-xml-parser");
const { root } = require("./server.cjs");
const { variants } = require("./run.cjs");
const image = "verapdf/cli:v1.30.2";
function checkReport(xml, expected = 1) {
  assert.equal(XMLValidator.validate(xml), true, "Invalid validator XML");
  const report = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
  }).parse(xml)?.report;
  const jobs = report?.jobs?.job;
  const entries = Array.isArray(jobs) ? jobs : jobs ? [jobs] : [];
  assert.equal(entries.length, expected, "Missing validation jobs");
  for (const job of entries) {
    const validation = job.validationReport;
    assert(validation, "Missing validation report");
    assert.equal(
      validation["@_jobEndStatus"],
      "normal",
      "Validator did not finish normally"
    );
    assert.equal(validation["@_isCompliant"], true, "PDF/UA validation failed");
    assert.equal(
      validation["@_profileName"],
      "PDF/UA-1 validation profile",
      "Wrong validation profile"
    );
    assert.equal(validation.details?.["@_failedRules"], 0);
    assert.equal(validation.details?.["@_failedChecks"], 0);
    assert(validation.details?.["@_passedChecks"] > 0, "No checks performed");
  }
  const summary = report.batchSummary;
  assert(summary, "Missing batch summary");
  assert.equal(summary["@_totalJobs"], expected);
  for (const failure of [
    "failedToParse",
    "encrypted",
    "outOfMemory",
    "veraExceptions",
  ])
    assert.equal(summary[`@_${failure}`], 0, `Validator ${failure}`);
  assert.equal(summary.validationReports?.["@_failedJobs"], 0);
  assert.equal(summary.validationReports?.["@_nonCompliant"], 0);
  assert.equal(summary.validationReports?.["@_compliant"], expected);
  return entries.length;
}
async function validate() {
  const dir = path.join(root, ".cache/pdf-tests");
  for (const variant of variants) {
    const pdf = path.join(dir, `${variant}.pdf`);
    await fs.access(pdf);
    let result;
    if (process.env.VERAPDF_PATH) {
      const executable = process.env.VERAPDF_PATH;
      if (process.platform === "win32" && /\.(bat|cmd)$/i.test(executable)) {
        assert(
          !/["&|<>^%\r\n]/.test(executable + pdf),
          "Unsupported shell characters in validator path"
        );
        result = spawnSync(`"${executable}" -f ua1 "${pdf}"`, {
          shell: true,
          encoding: "utf8",
          maxBuffer: 20 * 1024 * 1024,
        });
      } else
        result = spawnSync(executable, ["-f", "ua1", pdf], {
          encoding: "utf8",
          maxBuffer: 20 * 1024 * 1024,
        });
    } else
      result = spawnSync(
        "docker",
        [
          "run",
          "--rm",
          "--mount",
          `type=bind,source=${dir},target=/data,readonly`,
          image,
          "-f",
          "ua1",
          `/data/${variant}.pdf`,
        ],
        { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
      );
    if (result.error || result.status !== 0)
      throw new Error(
        `veraPDF could not run: ${
          result.error?.message || result.stderr
        }. Install Docker or set VERAPDF_PATH.`
      );
    await fs.writeFile(path.join(dir, `${variant}.verapdf.xml`), result.stdout);
    checkReport(result.stdout);
    console.log(`${variant}: PDF/UA-1 machine validation passed`);
  }
}
module.exports = { checkReport, validate, image };
if (require.main === module)
  validate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
