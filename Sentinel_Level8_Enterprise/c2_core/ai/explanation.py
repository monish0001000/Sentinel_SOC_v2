# ai/explanation.py

class ExplainAI:
    def __init__(self, bus):
        self.bus = bus
        bus.subscribe("risk", self.explain)

    async def explain(self, data):
        explanation = "Suspicious behavior detected based on system activity."
        risk = data.get("risk", 0)
        
        await self.bus.publish("explanation", {
            "risk": risk,
            "explanation": explanation
        })
