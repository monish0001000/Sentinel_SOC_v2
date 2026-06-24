import os
import redis
import json
import time

# Connection Config
REDIS_HOST = os.getenv('REDIS_HOST', 'redis')
REDIS_PORT = 6379

class SOAREngine:
    def __init__(self):
        self._connect_redis()
        # Mock Asset Database (Business Impact)
        # In a real system, this might query the CMDB Service
        self.critical_assets = ["192.168.1.5", "10.0.0.1", "DomainController", "Production-DB"]

    def _connect_redis(self):
        print(f"[SOAR] Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")
        while True:
            try:
                self.r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
                self.r.ping()
                print("[SOAR] Connected to Redis.")
                self.pubsub = self.r.pubsub()
                self.pubsub.subscribe('soc_alerts')
                break
            except redis.ConnectionError:
                print("[SOAR] Redis unavailable, retrying in 3s...")
                time.sleep(3)

    def run(self):
        print("[SOAR] Service Started. Listening on 'soc_alerts'...")
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                try:
                    payload = message['data'].decode('utf-8')
                    alert = json.loads(payload)
                    
                    target = alert.get("source", "unknown")
                    threat = alert.get("threat", "unknown")
                    
                    print(f"[SOAR] Analyzing Alert: '{threat}' on Target: {target}", flush=True)
                    
                    # Policy Enforcer
                    if target in self.critical_assets:
                        print(f"🚫 BLOCKING HOST {target} (Critical Asset Protection Enabled)", flush=True)
                        
                        # PUBLISH COMMAND TO C2
                        command_payload = {
                            "action": "block_ip",
                            "target": target,
                            "reason": f"Automated SOAR Block (Threat: {threat})"
                        }
                        self.r.publish('c2_commands', json.dumps(command_payload))
                        print(f"[SOAR] 📤 SENT COMMAND: block_ip {target}", flush=True)
                    else:
                        print(f"⚠️ MONITORING ONLY for {target} (Non-Critical Asset)", flush=True)
                        
                except Exception as e:
                    print(f"[SOAR] Error: {e}", flush=True)

if __name__ == "__main__":
    time.sleep(2)
    service = SOAREngine()
    service.run()
