const { test } = require("node:test");
const assert = require("node:assert/strict");
const { XMLParser } = require("fast-xml-parser");

test("XML entity limits remain enforced when explicitly set to zero", () => {
  const parser = new XMLParser({
    processEntities: { enabled: true, maxEntityCount: 0, maxEntitySize: 0 },
  });
  assert.throws(
    () =>
      parser.parse(
        '<!DOCTYPE doc [<!ENTITY example "text">]><doc>&example;</doc>'
      ),
    /Entity count|Entity .*size/
  );
});
