// Presentational cell for the staff priority queue (React + Tailwind). Not wired to any route yet:
// pass it one prediction from scoreFollowUps() plus the existing rule-based priority.
// The percentage is shown ONLY when the model reports a calibrated probability.
export default function MlScoreCell({ prediction, rulePriority, onOverride }) {
  const rule = rulePriority ?? prediction?.rule_based_priority ?? "-";
  if (!prediction || prediction.source !== "ml_model") {
    return <span className="text-sm text-gray-600">Priority: {rule} <span className="text-xs">(rule-based)</span></span>;
  }
  const pct = prediction.estimated_probability_missed;
  return (
    <div className="text-sm">
      <div>Priority (rules): <strong>{rule}</strong></div>
      <div>
        {pct != null ? <>Estimated chance of a missed follow-up: <strong>{Math.round(pct * 100)}%</strong></>
                     : <>Model ranking score: <strong>{prediction.ml_score.toFixed(2)}</strong> <span className="text-xs">(not a probability)</span></>}
        {prediction.above_review_threshold && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Review suggested</span>}
      </div>
      {prediction.top_factors?.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-gray-600">
          {prediction.top_factors.map((f) => <li key={f.factor}>{f.factor}: {f.direction}</li>)}
        </ul>
      )}
      <div className="mt-1 text-xs text-gray-500">Decision support only; staff can override.</div>
      {onOverride && <button type="button" className="mt-1 text-xs underline" onClick={onOverride}>Override priority</button>}
    </div>
  );
}
