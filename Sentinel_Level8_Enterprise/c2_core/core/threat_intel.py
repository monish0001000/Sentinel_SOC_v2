import requests
from typing import Set

class ThreatIntelService:
    def __init__(self):
        self.malicious_ips: Set[str] = set()
        self.api_key = None # Placeholder for VirusTotal/AbuseIPDB Key
        
        # Load some static known bad IPs for demo purposes
        # In production, this would download a daily feed (e.g., from abuse.ch)
        self.load_static_blocklist()

    def load_static_blocklist(self):
        # Simulated Feed
        self.malicious_ips = set() # Empty start, real data only
        print(f"[THREAT INTEL] Loaded {len(self.malicious_ips)} IOCs (Indicators of Compromise).")

    def check_ip(self, ip: str) -> dict:
        """
        Checks if IP is malicious.
        Returns dict with status and confidence.
        """
        if ip in self.malicious_ips:
            return {
                "malicious": True,
                "confidence": "high",
                "source": "Sentinel Local Feed",
                "category": "Botnet" 
            }
        
        # Future: HTTP Request to VirusTotal
        # if self.api_key:
        #    return self.query_virustotal(ip)

        return {"malicious": False}

    def add_to_feed(self, ip: str):
        self.malicious_ips.add(ip)
