from core.event_bus import EventBus
from typing import Dict

# --- Playbook Definitions ---

async def response_ransomware(bus: EventBus, alert: Dict) -> str:
    """
    Playbook: Ransomware Detected
    Action: 
    1. Panic Mode (Firewall)
    2. Request Agent to Kill Process (via command dispatch)
    """
    target_ip = alert.get("source_ip", "127.0.0.1") # Assuming local agent
    
    # 1. Firewall Lockdown
    # We emit an event that the FirewallService is listening for, or call it via API if we had direct ref.
    # Since we don't have direct ref to FirewallService instance here easily without DI, 
    # we rely on the bus to broadcast a "panic" command.
    await bus.publish("command", {"cmd": "panic_mode", "enabled": True})
    
    return "Initiated Panic Mode. Ransomware Containment Active."

async def response_dlp(bus: EventBus, alert: Dict) -> str:
    """
    Playbook: Data Exfiltration Detected (DLP)
    Action: Block the destination IP.
    """
    dst_ip = alert.get("target_ip")
    if dst_ip:
        await bus.publish("command", {"cmd": "block_ip", "ip": dst_ip})
        return f"Blocked Exfiltration Target: {dst_ip}"
    return "Failed to block: No IP provided."

async def response_intrusion(bus: EventBus, alert: Dict) -> str:
    """
    Playbook: Network Intrusion (e.g. Port Scan)
    Action: Block Source IP.
    """
    src_ip = alert.get("source_ip")
    if src_ip:
        await bus.publish("command", {"cmd": "block_ip", "ip": src_ip})
        return f"Blocked Attacker IP: {src_ip}"
    return "No Attacker IP found."

# --- Registration Helper ---
from typing import Dict

def register_default_playbooks(engine):
    engine.register_playbook("response_ransomware", response_ransomware)
    engine.register_playbook("response_dlp", response_dlp)
    engine.register_playbook("response_intrusion", response_intrusion)
    # Map generic 'malware' to ransomware response for safety
    engine.register_playbook("response_malware", response_ransomware) 
