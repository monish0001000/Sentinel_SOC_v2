from typing import Dict, List
import time

class EDRManager:
    def __init__(self, bus=None):
        self.agents: Dict[str, Dict] = {}
        self.bus = bus

    def register_agent(self, agent_data: dict):
        agent_id = agent_data["id"]
        agent_data["last_seen"] = time.time()
        agent_data["status"] = "online"
        
        # Ensure stats dict exists if not provided
        if "stats" not in agent_data:
            agent_data["stats"] = {}

        self.agents[agent_id] = agent_data
        
        print(f"[EDR] Agent registered: {agent_data['hostname']} ({agent_id})")
        
        self.publish_updates()
        return {"status": "registered"}

    def update_heartbeat(self, agent_id: str, stats: dict):
        if agent_id in self.agents:
            self.agents[agent_id]["stats"] = stats
            self.agents[agent_id]["last_seen"] = time.time()
            self.agents[agent_id]["status"] = "online"
            
            # Recalculate global metrics whenever a heartbeat arrives
            self.calculate_global_metrics()
            
            # Publish specific agent update (optional, but good for real-time single host view)
            if self.bus:
                 self.bus.publish(f"agent_update:{agent_id}", self.agents[agent_id])

            return {"status": "updated"}
        return {"status": "unknown_agent", "action": "re-register"}

    def calculate_global_metrics(self):
        if not self.bus:
            return

        total_cpu = 0
        total_ram = 0
        count = 0
        online_agents = []

        now = time.time()
        for agent in self.agents.values():
            # Mark offline if silent for > 30s
            if now - agent["last_seen"] > 30:
                agent["status"] = "offline"
            
            if agent["status"] == "online":
                stats = agent.get("stats", {})
                total_cpu += stats.get("cpu", 0)
                total_ram += stats.get("memory", 0)
                count += 1
                online_agents.append(agent)

        avg_cpu = total_cpu / count if count > 0 else 0
        avg_ram = total_ram / count if count > 0 else 0
        
        # Publish Global Fleet Metrics
        self.bus.publish("metrics", {
            "type": "global",
            "active_agents": count,
            "total_agents": len(self.agents),
            "cpu_usage": round(avg_cpu, 1),
            "memory_usage": round(avg_ram, 1),
            "disk_usage": 0 # TODO: Aggregate disk if needed
        })
        
        # Publish full agent list for "All Hosts" view
        self.bus.publish("agents_list", list(self.agents.values()))

    def publish_updates(self):
        """Force publish of current state"""
        self.calculate_global_metrics()

    def get_agents(self):
        # Refresh status before returning
        now = time.time()
        for agent in self.agents.values():
            if now - agent["last_seen"] > 30:
                agent["status"] = "offline"
        return list(self.agents.values())
