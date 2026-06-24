# ai/risk_scoring.py
"""
Enhanced Risk Scoring Engine with Reputation and DPI Integration
Incorporates VirusTotal/AbuseIPDB data and deep packet inspection results
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import asyncio


class ReputationRiskScorer:
    """Calculates risk from reputation data"""

    @staticmethod
    def calculate_reputation_risk(reputation_data: Dict[str, Any]) -> float:
        """
        Convert reputation scores to risk contribution (0-100)
        
        Args:
            reputation_data: Reputation analysis from event
            
        Returns:
            Risk score contribution (0-100)
        """
        if not reputation_data:
            return 0.0

        # Combined reputation score is already 0-100
        base_score = reputation_data.get("combined_risk_score", 0.0)

        # Increase weight if blacklisted
        if reputation_data.get("is_blacklisted", False):
            base_score = min(100, base_score * 1.5)

        # Add confidence factor
        confidence = reputation_data.get("confidence", 0.5)
        return base_score * confidence

    @staticmethod
    def calculate_threat_type_risk(threat_types: List[str]) -> float:
        """
        Calculate risk based on threat types detected

        Args:
            threat_types: List of threat types

        Returns:
            Risk contribution (0-100)
        """
        threat_weights = {
            "malware": 90,
            "botnet": 85,
            "phishing": 80,
            "ransomware": 95,
            "trojan": 88,
            "spammer": 50,
            "proxy": 35,
            "vpn": 20,
            "datacenter": 15,
            "compromised": 75,
            "c2": 100,
        }

        if not threat_types:
            return 0.0

        # Use highest risk threat type
        return max(
            threat_weights.get(t.lower(), 30) for t in threat_types
        )


class DPIRiskScorer:
    """Calculates risk from deep packet inspection data"""

    @staticmethod
    def calculate_payload_risk(payload_data: Dict[str, Any]) -> float:
        """
        Calculate risk based on payload analysis
        
        Args:
            payload_data: Payload analysis from DPI
            
        Returns:
            Risk score (0-100)
        """
        if not payload_data:
            return 0.0

        risk = 0.0

        # Executable detected = highest risk
        if payload_data.get("has_executable"):
            risk += 95

        # Malware signatures = high risk
        if payload_data.get("has_malware_signatures"):
            risk += 80

        # High entropy (encrypted/compressed) = medium risk
        entropy = payload_data.get("entropy", 0)
        if entropy > 7.0:
            risk += 40
        elif entropy > 6.0:
            risk += 20

        # Suspicious strings found
        suspicious = len(payload_data.get("suspicious_strings", []))
        risk += min(30, suspicious * 10)

        return min(100, risk)

    @staticmethod
    def calculate_traffic_anomaly_risk(
        anomalies: List[Dict[str, Any]]
    ) -> float:
        """
        Calculate risk from detected traffic anomalies
        
        Args:
            anomalies: List of anomalies from DPI
            
        Returns:
            Risk score (0-100)
        """
        if not anomalies:
            return 0.0

        risk = 0.0
        anomaly_weights = {
            "port_scan": 75,
            "executable_detected": 95,
            "malware_pattern": 90,
            "high_entropy_payload": 40,
            "suspicious_dns": 70,
            "data_exfiltration": 85,
            "c2_activity": 100,
        }

        for anomaly in anomalies:
            anomaly_type = anomaly.get("type", "unknown")
            severity = anomaly.get("severity", "low").lower()

            # Base weight from anomaly type
            base_weight = anomaly_weights.get(anomaly_type, 50)

            # Increase by severity
            if severity == "critical":
                base_weight *= 1.2
            elif severity == "high":
                base_weight *= 1.1
            elif severity == "low":
                base_weight *= 0.7

            risk += base_weight

        return min(100, risk)


class RiskScorer:
    """
    Enhanced Risk Scorer combining traditional alerts with
    reputation analysis and deep packet inspection
    """

    def __init__(self, bus):
        self.bus = bus
        self.host_scores = {}  # {agent_id: current_risk_score}
        self.global_risk = 0
        self.risk_history = {}  # Track risk over time
        self.threat_inventory = {}  # {entity_type:entity: threat_data}

        # Subscribe to all event types
        bus.subscribe("alert", self.handle_alert)
        bus.subscribe("anomaly", self.handle_alert)
        bus.subscribe("network_event", self.handle_network_event)

    async def handle_alert(self, data):
        """
        Handle traditional security alerts

        Args:
            data: Alert event with optional score and severity
        """
        agent_id = data.get("agent_id", "local_server")
        incoming_risk = data.get("score", 0)

        # Infer score from severity if not provided
        if incoming_risk == 0 and "severity" in data:
            severity = data["severity"].lower()
            if severity == "critical":
                incoming_risk = 90
            elif severity == "high":
                incoming_risk = 70
            elif severity == "medium":
                incoming_risk = 40
            else:
                incoming_risk = 10

        # Update host risk with decay
        await self._update_host_risk(agent_id, incoming_risk)

    async def handle_network_event(self, data):
        """
        Handle network events with enriched data (reputation + DPI)

        Args:
            data: Network event with optional reputation and DPI data
        """
        agent_id = data.get("agent_id", "local_server")
        event_risk = 0.0

        # Calculate reputation-based risk
        reputation = data.get("reputation")
        if reputation:
            reputation_risk = ReputationRiskScorer.calculate_reputation_risk(
                reputation
            )
            event_risk += reputation_risk * 0.4  # 40% weight

            # Track threat inventory
            entity = reputation.get("entity")
            if entity:
                self.threat_inventory[f"ip:{entity}"] = reputation

        # Calculate DPI-based risk
        dpi = data.get("dpi", {})
        payload = dpi.get("payload")
        if payload:
            payload_risk = DPIRiskScorer.calculate_payload_risk(payload)
            event_risk += payload_risk * 0.3  # 30% weight

        # Calculate anomaly-based risk
        anomalies = data.get("anomalies", [])
        if anomalies:
            anomaly_risk = DPIRiskScorer.calculate_traffic_anomaly_risk(
                anomalies
            )
            event_risk += anomaly_risk * 0.3  # 30% weight

        # Update host risk if significant
        if event_risk > 10:
            await self._update_host_risk(agent_id, event_risk)

        # Generate alerts for high-risk events
        if event_risk > 60:
            await self._generate_risk_alert(data, event_risk)

    async def _update_host_risk(self, agent_id: str, incoming_risk: float):
        """
        Update host risk score with exponential decay

        Args:
            agent_id: Host identifier
            incoming_risk: New risk value (0-100)
        """
        current_score = self.host_scores.get(agent_id, 0)

        # Weighted average: new event has more weight
        new_score = current_score * 0.6 + incoming_risk * 0.4

        # Cap at 100
        new_score = min(100, new_score)

        self.host_scores[agent_id] = new_score

        # Record in history
        if agent_id not in self.risk_history:
            self.risk_history[agent_id] = []

        self.risk_history[agent_id].append({
            "timestamp": datetime.now().isoformat(),
            "score": new_score,
        })

        # Keep only last 100 history entries
        if len(self.risk_history[agent_id]) > 100:
            self.risk_history[agent_id] = self.risk_history[agent_id][-100:]

        # Publish updated risk
        await self.calculate_and_publish_global_risk()

    async def _generate_risk_alert(self, event: Dict[str, Any], risk_score: float):
        """
        Generate alert for high-risk events

        Args:
            event: Network event
            risk_score: Calculated risk score
        """
        alert = {
            "type": "enriched_threat",
            "severity": "critical" if risk_score > 80 else "high",
            "risk_score": risk_score,
            "source_ip": event.get("src_ip"),
            "dest_ip": event.get("dst_ip"),
            "protocol": event.get("protocol"),
            "timestamp": datetime.now().isoformat(),
            "sources": [],
        }

        # Document sources of risk
        if event.get("reputation"):
            alert["sources"].append(f"reputation:{event['reputation'].get('threat_types')}")
        if event.get("dpi", {}).get("payload"):
            alert["sources"].append("dpi:payload_analysis")
        if event.get("anomalies"):
            alert["sources"].append("dpi:anomaly_detection")

        await self.bus.publish("alert", alert)

    async def calculate_and_publish_global_risk(self):
        """Calculate and publish global organization risk"""
        if not self.host_scores:
            self.global_risk = 0
        else:
            # Weighted risk: peak risk of any host heavily influences global
            scores = list(self.host_scores.values())
            max_risk = max(scores)
            avg_risk = sum(scores) / len(scores)

            # Global risk skewed toward max (if one host is compromised, org is at risk)
            self.global_risk = max_risk * 0.7 + avg_risk * 0.3

        await self.bus.publish("risk", {
            "global_score": self.global_risk,
            "host_scores": self.host_scores,
            "threat_inventory_size": len(self.threat_inventory),
            "timestamp": datetime.now().isoformat(),
        })

    def get_threat_inventory(self) -> Dict[str, Any]:
        """Get current threat inventory"""
        return {
            "total_threats": len(self.threat_inventory),
            "threats": self.threat_inventory,
            "last_updated": datetime.now().isoformat(),
        }

    def get_risk_trend(self, agent_id: str, minutes: int = 60) -> List[Dict]:
        """
        Get risk trend for an agent

        Args:
            agent_id: Host identifier
            minutes: Historical window

        Returns:
            List of risk scores over time
        """
        if agent_id not in self.risk_history:
            return []

        cutoff = datetime.now() - timedelta(minutes=minutes)
        trend = []

        for entry in self.risk_history[agent_id]:
            try:
                entry_time = datetime.fromisoformat(entry["timestamp"])
                if entry_time > cutoff:
                    trend.append(entry)
            except:
                pass

        return trend

    def export_risk_report(self) -> Dict[str, Any]:
        """Export comprehensive risk assessment report"""
        return {
            "generated_at": datetime.now().isoformat(),
            "global_risk_score": self.global_risk,
            "host_scores": self.host_scores,
            "threat_inventory": self.threat_inventory,
            "high_risk_hosts": [
                host
                for host, score in self.host_scores.items()
                if score > 70
            ],
            "critical_threats": [
                threat
                for threat in self.threat_inventory.values()
                if threat.get("combined_risk_score", 0) > 80
            ],
        }
