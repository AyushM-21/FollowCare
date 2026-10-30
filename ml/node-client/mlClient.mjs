// Calls the local FollowCare ML service (python -m ml.api). Never throws: on any problem it returns the
// existing rule-based priority so the app keeps working. Needs Node 18+ (global fetch).
const BASE = process.env.FOLLOWCARE_ML_URL || "http://127.0.0.1:5001";

export function ruleBasedFallback(items) {
  return items.map((i) => ({
    followup_id: i?.followup_id ?? null,
    source: "rule_based_fallback",
    rule_based_priority: i?.followup?.priority ?? null,
    ml_score: null,
  }));
}

/**
 * items: [{ followup_id, followup:{due_date, source_encounter_class, followup_type, reason_description, priority},
 *           patient:{...}, risk:{...}, history:[{due_date, status}] }]   (see ml/feature_builder.py)
 * Returns one prediction per item, in the same order.
 */
export async function scoreFollowUps(items, { timeoutMs = 2000, fetchImpl = fetch, apiKey = process.env.FOLLOWCARE_ML_API_KEY } = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  try {
    const res = await fetchImpl(`${BASE}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return ruleBasedFallback(items);
    const { predictions } = await res.json();
    return Array.isArray(predictions) && predictions.length === items.length ? predictions : ruleBasedFallback(items);
  } catch {
    return ruleBasedFallback(items); // service down, timeout, bad JSON
  }
}
