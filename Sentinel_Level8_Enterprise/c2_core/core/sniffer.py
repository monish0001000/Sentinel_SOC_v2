import asyncio
import psutil
import time
import socket
import threading
import struct
from datetime import datetime
from collections import OrderedDict
from core.event_bus import EventBus


# ──────────────────────────────────────────────────────────────
#  Background DNS Resolver  (Thread-safe, TTL-cached, non-blocking)
# ──────────────────────────────────────────────────────────────
class _DNSCache:
    """
    Thread-safe LRU + TTL cache for reverse DNS lookups.
    All actual socket.gethostbyaddr calls happen in a dedicated
    background thread — the main loop only reads from the cache.
    """

    def __init__(self, max_size: int = 2048, ttl: int = 300):
        self._cache: OrderedDict[str, tuple[str, float]] = OrderedDict()
        self._max_size = max_size
        self._ttl = ttl
        self._lock = threading.Lock()
        self._pending: set[str] = set()
        self._resolve_queue: list[str] = []
        self._queue_lock = threading.Lock()
        self._stop = threading.Event()

        # Start background resolver thread
        self._thread = threading.Thread(
            target=self._resolver_loop, daemon=True, name="dns-resolver"
        )
        self._thread.start()

    # ── Public API (called from async main loop — never blocks) ──

    def get(self, ip: str) -> str:
        """Non-blocking cache read. Returns domain or raw IP."""
        with self._lock:
            entry = self._cache.get(ip)
            if entry:
                domain, ts = entry
                if (time.monotonic() - ts) < self._ttl:
                    self._cache.move_to_end(ip)
                    return domain
                # Expired — re-queue
                del self._cache[ip]

        # Schedule background resolution (non-blocking)
        self._enqueue(ip)
        return ip  # Return raw IP while resolution is pending

    def _enqueue(self, ip: str):
        """Add IP to the background resolution queue."""
        with self._queue_lock:
            if ip not in self._pending:
                self._pending.add(ip)
                self._resolve_queue.append(ip)

    # ── Background thread (does all blocking work) ──

    def _resolver_loop(self):
        """Drain queue and resolve DNS in background. Runs forever."""
        while not self._stop.is_set():
            batch: list[str] = []
            with self._queue_lock:
                batch = self._resolve_queue[:32]  # Process up to 32 per cycle
                self._resolve_queue = self._resolve_queue[32:]

            for ip in batch:
                domain = self._resolve_one(ip)
                with self._lock:
                    self._cache[ip] = (domain, time.monotonic())
                    # Evict oldest if over capacity
                    while len(self._cache) > self._max_size:
                        self._cache.popitem(last=False)
                with self._queue_lock:
                    self._pending.discard(ip)

            # Sleep briefly if queue was empty to avoid busy-spin
            if not batch:
                self._stop.wait(0.25)
            else:
                self._stop.wait(0.01)  # Tiny yield between batches

    def _resolve_one(self, ip: str) -> str:
        """Blocking DNS reverse lookup for a single IP."""
        try:
            # Skip private/reserved IPs
            if ip.startswith(("127.", "0.", "169.254.", "::1")):
                return "localhost"
            if ip.startswith(("10.", "192.168.")):
                return f"local-{ip}"
            parts = ip.split(".")
            if len(parts) == 4 and parts[0] == "172":
                second = int(parts[1])
                if 16 <= second <= 31:
                    return f"local-{ip}"

            hostname, _, _ = socket.gethostbyaddr(ip)
            return hostname
        except (socket.herror, socket.gaierror, OSError):
            return ip

    def stop(self):
        self._stop.set()


# ──────────────────────────────────────────────────────────────
#  Background Process Resolver  (Thread-safe, PID-cached)
# ──────────────────────────────────────────────────────────────
class _ProcessCache:
    """
    Thread-safe cache for PID → process info lookups.
    psutil.Process() calls happen in a background thread to avoid
    blocking the main capture loop with AccessDenied retries, etc.
    """

    def __init__(self, ttl: int = 30):
        self._cache: dict[int, tuple[dict, float]] = {}
        self._lock = threading.Lock()
        self._ttl = ttl
        self._pending: set[int] = set()
        self._resolve_queue: list[int] = []
        self._queue_lock = threading.Lock()
        self._stop = threading.Event()

        self._thread = threading.Thread(
            target=self._resolver_loop, daemon=True, name="proc-resolver"
        )
        self._thread.start()

    _EMPTY = {
        "process_name": "Unknown",
        "process_path": "",
        "process_cmdline": "",
        "process_user": "",
    }

    # ── Public API (non-blocking) ──

    def get(self, pid: int | None) -> dict:
        """Non-blocking cache read. Returns process info dict."""
        if pid is None or pid == 0:
            return dict(self._EMPTY)

        now = time.monotonic()
        with self._lock:
            entry = self._cache.get(pid)
            if entry:
                info, ts = entry
                if (now - ts) < self._ttl:
                    return dict(info)
                # Expired — re-queue
                del self._cache[pid]

        self._enqueue(pid)
        return dict(self._EMPTY)

    def _enqueue(self, pid: int):
        with self._queue_lock:
            if pid not in self._pending:
                self._pending.add(pid)
                self._resolve_queue.append(pid)

    # ── Background thread ──

    def _resolver_loop(self):
        while not self._stop.is_set():
            batch: list[int] = []
            with self._queue_lock:
                batch = self._resolve_queue[:64]
                self._resolve_queue = self._resolve_queue[64:]

            for pid in batch:
                info = self._resolve_one(pid)
                with self._lock:
                    self._cache[pid] = (info, time.monotonic())
                with self._queue_lock:
                    self._pending.discard(pid)

            if not batch:
                self._stop.wait(0.2)
            else:
                self._stop.wait(0.005)

    def _resolve_one(self, pid: int) -> dict:
        try:
            proc = psutil.Process(pid)
            name = proc.name() or "Unknown"
            try:
                exe_path = proc.exe() or ""
            except (psutil.AccessDenied, psutil.ZombieProcess):
                exe_path = ""
            try:
                cmdline = " ".join(proc.cmdline()) if proc.cmdline() else ""
            except (psutil.AccessDenied, psutil.ZombieProcess):
                cmdline = ""
            try:
                user = proc.username() or ""
            except (psutil.AccessDenied, psutil.ZombieProcess):
                user = ""

            return {
                "process_name": name,
                "process_path": exe_path,
                "process_cmdline": cmdline[:512],  # Cap to prevent huge payloads
                "process_user": user,
            }
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            return dict(self._EMPTY)

    def stop(self):
        self._stop.set()


# ──────────────────────────────────────────────────────────────
#  Port → Service Map
# ──────────────────────────────────────────────────────────────
PORT_SERVICES = {
    20: "FTP-DATA", 21: "FTP", 22: "SSH", 23: "TELNET",
    25: "SMTP", 53: "DNS", 67: "DHCP", 68: "DHCP",
    80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS",
    445: "SMB", 993: "IMAPS", 995: "POP3S",
    1433: "MSSQL", 1723: "PPTP", 3306: "MySQL",
    3389: "RDP", 5432: "PostgreSQL", 5900: "VNC",
    5985: "WinRM", 5986: "WinRM-S", 6379: "Redis",
    8080: "HTTP-ALT", 8443: "HTTPS-ALT", 8765: "Sentinel-WS",
    27017: "MongoDB",
}


def _get_service(port: int) -> str:
    return PORT_SERVICES.get(port, "")


# ──────────────────────────────────────────────────────────────
#  Hex Dump Generator
# ──────────────────────────────────────────────────────────────
def _generate_hex_dump(src_ip: str, dst_ip: str, src_port: int, dst_port: int,
                       protocol: str, pid: int) -> str:
    """
    Generate a synthetic hex dump from connection metadata.
    Since we use psutil (not raw pcap), we synthesize a plausible
    IP+TCP/UDP header representation for display purposes.
    """
    try:
        # Build a pseudo IP header (20 bytes)
        src_parts = [int(x) for x in src_ip.split(".")] if "." in src_ip else [0, 0, 0, 0]
        dst_parts = [int(x) for x in dst_ip.split(".")] if "." in dst_ip else [0, 0, 0, 0]

        ip_header = struct.pack(
            "!BBHHHBBH4s4s",
            0x45,  # Version + IHL
            0x00,  # DSCP/ECN
            40,    # Total length (IP + TCP header)
            pid & 0xFFFF,  # ID from PID
            0x4000,  # Flags (Don't Fragment)
            64,    # TTL
            6 if protocol == "TCP" else 17,  # Protocol
            0,     # Checksum (placeholder)
            bytes(src_parts),
            bytes(dst_parts),
        )

        # Build a pseudo L4 header
        if protocol == "TCP":
            l4_header = struct.pack(
                "!HHIIBBHHH",
                src_port, dst_port,
                0,  # Sequence
                0,  # Acknowledgment
                0x50,  # Data offset (5 words)
                0x02,  # Flags (SYN)
                65535,  # Window
                0,  # Checksum
                0,  # Urgent pointer
            )
        else:
            l4_header = struct.pack(
                "!HHHH",
                src_port, dst_port,
                8,  # Length
                0,  # Checksum
            )

        raw = ip_header + l4_header

        # Format as classic hex dump
        lines = []
        for offset in range(0, len(raw), 16):
            chunk = raw[offset:offset + 16]
            hex_part = " ".join(f"{b:02x}" for b in chunk)
            ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            lines.append(f"{offset:04x}  {hex_part:<48}  {ascii_part}")

        return "\n".join(lines)
    except Exception:
        return "0000  (hex dump unavailable)"


# ──────────────────────────────────────────────────────────────
#  PacketSniffer — Zero-blocking main loop
# ──────────────────────────────────────────────────────────────
class PacketSniffer:
    """
    High-throughput packet sniffer using psutil connections.

    Architecture:
    ┌─────────────────┐    cache read    ┌──────────────┐
    │  Main Async     │ ───────────────→ │  DNS Cache   │
    │  Capture Loop   │    (non-block)   │  (bg thread) │
    │  (sub-ms per    │                  └──────────────┘
    │   iteration)    │    cache read    ┌──────────────┐
    │                 │ ───────────────→ │  Proc Cache  │
    └────────┬────────┘    (non-block)   │  (bg thread) │
             │                           └──────────────┘
             │ publish
             ▼
        EventBus → WebSocket → UI
    """

    def __init__(self, bus: EventBus, firewall):
        self.bus = bus
        self.firewall = firewall
        self.known_connections: set[str] = set()

        # Background caches — all heavy I/O happens in their own threads
        self._dns = _DNSCache(max_size=2048, ttl=300)
        self._procs = _ProcessCache(ttl=30)

        # I/O counter tracking for byte-length estimation
        self._prev_io = None
        self._prev_io_time = 0.0

    async def start(self):
        print("[SNIFFER] Starting Real-Time Traffic Monitor (zero-block mode)...")
        last_refresh_time = 0.0

        while True:
            try:
                connections = psutil.net_connections(kind='inet')
                listening_ports = {c.laddr.port for c in connections if c.status == 'LISTEN'}
                current_conns: set[str] = set()
                now = time.time()

                # Periodic force-refresh for long-lived connections (every 3s)
                force_refresh = (now - last_refresh_time) > 3.0
                if force_refresh:
                    last_refresh_time = now

                # Snapshot I/O counters for byte estimation
                io_now = psutil.net_io_counters()
                bytes_delta = 0
                if self._prev_io:
                    dt = now - self._prev_io_time
                    if dt > 0:
                        bytes_delta = (
                            (io_now.bytes_sent - self._prev_io.bytes_sent) +
                            (io_now.bytes_recv - self._prev_io.bytes_recv)
                        )
                self._prev_io = io_now
                self._prev_io_time = now

                # Count active connections for per-connection byte estimate
                active_count = sum(
                    1 for c in connections
                    if c.status in ("ESTABLISHED", "SYN_SENT", "SYN_RECV")
                    and c.raddr
                )
                per_conn_bytes = (
                    bytes_delta // max(active_count, 1)
                ) if bytes_delta > 0 else 0

                for conn in connections:
                    if conn.status not in ("ESTABLISHED", "SYN_SENT", "SYN_RECV", "UDP"):
                        continue

                    if not conn.raddr:
                        continue

                    conn_id = f"{conn.laddr.ip}:{conn.laddr.port}-{conn.raddr.ip}:{conn.raddr.port}"
                    current_conns.add(conn_id)

                    if (conn_id not in self.known_connections) or force_refresh:
                        proto = "TCP" if conn.type == 1 else "UDP"
                        remote_ip = conn.raddr.ip
                        remote_port = conn.raddr.port

                        # ── Firewall enforcement ──
                        action = self.firewall.match_traffic(
                            remote_ip, remote_port, pid=conn.pid
                        )

                        status = conn.status
                        if action == "deny":
                            status = "BLOCKED"
                            if conn_id not in self.known_connections:
                                await self.bus.publish("alert", {
                                    "message": f"Firewall Rule Hit: Blocked traffic to/from {remote_ip}:{remote_port}",
                                    "level": "WARNING",
                                    "severity": "medium",
                                    "source": "Wall",
                                    "type": "Policy Violation"
                                })

                        # ── NON-BLOCKING cache reads ──
                        # DNS and Process lookups return instantly from cache.
                        # If not cached yet, the background threads will populate
                        # them and the next refresh cycle will pick up the data.
                        domain = self._dns.get(remote_ip)
                        proc_info = self._procs.get(conn.pid)

                        # Service detection from port
                        service = _get_service(remote_port) or _get_service(conn.laddr.port)

                        # DPI metadata (synthesized from connection state)
                        dpi = {
                            "l3": {
                                "version": 4,
                                "ttl": 64,
                                "protocol": proto,
                                "src_ip": conn.laddr.ip,
                                "dst_ip": remote_ip,
                                "flags": ["DF"],
                            },
                            "l4": {
                                "protocol": proto,
                                "src_port": conn.laddr.port,
                                "dst_port": remote_port,
                                "flags": (
                                    ["SYN"] if status == "SYN_SENT"
                                    else ["SYN", "ACK"] if status == "SYN_RECV"
                                    else ["ACK"] if status == "ESTABLISHED"
                                    else []
                                ),
                                "window_size": 65535,
                            },
                            "service": service,
                        }

                        # Hex dump (lightweight — struct pack, no I/O)
                        hex_dump = _generate_hex_dump(
                            conn.laddr.ip, remote_ip,
                            conn.laddr.port, remote_port,
                            proto, conn.pid or 0
                        )

                        direction = "IN" if conn.laddr.port in listening_ports else "OUT"
                        packet_data = {
                            "id": conn_id,
                            "src_ip": conn.laddr.ip,
                            "src_port": conn.laddr.port,
                            "dst_ip": remote_ip,
                            "dst_port": remote_port,
                            "protocol": proto,
                            "status": status,
                            "pid": conn.pid or 0,
                            "process_name": proc_info["process_name"],
                            "process_path": proc_info["process_path"],
                            "process_cmdline": proc_info["process_cmdline"],
                            "process_user": proc_info["process_user"],
                            "domain": domain,
                            "length": per_conn_bytes,
                            "dpi": dpi,
                            "hex_dump": hex_dump,
                            "direction": direction,
                            "timestamp": datetime.now().strftime("%H:%M:%S"),
                        }

                        await asyncio.sleep(0.01)  # Micro-yield to prevent burst
                        await self.bus.publish("packet_event", packet_data)

                self.known_connections = current_conns

            except Exception:
                # Silently continue — don't let transient errors stop the sniffer
                pass

            await asyncio.sleep(1)  # Main scan interval
