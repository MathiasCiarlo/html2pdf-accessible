const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkReport } = require("../../../scripts/pdf/validate.cjs");
const valid =
  '<report><jobs><job><validationReport jobEndStatus="normal" isCompliant="true" profileName="PDF/UA-1 validation profile"><details failedRules="0" failedChecks="0" passedChecks="42"/></validationReport></job></jobs><batchSummary totalJobs="1" failedToParse="0" encrypted="0" outOfMemory="0" veraExceptions="0"><validationReports failedJobs="0" nonCompliant="0" compliant="1"/></batchSummary></report>';
test("accepts completed UA1 validation", () =>
  assert.equal(checkReport(valid), 1));
test("rejects missing report and malformed XML", () => {
  for (const xml of [
    "",
    "<report/>",
    "<broken>",
    valid.replace(/<validationReport.*?<\/validationReport>/, ""),
  ])
    assert.throws(() => checkReport(xml));
});
test("rejects noncompliance, parser failures, wrong profiles, incomplete jobs and empty checks", () => {
  for (const [a, b] of [
    ['isCompliant="true"', 'isCompliant="false"'],
    ['failedToParse="0"', 'failedToParse="1"'],
    ["PDF/UA-1", "PDF/A-1"],
    ['jobEndStatus="normal"', 'jobEndStatus="exception"'],
    ['failedChecks="0"', 'failedChecks="1"'],
    ['passedChecks="42"', 'passedChecks="0"'],
  ])
    assert.throws(() => checkReport(valid.replace(a, b)));
  assert.throws(() => checkReport(valid, 5));
});
