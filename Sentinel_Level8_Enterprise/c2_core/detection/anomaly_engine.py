# detection/anomaly_engine.py
import numpy as np

class AnomalyEngine:
    def __init__(self, bus):
        self.bus = bus
        bus.subscribe("system_event", self.analyze)

    async def analyze(self, event):
        # score = np.random.randint(0, 100)
        # Disable random anomalies for now to keep the UI clean.
        # Future: Implement real ML model inference here.
        pass

        # if score > 80:
        #     await self.bus.publish("anomaly", {
        #         "score": score,
        #         "event": event
        #     })
