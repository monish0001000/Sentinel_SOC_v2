import asyncio
from datetime import datetime, timezone
import random
from core.ngfw import SecurityRule

async def seed_data(firewall_service, siem_service):
    """
    Populates the system with initial data if empty.
    """
    print("[SEEDER] Checking for existing data...")
    try:
        # 1. Seed Firewall Policies
        policies = firewall_service.get_policies()
        if not policies or len(policies) < 5:
            print("[SEEDER] Seeding Security Policies...")
            new_policies = [
                SecurityRule("Block RDP Brute Force", "Untrust", "Any", "Any", "rdp", "deny"),
                SecurityRule("Allow Corporate VPN", "Untrust", "Trust", "10.0.0.0/8", "Any", "allow"),
                SecurityRule("Block Known Malicious IPs", "Untrust", "Any", "192.168.1.100", "Any", "deny"),
                SecurityRule("Monitor SQL Traffic", "Trust", "DMZ", "Any", "sql", "allow"),
                SecurityRule("Prevent Data Exfiltration", "Trust", "Untrust", "Any", "ftp", "deny"),
                SecurityRule("Isolate Compromised Hosts", "Any", "Any", "Any", "Any", "deny"),
                SecurityRule("Allow DNS Queries", "Any", "Any", "Any", "dns", "allow"),
                SecurityRule("Block SMB via WAN", "Untrust", "Any", "Any", "smb", "deny"),
                SecurityRule("Allow HTTPS Ops", "Trust", "Untrust", "Any", "https", "allow"),
                SecurityRule("Zero Trust Default", "Any", "Any", "Any", "Any", "deny")
            ]
            
            for p in new_policies:
                await firewall_service.add_policy(p.to_dict())
                
            print(f"[SEEDER] Seeded {len(new_policies)} policies.")

        # 2. Seed SIEM Logs
        print("[SEEDER] Seeding Historical SIEM Logs...")
        
        log_types = ["Auth", "Firewall", "System", "EDR"]
        actions = ["Login", "Connection", "Process Start", "File Access"]
        statuses = ["Success", "Failed", "Blocked", "Allowed"]
        
        for i in range(20):
            log = {
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": f"192.168.1.{random.randint(10, 200)}",
                "event_type": random.choice(log_types),
                "severity": random.choice(["info", "low", "medium", "high", "critical"]),
                "message": f"{random.choice(actions)} {random.choice(statuses)} for user_id={random.randint(1000,9999)}",
                "host": f"WORKSTATION-{random.randint(1,50)}"
            }
            # Use proper API
            await siem_service.log_event(
                level=log["severity"].upper(),
                message=log["message"],
                source=log["source"],
                log_type=log["event_type"],
                metadata=log
            )
        
        print(f"[SEEDER] Seeded 20 SIEM logs.")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[SEEDER] ERROR: {e}")
    
    print("[SEEDER] Finished.")
