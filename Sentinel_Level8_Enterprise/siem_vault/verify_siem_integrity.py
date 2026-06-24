import os
import redis
import json
import hashlib
import time
from datetime import datetime

# Connection Config
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = 6379

class SIEMVault:
    def __init__(self):
        self._connect_redis()
        # Initial Hash for Merkle Chain
        self.prev_hash = "00000000000000000000000000000000"

    def _connect_redis(self):
        print(f"[SIEM] Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")
        while True:
            try:
                self.r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
                self.r.ping()
                print("[SIEM] Connected to Redis.")
                self.pubsub = self.r.pubsub()
                self.pubsub.subscribe('soc_logs')
                break
            except redis.ConnectionError:
                print("[SIEM] Redis unavailable, retrying in 3s...")
                time.sleep(3)

    def calculate_hash(self, log_entry):
        # Merkle Chain: Hash(timestamp + message + prev_hash)
        # Using timestamp from the log itself ensures consistency
        ts = log_entry.get('timestamp', datetime.utcnow().isoformat())
        msg = log_entry.get('message', '')
        payload = f"{ts}{msg}{self.prev_hash}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def run(self):
        print("[SIEM] Service Started. Listening on 'soc_logs'...")
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                try:
                    payload = message['data'].decode('utf-8')
                    data = json.loads(payload)
                    
                    # Calculate Hash
                    current_hash = self.calculate_hash(data)
                    
                    # Update Chain
                    self.prev_hash = current_hash
                    
                    # Output Verification
                    print(f"✅ Log Secured: {current_hash} | Msg: {data.get('message')}", flush=True)
                    
                except json.JSONDecodeError:
                    print(f"[SIEM] Error decoding JSON: {message['data']}", flush=True)
                except Exception as e:
                    print(f"[SIEM] Error processing log: {e}", flush=True)

if __name__ == "__main__":
    # Give Redis a moment to come up if started simultaneously
    time.sleep(2) 
    service = SIEMVault()
    service.run()
