import asyncio
from core.event_bus import EventBus
import networkx as nx

class PredictiveEngine:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.bus.subscribe("alert", self.handle_alert)
        
        # MITRE ATT&CK Probabilistic Graph
        # Nodes = Tactics/Techniques
        # Edges = Probability of transition
        self.attack_graph = nx.DiGraph()
        self._build_mitre_graph()
        
        # State tracking per Entity (IP or Host)
        # { "192.168.1.50": { "current_stage": "Discovery", "last_event_time": ... } }
        self.active_kill_chains = {}

    def _build_mitre_graph(self):
        # Simplified MITRE Graph
        # Tactic Order: Recon -> Resource Dev -> Initial Access -> Execution -> Persistence -> PrivEsc -> Defense Evasion -> Cred Access -> Discovery -> Lateral Movement -> Collection -> Exfil -> Impact
        
        # We model specific Technique transitions for higher fidelity
        
        # 1. Discovery -> Credential Access
        self.attack_graph.add_edge("T1082", "T1003", weight=0.8) # System Info Discovery -> OS Credential Dumping
        self.attack_graph.add_edge("T1082", "T1555", weight=0.6) # System Info Discovery -> Credentials from Password Stores
        
        # 2. Credential Access -> Lateral Movement
        self.attack_graph.add_edge("T1003", "T1021", weight=0.9) # Cred Dump -> Remote Services
        self.attack_graph.add_edge("T1003", "T1028", weight=0.7) # Cred Dump -> Windows Remote Management
        
        # 3. Lateral Movement -> Execution (Remote)
        self.attack_graph.add_edge("T1021", "T1059", weight=0.9) # Remote Services -> Command and Scripting Interpreter
        
        # 4. Execution -> Impact (Ransomware)
        self.attack_graph.add_edge("T1059", "T1486", weight=0.5) # Cmd Line -> Data Encrypted for Impact

    def _map_alert_to_ttp(self, alert_msg):
        # Heuristic mapping (In real world, use NLP or explicit fields)
        msg = alert_msg.lower()
        if "whoami" in msg or "systeminfo" in msg or "discovery" in msg:
            return "T1082"
        if "mimikatz" in msg or "lsass" in msg or "dump" in msg:
            return "T1003"
        if "psexec" in msg or "rdp" in msg or "lateral" in msg:
            return "T1021"
        if "encrypt" in msg or "extension" in msg:
            return "T1486"
        return None

    def _get_tactic_name(self, ttp_id):
        lookup = {
            "T1082": "Discovery",
            "T1003": "Credential Access",
            "T1021": "Lateral Movement",
            "T1059": "Execution",
            "T1486": "Impact (Encryption)"
        }
        return lookup.get(ttp_id, "Unknown")

    async def handle_alert(self, event):
        # Don't predict on our own predictions to avoid loops
        if event.get("type") == "Prediction":
            return

        msg = event.get("message", "")
        source = event.get("source_ip") or event.get("hostname") or "unknown_host"
        
        current_ttp = self._map_alert_to_ttp(msg)
        
        if current_ttp:
            print(f"[PREDICT] Mapped Alert '{msg}' to {current_ttp}")
            
            # Update State
            self.active_kill_chains[source] = current_ttp
            
            # Predict Next Step
            if self.attack_graph.has_node(current_ttp):
                successors = list(self.attack_graph.successors(current_ttp))
                
                for next_ttp in successors:
                    prob = self.attack_graph[current_ttp][next_ttp]['weight']
                    next_tactic = self._get_tactic_name(next_ttp)
                    
                    if prob > 0.5:
                        prediction_msg = f"PREDICTION: Attacker at {source} likely to attempt {next_ttp} ({next_tactic}) next. (Confidence: {int(prob*100)}%)"
                        
                        await self.bus.publish("alert", {
                            "message": prediction_msg,
                            "level": "CRITICAL",
                            "severity": "high",
                            "type": "Prediction",
                            "source": "PredictiveAI",
                            "metadata": {
                                "current_stage": current_ttp,
                                "predicted_stage": next_ttp,
                                "confidence": prob,
                                "suggested_action": "Enable Strict Monitoring" # TODO: Map to SOAR
                            }
                        })
