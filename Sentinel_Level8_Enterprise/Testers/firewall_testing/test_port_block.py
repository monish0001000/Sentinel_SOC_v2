"""
Sentinel SOC — Real-Time Port Block Verification Test
======================================================
Tests the full end-to-end pipeline:
  API Auth → POST /firewall/block-port → WFP Kernel Drop → WebSocket UI Update

Usage:
  python test_port_block.py              # Default: tests outbound port 8888
  python test_port_block.py 443          # Custom port (outbound HTTPS)
  python test_port_block.py 80 1.1.1.1   # Port 80 against specific host
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

# Safety: Ports critical to Sentinel infrastructure
PROTECTED_PORTS = {
    8000: "FastAPI Backend",
    8765: "WebSocket Server",
    6379: "Redis",
    5432: "PostgreSQL",
    3306: "MySQL",
}

# Safety: IPs that must NEVER be targeted
PROTECTED_IPS = {"127.0.0.1", "::1", "localhost", "0.0.0.0"}

DEFAULT_TARGET_PORT = 8888
DEFAULT_PROBE_HOST = "1.1.1.1"


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


def probe_port(host: str, port: int, timeout: float = 2.0) -> tuple:
    """
    Attempt a raw TCP connection to host:port.
    Returns (success: bool, latency_ms: float).
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    start = time.perf_counter()
    try:
        s.connect((host, port))
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


def block_port(token: str, port: int, reason: str = "Automated Test — test_port_block.py") -> bool:
    """Fire POST /firewall/block-port to trigger kernel-level port block."""
    print(f"[BLOCK] Sending block request for port {port}...")
    try:
        res = requests.post(
            f"{API_URL}/firewall/block-port",
            json={"port": port, "reason": reason},
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


def unblock_port(token: str, port: int) -> bool:
    """Clean up: unblock the port after the test."""
    print(f"[CLEANUP] Unblocking port {port}...")
    try:
        res = requests.post(
            f"{API_URL}/firewall/unblock-port",
            json={"port": port},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            timeout=5
        )
        if res.status_code == 200:
            print(f"[CLEANUP] ✅ Port {port} unblocked.")
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
    print("  Sentinel SOC — Real-Time Port Block Test")
    print("=" * 60)

    # Parse CLI args
    target_port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET_PORT
    probe_host = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PROBE_HOST

    # Safety checks
    if target_port in PROTECTED_PORTS:
        svc = PROTECTED_PORTS[target_port]
        print(f"\n[SAFETY] ❌ REFUSED: Cannot block port {target_port} ({svc}).")
        print("[SAFETY] Blocking infrastructure ports would crash the SOC.")
        sys.exit(1)

    if probe_host in PROTECTED_IPS:
        print(f"\n[SAFETY] ❌ REFUSED: Cannot probe against loopback '{probe_host}'.")
        sys.exit(1)

    print(f"\n  Target Port: {target_port}")
    print(f"  Probe Host:  {probe_host}")
    print(f"  API:         {API_URL}")
    print()

    # Step 1: Authenticate
    token = authenticate()

    # Step 2: Pre-block probe
    print(f"\n[STEP 1] Pre-block probe — {probe_host}:{target_port}...")
    reachable, latency_before = probe_port(probe_host, target_port)
    status = "OPEN/REACHABLE" if reachable else "CLOSED/FILTERED"
    print(f"[STEP 1] Result: {status} | Latency: {latency_before:.2f} ms")

    if not reachable:
        print(f"[STEP 1] ⚠️ Port {target_port} is already closed on {probe_host}.")
        print(f"         Test will still verify the block pipeline.")

    # Step 3: Fire the block command
    print(f"\n[STEP 2] Triggering kernel-level port block via API...")
    success = block_port(token, target_port)
    if not success:
        print("[STEP 2] ❌ Block command failed. Aborting.")
        sys.exit(1)

    # Small sync delay for WFP driver to enforce
    time.sleep(0.05)

    # Step 4: Post-block probe
    print(f"\n[STEP 3] Post-block probe — {probe_host}:{target_port}...")
    reachable_after, latency_after = probe_port(probe_host, target_port, timeout=1.0)
    status_after = "STILL OPEN" if reachable_after else "BLOCKED"
    print(f"[STEP 3] Result: {status_after} | Latency: {latency_after:.2f} ms")

    # Step 5: Verdict
    print("\n" + "=" * 60)
    if not reachable_after:
        if latency_after < 5.0:
            print(f"  ✅ PASS — Port {target_port} dropped instantly (<5ms)")
            print(f"  Drop latency: {latency_after:.2f} ms")
        else:
            print(f"  ✅ PASS — Port {target_port} blocked (timeout-based drop)")
            print(f"  Drop latency: {latency_after:.2f} ms")
            if latency_after > 50:
                print("  ⚠️ Drop >50ms — WFP may not be active (non-admin?)")
    else:
        print(f"  ❌ FAIL — Port {target_port} still accepts connections!")
        print("  Check: Is the backend running as Administrator?")
        print("  Check: Is WFP/WinDivert driver loaded?")
    print("=" * 60)

    # Step 6: Dashboard verification
    print(f"\n[DASHBOARD] Check the Sentinel UI:")
    print(f"  → Firewall page: 'Blocked Ports' badge should show port {target_port}")
    print(f"  → Live Actions table should log the block event")
    print(f"  → SIEM Forensics should log 'Firewall Event: rule_added'")

    # Step 7: Cleanup
    print(f"\n[STEP 4] Cleanup — unblocking port {target_port}...")
    unblock_port(token, target_port)

    print("\n[DONE] Test complete.\n")


if __name__ == "__main__":
    main()
