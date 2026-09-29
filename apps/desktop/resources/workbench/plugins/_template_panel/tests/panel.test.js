const { test } = require("node:test");
const assert = require("node:assert/strict");
const plugin = require("../index.js");

test("ping", async () => {
  const out = JSON.parse(await plugin.execute({ action: "ping" }, { config: {}, storage: { get: () => null, set: () => {} } }));
  assert.equal(out.ok, true);
});
