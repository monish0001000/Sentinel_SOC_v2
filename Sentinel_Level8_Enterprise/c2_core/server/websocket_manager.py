import asyncio
import json
import websockets
from datetime import datetime
from typing import Dict, List, Set
from collections import Counter

# --- Registry ---
CLIENTS = set()             # UI Clients
AGENTS: Dict[str, any] = {} # Active Agent WebSocket Connections
AGENT_META: Dict[str, dict] = {} # Agent Metadata

# --- Shared Stats State (In-Memory) ---
class RealTimeStats:
    def __init__(self):
        self.packet_rate = 0
        self.connections = 0
        self.cpu_usage = 0
        self.memory_usage = 0
        self.latest_system_info = None 
        self.top_ips = Counter()
        self.targeted_ports = Counter()
        self.threat_types = Counter()
        self.history_max_len = 30
        self.metric_history = []
        self.total_packets = 0
        self.threats_blocked = 0
        self.suspicious = 0
        self.allowed = 0
        self.live_alerts = []
        self.max_alerts = 50

    def update_metrics(self, data):
        self.packet_rate = data.get("packet_rate", self.packet_rate)
        self.connections = data.get("connections", self.connections)
        self.cpu_usage = data.get("cpu_usage", self.cpu_usage)
        self.memory_usage = data.get("memory_usage", self.memory_usage)
        
        now = datetime.utcnow()
        self.metric_history.append({
            "time": now.strftime("%H:%M:%S"),
            "packets": self.packet_rate,
            "threats": len(self.live_alerts)
        })
        if len(self.metric_history) > self.history_max_len:
            self.metric_history.pop(0)

    def add_packet_stat(self, packet):
        src_ip = packet.get("src_ip")
        dst_port = packet.get("dst_port")
        status = packet.get("status")
        
        if src_ip: self.top_ips[src_ip] += 1
        if dst_port:
            port_label = f"{dst_port}"
            self.targeted_ports[port_label] += 1
            
        self.total_packets += 1
        if status == "ALLOW": self.allowed += 1
        elif status == "BLOCKED": self.threats_blocked += 1
        else: self.suspicious += 1

    def add_alert(self, alert):
        alert["id"] = f"evt-{int(datetime.utcnow().timestamp()*1000)}"
        self.live_alerts.append(alert)
        if len(self.live_alerts) > self.max_alerts:
            self.live_alerts.pop(0)
        self.threat_types[alert.get("type", "General")] += 1

    def get_analytics(self):
        return {
            "chartData": list(self.metric_history),
            "topIPs": [{"ip": k, "attacks": v} for k,v in self.top_ips.most_common(5)],
            "threatTypes": [{"name": k, "value": v, "color": "hsl(0, 50%, 50%)"} for k,v in self.threat_types.most_common(5)],
            "targetedPorts": [{"port": k, "attacks": v} for k,v in self.targeted_ports.most_common(5)]
        }

    def get_stats(self):
        return {
            "totalPackets": self.total_packets,
            "threatsBlocked": self.threats_blocked,
            "suspicious": self.suspicious,
            "allowed": self.allowed
        }

STATS = RealTimeStats()

# --- Broadcasting ---

async def broadcast_to_ui(payload):
    """Sends a JSON message to all connected UI clients"""
    if CLIENTS:
        message = json.dumps(payload)
        # safe broadcast
        await asyncio.gather(*[client.send(message) for client in CLIENTS], return_exceptions=True)

async def broadcast_agent_update():
    """Compiles agent list and broadcasts to UI immediately"""
    payload = {
        "type": "agent_update",
        "data": list(AGENT_META.values())
    }
    print(f"[BUS] Broadcasting AGENT UPDATE to {len(CLIENTS)} clients: {len(AGENT_META)} agents.")
    await broadcast_to_ui(payload)


# --- Event Bus Handlers ---

async def handle_metric_event(data):
    STATS.update_metrics(data)

async def handle_alert_event(alert):
    STATS.add_alert(alert)

async def handle_packet_event(data):
    STATS.add_packet_stat(data)
    await broadcast_to_ui({"type": "packet_event", "payload": data})

async def handle_firewall_event(data):
    await broadcast_to_ui({"type": "firewall_event", "payload": data})

async def handle_explanation_event(data):
    await broadcast_to_ui({"type": "explanation", "payload": data})

async def handle_system_event(event):
    await broadcast_to_ui({"type": "explanation", "payload": {"explanation": f"System Check: {event}"}})

async def handle_system_info_event(data):
    STATS.latest_system_info = data
    await broadcast_to_ui({"type": "system_info", "payload": data})

async def handle_agent_command(data):
    target_id = data.get("target_agent_id")
    cmd = {
        "type": "command",
        "command": data.get("command"),
        "args": data.get("args", {}),
        "id": data.get("id", "cmd")
    }
    msg = json.dumps(cmd)
    
    if target_id == "all":
        if AGENTS:
            await asyncio.gather(*[ws.send(msg) for ws in AGENTS.values()], return_exceptions=True)
    elif target_id in AGENTS:
        try:
            await AGENTS[target_id].send(msg)
        except:
            del AGENTS[target_id]

# --- WebSocket Handler ---

async def handler(websocket):
    try:
        # 1. Handshake
        init_data = await asyncio.wait_for(websocket.recv(), timeout=5.0)
        init_msg = json.loads(init_data)
        client_type = init_msg.get("type")

        if client_type == "agent_register":
            # --- AGENT CONNECT ---
            agent_id = init_msg.get("id")
            hostname = init_msg.get("hostname")
            print(f"[BUS] Agent {agent_id} connected. Broadcasting to UI...")
            
            AGENTS[agent_id] = websocket
            AGENT_META[agent_id] = {
                "id": agent_id,
                "hostname": hostname,
                "os": init_msg.get("os", "Unknown"),
                "ip": init_msg.get("ip", "Unknown"),
                "status": "online",
                "last_seen": datetime.utcnow().timestamp()
            }
            
            # IMMEDIATE BROADCAST
            await broadcast_agent_update()

            try:
                # Loop for Heartbeats
                async for message in websocket:
                    data = json.loads(message)
                    if data.get("type") == "heartbeat":
                         if agent_id in AGENT_META:
                             AGENT_META[agent_id]["last_seen"] = datetime.utcnow().timestamp()
                             if "stats" in data:
                                 AGENT_META[agent_id]["stats"] = data["stats"]
                             await broadcast_agent_update() # Sync Heartbeats

                    elif data.get("type") == "telemetry":
                         # Explicit Telemetry
                         print(f"[WS] 📥 RECV TELEMETRY from {agent_id}", flush=True) # DEBUG
                         if agent_id in AGENT_META:
                             AGENT_META[agent_id]["last_seen"] = datetime.utcnow().timestamp()
                             if "data" in data:
                                 AGENT_META[agent_id]["stats"] = data["data"]
                             await broadcast_agent_update() # Sync Telemetry
            except Exception as e:
                print(f"[WS] Agent {agent_id} dropped: {e}")
            finally:
                print(f"[WS] Cleaning up agent {agent_id}")
                if agent_id in AGENTS: del AGENTS[agent_id]
                if agent_id in AGENT_META: del AGENT_META[agent_id]
                await broadcast_agent_update()

        else:
            # --- UI CONNECT ---
            print("[WS] UI Client Connected")
            CLIENTS.add(websocket)
            
            # Send Initial State
            await websocket.send(json.dumps({
                "type": "agent_update",
                "data": list(AGENT_META.values())
            }, default=str))
            
            if STATS.latest_system_info:
                await websocket.send(json.dumps({
                    "type": "system_info",
                    "payload": STATS.latest_system_info
                }, default=str))

            try:
                while True:
                    # 1Hz Dashboard Loop
                    payload = {
                        "type": "update",
                        "metrics": {
                            "packet_rate": STATS.packet_rate,
                            "connections": STATS.connections,
                            "cpu_usage": STATS.cpu_usage,
                            "memory_usage": STATS.memory_usage
                        },
                        "alerts": STATS.live_alerts[-10:],
                        "stats": STATS.get_stats(),
                        "analytics": STATS.get_analytics()
                    }
                    await websocket.send(json.dumps(payload, default=str))
                    await asyncio.sleep(1)
            except Exception as e:
                print(f"[WS] UI Loop Error: {e}")
            finally:
                CLIENTS.remove(websocket)
                print("[WS] UI Client Disconnected")

    except Exception as e:
        print(f"[WS] Handshake/Connection Error: {e}")

async def handle_siem_event(data):
    """Broadcast SIEM log entry to all UI clients for live forensic streaming."""
    await broadcast_to_ui({"type": "siem_event", "payload": data})

# --- Server Start ---

async def start_websocket_server(bus):
    print("[WS] WebSocket Manager running on ws://0.0.0.0:8765")
    
    # Subscriptions
    bus.subscribe("metrics", handle_metric_event)
    bus.subscribe("alert", handle_alert_event)
    bus.subscribe("explanation", handle_explanation_event)
    bus.subscribe("system_event", handle_system_event)
    bus.subscribe("system_info", handle_system_info_event)
    bus.subscribe("firewall_event", handle_firewall_event)
    bus.subscribe("packet_event", handle_packet_event)
    bus.subscribe("agent_command", handle_agent_command)
    bus.subscribe("siem_event", handle_siem_event)

    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future() # Run forever
