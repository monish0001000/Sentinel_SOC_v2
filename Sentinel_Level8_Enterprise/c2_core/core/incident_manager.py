
from server.database import db
from core.event_bus import EventBus
from typing import Dict, List, Optional

class IncidentManager:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.bus.subscribe("alert", self.handle_alert)

    async def handle_alert(self, event: Dict):
        """
        Listens for alerts and auto-creates incidents for CRITICAL level.
        """
        # Auto-create incident if CRITICAL
        # We handle case-insensitive check
        severity = str(event.get("severity", "")).upper()
        
        if severity == "CRITICAL":
            # Check if we should deduplicate? 
            # For this phase, we assume every Critical alert is worthy of an incident 
            # or at least a new entry.
            print(f"[INCIDENT] Auto-creating incident for Critical Alert: {event.get('message')}")
            self.create_incident_from_alert(event)

    def create_incident_from_alert(self, alert: Dict) -> int:
        data = {
            "type": alert.get("type", "SecurityAlert"),
            "severity": "CRITICAL",
            "source": alert.get("source", "Unknown"),
            "description": alert.get("message", "No description provided"),
            "risk_score": alert.get("risk_score", 0)
        }
        
        # 1. Create Incident
        incident_id = db.create_incident(data)
        
        # 2. Log Audit
        db.log_audit(incident_id, "CREATED", "System")
        
        # 3. Notify
        print(f"[INCIDENT] Created Incident #{incident_id}")
        self.bus.publish("incident_created", {
            "incident_id": incident_id,
            "data": data,
            "timestamp": db.datetime.utcnow().isoformat()
        })
        return incident_id

    def get_incident(self, incident_id: int) -> Optional[Dict]:
        return db.get_incident(incident_id)

    def list_incidents(self, status: Optional[str] = None) -> List[Dict]:
        return db.list_incidents(status)

    def contain_incident(self, incident_id: int, actor: str = "System") -> bool:
        incident = db.get_incident(incident_id)
        if not incident:
            raise ValueError(f"Incident #{incident_id} not found")
        
        current_status = incident["status"]
        
        if current_status == "RESOLVED":
            # Invalid transition
             raise ValueError("Cannot contain a RESOLVED incident. Re-open first (not implemented).")

        if current_status == "CONTAINED":
            return True # Idempotent match
            
        success = db.update_incident_status(incident_id, "CONTAINED")
        if success:
            db.log_audit(incident_id, "CONTAINED", actor)
            print(f"[INCIDENT] Incident #{incident_id} CONTAINED by {actor}")
            return True
        return False

    def resolve_incident(self, incident_id: int, actor: str = "System") -> bool:
        incident = db.get_incident(incident_id)
        if not incident:
            raise ValueError(f"Incident #{incident_id} not found")
            
        current_status = incident["status"]
        if current_status == "RESOLVED":
             return True # Idempotent
        
        success = db.update_incident_status(incident_id, "RESOLVED")
        if success:
            db.log_audit(incident_id, "RESOLVED", actor)
            print(f"[INCIDENT] Incident #{incident_id} RESOLVED by {actor}")
            return True
        return False
        
    def get_audit_trail(self, incident_id: int) -> List[Dict]:
         return db.get_audit_logs(incident_id)

