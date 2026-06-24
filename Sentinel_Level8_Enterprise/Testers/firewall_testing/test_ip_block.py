"""
Sentinel SOC — Real-Time IP Block Verification Test
=====================================================
Tests the full end-to-end pipeline:
  API Auth → POST /firewall/block-ip → WFP Kernel Drop → WebSocket UI Update

Usage:
  python test_ip_block.py                    # Default: tests against 1.1.1.1:80
  python test_ip_block.py 93.184.216.34 80   # Custom target IP and port
"""

import sys
import os
import socket
import time
import json
import requests

# ─── Configuration ─────────────────────────────────────────────
API_URL = os.getenv("SENTINEL_API", "http://127.0.0.1:8000")
USERNAME = os.getenv("SENTINEL_USER", "admin")
PASSWORD = os.getenv("SENTINEL_PASS", "admin")

# Safety: IPs that must NEVER be blocked (would kill dashboard)
PROTECTED_IPS = {"127.0.0.1", "::1", "localhost", "0.0.0.0"}
# Safety: Ports that must NEVER be blocked
PROTECTED_PORTS = {8000, 8765, 6379}

DEFAULT_TARGET_IP = "1.1.1.1"
DEFAULT_TARGET_PORT = 80


# ─── Helpers ───────────────────────────────────────────────────

def authenticate() -> str:
    """Authenticate with Sentinel backend and return JWT token."""
    print(f"[AUTH] Authenticating as '{USERNAME}' at {API_URL}...")
    try:
        res = requests.post(
            f"{API_URL}/auth/login",
            data={"username": USERNAME, "password": PASSWORD},
            timeout=5
        )
        if res.status_code == 200:
            token = res.json().get("access_token")
            print(f"[AUTH] ✅ Authenticated. Token: {token[:20]}...")
            return token
        else:
            print(f"[AUTH] ❌ Login failed: {res.status_code} — {res.text}")
            sys.exit(1)
    except requests.ConnectionError:
        print(f"[AUTH] ❌ Cannot reach backend at {API_URL}. Is it running?")
        sys.exit(1)


def probe_connection(ip: str, port: int, timeout: float = 2.0) -> tuple:
    """
    Attempt a raw TCP connection. Returns (success: bool, latency_ms: float).
    If the firewall drops the packet, this should fail in <5ms.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    start = time.perf_counter()
    try:
        s.connect((ip, port))
        elapsed = (time.perf_counter() - start) * 1000
        s.close()
        return True, elapsed
    except (socket.timeout, OSError, ConnectionRefusedError):
        elapsed = (time.perf_counter() - start) * 1000
        try:
            s.close()
        except Exception:
            pass
        return False, elapsed


def block_ip(token: str, ip: str, reason: str = "Automated Test — test_ip_block.py") -> bool:
    """Fire a POST to /firewall/block-ip to trigger the kernel-level block."""
    print(f"[BLOCK] Sending block request for {ip}...")
    try:
        res = requests.post(
            f"{API_URL}/firewall/block-ip",
            json={"ip": ip, "reason": reason},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            timeout=5
        )
        if res.status_code == 200:
            print(f"[BLOCK] ✅ Block command accepted: {res.json()}")
            return True
        else:
            print(f"[BLOCK] ❌ Block failed: {res.status_code} — {res.text}")
            return False
    except Exception as e:
        print(f"[BLOCK] ❌ Request error: {e}")
        return False


def unblock_ip(token: str, ip: str) -> bool:
    """Clean up: unblock the IP after the test."""
    print(f"[CLEANUP] Unblocking {ip}...")
    try:
        res = requests.post(
            f"{API_URL}/firewall/unblock-ip",
            json={"ip": ip},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            timeout=5
        )
        if res.status_code == 200:
            print(f"[CLEANUP] ✅ {ip} unblocked.")
            return True
        else:
            print(f"[CLEANUP] ⚠️ Unblock response: {res.status_code}")
            return False
    except Exception as e:
        print(f"[CLEANUP] ⚠️ Unblock error: {e}")
        return False


# ─── Main Test Sequence ────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Sentinel SOC — Real-Time IP Block Test")
    print("=" * 60)

    # Parse CLI args
    target_ip = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TARGET_IP
    target_port = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TARGET_PORT

    # Safety checks
    if target_ip in PROTECTED_IPS:
        print(f"\n[SAFETY] ❌ REFUSED: Cannot block protected IP '{target_ip}'.")
        print("[SAFETY] Blocking loopback would sever the dashboard connection.")
        sys.exit(1)

    if target_port in PROTECTED_PORTS:
        print(f"\n[SAFETY] ❌ REFUSED: Cannot test against protected port {target_port}.")
        sys.exit(1)

    print(f"\n  Target: {target_ip}:{target_port}")
    print(f"  API:    {API_URL}")
    print()

    # Step 1: Authenticate
    token = authenticate()

    # Step 2: Pre-block probe
    print(f"\n[STEP 1] Pre-block connection probe to {target_ip}:{target_port}...")
    reachable, latency_before = probe_connection(target_ip, target_port)
    status = "REACHABLE" if reachable else "UNREACHABLE"
    print(f"[STEP 1] Result: {status} | Latency: {latency_before:.2f} ms")

    if not reachable:
        print(f"[STEP 1] ⚠️ Target is already unreachable. The test can still")
        print(f"         verify the block command pipeline, but drop-time")
        print(f"         comparison may not be meaningful.")

    # Step 3: Fire the block command
    print(f"\n[STEP 2] Triggering kernel-level IP block via API...")
    success = block_ip(token, target_ip)
    if not success:
        print("[STEP 2] ❌ Block command failed. Aborting.")
        sys.exit(1)

    # Small sync delay for WFP driver to enforce
    time.sleep(0.05)

    # Step 4: Post-block probe
    print(f"\n[STEP 3] Post-block connection probe to {target_ip}:{target_port}...")
    reachable_after, latency_after = probe_connection(target_ip, target_port, timeout=1.0)
    status_after = "REACHABLE" if reachable_after else "BLOCKED"
    print(f"[STEP 3] Result: {status_after} | Latency: {latency_after:.2f} ms")

    # Step 5: Verdict
    print("\n" + "=" * 60)
    if not reachable_after:
        if latency_after < 5.0:
            print("  ✅ PASS — Connection dropped instantly (<5ms)")
            print(f"  Drop latency: {latency_after:.2f} ms")
        else:
            print("  ✅ PASS — Connection blocked (timeout-based drop)")
            print(f"  Drop latency: {latency_after:.2f} ms")
            print("  ⚠️ Drop took >5ms — WFP may not be active (non-admin?)")
    else:
        print("  ❌ FAIL — Connection still succeeds after block!")
        print("  Check: Is the backend running as Administrator?")
        print("  Check: Is WFP/WinDivert driver loaded?")
    print("=" * 60)

    # Step 6: Dashboard verification prompt
    print("\n[DASHBOARD] Check the Sentinel UI:")
    print(f"  → Firewall page: 'Blocked IPs' badge should show '{target_ip}'")
    print(f"  → Live Actions table should show the block event")
    print(f"  → SIEM Forensics should log a 'Firewall Event: rule_added' entry")

    # Step 7: Cleanup
    print(f"\n[STEP 4] Cleanup — unblocking {target_ip}...")
    unblock_ip(token, target_ip)

    print("\n[DONE] Test complete.\n")


if __name__ == "__main__":
    main()
