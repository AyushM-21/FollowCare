"""Tests for feature_builder and api.  Synthetic data only."""
import os, shutil, tempfile, unittest

import pandas as pd

from ml import fix_dataset as FD
from ml import train_model as TM
from ml.api import create_app
from ml.feature_builder import build_model_record, history_features
from ml.predict_service import ValidationError
from ml.test_pipeline import write_raw
from datetime import date


def item_from_raw(raw_dir, followup_id):
    fu = pd.read_csv(os.path.join(raw_dir, "followups.csv"))
    rk = pd.read_csv(os.path.join(raw_dir, "patient_risk.csv"))
    pt = pd.read_csv(os.path.join(raw_dir, "patients_followcare.csv"), keep_default_na=False, na_values=[""])
    row = fu[fu.followup_id == followup_id].iloc[0]
    p = pt[pt.Id == row.patient_id].iloc[0].to_dict()
    r = rk[rk.patient_id == row.patient_id].iloc[0].to_dict()
    hist = [{"due_date": d, "status": s} for d, s in zip(fu[fu.patient_id == row.patient_id].followup_due_date,
                                                         fu[fu.patient_id == row.patient_id].followup_status)]
    return {"followup_id": followup_id,
            "followup": {k: row[k] for k in ["source_encounter_class", "followup_type", "reason_description", "priority"]}
                        | {"due_date": row.followup_due_date},
            "patient": {**p, "caregiver_on_file": bool(p["caregiver_on_file"] in (True, "True", "true", 1))},
            "risk": {**{k: r[k] for k in ["age_years", "active_chronic_conditions", "active_medications",
                                          "acute_visits_last_12m", "non_adherent_medications"]},
                     "readmission_within_30d": str(r["readmission_within_30d"]).lower() == "true"},
            "history": hist}


class HistoryTests(unittest.TestCase):
    H = [{"due_date": "2025-01-01", "status": "missed"}, {"due_date": "2025-02-01", "status": "completed_late"},
         {"due_date": "2025-03-01", "status": "completed_on_time"}, {"due_date": "2026-01-01", "status": "missed"}]

    def test_strictly_before_and_future_ignored(self):
        f = history_features(date(2025, 3, 1), self.H)
        self.assertEqual((f["prior_total_followups"], f["prior_missed_followups"], f["prior_late_followups"]), (2, 1, 1))
        self.assertAlmostEqual(f["prior_missed_rate"], 0.5)
        self.assertEqual(f["days_since_last_followup"], 28.0)

    def test_first_followup(self):
        f = history_features(date(2024, 1, 1), self.H)
        self.assertEqual((f["prior_total_followups"], f["prior_missed_rate"], f["days_since_last_followup"]), (0, 0.0, -1.0))

    def test_bad_status_and_date(self):
        with self.assertRaises(ValidationError):
            history_features(date(2025, 1, 1), [{"due_date": "2024-01-01", "status": "weird"}])
        with self.assertRaises(ValidationError):
            history_features(date(2025, 1, 1), [{"due_date": "01/01/2024", "status": "missed"}])


class Consistency(unittest.TestCase):
    """The online feature builder must give exactly the training features from fix_dataset."""

    def test_matches_training_pipeline(self):
        tmp = tempfile.mkdtemp()
        try:
            write_raw(tmp, 80, seed=3)
            train, _, rep = FD.build(tmp)
            groups = rep["reason_groups"]
            checked = 0
            for _, row in train.sample(60, random_state=1).iterrows():
                rec = build_model_record(item_from_raw(tmp, row.followup_id), groups)
                for c in FD.FEATURES:
                    a, b = row[c], rec[c]
                    if isinstance(a, str) or isinstance(b, str):
                        self.assertEqual(str(a), str(b), msg=f"{row.followup_id} {c}")
                    else:
                        self.assertAlmostEqual(float(a), float(b), places=6, msg=f"{row.followup_id} {c}")
                checked += 1
            self.assertEqual(checked, 60)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(); raw = os.path.join(cls.tmp, "raw"); os.makedirs(raw); write_raw(raw, 150)
        proc = os.path.join(cls.tmp, "proc"); os.makedirs(proc)
        tr, pe, _ = FD.build(raw)
        tr.to_csv(os.path.join(proc, "training_dataset.csv"), index=False)
        pe.to_csv(os.path.join(proc, "pending_inference_queue.csv"), index=False)
        cls.art = os.path.join(cls.tmp, "art"); TM.run(proc, cls.art, quick=True)
        cls.raw = raw
        cls.item = item_from_raw(raw, tr.followup_id.iloc[0])

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_health_and_score(self):
        c = create_app(self.art).test_client()
        self.assertTrue(c.get("/health").get_json()["model_loaded"])
        r = c.post("/score", json={"items": [self.item]})
        self.assertEqual(r.status_code, 200)
        p = r.get_json()["predictions"][0]
        self.assertEqual(p["followup_id"], self.item["followup_id"])
        self.assertEqual(p["source"], "ml_model")
        self.assertTrue(0 <= p["ml_score"] <= 1)

    def test_score_ignores_future_history(self):
        c = create_app(self.art).test_client()
        extra = dict(self.item, history=self.item["history"] + [{"due_date": "2031-01-01", "status": "missed"}])
        a = c.post("/score", json={"items": [self.item]}).get_json()["predictions"][0]["ml_score"]
        b = c.post("/score", json={"items": [extra]}).get_json()["predictions"][0]["ml_score"]
        self.assertEqual(a, b)

    def test_bad_requests(self):
        c = create_app(self.art).test_client()
        bad_item = {**self.item, "risk": {k: v for k, v in self.item["risk"].items() if k != "age_years"}}
        self.assertEqual(c.post("/score", json={"items": [bad_item]}).status_code, 400)
        self.assertEqual(c.post("/score", json={"items": []}).status_code, 400)
        self.assertEqual(c.post("/score", json={"items": [self.item] * 201}).status_code, 400)
        self.assertEqual(c.post("/score", json={"nope": 1}).status_code, 400)
        self.assertEqual(c.post("/predict", json={"records": "x"}).status_code, 400)

    def test_fallback_without_model(self):
        c = create_app(os.path.join(self.tmp, "missing")).test_client()
        r = c.post("/score", json={"items": [self.item]})
        self.assertEqual(r.status_code, 503)
        p = r.get_json()["predictions"][0]
        self.assertEqual((p["source"], p["rule_based_priority"]), ("rule_based_fallback", self.item["followup"]["priority"]))

    def test_api_key(self):
        os.environ["FOLLOWCARE_ML_API_KEY"] = "k"
        try:
            c = create_app(self.art).test_client()
            self.assertEqual(c.post("/score", json={"items": [self.item]}).status_code, 401)
            self.assertEqual(c.post("/score", json={"items": [self.item]}, headers={"X-API-Key": "k"}).status_code, 200)
        finally:
            del os.environ["FOLLOWCARE_ML_API_KEY"]


if __name__ == "__main__":
    unittest.main()
