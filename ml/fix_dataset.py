"""Clean, merge and feature-engineer the three FollowCare CSVs (leak-free, PII-free).

    python -m ml.fix_dataset --data-dir data/raw --out-dir data/processed

Writes   training_dataset.csv           (resolved follow-ups of living patients)
         pending_inference_queue.csv    (pending follow-ups, scored later)
Rescheduled follow-ups and deceased patients are excluded from the binary training set.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd

TRAIN_STATUSES = ["completed_on_time", "completed_late", "missed"]
NUMERIC = ["age_years", "active_chronic_conditions", "active_medications", "acute_visits_last_12m",
           "readmission_within_30d", "non_adherent_medications", "clinical_baseline_score",
           "caregiver_on_file", "prior_total_followups", "prior_missed_followups", "prior_late_followups",
           "prior_missed_rate", "days_since_last_followup", "due_month", "due_dayofweek"]
CATEGORICAL = ["source_encounter_class", "followup_type", "reason_grouped", "priority", "GENDER", "MARITAL",
               "STATE", "city_tier", "preferred_language", "preferred_contact_method", "caregiver_relationship"]
FEATURES = NUMERIC + CATEGORICAL
SNAPSHOT_FEATURES = ["acute_visits_last_12m", "readmission_within_30d", "non_adherent_medications",
                     "clinical_baseline_score", "age_years", "active_chronic_conditions", "active_medications"]
# Columns that must never reach the model (post-outcome, snapshot-leaky, identifiers, PII).
BANNED = ["days_overdue", "followup_completed_date", "outreach_attempts", "last_outreach_channel",
          "missed_followups_last_12m", "risk_score", "risk_level", "top_risk_drivers", "followup_status",
          "followup_id", "patient_id", "FIRST", "LAST", "PREFIX", "ADDRESS", "PIN_CODE", "phone", "email",
          "caregiver_name", "caregiver_phone", "BIRTHDATE", "DEATHDATE", "qa_flag", "CITY"]
ID_COLS = ["followup_id", "patient_id"]


def point_in_time_history(df: pd.DataFrame, lead_days: int = 0) -> pd.DataFrame:
    """For every follow-up use ONLY the same patient's rows with prior_due_date < current_due_date - lead_days.

    lead_days=0 is the specified behaviour. Use >0 to require that earlier outcomes were already
    observable a few days before the current due date (stricter; see README 'Leakage notes')."""
    df = df.sort_values(["patient_id", "followup_due_date", "followup_id"]).reset_index(drop=True)
    cols = {c: np.zeros(len(df)) for c in ["prior_total_followups", "prior_missed_followups",
                                             "prior_late_followups", "prior_missed_rate"]}
    since = np.full(len(df), -1.0)
    for _, g in df.groupby("patient_id", sort=False):
        idx = g.index.values
        due = g["followup_due_date"].values.astype("datetime64[D]")
        st = g["followup_status"].values
        for k, i in enumerate(idx):
            prior = due < (due[k] - np.timedelta64(lead_days, "D"))
            n = int(prior.sum())
            if n == 0:
                continue
            miss = int((prior & (st == "missed")).sum())
            cols["prior_total_followups"][i] = n
            cols["prior_missed_followups"][i] = miss
            cols["prior_late_followups"][i] = int((prior & (st == "completed_late")).sum())
            cols["prior_missed_rate"][i] = miss / n
            since[i] = float((due[k] - due[prior].max()).astype(int))
    for c, v in cols.items():
        df[c] = v
    df["days_since_last_followup"] = since
    return df


def build(data_dir: str, lead_days: int = 0, top_reasons: int = 15):
    fu = pd.read_csv(os.path.join(data_dir, "followups.csv"))
    rk = pd.read_csv(os.path.join(data_dir, "patient_risk.csv"))
    pt = pd.read_csv(os.path.join(data_dir, "patients_followcare.csv"))
    need = {"followups": (fu, ["followup_id", "patient_id", "followup_due_date", "followup_status",
                               "source_encounter_class", "followup_type", "reason_description", "priority"]),
            "patient_risk": (rk, ["patient_id", "age_years", "active_chronic_conditions", "active_medications",
                                  "acute_visits_last_12m", "readmission_within_30d", "non_adherent_medications"]),
            "patients": (pt, ["Id", "is_deceased", "GENDER", "MARITAL", "STATE", "city_tier", "preferred_language",
                              "preferred_contact_method", "caregiver_on_file", "caregiver_relationship"])}
    for name, (d, cols) in need.items():
        miss = [c for c in cols if c not in d.columns]
        if miss:
            raise ValueError(f"{name} is missing columns {miss}")

    report = {"followups_raw": len(fu)}
    fu = fu.drop_duplicates("followup_id").copy()
    fu["followup_due_date"] = pd.to_datetime(fu["followup_due_date"], errors="coerce")
    fu = fu[fu["followup_due_date"].notna()]

    pt = pt.drop_duplicates("Id").copy()
    pt["is_deceased"] = pt["is_deceased"].astype(str).str.lower().eq("true")
    deceased = set(pt.loc[pt.is_deceased, "Id"])
    report["deceased_patients_with_followups"] = int(fu.loc[fu.patient_id.isin(deceased), "patient_id"].nunique())
    report["deceased_followup_rows_dropped"] = int(fu.patient_id.isin(deceased).sum())
    fu = fu[~fu.patient_id.isin(deceased)]
    pt["caregiver_on_file"] = pt["caregiver_on_file"].astype(str).str.lower().eq("true").astype(int)
    pt["MARITAL"] = pt["MARITAL"].fillna("Unknown")
    pt["caregiver_relationship"] = pt["caregiver_relationship"].fillna("None")

    rk = rk.drop_duplicates("patient_id").copy()
    rk["readmission_within_30d"] = rk["readmission_within_30d"].astype(str).str.lower().eq("true").astype(int)
    rk["clinical_baseline_score"] = (rk.active_chronic_conditions * 3 + rk.acute_visits_last_12m * 2 +
                                     rk.readmission_within_30d * 10 + rk.non_adherent_medications * 3)

    df = fu.merge(rk[["patient_id", "age_years", "active_chronic_conditions", "active_medications",
                      "acute_visits_last_12m", "readmission_within_30d", "non_adherent_medications",
                      "clinical_baseline_score"]], on="patient_id", how="inner")
    report["living_followups_without_risk_row_dropped"] = int(len(fu) - len(df))
    df = df.merge(pt[["Id", "GENDER", "MARITAL", "STATE", "city_tier", "preferred_language",
                      "preferred_contact_method", "caregiver_on_file", "caregiver_relationship"]],
                  left_on="patient_id", right_on="Id", how="left").drop(columns="Id")

    df = point_in_time_history(df, lead_days)   # history uses all of the patient's rows, any status
    df["due_month"] = df["followup_due_date"].dt.month
    df["due_dayofweek"] = df["followup_due_date"].dt.dayofweek

    resolved = df["followup_status"].isin(TRAIN_STATUSES)
    top = df.loc[resolved, "reason_description"].value_counts().head(top_reasons).index.tolist()
    df["reason_grouped"] = df["reason_description"].where(df["reason_description"].isin(top), "Other")

    train = df[resolved].copy()
    train["target_missed"] = (train["followup_status"] == "missed").astype(int)
    pending = df[df["followup_status"] == "pending"].copy()
    report.update(rescheduled_excluded=int((df.followup_status == "rescheduled").sum()),
                  training_rows=len(train), missed=int(train.target_missed.sum()),
                  not_missed=int((1 - train.target_missed).sum()),
                  missed_rate=round(float(train.target_missed.mean()), 4), pending_rows=len(pending),
                  lead_days=lead_days, reason_groups=top)
    keep_train = ID_COLS + ["followup_due_date"] + FEATURES + ["target_missed"]
    keep_pend = ID_COLS + ["followup_due_date"] + FEATURES
    return train[keep_train], pending[keep_pend], report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default="data/raw")
    ap.add_argument("--out-dir", default="data/processed")
    ap.add_argument("--lead-days", type=int, default=0)
    a = ap.parse_args()
    train, pending, report = build(a.data_dir, a.lead_days)
    os.makedirs(a.out_dir, exist_ok=True)
    train.to_csv(os.path.join(a.out_dir, "training_dataset.csv"), index=False)
    pending.to_csv(os.path.join(a.out_dir, "pending_inference_queue.csv"), index=False)
    print(report)


if __name__ == "__main__":
    main()
