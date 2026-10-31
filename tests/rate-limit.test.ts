import assert from "node:assert/strict";
import { test } from "node:test";

process.env.RATE_LIMIT_PER_HOUR = "2";
process.env.GLOBAL_LIMIT_PER_HOUR = "3";
process.env.MAX_CONCURRENT_PLANS = "1";
test("limits concurrent builds, per-address use and total use", async () => {
  // Imported after the env is set, since the limits are read at load time.
  const { allow } = await import("../src/lib/rate-limit");
  const a1 = allow("1.1.1.1");
  assert.equal(a1.ok, true);
  const busy = allow("2.2.2.2");
  assert.equal(busy.ok, false, "only one build at a time");
  if (a1.ok) a1.release();

  const a2 = allow("1.1.1.1");
  assert.equal(a2.ok, true);
  if (a2.ok) a2.release();
  assert.equal(allow("1.1.1.1").ok, false, "per-address limit reached");

  const b1 = allow("2.2.2.2");
  assert.equal(b1.ok, true);
  if (b1.ok) b1.release();
  assert.equal(allow("3.3.3.3").ok, false, "global limit reached");
});
