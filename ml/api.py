"""Local HTTP wrapper for the Node backend.

    pip install -r ml/requirements.txt
    export FOLLOWCARE_ML_API_KEY=<long random secret>      # PowerShell: $env:FOLLOWCARE_ML_API_KEY="..."
    python -m ml.api                                        # http://127.0.0.1:5001  (localhost only)

POST /score    {"items":[ item, ... ]}    raw DB-style rows -> features built here (see ml/feature_builder.py)
POST /predict  {"records":[ 26 features ]} already-built features
GET  /health
If the model is unusable, /score and /predict answer 503 with a rule-based fallback payload, so the
backend keeps using its existing priority. Request bodies are never logged."""
from __future__ import annotations

import hmac
import os

from flask import Flask, jsonify, request

from .feature_builder import build_model_record
from .predict_service import MAX_BATCH, FollowUpPredictorService, ValidationError


def create_app(artifact_dir=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 1_000_000
    svc = FollowUpPredictorService(artifact_dir or os.environ.get("FOLLOWCARE_ARTIFACT_DIR", "ml/artifacts"))
    app.config["SERVICE"] = svc

    def authorised():
        key = os.environ.get("FOLLOWCARE_ML_API_KEY")
        return not key or hmac.compare_digest(request.headers.get("X-API-Key", ""), key)

    @app.get("/health")
    def health():
        return jsonify(status="ok", model_loaded=svc.available, reason=None if svc.available else svc.reason,
                       model_version=svc.meta["model_version"] if svc.available else None)

    @app.post("/predict")
    def predict():
        if not authorised():
            return jsonify(error="unauthorised"), 401
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or not isinstance(body.get("records"), list):
            return jsonify(error='JSON body {"records": [...]} required'), 400
        try:
            out = svc.predict(body["records"])
        except ValidationError as e:
            return jsonify(error=str(e)), 400
        return jsonify(predictions=out, fallback="rule_based" if not svc.available else None), (200 if svc.available else 503)

    @app.post("/score")
    def score():
        if not authorised():
            return jsonify(error="unauthorised"), 401
        body = request.get_json(silent=True)
        items = body.get("items") if isinstance(body, dict) else None
        if not isinstance(items, list) or not items:
            return jsonify(error='JSON body {"items": [...]} required'), 400
        if len(items) > MAX_BATCH:
            return jsonify(error=f"at most {MAX_BATCH} items per request"), 400
        if not svc.available:
            out = [svc._fallback((i.get("followup") if isinstance(i, dict) else None) or {}) for i in items]
            for o, i in zip(out, items):
                o["followup_id"] = i.get("followup_id") if isinstance(i, dict) else None
            return jsonify(predictions=out, fallback="rule_based"), 503
        try:
            groups = svc.meta["reason_groups"]
            recs = []
            for n, item in enumerate(items):
                try:
                    recs.append(build_model_record(item, groups))
                except ValidationError as e:
                    raise ValidationError(f"item {n}: {e}")
            out = svc.predict(recs)
        except KeyError:
            return jsonify(error="model metadata is outdated; retrain"), 503
        except ValidationError as e:
            return jsonify(error=str(e)), 400
        for o, i in zip(out, items):
            o["followup_id"] = i.get("followup_id")
        return jsonify(predictions=out)

    return app


if __name__ == "__main__":
    create_app().run(host="127.0.0.1", port=int(os.environ.get("FOLLOWCARE_ML_PORT", "5001")))
