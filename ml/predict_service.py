"""FollowUpPredictorService: validated ML scoring with automatic fallback to the existing rule-based priority.

    svc = FollowUpPredictorService("ml/artifacts")
    svc.predict([{...26 feature fields...}])

If artifacts are missing, corrupted (SHA-256 mismatch) or built with a different scikit-learn minor
version, the service does NOT raise: it returns the record's existing rule-based `priority` instead.
Inputs are never logged."""
from __future__ import annotations

import hashlib
import json
import os

import joblib
import numpy as np
import pandas as pd
import sklearn

from .fix_dataset import CATEGORICAL, FEATURES, NUMERIC
from .calibration import PlattCalibrator  # noqa: F401  (needed to unpickle the calibrator)

DISCLAIMER = ("Administrative decision support only - not a diagnosis or clinical triage score. "
              "Staff can review and override. Shows association, not causation.")
MAX_BATCH = 200
RANGES = {"age_years": (0, 120), "active_chronic_conditions": (0, 100), "active_medications": (0, 200),
          "acute_visits_last_12m": (0, 500), "readmission_within_30d": (0, 1), "non_adherent_medications": (0, 200),
          "clinical_baseline_score": (0, 5000), "caregiver_on_file": (0, 1), "prior_total_followups": (0, 10000),
          "prior_missed_followups": (0, 10000), "prior_late_followups": (0, 10000), "prior_missed_rate": (0, 1),
          "days_since_last_followup": (-1, 40000), "due_month": (1, 12), "due_dayofweek": (0, 6)}
LABELS = {c: c.replace("_", " ").capitalize() for c in FEATURES}


class ValidationError(ValueError):
    pass


def validate_record(rec):
    if not isinstance(rec, dict):
        raise ValidationError("record must be an object")
    missing = [c for c in FEATURES if rec.get(c) is None]
    if missing:
        raise ValidationError(f"missing fields: {missing}")
    out = {}
    for c in NUMERIC:
        v = rec[c]
        if isinstance(v, bool):
            v = int(v)
        if not isinstance(v, (int, float)) or not np.isfinite(v):
            raise ValidationError(f"{c} must be a finite number")
        lo, hi = RANGES[c]
        if not lo <= v <= hi:
            raise ValidationError(f"{c} must be between {lo} and {hi}")
        out[c] = float(v)
    if out["prior_missed_followups"] + out["prior_late_followups"] > out["prior_total_followups"]:
        raise ValidationError("prior_missed_followups + prior_late_followups cannot exceed prior_total_followups")
    for c in CATEGORICAL:
        v = rec[c]
        if not isinstance(v, str) or not v or len(v) > 120:
            raise ValidationError(f"{c} must be a non-empty string up to 120 characters")
        out[c] = v
    return out


def _sha(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


class FollowUpPredictorService:
    def __init__(self, artifact_dir="ml/artifacts", require_validated=False):
        self.model = self.calibrator = self.meta = None
        self.reason = "no model loaded"
        try:
            with open(os.path.join(artifact_dir, "model_metadata.json")) as f:
                meta = json.load(f)
            for name, digest in meta["artifact_sha256"].items():
                if _sha(os.path.join(artifact_dir, name)) != digest:
                    self.reason = f"checksum mismatch for {name}"
                    return
            if meta["environment"]["scikit_learn"].split(".")[:2] != sklearn.__version__.split(".")[:2]:
                self.reason = "scikit-learn version differs from the one used for training; retrain"
                return
            if require_validated and not meta["validation_gates"]["validated_for_decision_support"]:
                self.reason = "model has not passed validation gates"
                return
            self.model = joblib.load(os.path.join(artifact_dir, "followup_hgb_model.joblib"))
            self.calibrator = joblib.load(os.path.join(artifact_dir, "followup_calibrator.joblib"))
            self.meta, self.reason = meta, "ok"
        except (OSError, KeyError, ValueError, AttributeError, ImportError, EOFError):
            self.model = self.calibrator = self.meta = None
            self.reason = "model artifacts missing or unreadable"

    @property
    def available(self):
        return self.model is not None

    @staticmethod
    def _fallback(rec):
        return {"source": "rule_based_fallback", "rule_based_priority": rec.get("priority") if isinstance(rec, dict) else None,
                "ml_score": None, "disclaimer": DISCLAIMER}

    def predict(self, records, explain=True):
        if not isinstance(records, list) or not records:
            raise ValidationError("records must be a non-empty list")
        if len(records) > MAX_BATCH:
            raise ValidationError(f"at most {MAX_BATCH} records per call")
        if not self.available:
            return [self._fallback(r) for r in records]
        rows, errs = [], []
        for i, r in enumerate(records):
            try:
                rows.append(validate_record(r))
            except ValidationError as e:
                errs.append(f"record {i}: {e}")
        if errs:
            raise ValidationError("; ".join(errs))
        X = pd.DataFrame(rows)[FEATURES]
        raw = self.model.predict_proba(X)[:, 1]
        use_cal = bool(self.meta["probabilities_calibrated"])
        score = self.calibrator.predict(raw) if use_cal else raw
        thr = self.meta["decision_threshold"]["calibrated" if use_cal else "raw"]
        neutral = self.meta["neutral_values"]
        out = []
        for i in range(len(X)):
            factors = []
            if explain:
                for f in FEATURES:
                    alt = X.iloc[[i]].copy()
                    alt[f] = neutral[f]
                    d = float(raw[i] - self.model.predict_proba(alt)[0, 1])
                    factors.append((abs(d), f, d))
                factors.sort(reverse=True)
            out.append({"source": "ml_model", "model_version": self.meta["model_version"],
                        "ml_score": round(float(score[i]), 4),
                        "score_kind": "calibrated_probability" if use_cal else "ranking_score_not_a_probability",
                        "estimated_probability_missed": round(float(score[i]), 4) if use_cal else None,
                        "above_review_threshold": bool(score[i] >= thr),
                        "rule_based_priority": records[i].get("priority"),
                        "validated_for_decision_support": bool(self.meta["validation_gates"]["validated_for_decision_support"]),
                        "top_factors": [{"factor": LABELS[f], "direction": "raises score" if d > 0 else "lowers score",
                                         "change_vs_typical_value": round(d, 4)} for _, f, d in factors[:3] if abs(d) > 1e-4],
                        "disclaimer": DISCLAIMER})
        return out
