"""Build the 26 model features from raw database-style rows, so the backend does not have to
re-implement the feature logic.  Mirrors ml/fix_dataset.py (checked by a consistency test).

item = {
  "followup_id": "...",                                   # echoed back, optional
  "followup": {"due_date": "YYYY-MM-DD", "source_encounter_class": ..., "followup_type": ...,
               "reason_description": ..., "priority": "low|medium|high"},
  "patient":  {"GENDER", "MARITAL", "STATE", "city_tier", "preferred_language",
               "preferred_contact_method", "caregiver_on_file": bool, "caregiver_relationship"},
  "risk":     {"age_years", "active_chronic_conditions", "active_medications", "acute_visits_last_12m",
               "readmission_within_30d": bool, "non_adherent_medications"},
  "history":  [{"due_date": "YYYY-MM-DD", "status": "missed|completed_late|completed_on_time|rescheduled|pending"}, ...]
}
`history` may contain ALL of the patient's other follow-ups; only rows due strictly before the
current due date are used (no future information)."""
from __future__ import annotations

from datetime import date, datetime

from .predict_service import ValidationError

STATUSES = {"missed", "completed_late", "completed_on_time", "rescheduled", "pending"}


def _blank(v):
    return v is None or v == "" or (isinstance(v, float) and v != v)


def _date(v, name):
    try:
        return datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError(f"{name} must be a date in YYYY-MM-DD format")


def history_features(due: date, history, lead_days: int = 0) -> dict:
    prior = []
    for h in history or []:
        if not isinstance(h, dict) or h.get("status") not in STATUSES:
            raise ValidationError("each history row needs a valid status")
        d = _date(h.get("due_date"), "history due_date")
        if (due - d).days > lead_days:           # strictly earlier than the current due date
            prior.append((d, h["status"]))
    n = len(prior)
    miss = sum(s == "missed" for _, s in prior)
    return {"prior_total_followups": float(n), "prior_missed_followups": float(miss),
            "prior_late_followups": float(sum(s == "completed_late" for _, s in prior)),
            "prior_missed_rate": miss / n if n else 0.0,
            "days_since_last_followup": float((due - max(d for d, _ in prior)).days) if n else -1.0}


def clinical_baseline_score(risk: dict) -> float:
    return float(risk["active_chronic_conditions"] * 3 + risk["acute_visits_last_12m"] * 2 +
                 int(bool(risk["readmission_within_30d"])) * 10 + risk["non_adherent_medications"] * 3)


def build_model_record(item: dict, reason_groups) -> dict:
    if not isinstance(item, dict):
        raise ValidationError("item must be an object")
    fu, pt, rk = item.get("followup"), item.get("patient"), item.get("risk")
    for name, part in (("followup", fu), ("patient", pt), ("risk", rk)):
        if not isinstance(part, dict):
            raise ValidationError(f"{name} object is required")
    due = _date(fu.get("due_date"), "followup.due_date")
    need = {"followup": (fu, ["source_encounter_class", "followup_type", "priority"]),
            "patient": (pt, ["GENDER", "STATE", "city_tier", "preferred_language", "preferred_contact_method"]),
            "risk": (rk, ["age_years", "active_chronic_conditions", "active_medications", "acute_visits_last_12m",
                          "readmission_within_30d", "non_adherent_medications"])}
    for name, (part, keys) in need.items():
        missing = [k for k in keys if _blank(part.get(k))]
        if missing:
            raise ValidationError(f"{name} is missing {missing}")
    reason = fu.get("reason_description")
    rec = {
        "age_years": rk["age_years"], "active_chronic_conditions": rk["active_chronic_conditions"],
        "active_medications": rk["active_medications"], "acute_visits_last_12m": rk["acute_visits_last_12m"],
        "readmission_within_30d": int(bool(rk["readmission_within_30d"])),
        "non_adherent_medications": rk["non_adherent_medications"],
        "caregiver_on_file": int(bool(pt.get("caregiver_on_file"))),
        "due_month": due.month, "due_dayofweek": due.weekday(),
        "source_encounter_class": fu["source_encounter_class"], "followup_type": fu["followup_type"],
        "reason_grouped": reason if reason in set(reason_groups) else "Other", "priority": fu["priority"],
        "GENDER": pt["GENDER"], "MARITAL": "Unknown" if _blank(pt.get("MARITAL")) else pt["MARITAL"], "STATE": pt["STATE"],
        "city_tier": pt["city_tier"], "preferred_language": pt["preferred_language"],
        "preferred_contact_method": pt["preferred_contact_method"],
        "caregiver_relationship": "None" if _blank(pt.get("caregiver_relationship")) else pt["caregiver_relationship"],
    }
    for k in ("age_years", "active_chronic_conditions", "active_medications", "acute_visits_last_12m",
              "non_adherent_medications"):
        if isinstance(rec[k], bool) or not isinstance(rec[k], (int, float)):
            raise ValidationError(f"risk.{k} must be a number")
    rec["clinical_baseline_score"] = clinical_baseline_score({**rk, "readmission_within_30d": rec["readmission_within_30d"]})
    rec.update(history_features(due, item.get("history")))
    return rec
