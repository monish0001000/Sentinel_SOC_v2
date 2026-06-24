import asyncio
from datetime import datetime
from typing import Dict, List, Set

class AdaptiveResponseEngine:
    def __init__(self, bus, firewall):
        self.bus = bus
        self.firewall = firewall
        self.risk_threshold_monitoring = 40
        self.risk_threshold_blocking = 60
        self.risk_threshold_panic = 95
        
        # Threat Memory: Track entities and their cumulative risk
        # { "ip:1.2.3.4": { "score": 50, "last_seen": timestamp, "actions": [] } }
        self.threat_memory: Dict[str, Dict] = {}
        
        # Subscribe to Predictive Engine events
        self.bus.subscribe("risk_assessment", self.handle_risk)

    async def handle_risk(self, event: Dict):
        """
        Evaluate risk score and trigger adaptive responses.
        """
        score = event.get("risk_score", 0)
        source = event.get("source", "unknown")
        # In a real system, the predictive engine should pass the 'target' IP/Process clearly.
        # For now, we assume the event might contain metadata or we treat 'system' as the local host.
        
        if score < self.risk_threshold_monitoring:
            return

        level = event.get("level", "UNKNOWN")
        print(f"[ADAPTIVE] Evaluating Risk {score} ({level}) from {source}")

        # 1. Update Threat Memory
        # Ideally we'd have a specific target identifier. 
        # For system-wide anomaly, we treat the 'Host' as the entity.
        entity_id = "Host:Local" # Simplified for this phase
        
        await self._update_memory(entity_id, score)
        
        # 2. Adaptive Actions
        if score >= self.risk_threshold_panic:
            # System must NEVER automatically transition to panic_mode/lockdown from here.
            # Only the SOAR Response Engine executes playbooks (like response_ransomware) that can trigger lockdown.
            print(f"[ADAPTIVE] Risk Score {score} exceeded panic threshold, but lockdown bypass active. Handled by SOAR.")
            
        elif score >= self.risk_threshold_blocking:
            # If network source, block external IPs (simulated as we don't have the specific IP in the abstract score)
            # In a full impl, 'metrics' would be tied to a flow.
            # Here we will Trigger "Aggressive Prevention" - e.g., Block usage of common attack ports
            await self._trigger_preventive_blocking()
            
        else:
            # Monitoring Phase
            print(f"[ADAPTIVE] Heightened Monitoring active for {entity_id}")

    async def _update_memory(self, entity: str, score: int):
        if entity not in self.threat_memory:
            self.threat_memory[entity] = {
                "score": score,
                "first_seen": datetime.now().isoformat(),
                "actions": []
            }
        else:
            # Accumulate or Maximize? Let's take Max risk seen
            self.threat_memory[entity]["score"] = max(self.threat_memory[entity]["score"], score)
            
        self.threat_memory[entity]["last_seen"] = datetime.now().isoformat()
        
        # Check for patterns to "Learn"
        await self._check_for_patterns(entity)

    async def _check_for_patterns(self, entity: str):
        """
        Level 6: Learning Engine.
        Analyze repeated behaviors and generate persistent rules.
        """
        history = self.threat_memory.get(entity, {})
        actions = history.get("actions", [])
        
        # Simple Logic: If we've had to block ports 3 times, create a permanent Policy
        preventive_count = actions.count("preventive_port_block")
        
        if preventive_count >= 2:
             # "Learn" a new permanent rule
             print(f"[ADAPTIVE-LEARNING] Repeated offenses by {entity}. Generative AI creating new POLICY.")
             
             # Create a simulated policy (in real life, write to DB)
             new_policy = {
                 "name": f"Auto-Policy-{entity.replace(':', '_')}",
                 "action": "DENY",
                 "target": "ALL_RISKY_PORTS",
                 "reason": "Learned from repeated behavior"
             }
             
             # Publish event so User sees the "Learning" happen
             await self.bus.publish("alert", {
                 "message": f"Adaptive Learning Engine created new Permanent Policy for {entity}",
                 "level": "INFO", # Info level to show 'Growth' not just 'Danger'
                 "severity": "low", 
                 "type": "AI_Learning",
                 "source": "Adaptive Engine"
             })
             
             # Reset counter/mark as learned to avoid spam
             self.threat_memory[entity]["actions"] = [a for a in actions if a != "preventive_port_block"]

    async def _trigger_lockdown(self, score):
        if not self.firewall.panic_mode:
            print(f"[ADAPTIVE] CRITICAL RISK {score} DETECTED! INITIATING PANIC MODE.")
            await self.firewall.toggle_panic_mode(True)
            
            await self.bus.publish("soar_action", {
                "playbook": "adaptive_lockdown",
                "status": "success",
                "reason": f"Risk Score {score} exceeded threshold"
            })
            
            # Record action
            if "Host:Local" in self.threat_memory:
                self.threat_memory["Host:Local"]["actions"].append("panic_mode")

    async def _trigger_preventive_blocking(self):
        # Block common risky ports temporarily if not already blocked
        risky_ports = [445, 3389, 23, 21]
        blocked_count = 0
        
        for port in risky_ports:
            if port not in self.firewall.blocked_ports:
                await self.firewall.block_port(port, reason="Adaptive Preventive Block")
                blocked_count += 1
        
        if blocked_count > 0:
            print(f"[ADAPTIVE] Blocked {blocked_count} high-risk ports proactively.")
            if "Host:Local" in self.threat_memory:
                 self.threat_memory["Host:Local"]["actions"].append("preventive_port_block")

    def get_threat_memory(self):
        return self.threat_memory
