import asyncio
from typing import Dict, Any, Callable, List
from core.event_bus import EventBus
from datetime import datetime
from core.impact import BusinessImpactEngine, Zone

class SOAREngine:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.playbooks: Dict[str, Callable] = {}
        self.history: List[Dict] = []
        self.bus.subscribe("alert", self.handle_alert)
        
        # Level 7 Upgrade: Impact Engine
        self.impact_engine = BusinessImpactEngine()

    def register_playbook(self, name: str, action: Callable):
        self.playbooks[name] = action
        print(f"[SOAR] Registered Playbook: {name}")

    async def handle_alert(self, event: Dict):
        severity = event.get("severity", "low")
        if severity == "critical" or severity == "high":
            await self.execute_response(event)

    async def execute_response(self, alert: Dict):
        alert_type = alert.get("type", "").lower()
        playbook_name = f"response_{alert_type}"
        target = alert.get("source", "unknown")
        
        # 1. Determine Action Name (Heuristic for MVP)
        action_name = "unknown_action"
        if "process" in alert_type: action_name = "kill_process"
        elif "network" in alert_type: action_name = "isolate_host"
        
        # 2. Impact Assessment (L7 Check)
        zone, reason = self.impact_engine.assess_impact(action_name, target)
        print(f"[SOAR] Impact Assessment for '{action_name}' on '{target}': {zone.value} ({reason})")
        
        if zone == Zone.DANGER:
             print(f"[SOAR] BLOCKED: Action requires L4 Approval. Reason: {reason}")
             await self.bus.publish("soar_action", {
                 "playbook": playbook_name,
                 "status": "blocked_requires_approval",
                 "reason": reason,
                 "target": target
             })
             return # STOP EXECUTION

        if playbook_name in self.playbooks:
            print(f"[SOAR] EXECUTING PLAYBOOK: {playbook_name} (Zone: {zone.value})")
            try:
                result = await self.playbooks[playbook_name](self.bus, alert)
                self.history.append({
                    "timestamp": datetime.utcnow().isoformat(),
                    "playbook": playbook_name,
                    "target": target,
                    "result": result,
                    "zone": zone.value
                })
                await self.bus.publish("soar_action", {
                    "playbook": playbook_name,
                    "status": "success",
                    "result": result,
                    "zone": zone.value
                })
            except Exception as e:
                print(f"[SOAR] Execution Failed: {e}")
        else:
             print(f"[SOAR] No playbook found for: {playbook_name}")
