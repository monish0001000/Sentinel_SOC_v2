
from typing import Dict, List, Optional
from server.database import db
from core.event_bus import EventBus
import time

class GlobalRiskEngine:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.global_risk_score = 0
        self.risk_threshold_panic = 80
        self.last_calculation = 0
        self.agent_stats_cache = {} # Cache for volatile stats (CPU/RAM)
        self.host_scores = {} # Cache for host scores

        # Subscribe to alerts (Legacy RiskScorer logic)
        bus.subscribe("alert", self.handle_alert)
        bus.subscribe("anomaly", self.handle_alert)
        bus.subscribe("risk_assessment", self.handle_alert) # Support Predictive & Rules Engine outputs

    async def handle_alert(self, data):
        """
        Handle alerts from server-side components (WFP, IDPS, etc).
        We attribute these to a virtual agent 'local_server' or specific agents if tagged.
        """
        agent_id = data.get("agent_id", "local_server")
        incoming_risk = data.get("score", 0)
        
        # Fallback Risk Calculation
        if incoming_risk == 0 and "severity" in data:
            severity = data["severity"].lower()
            if severity == "critical": incoming_risk = 90
            elif severity == "high": incoming_risk = 70
            elif severity == "medium": incoming_risk = 40
            else: incoming_risk = 10

        # Update Host Risk (decay logic or accumulator can go here)
        current_host_score = self.host_scores.get(agent_id, 0)
        
        # Simple latching logic: Max of current vs new, capped at 100
        # In a real system we might want decay, but for safety we latch high.
        new_host_score = min(100, max(current_host_score, incoming_risk))
        
        # If it's a new cumulative risk, update it. 
        # Actually simplest way to ensure urgency is just set it to the new risk if it's higher.
        if incoming_risk > current_host_score:
             new_host_score = incoming_risk
        
        self.host_scores[agent_id] = new_host_score
        
        # If it's the local server, we don't have a heartbeat to update the DB directly?
        # Maybe we should mock a DB entry for local_server so it shows up in "Nodes"?
        if agent_id == "local_server":
             # Optional: persist to DB if we want it to survive
             pass

        await self.calculate_global_risk()


    async def update_agent_risk(self, agent_id: str, local_risk: int, stats: Dict = None):
        """
        Called when an agent reports a new risk score.
        Updates DB and recalculates global risk.
        stats: Full telemetry dict (CPU, RAM, etc.)
        """
        # Update DB
        db.update_agent_heartbeat(agent_id, local_risk)
        
        # Update Memory Cache
        if stats:
             self.agent_stats_cache[agent_id] = stats

        # Publish update event
        await self.bus.publish("agent_risk_update", {
            "agent_id": agent_id, 
            "risk_score": local_risk,
            "timestamp": time.time()
        })
        
        # Recalculate Global Risk & Broadcast State
        await self.calculate_global_risk()

    async def calculate_global_risk(self):
        """
        Aggregates risk from all ONLINE agents.
        """
        agents_db = db.get_agents()
        if not agents_db:
            self.global_risk_score = 0
            self.publish_state([], {})
            return

        total_risk = 0
        active_count = 0
        max_agent_risk = 0
        
        # Prepare list for Frontend
        frontend_agents = []
        host_scores = {}

        for agent in agents_db:
            # Map DB fields to Frontend fields
            agent_id = agent['agent_id']
            risk = agent.get('local_risk', 0)
            
            # Format for UI
            frontend_agent = {
                "id": agent_id,
                "hostname": agent['hostname'],
                "ip": agent['ip_address'],
                "os": agent['os'],
                "status": agent['status'],
                "last_seen": agent['last_seen'],
                "stats": self.agent_stats_cache.get(agent_id, {}) # From telemetry.py structure
            }
            frontend_agents.append(frontend_agent)

            # Risk Logic
            # Check if active (e.g. within last 60s is handled by DB status logic or here?)
            # For now assume if in DB and status=ONLINE it's active.
            if agent['status'] == 'ONLINE':
                total_risk += risk
                active_count += 1
                if risk > max_agent_risk:
                    max_agent_risk = risk
                host_scores[agent_id] = risk

        # Global Score Formula
        if active_count > 0:
            avg_risk = total_risk / active_count
            self.global_risk_score = int((avg_risk * 0.7) + (max_agent_risk * 0.3))
        else:
            self.global_risk_score = 0

        # Broadcast Global Risk
        await self.bus.publish("global_risk", {
            "score": self.global_risk_score,
            "active_agents": active_count,
            "host_scores": host_scores
        })
        
        # Broadcast Agent List (for NodesPage)
        await self.bus.publish("agents_list", frontend_agents)

        # Check Thresholds
        if self.global_risk_score > self.risk_threshold_panic:
            # System must NEVER flip into automated network isolation involuntarily
            print(f"[GLOBAL RISK] High risk ({self.global_risk_score}) detected, but automated panic route is disabled by policy.")

    async def trigger_global_panic(self):
        print(f"[GLOBAL RISK] CRITICAL RISK {self.global_risk_score} DETECTED! TRIGGERING GLOBAL PANIC!")
        await self.bus.publish("global_panic", {
            "risk_score": self.global_risk_score,
            "reason": "Global Risk Threshold Exceeded"
        })
    
    def publish_state(self, agents, scores):
        self.bus.publish("agents_list", agents)
