"""Run:  python -m pytest ml/test_pipeline.py   or   python -m unittest ml.test_pipeline
Synthetic data only; never reads real patient files."""
import json, os, shutil, tempfile, unittest

import numpy as np
import pandas as pd

from ml import fix_dataset as FD
from ml import train_model as TM
from ml.predict_service import FollowUpPredictorService, ValidationError, validate_record


def write_raw(d, n=90, seed=1):
    rng = np.random.RandomState(seed)
    pats, risk, fus = [], [], []
    for i in range(n):
        dead = i % 15 == 0
        pats.append(dict(Id=f"p{i}", is_deceased=dead, GENDER="F", MARITAL=None if i % 4 == 0 else "M", STATE="MH",
                         city_tier="metro", preferred_language="English", preferred_contact_method="call",
                         caregiver_on_file=bool(i % 2), caregiver_relationship=None if i % 2 == 0 else "Son",
                         FIRST="Name", LAST="Surname", phone="123", email="a@b.c", qa_flag=None))
        if not dead:
            risk.append(dict(patient_id=f"p{i}", age_years=rng.randint(5, 90), active_chronic_conditions=rng.randint(0, 5),
                             active_medications=rng.randint(0, 5), acute_visits_last_12m=rng.randint(0, 4),
                             readmission_within_30d=bool(rng.rand() < .1), missed_followups_last_12m=rng.randint(0, 3),
                             non_adherent_medications=rng.randint(0, 3), risk_score=5, risk_level="low", top_risk_drivers=None))
        for k in range(rng.randint(3, 7)):
            st = rng.choice(["completed_on_time", "completed_late", "missed", "rescheduled", "pending"], p=[.5, .15, .2, .1, .05])
            due = pd.Timestamp("2024-01-01") + pd.Timedelta(days=30 * k + int(rng.randint(0, 20)))
            fus.append(dict(followup_id=f"f{i}_{k}", patient_id=f"p{i}", source_encounter_class="ambulatory",
                            reason_description=rng.choice(list("ABCDEFGHIJKLMNOPQRST")), followup_type="clinic_visit",
                            followup_due_date=str(due.date()), followup_status=st, priority=rng.choice(["low", "medium", "high"]),
                            days_overdue=0, outreach_attempts=0, last_outreach_channel=None, followup_completed_date=None))
    pd.DataFrame(fus).to_csv(os.path.join(d, "followups.csv"), index=False)
    pd.DataFrame(risk).to_csv(os.path.join(d, "patient_risk.csv"), index=False)
    pd.DataFrame(pats).to_csv(os.path.join(d, "patients_followcare.csv"), index=False)


class PointInTime(unittest.TestCase):
    def frame(self, rows):
        return pd.DataFrame([dict(followup_id=i, patient_id="p", followup_due_date=pd.Timestamp(d), followup_status=s)
                             for i, d, s in rows])

    def test_strictly_prior_only(self):
        df = FD.point_in_time_history(self.frame([("a", "2025-01-01", "missed"), ("b", "2025-02-01", "completed_late"),
                                                  ("c", "2025-02-01", "missed"), ("d", "2025-03-01", "completed_on_time")]))
        r = df.set_index("followup_id")
        self.assertEqual(r.loc["a", "prior_total_followups"], 0)
        self.assertEqual(r.loc["a", "days_since_last_followup"], -1.0)
        self.assertEqual(r.loc["a", "prior_missed_rate"], 0.0)
        self.assertEqual(r.loc["b", "prior_total_followups"], 1)       # 'c' has the SAME due date -> not prior
        self.assertEqual(r.loc["b", "prior_missed_followups"], 1)
        self.assertEqual(r.loc["c", "prior_late_followups"], 0)        # b same date, excluded
        self.assertEqual(r.loc["d", "prior_total_followups"], 3)
        self.assertEqual(r.loc["d", "prior_missed_followups"], 2)
        self.assertAlmostEqual(r.loc["d", "prior_missed_rate"], 2 / 3)
        self.assertEqual(r.loc["d", "days_since_last_followup"], 28.0)

    def test_future_rows_never_leak(self):
        base = self.frame([("a", "2025-01-01", "completed_on_time"), ("b", "2025-02-01", "completed_on_time")])
        fut = self.frame([("a", "2025-01-01", "completed_on_time"), ("b", "2025-02-01", "completed_on_time"),
                          ("z", "2026-01-01", "missed")])
        a = FD.point_in_time_history(base).set_index("followup_id")
        b = FD.point_in_time_history(fut).set_index("followup_id")
        for c in ["prior_total_followups", "prior_missed_followups", "prior_missed_rate", "days_since_last_followup"]:
            self.assertEqual(a.loc["b", c], b.loc["b", c])

    def test_lead_days_is_stricter(self):
        f = self.frame([("a", "2025-01-01", "missed"), ("b", "2025-01-05", "completed_on_time")])
        self.assertEqual(FD.point_in_time_history(f, 0).set_index("followup_id").loc["b", "prior_missed_followups"], 1)
        self.assertEqual(FD.point_in_time_history(f, 7).set_index("followup_id").loc["b", "prior_missed_followups"], 0)


class Cleaning(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(); write_raw(cls.tmp)
        cls.train, cls.pending, cls.rep = FD.build(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_no_banned_columns_in_features(self):
        self.assertFalse(set(FD.BANNED) & set(FD.FEATURES))
        self.assertEqual(len(FD.FEATURES), 26)
        self.assertEqual((len(FD.NUMERIC), len(FD.CATEGORICAL)), (15, 11))

    def test_no_pii_or_leaky_columns_in_outputs(self):
        for df in (self.train, self.pending):
            self.assertFalse(({"FIRST", "LAST", "phone", "email", "qa_flag", "days_overdue", "outreach_attempts",
                               "missed_followups_last_12m", "risk_score", "followup_status"}) & set(df.columns))

    def test_target_and_exclusions(self):
        self.assertTrue(set(self.train.target_missed.unique()) <= {0, 1})
        self.assertEqual(self.rep["training_rows"], len(self.train))
        self.assertGreater(self.rep["rescheduled_excluded"], 0)
        self.assertGreater(len(self.pending), 0)

    def test_deceased_removed(self):
        self.assertGreater(self.rep["deceased_followup_rows_dropped"], 0)
        self.assertFalse(self.train.patient_id.isin([f"p{i}" for i in range(0, 90, 15)]).any())

    def test_null_handling_and_reason_grouping(self):
        self.assertEqual(self.train[FD.CATEGORICAL].isna().sum().sum(), 0)
        self.assertLessEqual(self.train.reason_grouped.nunique(), 16)
        self.assertIn("Other", set(self.train.reason_grouped))
        self.assertIn("None", set(self.train.caregiver_relationship))

    def test_missing_column_raises(self):
        tmp = tempfile.mkdtemp()
        try:
            write_raw(tmp, 10)
            p = os.path.join(tmp, "followups.csv")
            pd.read_csv(p).drop(columns=["followup_status"]).to_csv(p, index=False)
            with self.assertRaises(ValueError):
                FD.build(tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(); raw = os.path.join(cls.tmp, "raw"); os.makedirs(raw)
        write_raw(raw, 150)
        cls.proc = os.path.join(cls.tmp, "proc"); os.makedirs(cls.proc)
        tr, pe, _ = FD.build(raw); tr.to_csv(os.path.join(cls.proc, "training_dataset.csv"), index=False)
        pe.to_csv(os.path.join(cls.proc, "pending_inference_queue.csv"), index=False)
        cls.art = os.path.join(cls.tmp, "art"); cls.meta = TM.run(cls.proc, cls.art, quick=True)
        cls.rec = TM.read_processed(os.path.join(cls.proc, "pending_inference_queue.csv"))[FD.FEATURES].iloc[0].to_dict()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_split_is_patient_disjoint_and_artifacts_exist(self):
        for f in ("followup_hgb_model.joblib", "model_metadata.json", "scored_pending_queue.csv"):
            self.assertTrue(os.path.exists(os.path.join(self.art, f)))
        self.assertNotIn("p1", json.dumps(self.meta["test"]))

    def test_predict_valid(self):
        s = FollowUpPredictorService(self.art); self.assertTrue(s.available)
        o = s.predict([self.rec])[0]
        self.assertEqual(o["source"], "ml_model"); self.assertTrue(0 <= o["ml_score"] <= 1)
        self.assertIn("Administrative decision support", o["disclaimer"])

    def test_fallback_when_artifacts_missing(self):
        s = FollowUpPredictorService(os.path.join(self.tmp, "none"))
        o = s.predict([self.rec])[0]
        self.assertEqual((o["source"], o["rule_based_priority"]), ("rule_based_fallback", self.rec["priority"]))

    def test_tampered_artifact_falls_back(self):
        dst = os.path.join(self.tmp, "tampered"); shutil.copytree(self.art, dst)
        with open(os.path.join(dst, "followup_hgb_model.joblib"), "ab") as f:
            f.write(b"x")
        self.assertEqual(FollowUpPredictorService(dst).predict([self.rec])[0]["source"], "rule_based_fallback")

    def test_validation(self):
        s = FollowUpPredictorService(self.art)
        bad = [dict(self.rec, age_years=-1), dict(self.rec, age_years="x"), dict(self.rec, due_month=13),
               {k: v for k, v in self.rec.items() if k != "priority"}, dict(self.rec, prior_missed_followups=999, prior_total_followups=1),
               dict(self.rec, STATE=""), "nope"]
        for b in bad:
            with self.assertRaises(ValidationError, msg=str(b)):
                s.predict([b])
        with self.assertRaises(ValidationError):
            s.predict([])
        with self.assertRaises(ValidationError):
            s.predict([self.rec] * 201)

    def test_unseen_category_ok(self):
        self.assertEqual(len(FollowUpPredictorService(self.art).predict([dict(self.rec, STATE="ZZ")])), 1)


if __name__ == "__main__":
    unittest.main()
