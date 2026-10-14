/**
 * The API returns priority reasons as [{ rule, points }]. Older/seed data or other
 * callers may use a { rule: points } map. Normalize both to a list of display rows.
 */
export function normalizeReasons(reasons) {
  if (!reasons) return [];
  const rows = Array.isArray(reasons)
    ? reasons.map((r) => ({ rule: String(r?.rule ?? r?.key ?? ''), points: Number(r?.points ?? 0) }))
    : Object.entries(reasons).map(([rule, points]) => ({ rule, points: Number(points) }));
  return rows.filter((r) => r.rule);
}

export const formatRule = (rule) => rule.replace(/_/g, ' ');
