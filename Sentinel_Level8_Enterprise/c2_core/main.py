# main.py
import asyncio
import sys
import os
import platform
import threading
import json
import redis
from uvicorn import Config, Server
import server.api as api

# Core Imports
from core.event_bus import EventBus
from core.firewall import FirewallService
from core.siem import LogRepository
from core.sniffer import PacketSniffer
from core.global_risk_engine import GlobalRiskEngine
from core.incident_manager import IncidentManager
from server.websocket_manager import start_websocket_server
from server.lifecycle import verify_startup_ports
from core.seeder import seed_data

# Collectors & Engines
from collectors.system_logs import SystemLogCollector
from collectors.network_stats import NetworkCollector
from collectors.system_info import SystemInfoCollector
from detection.rules_engine import RulesEngine
from ai.predictive_engine import PredictiveEngine
from ai.explanation import ExplainAI
from core.edr.fim import FileIntegrityMonitor
from core.edr.behavior import BehaviorEngine
from core.soar.engine import SOAREngine
from core.soar.playbooks import register_default_playbooks
from ai.traffic_model import TrafficAnalyzer

def start_redis_listener(firewall_service, loop):
    """
    Background Thread: Listens for commands from AI/SOAR via Redis
    """
    redis_host = os.getenv('REDIS_HOST', 'redis')
    try:
        r = redis.Redis(host=redis_host, port=6379, db=0)
        pubsub = r.pubsub()
        pubsub.subscribe('c2_commands')
        print(f"[C2] 👂 Listening for commands on 'c2_commands'...")
        
        for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                    action = data.get("action")
                    target = data.get("target")
                    reason = data.get("reason", "Remote Command")
                    
                    if action == "block_ip" and target:
                        print(f"[C2] ⚡ RECEIVED COMMAND: Block {target}", flush=True)
                        asyncio.run_coroutine_threadsafe(
                            firewall_service.block_ip(target, reason=reason), 
                            loop
                        )
                except Exception as e:
                    print(f"[C2] Command Error: {e}")
    except Exception as e:
        print(f"[C2] ⚠️ Redis Listener Failed: {e}")

async def main():
    # 1. Startup Checks
    verify_startup_ports()
    
    # 2. Redis State Reset (User Requested Critical Fix)
    redis_host = os.getenv('REDIS_HOST', 'redis')
    try:
        r = redis.Redis(host=redis_host, port=6379, db=0)
        # FORCE FLUSHALL to ensure clean slate
        r.flushall()
        print("[MAIN] 🧹 Redis FLUSHALL executed. State cleared.")
        
        # Set Default Safe State
        r.set("firewall_status", "active")
        r.set("lockdown", "false")
        r.set("panic_mode", "false")
        print("[MAIN] 🟢 Redis State Reset: Firewall Active, Panic Mode OFF.")
    except Exception as e:
        print(f"[MAIN] ⚠️ Failed to reset Redis state: {e}")

    # 3. Initialize Event Bus
    bus = EventBus()
    api.set_event_bus(bus)

    # 4. Initialize Firewall (WFP or Simulation)
    if platform.system() == "Windows":
        try:
            from core.wfp_firewall import WFPFirewallService
            firewall = WFPFirewallService(bus)
            firewall.start()
            print("[MAIN] Advanced WFP Firewall loaded.")
        except ImportError:
            print("[MAIN] 'pydivert' not installed. Falling back to Simulated Firewall.")
            firewall = FirewallService(bus)
        except Exception as e:
            print(f"[MAIN] WFP Init Failed ({e}). Falling back to Simulated Firewall.")
            firewall = FirewallService(bus)
    else:
        firewall = FirewallService(bus)
    
    api.set_firewall_service(firewall)

    # 5. Initialize Core Services
    siem = LogRepository(bus)
    api.set_siem_service(siem)

    predictive_engine = PredictiveEngine(bus)
    api.set_predictive_engine(predictive_engine)

    global_risk_engine = GlobalRiskEngine(bus)
    api.set_global_risk_engine(global_risk_engine)
    
    incident_manager = IncidentManager(bus)
    api.set_incident_manager(incident_manager)

    # 6. Initialize Collectors & AI
    SystemLogCollector(bus)
    NetworkCollector(bus)
    SystemInfoCollector(bus)
    RulesEngine(bus)
    ExplainAI(bus)
    
    # EDR & SOAR
    fim = FileIntegrityMonitor(bus)
    behavior_engine = BehaviorEngine(bus)

    # Hunter & SOAR
    from ai.hunter import HunterAI
    hunter = HunterAI(bus, siem)
    bus.subscribe("alert", hunter.investigate)

    soar = SOAREngine(bus)
    register_default_playbooks(soar)

    from core.adaptive_response import AdaptiveResponseEngine
    adaptive_engine = AdaptiveResponseEngine(bus, firewall)

    from core.self_healing import SelfHealingEngine
    self_healing = SelfHealingEngine(bus)
    asyncio.create_task(self_healing.start())

    # Packet Sniffer
    sniffer = PacketSniffer(bus, firewall)

    # 7. Start Servers
    
    # FastAPI
    # Note: CORSMiddleware is usually configured inside api.py, 
    # but we ensure it is set correctly there.
    config = Config(app=api.app, host="0.0.0.0", port=8000, loop="asyncio")
    api_server = Server(config)

    # Redis Listener
    loop = asyncio.get_running_loop()
    threading.Thread(target=start_redis_listener, args=(firewall, loop), daemon=True).start()

    # Collectors & Websocket
    sys_collector = SystemLogCollector(bus)
    net_collector = NetworkCollector(bus)
    info_collector = SystemInfoCollector(bus)
    
    # Seed Data (Policies & Logs)
    await seed_data(firewall, siem)

    # Start EDR Monitors after seeding to prevent false-positives
    fim.start()
    behavior_engine.start_monitor()

    print("[MAIN] System Starting...")
    
    await asyncio.gather(
        sys_collector.start(),
        net_collector.start(),
        info_collector.start(),
        sniffer.start(),
        start_websocket_server(bus), # Using new manager
        api_server.serve()
    )

if __name__ == "__main__":
    asyncio.run(main())
