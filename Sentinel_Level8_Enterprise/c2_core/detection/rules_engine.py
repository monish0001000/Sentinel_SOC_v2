# detection/rules_engine.py

class RulesEngine:
    def __init__(self, bus):
        self.bus = bus
        self.last_alert_time = 0
        self.alert_cooldown = 30 # seconds
        bus.subscribe("system_event", self.check_system)

    async def check_system(self, event):
        # Check cooldown
        current_time = event["timestamp"]
        if current_time - self.last_alert_time < self.alert_cooldown:
            return

        alerts = []

        if event["cpu"] > 85:
            alerts.append("High CPU Usage")

        if event["memory"] > 90:
            alerts.append("High Memory Usage")

        if alerts:
            self.last_alert_time = current_time
            print("[ALERT TRIGGERED]", alerts) ##########
            # Send the first alert message as the main message
            await self.bus.publish("alert", {
                "message": alerts[0],
                "level": "WARNING",
                "severity": "medium",
                "event": event
            })
