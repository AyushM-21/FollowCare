"""Platt (sigmoid) probability calibration. Own module so pickles resolve as ml.calibration.PlattCalibrator."""
import numpy as np
from sklearn.linear_model import LogisticRegression


class PlattCalibrator:
    def __init__(self):
        self.lr = LogisticRegression(C=1e6, max_iter=1000)

    @staticmethod
    def _l(p):
        p = np.clip(np.asarray(p, float), 1e-6, 1 - 1e-6)
        return np.log(p / (1 - p)).reshape(-1, 1)

    def fit(self, p, y):
        self.lr.fit(self._l(p), y)
        return self

    def predict(self, p):
        return self.lr.predict_proba(self._l(p))[:, 1]
