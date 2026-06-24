import asyncio
import random
from datetime import datetime

class HunterAI:
    def __init__(self, bus, log_repo):
        self.bus = bus
        self.log_repo = log_repo
        self.active_hunts = {}

    async def start(self):
        print("[HUNTER] AI Threat Hunter active. Monitoring for Critical Alerts...")
        # In a real app, this would subscribe via the bus, 
        # but for now we'll hook into the bus in main.py
        pass

    async def investigate(self, alert: dict):
        """
        Triggered when a High/Critical alert is received.
        """
        hunt_id = f"hunt-{random.randint(1000,9999)}"
        severity = alert.get("severity", "low")
        
        if severity not in ["high", "critical"]:
            return

        print(f"[HUNTER] Starting Investigation {hunt_id} for alert: {alert.get('message')}")
        
        # 1. Hypothesis Generation
        hypothesis = f"Suspicious activity detected from {alert.get('source')}. Checking for lateral movement."
        
        await self.bus.publish("ai_event", {
            "type": "hunt_start",
            "hunt_id": hunt_id,
            "hypothesis": hypothesis,
            "timestamp": datetime.now().isoformat()
        })

        # 2. Evidence Collection (Simulated Log Search)
        # In reality, query self.log_repo.query(...)
        await asyncio.sleep(2) # Thinking time
        
        evidence = []
        # Simulate finding correlated logs
        if "process" in alert.get("message", "").lower():
            evidence.append("Found 3 other process spawning events in the last 10 minutes.")
            evidence.append("Process is unsigned.")
        elif "traffic" in alert.get("message", "").lower():
            evidence.append("Destination IP 192.168.1.50 has bad reputation.")
        
        # 3. Verdict
        verdict = "MALICIOUS" if len(evidence) > 0 else "BENIGN"
        confidence = 0.85 if verdict == "MALICIOUS" else 0.40
        
        report = {
            "hunt_id": hunt_id,
            "trigger_alert": alert,
            "hypothesis": hypothesis,
            "evidence": evidence,
            "verdict": verdict,
            "confidence": confidence,
            "recommendation": "Isolate Host" if verdict == "MALICIOUS" else "Monitor",
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"[HUNTER] Investigation Complete. Verdict: {verdict}")
        
        await self.bus.publish("ai_event", {
            "type": "hunt_report",
            "report": report
        })
