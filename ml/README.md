# FollowCare ML – missed-follow-up prediction (HistGradientBoostingClassifier)

Drop-in `ml/` folder (this file is `ml/README.md`; it does not replace the repo's root README). All results use the supplied
CSVs, which look synthetic, so they are **not real-world performance**. The model is administrative decision support, never clinical triage.

## Setup, train, evaluate, predict
```bash
pip install -r ml/requirements.txt
mkdir -p data/raw   # put followups.csv, patient_risk.csv, patients_followcare.csv here (contain PII/synthetic PII: keep out of git)
python -m ml.fix_dataset --data-dir data/raw --out-dir data/processed   # cleaned, PII-free CSVs
python -m ml.train_model --processed-dir data/processed --artifact-dir ml/artifacts
python -m pytest ml/test_pipeline.py        # or: python -m unittest ml.test_pipeline   (15 tests)
```
```python
from ml.predict_service import FollowUpPredictorService
svc = FollowUpPredictorService("ml/artifacts")   # never raises; falls back to the rule-based priority if the model is unusable
svc.predict([{...26 feature fields incl. "priority"...}])
```
Artifacts: `followup_hgb_model.joblib`, `followup_calibrator.joblib`, `model_metadata.json`, `scored_pending_queue.csv`.
Loading checks SHA-256 and scikit-learn minor version (joblib files are pickles: load only files you trained).
Add `data/raw/`, `data/processed/` and `ml/artifacts/` to `.gitignore` if the data is not meant to be public.

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
  top-3 "what changes the score" factors (association, not causation), rule-based fallback. `test_pipeline.py`: leakage, point-in-time, PII, deceased, fallback, tampering, validation.

## Results on the untouched test set (470 rows, no-skill PR-AUC 0.206)
| Model | ROC-AUC (95% CI) | PR-AUC (95% CI) |
|---|---|---|
| HGB, tuned by CV (depth 5, 15 leaves, min leaf 30, l2 1.0, lr 0.08) | 0.666 (0.592–0.722) | 0.325 (0.217–0.404) |
| HGB, hyper-parameters you specified | 0.671 (0.593–0.729) | 0.355 |
| Logistic Regression baseline | 0.675 (0.592–0.729) | 0.345 (0.232–0.434) |
| Existing rule (`priority`) | 0.585 | 0.257 |

Tuned HGB: Brier 0.156, calibration error 0.039 (0.035 after Platt). At the CV-chosen threshold 0.18: precision 0.284, recall 0.794, F1 0.419
(TN 179, FP 194, FN 20, TP 77). At 0.25: precision 0.299, recall 0.485, F1 0.370. Specified hyper-parameters at 0.25: precision 0.339, recall 0.577, F1 0.428, Brier 0.154.

**Honest reading**
- HGB clearly beats the rule-based priority, and passes the validation gate (CI lower bounds above chance/no-skill).
- It does **not** beat Logistic Regression: the differences are inside the confidence intervals. The earlier claim that HGB outperforms LR was not reproduced.
- The specified ROC 0.6713 / PR 0.3586 / F1 0.3843 (at 0.25) are close to, but not exactly, what this code gives (0.6705 / 0.3551 / 0.4275). Numbers here are the measured ones.
- Most of the signal comes from the `patient_risk.csv` snapshot features: cross-validated ROC-AUC falls from 0.611 to 0.585 without them (equal to Logistic Regression).
  Those columns are undated, so they may not be point-in-time for older follow-ups. Treat the gain as unverified until real dated data confirms it.
- Requiring earlier outcomes to be known 7 days ahead (`--lead-days 7`) barely changes the result (ROC 0.668 vs 0.671), so the history features are not driving a leak.
- The test set is small (97 positives); CIs are wide.

## Using it in the app (not done: repo code was not accessible)
Call the service from the backend with a short timeout; on any error use the existing rule-based priority. In the staff queue show the rule priority beside
the ML score, label it "estimated chance of a missed follow-up" only when `estimated_probability_missed` is non-null, show top factors, and keep an override.
Never auto-cancel, deny or reschedule based on the score. The backend must compute the `prior_*` fields from its own DB using the same strict-before rule.
