import os
import sys
import socket
import time
import json
import redis

# Redis Configuration
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = 6379

def test_connection_latency(ip: str, port: int) -> tuple[bool, float]:
    """
    Attempts to connect to target IP/Port and returns (success, latency_seconds).
    If blocked by firewall, it should fail instantly (<5ms).
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0) # 1 second timeout
    start_time = time.time()
    try:
        s.connect((ip, port))
        latency = time.time() - start_time
        s.close()
        return True, latency
    except (socket.timeout, OSError) as e:
        latency = time.time() - start_time
        s.close()
        # Returns False, latency
        return False, latency

def main():
    print("=== Sentinel SOC Live Firewall Test Framework ===")
    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
        r.ping()
        print(f"[FIREWALL-TEST] Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
    except redis.ConnectionError:
        print(f"[FIREWALL-TEST] Error: Could not connect to Redis at {REDIS_HOST}:{REDIS_PORT}.")
        print("[FIREWALL-TEST] Please ensure Redis is running and try again.")
        sys.exit(1)

    print("\nSelect Test Vector:")
    print("1. Direct C2 Block IP Command (Manual Admin Block)")
    print("2. Automated SOAR Playbook Containment (Critical Asset Protection)")
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        target_ip = "198.51.100.42"
        target_port = 80
        print(f"\n--- Testing Direct block on {target_ip} ---")
        
        # Test 1: Prior Connection check
        print(f"[FIREWALL-TEST] 1. Measuring initial connection latency to {target_ip}:{target_port}...")
        _, latency_before = test_connection_latency(target_ip, target_port)
        print(f"[FIREWALL-TEST] Latency before block: {latency_before*1000:.2f} ms")
        
        # Test 2: Trigger command
        payload = {
            "action": "block_ip",
            "target": target_ip,
            "reason": "Simulated Malicious C2 Beaconing (Manual Test)"
        }
        print(f"[FIREWALL-TEST] 2. Publishing block command to 'c2_commands' channel...")
        r.publish("c2_commands", json.dumps(payload))
        
        # Give system a tiny moment (<50ms) to sync
        time.sleep(0.05)
        
        # Test 3: Post Connection check
        print(f"[FIREWALL-TEST] 3. Verifying kernel firewall enforcement drop latency...")
        success, latency_after = test_connection_latency(target_ip, target_port)
        
        print(f"[FIREWALL-TEST] Latency after block: {latency_after*1000:.2f} ms")
        if latency_after < 0.005: # <5ms
            print("[FIREWALL-TEST] ✅ SUCCESS: Connection dropped instantly by firewall rules!")
        else:
            print("[FIREWALL-TEST] ⚠️ Warning: Drop latency took longer than expected (check if admin rights are enabled).")
            
    elif choice == "2":
        # Critical Asset (from verify_adaptive_soar.py self.critical_assets)
        target_ip = "192.168.1.5"
        print(f"\n--- Testing SOAR Automated Containment on {target_ip} ---")
        
        payload = {
            "source": target_ip,
            "threat": "Ransomware Activity Detected",
            "severity": "high"
        }
        print(f"[FIREWALL-TEST] 1. Publishing critical alert to 'soc_alerts'...")
        r.publish("soc_alerts", json.dumps(payload))
        print("[FIREWALL-TEST] Alert published. SOAR engine will analyze and trigger block command.")
        
        # Wait for SOAR loop to parse and C2 to execute WFP block
        time.sleep(0.5)
        print("[FIREWALL-TEST] Check the Sentinel SOC dashboard for the Automated Block and count increments!")
    
    else:
        print("[FIREWALL-TEST] Invalid Choice.")

if __name__ == "__main__":
    main()
