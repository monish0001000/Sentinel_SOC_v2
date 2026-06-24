import os
import redis
import json
import time

# Connection Config
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = 6379

class AIPredictionEngine:
    def __init__(self):
        self._connect_redis()
        # Heuristic Threat Signatures
        self.threat_signatures = ["Suspicious Process", "whoami", "mimikatz", "nmap", "powershell -enc"]

    def _connect_redis(self):
        print(f"[AI] Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")
        while True:
            try:
                self.r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
                self.r.ping()
                print("[AI] Connected to Redis.")
                self.pubsub = self.r.pubsub()
                self.pubsub.subscribe('soc_logs')
                break
            except redis.ConnectionError:
                print("[AI] Redis unavailable, retrying in 3s...")
                time.sleep(3)

    def predict_next_step(self, message):
        """
        Simple Rule-Based Prediction (Placeholder for simple Model)
        """
        msg_lower = message.lower()
        if "whoami" in msg_lower or "discovery" in msg_lower:
             return "Prediction: Attacker likely to attempt Credential Access (T1003) next."
        if "mimikatz" in msg_lower or "credential" in msg_lower:
             return "Prediction: Attacker likely to attempt Lateral Movement (T1021) next."
        if "suspicious process" in msg_lower:
             return "Prediction: Potential Malware Execution detected."
        return None

    def run(self):
        print("[AI] Service Started. Listening on 'soc_logs'...")
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                try:
                    payload = message['data'].decode('utf-8')
                    data = json.loads(payload)
                    log_msg = data.get("message", "")
                    
                    # Logic 1: Scan for known threats
                    if any(sig.lower() in log_msg.lower() for sig in self.threat_signatures):
                         print(f"[AI] ⚡ Threat Identified in Log: {log_msg}", flush=True)
                         
                         # Logic 2: Predict functionality
                         prediction = self.predict_next_step(log_msg)
                         
                         alert_payload = {
                             "source": data.get("source", "unknown"),
                             "threat": log_msg,
                             "prediction": prediction or "Analysis Pending",
                             "severity": "High",
                             "timestamp": time.time()
                         }
                         
                         # Publish to NEW channel: soc_alerts
                         self.r.publish('soc_alerts', json.dumps(alert_payload))
                         print(f"[AI] ➡️ Published Prediction to 'soc_alerts'", flush=True)
                         
                except Exception as e:
                    print(f"[AI] Error: {e}", flush=True)

if __name__ == "__main__":
    time.sleep(2)
    service = AIPredictionEngine()
    service.run()
