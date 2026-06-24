import asyncio
import threading
import pydivert
import json
import time
import os
from typing import Optional, Set, Dict, List
from core.event_bus import EventBus
from core.dpi import DPIEngine
from core.ngfw import PolicyEngine, SecurityRule
from datetime import datetime
import uuid

RULES_FILE = "firewall_rules.json"

class WFPFirewallService:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.active = True
        self.dpi = DPIEngine()
        self.ngfw = PolicyEngine()
        self.lock = threading.Lock()
        self.running = False
        
        # Capture the event loop from the main thread so we can publish from the worker thread
        self.loop = asyncio.get_event_loop()
        
        # Features
        self.auto_block_enabled = True
        self.panic_mode = False
        
        # Simple Block Lists (Legacy Support)
        self.blocked_ips: Set[str] = set()
        self.blocked_ports: Set[int] = set()
        self.blocked_countries: Set[str] = set()
        self.simple_rules: Dict[str, Dict] = {}
        self.whitelist_ips: Set[str] = {"127.0.0.1", "localhost", "::1"}
        
        # Hardcoded bypass prefixes — these NEVER get dropped
        self._bypass_prefixes = ("127.", "::1", "0.0.0.0")
        self._private_prefixes = ("192.168.", "10.", "172.16.", "172.17.", "172.18.",
                                   "172.19.", "172.20.", "172.21.", "172.22.", "172.23.",
                                   "172.24.", "172.25.", "172.26.", "172.27.", "172.28.",
                                   "172.29.", "172.30.", "172.31.")
        
        # Zero Trust Identity
        from core.process_identity import ProcessIdentity
        self.identity = ProcessIdentity()
        
        # Load rules
        self.load_rules()
        self.bus.subscribe("command", self.handle_command)
        
        # WinDivert handle filter
        self.filter = "true" 
        self._reload_filter = False
        self.last_packet_time = 0

    async def handle_command(self, event: Dict):
        """
        Handle commands from SOAR or other components.
        """
        cmd = event.get("cmd")
        print(f"[WFP FIREWALL] Received Command: {cmd}")
        
        if cmd == "panic_mode":
            enabled = event.get("enabled", True)
            await self.toggle_panic_mode(enabled)
        
        elif cmd == "block_ip":
            ip = event.get("ip")
            if ip:
                await self.block_ip(ip, reason="Automated Command")

        elif cmd == "block_port":
            port = event.get("port")
            if port:
                await self.block_port(int(port), reason="Automated Command")

    def _ip_to_country(self, ip: str) -> str:
        # Simple deterministic mapping for demo/testing geo-blocking
        if ip.startswith(("127.", "192.168.", "10.", "172.16.", "::1", "localhost")):
            return "US"
        h = hash(ip) % 3
        if h == 0: return "CN"
        if h == 1: return "RU"
        return "US"

    async def _execute_netsh(self, cmd: str):
        """Helper to run netsh commands safely."""
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                print(f"[WFP FIREWALL] Netsh Failed: {stderr.decode().strip()}")
                return False
            return True
        except Exception as e:
            print(f"[WFP FIREWALL] Netsh Exception: {e}")
            return False

    def load_rules(self):
        if os.path.exists(RULES_FILE):
            try:
                with open(RULES_FILE, "r") as f:
                    data = json.load(f)
                    self.active = data.get("active", True)
                    self.auto_block_enabled = data.get("auto_block_enabled", True)
                    self.panic_mode = data.get("panic_mode", False)
                    self.blocked_ips = set(data.get("blocked_ips", []))
                    self.blocked_ports = set(data.get("blocked_ports", []))
                    self.blocked_countries = set(data.get("blocked_countries", []))
                    self.simple_rules = data.get("simple_rules", {})
                    
                    if "policies" in data:
                        self.ngfw.load_rules(data["policies"])
                        
                print(f"[WFP FIREWALL] Loaded rules. Active: {self.active}, Panic: {self.panic_mode}")
            except Exception as e:
                print(f"[WFP FIREWALL] Error loading rules: {e}")

        # Seed Default Zero Trust Policies if empty
        if not self.ngfw.rules:
            print("[WFP FIREWALL] No policies found. Seeding Default Zero Trust Rules...")
            defaults = [
                SecurityRule("Block Untrusted Processes", "Untrust", "Any", "Any", "Any", "deny"),
                SecurityRule("Allow Web Traffic", "Trust", "Untrust", "Any", "web-browsing", "allow"),
                SecurityRule("Isolate Critical Apps", "Any", "DMZ", "Any", "Any", "deny"),
                SecurityRule("Default Allow LAN", "Trust", "Trust", "Any", "Any", "allow")
            ]
            for rule in defaults:
                self.ngfw.add_rule(rule)
            self.save_rules()

    def save_rules(self):
        try:
            data = {
                "active": self.active,
                "auto_block_enabled": self.auto_block_enabled,
                "panic_mode": self.panic_mode,
                "blocked_ips": list(self.blocked_ips),
                "blocked_ports": list(self.blocked_ports),
                "blocked_countries": list(self.blocked_countries),
                "simple_rules": self.simple_rules,
                "policies": self.ngfw.get_rules_dict()
            }
            with open(RULES_FILE, "w") as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            print(f"[WFP FIREWALL] Error saving rules: {e}")

    def start(self):
        """Starts the packet interception loop in a background thread."""
        self.running = True
        self.thread = threading.Thread(target=self._packet_loop, daemon=True)
        self.thread.start()
        print("[WFP FIREWALL] Kernel Interception Started via WinDivert.")

    def stop(self):
        self.running = False

    def _is_bypass_ip(self, ip: str) -> bool:
        """Check if IP is loopback or link-local — must NEVER be dropped."""
        return ip.startswith(self._bypass_prefixes) or ip in self.whitelist_ips

    def _is_private_ip(self, ip: str) -> bool:
        """Check if IP is in a private RFC1918 subnet."""
        return ip.startswith(self._private_prefixes)

    def _emit_packet_event(self, packet, src_ip: str, dst_ip: str, protocol: str, status: str):
        """Emit a packet event to the UI via the event bus (thread-safe)."""
        direction = "OUT" if packet.is_outbound else "IN"
        uid_prefix = "BLOCK" if status == "BLOCKED" else f"{packet.src_port}-{packet.dst_port}"
        packet_data = {
            "id": f"{src_ip}:{packet.src_port}-{dst_ip}:{packet.dst_port}",
            "uid": str(uuid.uuid4()),
            "src_ip": src_ip,
            "src_port": packet.src_port,
            "dst_ip": dst_ip,
            "dst_port": packet.dst_port,
            "protocol": protocol,
            "status": status,
            "pid": 0,
            "direction": direction,
            "timestamp": time.strftime("%H:%M:%S")
        }
        try:
            asyncio.run_coroutine_threadsafe(
                self.bus.publish("packet_event", packet_data),
                self.loop
            )
        except Exception:
            pass  # Don't crash the packet loop for UI emission failures

    def _wake_up_loop(self):
        """Send a harmless dummy UDP packet to loopback to instantly unblock WinDivert."""
        import socket
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.sendto(b"WAKEUP", ("127.0.0.1", 59999))
            sock.close()
        except Exception:
            pass

    def _packet_loop(self):
        """
        Blocking loop that reads packets from the Kernel Driver.
        
        Routing Logic (enterprise-grade):
          1. Loopback/link-local → ALWAYS pass (even in panic).
          2. Firewall disabled   → passthrough.
          3. Panic Mode          → drop everything except whitelisted/loopback.
          4. Explicit Blocklist  → drop if IP/Port/Country is in the block set.
          5. Default Pass        → allow everything else. DPI/NGFW runs advisory-only.
        """
        while self.running:
            self._reload_filter = False
            # Dynamic WinDivert Filter Update: enforce absolute ip/ipv6 capture in panic mode
            current_filter = "ip or ipv6" if self.panic_mode else self.filter
            try:
                with pydivert.WinDivert(current_filter) as w:
                    for packet in w:
                        if not self.running or self._reload_filter:
                            break

                        src_ip = packet.src_addr
                        dst_ip = packet.dst_addr

                        # ──────────────────────────────────────────────
                        # RULE 0A: ABSOLUTE PORT REFUSAL (Highest Priority)
                        # Blocked ports are dropped unconditionally — even
                        # on loopback/private IPs.  No program, proxy, or
                        # local binding can communicate on these ports.
                        # ──────────────────────────────────────────────
                        if self.blocked_ports:
                            pkt_src = packet.src_port
                            pkt_dst = packet.dst_port
                            if pkt_src in self.blocked_ports or pkt_dst in self.blocked_ports:
                                self._emit_packet_event(packet, src_ip, dst_ip, "blocked", "BLOCKED")
                                continue  # DROP — absolute refusal

                        # ──────────────────────────────────────────────
                        # RULE 0B: LOOPBACK & SOC PORT BYPASS (Hardcoded)
                        # ──────────────────────────────────────────────
                        if packet.src_port in {8000, 8080, 8765, 6379} or packet.dst_port in {8000, 8080, 8765, 6379}:
                            w.send(packet)
                            continue

                        if self._is_bypass_ip(src_ip) or self._is_bypass_ip(dst_ip):
                            w.send(packet)
                            continue

                        # ──────────────────────────────────────────────
                        # RULE 1: FIREWALL DISABLED → Full passthrough
                        # ──────────────────────────────────────────────
                        if not self.active:
                            w.send(packet)
                            continue

                        # ──────────────────────────────────────────────
                        # RULE 2: PANIC MODE — Block EVERYTHING except
                        #         loopback/whitelisted IPs and critical ports.
                        #         (Which are already allowed by Rule 0B)
                        # ──────────────────────────────────────────────
                        if self.panic_mode:
                            # Drop all non-bypassed traffic in panic mode
                            self._emit_packet_event(packet, src_ip, dst_ip, "unknown", "BLOCKED")
                            # ABSOLUTE DISCARD - Do NOT call w.send(packet)
                            continue

                        # ──────────────────────────────────────────────
                        # RULE 3: EXPLICIT BLOCKLIST CHECK (L3/L4)
                        #         Only drop traffic that matches an
                        #         active, explicit rule.
                        # ──────────────────────────────────────────────
                        blocked = False

                        # 3a. IP Blocklist
                        if src_ip in self.blocked_ips or dst_ip in self.blocked_ips:
                            blocked = True

                        # 3b. Port Blocklist
                        if not blocked and (packet.src_port in self.blocked_ports or 
                                            packet.dst_port in self.blocked_ports):
                            blocked = True

                        # 3c. Geo-Blocking
                        if not blocked and self.blocked_countries:
                            src_country = self._ip_to_country(src_ip)
                            dst_country = self._ip_to_country(dst_ip)
                            if src_country in self.blocked_countries or dst_country in self.blocked_countries:
                                blocked = True

                        if blocked:
                            self._emit_packet_event(packet, src_ip, dst_ip, "blocked", "BLOCKED")
                            continue  # DROP — do NOT send

                        # ──────────────────────────────────────────────
                        # RULE 4: DEFAULT PASS — Allow the packet.
                        #         DPI/NGFW runs as advisory logging.
                        # ──────────────────────────────────────────────
                        w.send(packet)  # ALWAYS pass in normal mode

                        # Advisory DPI/NGFW (non-blocking, log only)
                        now = time.time()
                        if now - self.last_packet_time > 0.05:
                            self.last_packet_time = now
                            try:
                                dpi_result = self.dpi.inspect_packet(packet.raw)
                                protocol = dpi_result.get("proto", "unknown")
                            except Exception:
                                protocol = "unknown"

                            self._emit_packet_event(packet, src_ip, dst_ip, protocol, "ALLOW")
                            
            except PermissionError:
                print("[WFP IMPORTANT] Failed to open WinDivert handle. Run as Administrator.")
                alert_data = {
                    "message": "Please run backend as Administrator to enforce Kernel block",
                    "level": "WARNING",
                    "severity": "medium",
                    "source": "Firewall Core",
                    "type": "System",
                    "timestamp": datetime.utcnow().isoformat()
                }
                try:
                    asyncio.run_coroutine_threadsafe(
                        self.bus.publish("alert", alert_data), 
                        self.loop
                    )
                except Exception:
                    pass
                break  # Exit loop to avoid infinite permission error spam
            except Exception as e:
                print(f"[WFP ERROR] {e}")
                time.sleep(1)

    # --- API Compat Methods ---
    
    def get_status(self):
        return {
            "active": self.active,
            "auto_block": self.auto_block_enabled, 
            "panic_mode": self.panic_mode,
            "blocked_ips": list(self.blocked_ips),
            "blocked_ports": list(self.blocked_ports),
            "blocked_countries": list(self.blocked_countries),
            "rules": list(self.simple_rules.values()),
            "policies": self.ngfw.get_rules_dict()
        }

    def get_policies(self):
        return self.ngfw.get_rules_dict()
        
    def match_traffic(self, ip: str, port: int, country: str = None, pid: int = None) -> str:
        """
        Evaluate traffic against rules. Uses Default Pass logic.
        Returns: 'allow' or 'deny'
        """
        # Loopback/bypassed always pass
        if self._is_bypass_ip(ip):
            return "allow"

        if port in {8000, 8080, 8765, 6379}:
            return "allow"

        # Panic mode: absolute block for all non-bypassed traffic
        if self.panic_mode:
            return "deny"

        # Explicit blocklist checks
        if ip in self.blocked_ips:
            return "deny"
        if port in self.blocked_ports:
            return "deny"

        if not country:
            country = self._ip_to_country(ip)
        if country in self.blocked_countries:
            return "deny"

        # Default Pass — allow everything else
        return "allow"

    async def block_ip(self, ip: str, reason: str="Manual"):
        if ip not in self.blocked_ips:
            self.blocked_ips.add(ip)
            
            # Execute Native Windows Block (Best Effort)
            cmd1 = f"netsh advfirewall firewall add rule name=\"Sentinel_Block_IP_{ip}\" dir=in action=block remoteip={ip}"
            await self._execute_netsh(cmd1)
            cmd2 = f"netsh advfirewall firewall add rule name=\"Sentinel_Block_IP_{ip}\" dir=out action=block remoteip={ip}"
            await self._execute_netsh(cmd2)

            self.simple_rules[f"ip:{ip}"] = {
                "target": ip,
                "type": "IP",
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            }
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_added",
                "rule": self.simple_rules[f"ip:{ip}"]
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall blocked IP {ip}. Reason: {reason}"
            })
        return {"status": "blocked", "ip": ip}

    async def unblock_ip(self, ip: str):
        if ip in self.blocked_ips:
            self.blocked_ips.remove(ip)
            
            await self._execute_netsh(f"netsh advfirewall firewall delete rule name=\"Sentinel_Block_IP_{ip}\"")

            if f"ip:{ip}" in self.simple_rules:
                del self.simple_rules[f"ip:{ip}"]
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_removed",
                "target": ip,
                "rule_type": "IP"
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall unblocked IP {ip}."
            })
        return {"status": "unblocked", "ip": ip}
        
    async def add_policy(self, policy):
        rule = SecurityRule.from_dict(policy)
        self.ngfw.add_rule(rule)
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "policy_updated",
            "policies": self.ngfw.get_rules_dict()
        })
        return {"status": "added"} 

    async def delete_policy(self, rule_id: str):
        self.ngfw.remove_rule(rule_id)
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "policy_updated",
            "policies": self.ngfw.get_rules_dict()
        })
        return {"status": "deleted", "id": rule_id}
        
    async def toggle_firewall(self, active: bool):
        self.active = active
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "status_change",
            "active": self.active,
            "panic_mode": self.panic_mode,
            "timestamp": datetime.utcnow().isoformat()
        })
        return {"status": "success", "active": self.active}
        
    async def toggle_panic_mode(self, enabled: bool):
        self.panic_mode = enabled
        self._reload_filter = True  # Signal loop to reload filter string
        self.save_rules()
        msg = "FIREWALL LOCKDOWN INITIATED. BLOCKING ALL TRAFFIC." if enabled else "Firewall Lockdown lifted."
        level = "CRITICAL" if enabled else "INFO"
        
        # Native Windows Advanced Firewall Fail-Safe Layer
        if enabled:
            # Block EVERYTHING at the OS level
            await self._execute_netsh("netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound")
            
            # Punch holes ONLY for the SOC management ports
            for port in [8000, 8080, 8765, 6379]:
                await self._execute_netsh(f'netsh advfirewall firewall add rule name="Sentinel_SOC_Bypass_{port}" dir=out action=allow protocol=TCP localport={port}')
        else:
            # Restore normal operation (Block inbound, Allow outbound)
            await self._execute_netsh("netsh advfirewall set allprofiles firewallpolicy blockinbound,allowoutbound")
            
            # Clean up the temporary Sentinel bypass rules
            for port in [8000, 8080, 8765, 6379]:
                await self._execute_netsh(f'netsh advfirewall firewall delete rule name="Sentinel_SOC_Bypass_{port}"')

        # Instantly wake up the blocking packet loop to apply new state
        self._wake_up_loop()

        await self.bus.publish("firewall_event", {
            "type": "panic_change",
            "panic_mode": self.panic_mode,
            "timestamp": datetime.utcnow().isoformat()
        })
        await self.bus.publish("alert", {
            "message": msg,
            "level": level,
            "severity": "high",
            "source": "Firewall Core"
        })
        return {"status": "success", "panic_mode": enabled}

    async def toggle_auto_block(self, enabled: bool):
        self.auto_block_enabled = enabled
        self.save_rules()
        await self.bus.publish("firewall_event", {
            "type": "config_change",
            "auto_block": self.auto_block_enabled,
            "timestamp": datetime.utcnow().isoformat()
        })
        return {"status": "success", "auto_block": self.auto_block_enabled}
        
    async def block_port(self, port: int, reason: str="Manual"):
        if port not in self.blocked_ports:
            self.blocked_ports.add(port)
            
            # Execute Native Windows Block — BIDIRECTIONAL TCP+UDP
            # Inbound TCP
            await self._execute_netsh(
                f'netsh advfirewall firewall add rule name="Sentinel_Block_Port_{port}_TCP_IN" dir=in action=block protocol=TCP localport={port}'
            )
            # Outbound TCP
            await self._execute_netsh(
                f'netsh advfirewall firewall add rule name="Sentinel_Block_Port_{port}_TCP_OUT" dir=out action=block protocol=TCP localport={port}'
            )
            # Inbound UDP
            await self._execute_netsh(
                f'netsh advfirewall firewall add rule name="Sentinel_Block_Port_{port}_UDP_IN" dir=in action=block protocol=UDP localport={port}'
            )
            # Outbound UDP
            await self._execute_netsh(
                f'netsh advfirewall firewall add rule name="Sentinel_Block_Port_{port}_UDP_OUT" dir=out action=block protocol=UDP localport={port}'
            )

            self.simple_rules[f"port:{port}"] = {
                "target": port,
                "type": "Port",
                "reason": reason,
                "timestamp": datetime.utcnow().isoformat()
            }
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_added",
                "rule": self.simple_rules[f"port:{port}"]
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall ABSOLUTE BLOCK on Port {port} (bidirectional TCP+UDP, incl. loopback). Reason: {reason}"
            })
        return {"status": "blocked", "port": port}
        
    async def unblock_port(self, port: int):
        if port in self.blocked_ports:
            self.blocked_ports.remove(port)
            
            # Remove all four bidirectional netsh rules
            for suffix in ["TCP_IN", "TCP_OUT", "UDP_IN", "UDP_OUT"]:
                await self._execute_netsh(
                    f'netsh advfirewall firewall delete rule name="Sentinel_Block_Port_{port}_{suffix}"'
                )
            # Legacy cleanup (old rule names)
            await self._execute_netsh(f'netsh advfirewall firewall delete rule name="Sentinel_Block_Port_{port}"')
            await self._execute_netsh(f'netsh advfirewall firewall delete rule name="Sentinel_Block_Port_{port}_UDP"')

            if f"port:{port}" in self.simple_rules:
                del self.simple_rules[f"port:{port}"]
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_removed",
                "target": port,
                "rule_type": "Port"
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall unblocked Port {port} (all rules removed)."
            })
        return {"status": "unblocked", "port": port} 
        
    async def block_country(self, country_code: str):
        if country_code not in self.blocked_countries:
            self.blocked_countries.add(country_code)
            self.simple_rules[f"country:{country_code}"] = {
                "target": country_code,
                "type": "Country",
                "reason": "Geo-Blocking Policy",
                "timestamp": datetime.utcnow().isoformat()
            }
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_added",
                "rule": self.simple_rules[f"country:{country_code}"]
            })
            await self.bus.publish("explanation", {
                "explanation": f"Firewall blocked Country {country_code}."
            })
        return {"status": "blocked", "country": country_code}

    async def unblock_country(self, country_code: str):
        if country_code in self.blocked_countries:
            self.blocked_countries.remove(country_code)
            if f"country:{country_code}" in self.simple_rules:
                del self.simple_rules[f"country:{country_code}"]
            self.save_rules()
            await self.bus.publish("firewall_event", {
                "type": "rule_removed",
                "target": country_code,
                "rule_type": "Country"
            })
        return {"status": "unblocked", "country": country_code}
