from typing import List, Dict, Optional
from datetime import datetime
import uuid

class SecurityRule:
    def __init__(self, name: str, source_zone: str, dest_zone: str, 
                 source_ip: str, app: str, action: str, 
                 process_name: str = "any", id: str = None):
        self.id = id or str(uuid.uuid4())
        self.name = name
        self.source_zone = source_zone
        self.dest_zone = dest_zone
        self.source_ip = source_ip  # "any" or specific IP/CIDR
        self.app = app              # "any", "ssh", "web", "database"
        self.process_name = process_name # "any" or "chrome.exe"
        self.action = action        # "allow", "deny"
        self.hits = 0
        self.created_at = datetime.utcnow().isoformat()

    def match(self, src_zone: str, dst_zone: str, src_ip: str, detected_app: str, detected_proc: str = "unknown") -> bool:
        if self.source_zone != "any" and self.source_zone != src_zone:
            return False
        if self.dest_zone != "any" and self.dest_zone != dst_zone:
            return False
        if self.source_ip != "any" and self.source_ip != src_ip:
            return False
        if self.app != "any" and self.app != detected_app:
            return False
        if self.process_name != "any" and self.process_name.lower() != detected_proc.lower():
            return False
            
        return True

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "source_zone": self.source_zone,
            "dest_zone": self.dest_zone,
            "source_ip": self.source_ip,
            "app": self.app,
            "process_name": self.process_name,
            "action": self.action,
            "hits": self.hits,
            "created_at": self.created_at
        }
    
    @classmethod
    def from_dict(cls, data):
        rule = cls(
            name=data["name"],
            source_zone=data["source_zone"],
            dest_zone=data["dest_zone"],
            source_ip=data["source_ip"],
            app=data["app"],
            action=data["action"],
            process_name=data.get("process_name", "any"),
            id=data.get("id")
        )
        rule.hits = data.get("hits", 0)
        rule.created_at = data.get("created_at")
        return rule

class PolicyEngine:
    def __init__(self):
        self.rules: List[SecurityRule] = []
        # Default Implicit Deny
        self.default_action = "deny" 

    def evaluate(self, src_zone: str, dst_zone: str, src_ip: str, app: str, process_name: str = "unknown") -> str:
        """
        Evaluate traffic against ordered rules.
        Returns: 'allow' or 'deny'
        """
        for rule in self.rules:
            if rule.match(src_zone, dst_zone, src_ip, app, process_name):
                rule.hits += 1
                return rule.action
        
        return self.default_action

    def add_rule(self, rule: SecurityRule):
        self.rules.append(rule)

    def remove_rule(self, rule_id: str):
        self.rules = [r for r in self.rules if r.id != rule_id]

    def reorder_rule(self, rule_id: str, new_index: int):
        # Move rule to new index
        rule = next((r for r in self.rules if r.id == rule_id), None)
        if rule:
            self.rules.remove(rule)
            self.rules.insert(new_index, rule)

    def get_rules_dict(self):
        return [r.to_dict() for r in self.rules]

    def load_rules(self, rules_data: List[Dict]):
        self.rules = [SecurityRule.from_dict(r) for r in rules_data]
