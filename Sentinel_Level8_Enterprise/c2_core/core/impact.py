from enum import Enum
from typing import Dict, Tuple

class ImpactLevel(Enum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4

class Zone(Enum):
    SAFE = "Safe"           # Auto-Execute
    MODERATE = "Moderate"   # AI Confidence > 90%
    DANGER = "Danger"       # Human Approval Required

class BusinessImpactEngine:
    def __init__(self):
        # Asset Criticality Map (Mock CMDB)
        self.assets = {
            "192.168.1.5": ImpactLevel.CRITICAL, # Domain Controller
            "192.168.1.20": ImpactLevel.HIGH,    # Database
            "192.168.1.100": ImpactLevel.LOW,    # Guest WiFi
            "fileserver": ImpactLevel.MEDIUM
        }
        
        # Action Risk Map
        self.action_risks = {
            "kill_process": ImpactLevel.LOW,
            "delete_file": ImpactLevel.MEDIUM,
            "isolate_host": ImpactLevel.HIGH,
            "reboot_host": ImpactLevel.HIGH,
            "block_subnet": ImpactLevel.CRITICAL
        }

    def assess_impact(self, action: str, target: str) -> Tuple[Zone, str]:
        """
        Calculates the Zone (Safe/Danger) for a proposed action.
        Returns: (Zone, Reason)
        """
        asset_impact = self.assets.get(target, ImpactLevel.LOW) # Default to Low if unknown
        action_risk = self.action_risks.get(action, ImpactLevel.HIGH) # Default to High if unknown
        
        # Logic Matrix
        
        # 1. CRITICAL ASSETS are always DANGER ZONE for any disruptive action
        if asset_impact == ImpactLevel.CRITICAL:
            if action_risk.value >= ImpactLevel.MEDIUM.value:
                return Zone.DANGER, f"Action '{action}' on CRITICAL Asset '{target}' requires L4 Approval."
        
        # 2. HIGH RISK ACTIONS are always DANGER/MODERATE
        if action_risk == ImpactLevel.CRITICAL:
            return Zone.DANGER, f"Action '{action}' is fundamentally dangerous."
            
        if action_risk == ImpactLevel.HIGH:
            if asset_impact == ImpactLevel.LOW:
                return Zone.MODERATE, f"High risk action on Low value asset."
            return Zone.DANGER, f"High risk action on valuable asset '{target}'."

        # 3. MEDIUM/LOW actions
        if action_risk == ImpactLevel.LOW:
            return Zone.SAFE, "Low risk action."

        return Zone.MODERATE, "Standard automated response."

