const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  releasePlan,
  checkRegistry,
} = require("../../../scripts/release/check.cjs");
const current = { name: "html2pdf-accessible", version: "0.1.4" };
const lock = { ...current, packages: { "": current } };

test("unchanged versions skip publishing; bumps and first releases publish", () => {
  assert.equal(releasePlan(current, current, lock).publish, false);
  assert.equal(
    releasePlan(current, { ...current, version: "0.1.3" }, lock).publish,
    true
  );
  assert.equal(releasePlan(current, undefined, lock).publish, true);
  assert.equal(
    releasePlan(current, { ...current, name: "old-name" }, lock).publish,
    false
  );
  assert.equal(releasePlan(current, current, lock).tag, "latest");
  const prerelease = { ...current, version: "0.2.0-beta.1" };
  assert.equal(
    releasePlan(prerelease, current, {
      ...prerelease,
      packages: { "": prerelease },
    }).tag,
    "next"
  );
});

test("rejects inconsistent lockfiles and invalid versions", () => {
  assert.throws(() =>
    releasePlan(current, current, { ...lock, version: "0.1.3" })
  );
  assert.throws(() => releasePlan(current, current, { ...lock, packages: {} }));
  for (const version of [
    "01.2.3",
    "1.2",
    "1.2.3-01",
    "1.2.3+build",
    "1.2.3\ninjected=true",
  ])
    assert.throws(() => releasePlan({ ...current, version }, current, lock));
});

test("registry failures and published versions stop publishing; only 404 is available", async () => {
  await checkRegistry(current, async () => ({ status: 404, ok: false }));
  for (const status of [200, 401, 429, 500])
    await assert.rejects(
      checkRegistry(current, async () => ({ status, ok: status === 200 }))
    );
  await assert.rejects(
    checkRegistry(current, async () => {
      throw new Error("network unavailable");
    })
  );
});
