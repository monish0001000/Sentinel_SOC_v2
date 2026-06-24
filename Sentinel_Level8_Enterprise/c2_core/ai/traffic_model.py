import numpy as np
from sklearn.ensemble import IsolationForest
import pickle
import os
import time

MODEL_FILE = "traffic_model.pkl"

class TrafficAnalyzer:
    def __init__(self):
        self.model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
        self.buffer = []
        self.buffer_size = 100 # Train every 100 packets
        self.is_trained = False
        self.load_model()

    def load_model(self):
        if os.path.exists(MODEL_FILE):
            try:
                with open(MODEL_FILE, "rb") as f:
                    self.model = pickle.load(f)
                    self.is_trained = True
                    print("[AI] Traffic Model Loaded.")
            except Exception:
                pass

    def save_model(self):
        try:
            with open(MODEL_FILE, "wb") as f:
                pickle.dump(self.model, f)
        except Exception as e:
            print(f"[AI] Model Save Failed: {e}")

    def extract_features(self, packet_meta: dict) -> list:
        """
        Extract numerical features from packet metadata.
        Features: [Packet Size, Port, Protocol Enum (TCP=1, UDP=2), Hour of Day]
        """
        size = packet_meta.get("size", 0)
        port = packet_meta.get("port", 0)
        proto = 1 if packet_meta.get("transport") == "tcp" else 0
        hour = time.localtime().tm_hour
        
        return [size, port, proto, hour]

    def analyze(self, packet_meta: dict) -> dict:
        features = self.extract_features(packet_meta)
        
        # Add to training buffer
        self.buffer.append(features)
        
        # Online Learning (Simulation: Re-fit periodically)
        # IsolationForest is technically offline, but we can re-train on growing dataset
        # In prod, we'd use something like River for online learning.
        if len(self.buffer) >= self.buffer_size:
            # Re-train on recent history to adapt
            # Note: doing this synchronously might lag, but ok for demo
            try:
                self.model.fit(self.buffer)
                self.is_trained = True
                self.save_model()
                self.buffer = [] # Clear buffer or keep rolling window
                # print("[AI] Traffic Model Refined.")
            except Exception:
                pass

        if not self.is_trained:
            return {"anomaly_score": 0, "is_anomaly": False}

        # Predict
        try:
            # decision_function returns negative for anomaly
            score = self.model.decision_function([features])[0] 
            is_anomaly = self.model.predict([features])[0] == -1
            
            # Normalize score roughly to 0-100 risk
            risk_score = 0
            if is_anomaly:
                risk_score = 75 + abs(score) * 25
            
            return {
                "anomaly_score": float(score),
                "is_anomaly": bool(is_anomaly),
                "risk_score": min(risk_score, 100)
            }
        except Exception:
            return {"anomaly_score": 0, "is_anomaly": False}
