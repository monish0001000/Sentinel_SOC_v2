import asyncio
import random
from typing import List

class ThreatSwarm:
    def __init__(self, firewall_service, bus):
        self.firewall = firewall_service
        self.bus = bus
        self.known_bad_ips = set()
        self.instance_id = f"sentinel-{random.randint(10000, 99999)}"

    async def start(self):
        print(f"[SWARM] Sentinel Node {self.instance_id} joining Global Threat Grid...")
        while True:
            try:
                # 1. Fetch Global Threats (Simulated)
                # In real world: response = requests.get("https://swarm.sentinel.io/feeds/latest")
                new_threats = self._simulate_fetch()
                
                # 2. Sync to Firewall
                for ip, reason in new_threats.items():
                    if ip not in self.known_bad_ips:
                        print(f"[SWARM] Received Global IOC: {ip} | {reason}")
                        # Auto-Block via Firewall
                        # We use block_ip which now does netsh!
                        await self.firewall.block_ip(ip, reason=f"Global Swarm: {reason}")
                        self.known_bad_ips.add(ip)
                        
                        await self.bus.publish("swarm_event", {
                             "type": "block_sync",
                             "ip": ip,
                             "source": "Global Grid"
                        })

                # 3. Share Local Detection (Simulated)
                # If we blocked something locally, we would push it here.
                
            except Exception as e:
                print(f"[SWARM] Sync Error: {e}")
                
            await asyncio.sleep(60) # Sync every minute

    def _simulate_fetch(self):
        # Disabled synthetic data generation
        return {}
