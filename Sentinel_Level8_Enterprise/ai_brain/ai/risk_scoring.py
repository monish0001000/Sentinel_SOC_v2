# ai/risk_scoring.py

class RiskScorer:
    def __init__(self, bus):
        self.bus = bus
        self.host_scores = {}  # {agent_id: current_risk_score}
        self.global_risk = 0
        
        bus.subscribe("alert", self.handle_alert)
        bus.subscribe("anomaly", self.handle_alert)
        # Subscribe to agent updates to initialize/clear scores? 
        # For now, we'll let alerts drive the risk creation, or default to 0.

    async def handle_alert(self, data):
        """
        Data expected format:
        {
            "agent_id": "uuid" (optional, defaults to 'local'),
            "severity": "high",
            "score": 50,
            ...
        }
        """
        agent_id = data.get("agent_id", "local_server")
        incoming_risk = data.get("score", 0)
        
        # If alert has no score, infer from severity (simplistic fallback)
        if incoming_risk == 0 and "severity" in data:
            severity = data["severity"].lower()
            if severity == "critical": incoming_risk = 90
            elif severity == "high": incoming_risk = 70
            elif severity == "medium": incoming_risk = 40
            else: incoming_risk = 10

        # Update Host Risk (decay logic or accumulator can go here)
        # For now, we take the MAX of current and new (High Water Mark)
        # effectively latching risk high until manual clearance or decay.
        # But for 'enterprise readiness', let's just set it to the latest alert's impact 
        # OR better: Add to current score with a cap.
        
        current_host_score = self.host_scores.get(agent_id, 0)
        new_host_score = min(100, current_host_score + incoming_risk)
        self.host_scores[agent_id] = new_host_score
        
        await self.calculate_and_publish_global_risk()

    async def calculate_and_publish_global_risk(self):
        if not self.host_scores:
            self.global_risk = 0
        else:
            # Global Risk = Max of any single host (Paramount safety)
            # OR Average? Usually in SOC, if one host is compromised, the org is at risk.
            # We will use Weighted Average but skewed towards Max.
            # Let's simple use MAX for now to trigger Urgent Responses.
            self.global_risk = max(self.host_scores.values())

        await self.bus.publish("risk", {
            "global_score": self.global_risk,
            "host_scores": self.host_scores
        })
