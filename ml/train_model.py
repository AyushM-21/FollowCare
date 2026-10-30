"""Tune, evaluate and export the HistGradientBoostingClassifier.

    python -m ml.fix_dataset --data-dir data/raw --out-dir data/processed
    python -m ml.train_model --processed-dir data/processed --artifact-dir ml/artifacts

Test set (GroupShuffleSplit by patient, 15%) is used exactly once, after all tuning, threshold and
calibration choices were made on training data only (GroupKFold out-of-fold predictions).
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import os
import platform
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (average_precision_score, brier_score_loss, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

from .calibration import PlattCalibrator
from .fix_dataset import CATEGORICAL, FEATURES, NUMERIC, SNAPSHOT_FEATURES

RANDOM_SEED = 42
RULE_RANK = {"high": 2, "medium": 1, "low": 0}
SPEC_BEST = dict(learning_rate=0.08, max_depth=7, max_leaf_nodes=15, min_samples_leaf=10, l2_regularization=10.0)


def read_processed(path):
    # "None" is a real category (caregiver_relationship); stop pandas turning it into NaN.
    return pd.read_csv(path, keep_default_na=False, na_values=[""])


def make_hgb(cat=CATEGORICAL, num=NUMERIC, seed=RANDOM_SEED, **params):
    pre = ColumnTransformer([("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=np.nan,
                                                    encoded_missing_value=np.nan), cat),
                             ("num", "passthrough", num)])
    p = dict(max_iter=500, early_stopping=True, validation_fraction=0.15, n_iter_no_change=15,
             random_state=seed, categorical_features=[True] * len(cat) + [False] * len(num))
    p.update(params)
    return Pipeline([("pre", pre), ("model", HistGradientBoostingClassifier(**p))])


def make_logreg(seed=RANDOM_SEED, C=0.3):
    pre = ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
                             ("num", Pipeline([("i", SimpleImputer(strategy="median")), ("s", StandardScaler())]), NUMERIC)])
    return Pipeline([("pre", pre), ("model", LogisticRegression(C=C, max_iter=3000, random_state=seed))])


def oof_predict(make, X, y, groups, n_splits=5):
    oof = np.zeros(len(y))
    for tr, va in GroupKFold(n_splits=n_splits).split(X, y, groups):
        oof[va] = make().fit(X.iloc[tr], y[tr]).predict_proba(X.iloc[va])[:, 1]
    return oof


def ece(y, p, bins=10):
    ids = np.clip(np.digitize(p, np.linspace(0, 1, bins + 1)[1:-1]), 0, bins - 1)
    return float(sum((ids == b).mean() * abs(y[ids == b].mean() - p[ids == b].mean()) for b in range(bins) if (ids == b).any()))


def best_f1_threshold(y, p):
    ts = np.unique(np.round(p, 3))
    return float(ts[int(np.argmax([f1_score(y, p >= t, zero_division=0) for t in ts]))])


def at_threshold(y, p, t):
    pred = (p >= t).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {"threshold": round(float(t), 3), "precision": round(float(precision_score(y, pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y, pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y, pred, zero_division=0)), 4),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}


def boot_ci(y, s, groups, n=500, seed=0):
    rng = np.random.RandomState(seed)
    u = np.unique(groups)
    idx = {g: np.where(groups == g)[0] for g in u}
    pr, roc = [], []
    for _ in range(n):
        i = np.concatenate([idx[g] for g in rng.choice(u, len(u))])
        if len(np.unique(y[i])) < 2:
            continue
        pr.append(average_precision_score(y[i], s[i])); roc.append(roc_auc_score(y[i], s[i]))
    q = lambda a: [round(float(np.percentile(a, 2.5)), 4), round(float(np.percentile(a, 97.5)), 4)]
    return {"pr_auc_ci95": q(pr), "roc_auc_ci95": q(roc)}


def score_report(y, s, groups, t=None):
    r = {"roc_auc": round(float(roc_auc_score(y, s)), 4), "pr_auc": round(float(average_precision_score(y, s)), 4)}
    r.update(boot_ci(y, s, groups))
    k = int(round(0.2 * len(y)))
    top = np.argsort(-s, kind="stable")[:k]
    r["precision_at_top_20pct"] = round(float(y[top].mean()), 4)
    r["lift_at_top_20pct"] = round(float(y[top].mean() / y.mean()), 3)
    if t is not None:
        sc = np.clip(s, 0, 1)
        r["brier"] = round(float(brier_score_loss(y, sc)), 4)
        r["ece"] = round(ece(y, sc), 4)
        r["at_threshold"] = at_threshold(y, s, t)
    return r


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def run(processed_dir="data/processed", artifact_dir="ml/artifacts", quick=False, seed=RANDOM_SEED):
    data = read_processed(os.path.join(processed_dir, "training_dataset.csv"))
    pending = read_processed(os.path.join(processed_dir, "pending_inference_queue.csv"))
    assert not set(["days_overdue", "outreach_attempts", "risk_score", "missed_followups_last_12m"]) & set(FEATURES)
    X, y, groups = data[FEATURES], data["target_missed"].values, data["patient_id"].values

    tr_i, te_i = next(GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=seed).split(X, y, groups))
    Xtr, ytr, gtr = X.iloc[tr_i], y[tr_i], groups[tr_i]
    Xte, yte, gte = X.iloc[te_i], y[te_i], groups[te_i]
    assert not set(gtr) & set(gte)

    # ---- hyper-parameter search: GroupKFold(5) on the training portion only -----------------
    grid = {"learning_rate": [0.08] if quick else [0.03, 0.08],
            "max_depth": [7] if quick else [3, 5, 7],
            "max_leaf_nodes": [15] if quick else [15, 31],
            "min_samples_leaf": [10] if quick else [10, 30],
            "l2_regularization": [10.0] if quick else [1.0, 10.0]}
    rows = []
    for vals in itertools.product(*grid.values()):
        params = dict(zip(grid, vals))
        oof = oof_predict(lambda: make_hgb(seed=seed, **params), Xtr, ytr, gtr)
        rows.append({"params": params, "cv_pr_auc": average_precision_score(ytr, oof), "cv_roc_auc": roc_auc_score(ytr, oof)})
    rows.sort(key=lambda r: -r["cv_pr_auc"])
    best = rows[0]["params"]

    # ---- threshold + calibration from out-of-fold predictions (no test data) ---------------
    oof = oof_predict(lambda: make_hgb(seed=seed, **best), Xtr, ytr, gtr)
    cal = PlattCalibrator().fit(oof, ytr)
    thr_raw = best_f1_threshold(ytr, oof)
    thr_cal = best_f1_threshold(ytr, cal.predict(oof))

    # ---- sensitivity (training CV only): snapshot features and lead-time -------------------
    no_snap = [c for c in NUMERIC if c not in SNAPSHOT_FEATURES]
    oof_ns = oof_predict(lambda: make_hgb(num=no_snap, seed=seed, **best), Xtr[CATEGORICAL + no_snap], ytr, gtr)
    oof_lr = oof_predict(lambda: make_logreg(seed), Xtr, ytr, gtr)
    sens = {"cv_roc_auc_all_features": round(float(roc_auc_score(ytr, oof)), 4),
            "cv_roc_auc_without_patient_risk_snapshot_features": round(float(roc_auc_score(ytr, oof_ns)), 4),
            "cv_roc_auc_logistic_regression": round(float(roc_auc_score(ytr, oof_lr)), 4)}

    # ---- final fit and single evaluation on the untouched test set -------------------------
    model = make_hgb(seed=seed, **best).fit(Xtr, ytr)
    p_raw = model.predict_proba(Xte)[:, 1]
    p_cal = cal.predict(p_raw)
    lr = make_logreg(seed).fit(Xtr, ytr)
    p_lr = lr.predict_proba(Xte)[:, 1]
    rule = data.iloc[te_i]["priority"].map(RULE_RANK).fillna(0).values.astype(float)
    spec_oof = oof_predict(lambda: make_hgb(seed=seed, **SPEC_BEST), Xtr, ytr, gtr)
    spec_model = make_hgb(seed=seed, **SPEC_BEST).fit(Xtr, ytr)
    p_spec = spec_model.predict_proba(Xte)[:, 1]

    test = {"rows": int(len(yte)), "patients": int(len(set(gte))), "positives": int(yte.sum()),
            "positive_rate": round(float(yte.mean()), 4),
            "hgb_tuned_raw": score_report(yte, p_raw, gte, thr_raw),
            "hgb_tuned_calibrated": score_report(yte, p_cal, gte, thr_cal),
            "hgb_at_fixed_threshold_0.25": at_threshold(yte, p_raw, 0.25),
            "hgb_with_requested_hyperparameters": {"params": SPEC_BEST, "cv_pr_auc_train": round(float(average_precision_score(ytr, spec_oof)), 4),
                                                   **score_report(yte, p_spec, gte)},
            "logistic_regression_baseline": score_report(yte, p_lr, gte),
            "rule_based_priority_baseline": score_report(yte, rule, gte),
            "no_skill_pr_auc": round(float(yte.mean()), 4)}
    gates = {"roc_auc_ci_lower_above_0.5": bool(test["hgb_tuned_calibrated"]["roc_auc_ci95"][0] > 0.5),
             "pr_auc_ci_lower_above_no_skill": bool(test["hgb_tuned_calibrated"]["pr_auc_ci95"][0] > test["no_skill_pr_auc"]),
             "beats_rule_priority_roc_auc": bool(test["hgb_tuned_raw"]["roc_auc"] > test["rule_based_priority_baseline"]["roc_auc"]),
             "beats_logistic_regression_roc_auc": bool(test["hgb_tuned_raw"]["roc_auc"] > test["logistic_regression_baseline"]["roc_auc"]),
             "probabilities_calibrated": bool(test["hgb_tuned_calibrated"]["ece"] <= 0.05)}
    gates["validated_for_decision_support"] = bool(gates["roc_auc_ci_lower_above_0.5"] and gates["pr_auc_ci_lower_above_no_skill"])

    # ---- artifacts --------------------------------------------------------------------------
    os.makedirs(artifact_dir, exist_ok=True)
    mpath = os.path.join(artifact_dir, "followup_hgb_model.joblib")
    cpath = os.path.join(artifact_dir, "followup_calibrator.joblib")
    joblib.dump(model, mpath); joblib.dump(cal, cpath)
    neutral = {c: Xtr[c].mode().iloc[0] for c in CATEGORICAL}
    neutral.update({c: float(Xtr[c].median()) for c in NUMERIC})
    pend_raw = model.predict_proba(pending[FEATURES])[:, 1]
    use_cal = gates["probabilities_calibrated"]
    pend_score = cal.predict(pend_raw) if use_cal else pend_raw
    thr_used = thr_cal if use_cal else thr_raw
    queue = pd.DataFrame({"followup_id": pending["followup_id"], "followup_due_date": pending["followup_due_date"],
                          "rule_based_priority": pending["priority"],
                          "ml_score": np.round(pend_score, 4),
                          "score_kind": "calibrated_probability" if use_cal else "ranking_score_not_a_probability",
                          "above_review_threshold": pend_score >= thr_used}).sort_values("ml_score", ascending=False)
    queue.to_csv(os.path.join(artifact_dir, "scored_pending_queue.csv"), index=False)

    meta = {"model_version": datetime.now(timezone.utc).strftime("v%Y%m%d-%H%M%S"), "status": "candidate",
            "task": "P(follow-up missed); administrative decision support only",
            "data_is_synthetic_or_unverified": True, "random_seed": seed,
            "features": {"numeric": NUMERIC, "categorical": CATEGORICAL}, "n_features": len(FEATURES),
            "training_rows": int(len(y)), "train_rows": int(len(ytr)), "test": test,
            "cv_search_top5": [{"params": r["params"], "cv_pr_auc": round(r["cv_pr_auc"], 4), "cv_roc_auc": round(r["cv_roc_auc"], 4)} for r in rows[:5]],
            "best_params": best, "n_iter_final": int(model.named_steps["model"].n_iter_),
            "decision_threshold": {"raw": thr_raw, "calibrated": thr_cal, "chosen_on": "out-of-fold training predictions, max F1"},
            "sensitivity_cv_on_training_only": sens, "validation_gates": gates,
            "probabilities_calibrated": bool(use_cal), "neutral_values": neutral,
            "categories": {c: sorted(map(str, data[c].unique())) for c in ["source_encounter_class", "followup_type", "priority"]},
            "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__,
                            "pandas": pd.__version__, "numpy": np.__version__},
            "artifact_sha256": {os.path.basename(mpath): sha(mpath), os.path.basename(cpath): sha(cpath)},
            "limitations": ["Synthetic/unverified data: metrics are not real-world performance.",
                            "patient_risk.csv snapshot features (age, conditions, acute visits, readmission, non-adherence) are undated and may not be point-in-time.",
                            "Prior-history features use rows due strictly before the current due date (lead_days=0)."]}
    with open(os.path.join(artifact_dir, "model_metadata.json"), "w") as f:
        json.dump(meta, f, indent=2, default=str)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--processed-dir", default="data/processed")
    ap.add_argument("--artifact-dir", default="ml/artifacts")
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    m = run(a.processed_dir, a.artifact_dir, a.quick)
    t = m["test"]
    print(json.dumps({"best_params": m["best_params"], "test_rows": t["rows"], "gates": m["validation_gates"],
                      "sensitivity": m["sensitivity_cv_on_training_only"],
                      "hgb_tuned_raw": {k: t["hgb_tuned_raw"][k] for k in ("roc_auc", "pr_auc", "brier", "ece", "roc_auc_ci95", "pr_auc_ci95")},
                      "hgb_tuned_threshold": t["hgb_tuned_raw"]["at_threshold"], "fixed_0.25": t["hgb_at_fixed_threshold_0.25"],
                      "hgb_requested_params": {k: t["hgb_with_requested_hyperparameters"][k] for k in ("roc_auc", "pr_auc")},
                      "logreg": {k: t["logistic_regression_baseline"][k] for k in ("roc_auc", "pr_auc")},
                      "rule": {k: t["rule_based_priority_baseline"][k] for k in ("roc_auc", "pr_auc")},
                      "no_skill": t["no_skill_pr_auc"]}, indent=1))


if __name__ == "__main__":
    main()
