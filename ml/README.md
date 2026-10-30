# FollowCare ML – missed-follow-up prediction (HistGradientBoostingClassifier)

Drop-in `ml/` folder (this file is `ml/README.md`; it does not replace the repo's root README). All results use the supplied
CSVs, which look synthetic, so they are **not real-world performance**. The model is administrative decision support, never clinical triage.

## Setup, train, evaluate, predict
```bash
pip install -r ml/requirements.txt
mkdir -p data/raw   # put followups.csv, patient_risk.csv, patients_followcare.csv here (contain PII/synthetic PII: keep out of git)
python -m ml.fix_dataset --data-dir data/raw --out-dir data/processed   # cleaned, PII-free CSVs
python -m ml.train_model --processed-dir data/processed --artifact-dir ml/artifacts
python -m pytest ml                        # 24 Python tests (synthetic data only)
node --test ml/node-client/mlClient.test.mjs   # 6 Node client tests
```
```python
from ml.predict_service import FollowUpPredictorService
svc = FollowUpPredictorService("ml/artifacts")   # never raises; falls back to the rule-based priority if the model is unusable
svc.predict([{...26 feature fields incl. "priority"...}])
```
Artifacts: `followup_hgb_model.joblib`, `followup_calibrator.joblib`, `model_metadata.json`, `scored_pending_queue.csv`.
Loading checks SHA-256 and scikit-learn minor version (joblib files are pickles: load only files you trained).
`data/raw/`, `data/processed/` and `ml/artifacts/` are git-ignored: after a fresh clone, run the two training commands above before the model loads (until then the service falls back to the rule-based priority). `scikit-learn` is pinned (`==1.9.1`) because the loader refuses artifacts trained with a different minor version.

## Data facts (all re-verified against the files)
1,163 patients (1,000 living, 163 deceased); 3,190 follow-ups; 171 follow-ups of 13 deceased patients dropped; 2,713 training rows
(583 missed = 21.49%, 2,130 not missed); 219 rescheduled excluded from the living-patient set; 87 pending go to the inference queue.
`missed_followups_last_12m` matches the real count of misses in the last 365 days for 99.8% of patients (corr 0.9987), so it is a leak and is dropped.

## What was built
- `fix_dataset.py`: drops post-outcome and snapshot-leak columns and all PII; point-in-time history from the patient's rows with
  `prior_due_date < current_due_date` (`--lead-days N` makes it stricter); `clinical_baseline_score`; top-15 reason grouping + "Other";
  "Unknown"/"None" imputation. 15 numeric + 11 categorical = 26 features.
- `train_model.py`: `GroupShuffleSplit(test 15%, seed 42)` by patient (470 test rows, 97 missed); `GroupKFold(5)` grid search on
  training only; threshold and Platt calibration fitted on out-of-fold training predictions; test set used once.
- `predict_service.py`: input validation (types, ranges, count consistency), calibrated probability only if calibration passes,
  top-3 "what changes the score" factors (association, not causation), rule-based fallback. `test_pipeline.py` / `test_api.py`: leakage, point-in-time, PII, deceased, fallback, tampering, validation, training-vs-online feature consistency, API behaviour.
- `feature_builder.py`: builds the 26 features from raw DB-style rows (history uses only rows due strictly earlier), so the backend does not reimplement feature logic.
- `api.py`: local Flask wrapper (`/score`, `/predict`, `/health`), API-key protected, 503 + rule-based fallback if the model is unusable.
- `node-client/mlClient.mjs`: Node 18+ client with timeout; never throws, returns the rule-based priority on any failure.
- `web-example/MlScoreCell.jsx`: presentational React cell for the staff queue (not wired in yet).

## Results on the untouched test set (470 rows, 97 missed, no-skill PR-AUC 0.206)
Measured with scikit-learn 1.9.1, seed 42, patient-grouped 85/15 split.

| Model | ROC-AUC (95% CI) | PR-AUC (95% CI) |
|---|---|---|
| HGB, tuned by 5-fold group CV (lr 0.03, depth 3, 15 leaves, min leaf 10, l2 1.0) | 0.689 (0.612-0.742) | 0.344 (0.210-0.430) |
| HGB, alternative fixed hyper-parameters (lr 0.08, depth 7, 15 leaves, min leaf 10, l2 10) | 0.671 (0.593-0.729) | 0.355 |
| Logistic Regression baseline | 0.675 (0.592-0.729) | 0.345 (0.232-0.434) |
| Existing rule (`priority`) | 0.585 | 0.257 |

Tuned HGB: Brier 0.154, calibration error 0.045. At the threshold chosen on out-of-fold training predictions (0.193): precision 0.294, recall 0.794,
F1 0.429 (TN 188, FP 185, FN 20, TP 77). At a fixed 0.25: precision 0.349, recall 0.526, F1 0.420 (TN 278, FP 95, FN 46, TP 51).

**Honest reading**
- HGB clearly beats the rule-based priority and passes the validation gate (confidence-interval lower bounds above chance and above the no-skill rate).
- Versus Logistic Regression it is a tie within noise: ROC-AUC is slightly higher, PR-AUC is level, and the intervals overlap.
- Most of the signal comes from the `patient_risk.csv` snapshot features: cross-validated ROC-AUC falls from 0.624 to 0.597 without them. Those columns are undated, so they may
  not be point-in-time for older follow-ups. Treat the gain as unverified until real dated data confirms it.
- Requiring earlier outcomes to be known 7 days ahead (`--lead-days 7`) barely changed an earlier run (ROC-AUC 0.668 vs 0.671 with fixed hyper-parameters), so the history features are not driving a leak.
- The test set is small; intervals are wide. Results will differ slightly with other scikit-learn versions. Re-run training and read `ml/artifacts/model_metadata.json` for your own numbers.
- The data looks synthetic: these figures demonstrate the pipeline, they are not evidence of real-world performance.

## Integration with FollowCare
1. Start the service next to the backend: `FOLLOWCARE_ML_API_KEY=<secret> python -m ml.api` (localhost:5001). Keep the key in your environment/secrets, not in code.
2. In the Express backend, load each follow-up's rows from PostgreSQL (follow-up, patient, risk snapshot, the patient's other follow-ups with due date and status)
   and call `scoreFollowUps(items)` from `ml/node-client/mlClient.mjs`. The item shape is documented in `ml/feature_builder.py`. The Python side only uses history rows
   due strictly before the current follow-up, so sending the whole history is safe.
3. In the staff priority queue show the rule priority beside the ML result (`ml/web-example/MlScoreCell.jsx`). Label a percentage only when
   `estimated_probability_missed` is non-null, show the top factors, and keep a manual override. Never auto-cancel, deny or reschedule based on the score.
4. Retrain by re-running the training commands on a fresh export, then review `model_metadata.json` before relying on the new model.
