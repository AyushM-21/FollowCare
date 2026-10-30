import test from "node:test";
import assert from "node:assert/strict";
import { scoreFollowUps, ruleBasedFallback } from "./mlClient.mjs";

const items = [{ followup_id: "f1", followup: { priority: "high" } }];
const ok = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });

test("returns model predictions", async () => {
  const p = [{ followup_id: "f1", source: "ml_model", ml_score: 0.3 }];
  assert.deepEqual(await scoreFollowUps(items, { fetchImpl: ok({ predictions: p }) }), p);
});
test("falls back on 503", async () => {
  const r = await scoreFollowUps(items, { fetchImpl: ok({}, 503) });
  assert.equal(r[0].source, "rule_based_fallback");
  assert.equal(r[0].rule_based_priority, "high");
});
test("falls back when service is down", async () => {
  const r = await scoreFollowUps(items, { fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(r[0].source, "rule_based_fallback");
});
test("falls back on length mismatch / malformed body", async () => {
  assert.equal((await scoreFollowUps(items, { fetchImpl: ok({ predictions: [] }) }))[0].source, "rule_based_fallback");
  assert.equal((await scoreFollowUps(items, { fetchImpl: ok({ nope: 1 }) }))[0].source, "rule_based_fallback");
});
test("empty input", async () => { assert.deepEqual(await scoreFollowUps([]), []); });
test("fallback shape", () => { assert.equal(ruleBasedFallback([{}])[0].ml_score, null); });
