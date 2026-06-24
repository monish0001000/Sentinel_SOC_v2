# collectors/network_monitor.py
"""
Enhanced Network Monitor with Deep Packet Inspection
Combines DPI with reputation analysis for comprehensive traffic visibility
"""

import asyncio
import time
from typing import Dict, Any, Optional, Set
from threading import Thread
from queue import Queue
import re

try:
    from scapy.all import sniff, IP, TCP, UDP, ICMP
except ImportError:
    IP = TCP = UDP = ICMP = None

from collectors.dpi_analyzer import DPIAnalyzer
from collectors.reputation_analyzer import ReputationAnalyzer


class NetworkMonitor:
    """
    Enhanced Network Monitor with DPI and Reputation Analysis
    
    Features:
    - Deep packet inspection (header/payload analysis)
    - IP and domain reputation checking (VirusTotal, AbuseIPDB)
    - Wireshark-style packet breakdown
    - Threat pattern detection
    - Real-time enrichment and alerting
    """

    def __init__(
        self,
        bus,
        virustotal_api_key: Optional[str] = None,
        abuseipdb_api_key: Optional[str] = None,
        enable_reputation_check: bool = True,
        enable_dpi: bool = True,
    ):
        """
        Initialize enhanced network monitor

        Args:
            bus: EventBus for publishing events
            virustotal_api_key: VirusTotal API key (optional)
            abuseipdb_api_key: AbuseIPDB API key (optional)
            enable_reputation_check: Enable reputation analysis
            enable_dpi: Enable deep packet inspection
        """
        self.bus = bus
        self.enable_dpi = enable_dpi
        self.enable_reputation = enable_reputation_check

        # Initialize analyzers
        if self.enable_dpi:
            self.dpi = DPIAnalyzer()
        if self.enable_reputation:
            self.reputation = ReputationAnalyzer(
                virustotal_api_key=virustotal_api_key,
                abuseipdb_api_key=abuseipdb_api_key,
            )

        # Packet queue for async processing
        self.packet_queue = Queue(maxsize=1000)
        self.running = False

        # Tracking for anomaly detection
        self.ip_activity_map: Dict[str, Dict[str, Any]] = {}
        self.port_scan_threshold = 10  # Alerts on 10+ different ports from same IP
        self.suspicious_ips: Set[str] = set()

        # Statistics
        self.packets_processed = 0
        self.packets_analyzed = 0
        self.threats_detected = 0

    async def process_packet_async(self, packet) -> Optional[Dict[str, Any]]:
        """
        Process packet asynchronously with DPI and reputation analysis

        Args:
            packet: Scapy packet object

        Returns:
            Enriched event dictionary
        """
        try:
            event = {
                "type": "network",
                "timestamp": time.time(),
                "raw_summary": packet.summary() if hasattr(packet, "summary") else str(packet),
            }

            # Extract basic packet info
            packet_info = self._extract_packet_info(packet)
            event.update(packet_info)

            # Deep Packet Inspection
            if self.enable_dpi:
                dpi_analysis = self.dpi.analyze_packet(packet)
                event["dpi"] = dpi_analysis
                event["traffic_signature"] = self.dpi.get_traffic_signature(dpi_analysis)

            # Reputation Analysis (async)
            if self.enable_reputation and "src_ip" in event:
                reputation_data = await self._analyze_reputation(event["src_ip"])
                if reputation_data:
                    event["reputation"] = reputation_data
                    
                    # Alert on high-risk IPs
                    if self.reputation.is_high_risk(reputation_data, threshold=50):
                        event["alert"] = {
                            "severity": "high",
                            "reason": f"High-risk IP detected: {reputation_data.combined_risk_score:.1f}",
                            "threat_types": reputation_data.threat_types,
                        }
                        self.threats_detected += 1

            # Anomaly Detection
            anomalies = await self._detect_anomalies(event)
            if anomalies:
                event["anomalies"] = anomalies
                self.threats_detected += len(anomalies)

            self.packets_analyzed += 1

            # Publish enriched event
            await self.bus.publish("network_event", event)

            return event

        except Exception as e:
            # Graceful error handling
            await self.bus.publish("error", {
                "type": "packet_processing_error",
                "error": str(e),
                "timestamp": time.time(),
            })
            return None

    def _extract_packet_info(self, packet) -> Dict[str, Any]:
        """Extract basic packet information from Scapy packet"""
        info = {
            "protocol": "Unknown",
            "src_ip": None,
            "dst_ip": None,
            "src_port": None,
            "dst_port": None,
            "size": len(packet) if hasattr(packet, "__len__") else 0,
        }

        try:
            if IP:
                if packet.haslayer(IP):
                    ip_layer = packet[IP]
                    info["src_ip"] = ip_layer.src
                    info["dst_ip"] = ip_layer.dst

                    if packet.haslayer(TCP):
                        tcp = packet[TCP]
                        info["protocol"] = "TCP"
                        info["src_port"] = tcp.sport
                        info["dst_port"] = tcp.dport
                    elif packet.haslayer(UDP):
                        udp = packet[UDP]
                        info["protocol"] = "UDP"
                        info["src_port"] = udp.sport
                        info["dst_port"] = udp.dport
                    elif packet.haslayer(ICMP):
                        info["protocol"] = "ICMP"
                    else:
                        info["protocol"] = "IP"
        except Exception:
            pass

        return info

    async def _analyze_reputation(self, ip: str) -> Optional[Dict[str, Any]]:
        """
        Analyze IP reputation asynchronously

        Args:
            ip: IP address to analyze

        Returns:
            Reputation data or None
        """
        if not self.enable_reputation or not ip:
            return None

        try:
            # Run async reputation check without blocking
            score = await asyncio.wait_for(
                self.reputation.analyze_ip(ip), timeout=5.0
            )
            return {
                "entity": score.entity,
                "entity_type": score.entity_type,
                "virustotal_score": score.virustotal_score,
                "virustotal_detections": score.virustotal_detections,
                "abuseipdb_score": score.abuseipdb_score,
                "abuseipdb_reports": score.abuseipdb_reports,
                "combined_risk_score": score.combined_risk_score,
                "is_blacklisted": score.is_blacklisted,
                "threat_types": score.threat_types,
                "is_cached": score.is_cached,
                "confidence": score.confidence,
            }
        except asyncio.TimeoutError:
            return None
        except Exception as e:
            return None

    async def _detect_anomalies(self, event: Dict[str, Any]) -> list:
        """
        Detect suspicious patterns and anomalies

        Args:
            event: Network event

        Returns:
            List of detected anomalies
        """
        anomalies = []
        src_ip = event.get("src_ip")
        dst_port = event.get("dst_port")

        if not src_ip:
            return anomalies

        # Track activity per IP
        if src_ip not in self.ip_activity_map:
            self.ip_activity_map[src_ip] = {"ports": set(), "packet_count": 0}

        activity = self.ip_activity_map[src_ip]
        activity["packet_count"] += 1

        if dst_port:
            activity["ports"].add(dst_port)

            # Port scan detection
            if len(activity["ports"]) > self.port_scan_threshold:
                anomalies.append({
                    "type": "port_scan",
                    "severity": "high",
                    "description": f"Port scan detected: {len(activity['ports'])} ports from {src_ip}",
                    "ports_scanned": list(activity["ports"])[:20],  # Top 20
                })
                self.suspicious_ips.add(src_ip)

        # DPI anomalies
        dpi = event.get("dpi", {})
        payload = dpi.get("payload", {})

        if payload:
            # Detect encrypted/suspicious payloads
            if payload.get("entropy", 0) > 7.0:
                anomalies.append({
                    "type": "high_entropy_payload",
                    "severity": "medium",
                    "description": "High-entropy payload detected (possible encryption/obfuscation)",
                    "entropy": payload.get("entropy"),
                })

            # Detect executable signatures
            if payload.get("has_executable"):
                anomalies.append({
                    "type": "executable_detected",
                    "severity": "critical",
                    "description": "Executable file signature detected in payload",
                })

            # Detect malware patterns
            if payload.get("has_malware_signatures"):
                anomalies.append({
                    "type": "malware_pattern",
                    "severity": "critical",
                    "description": "Malware patterns detected in payload",
                    "patterns": payload.get("suspicious_strings", []),
                })

        return anomalies

    def process_packet_sync(self, packet):
        """
        Synchronous packet processing (for use in sniff callback)

        Args:
            packet: Scapy packet object
        """
        self.packet_queue.put(packet)
        self.packets_processed += 1

    async def packet_processing_loop(self):
        """
        Main async loop for processing queued packets
        Allows non-blocking reputation checks and DPI analysis
        """
        while self.running:
            try:
                # Non-blocking get from queue
                if not self.packet_queue.empty():
                    packet = self.packet_queue.get(block=False)
                    await self.process_packet_async(packet)
                else:
                    await asyncio.sleep(0.01)
            except Exception as e:
                await self.bus.publish("error", {
                    "type": "processing_loop_error",
                    "error": str(e),
                    "timestamp": time.time(),
                })
                await asyncio.sleep(0.1)

    def start(self, interface: Optional[str] = None, packet_count: int = 0):
        """
        Start network monitoring

        Args:
            interface: Network interface to sniff on (None = all)
            packet_count: Number of packets to capture (0 = unlimited)
        """
        self.running = True

        # Start async processing loop in background
        def run_async_loop():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(self.packet_processing_loop())

        async_thread = Thread(target=run_async_loop, daemon=True)
        async_thread.start()

        # Start packet capture (blocking)
        try:
            if IP and TCP and UDP:
                sniff(
                    iface=interface,
                    prn=self.process_packet_sync,
                    store=False,
                    count=packet_count if packet_count > 0 else 0,
                )
            else:
                print("[MONITOR] Scapy not available, running in demo mode")
                # Demo mode: publish synthetic packets
                asyncio.run(self._demo_packets())
        except KeyboardInterrupt:
            self.stop()

    async def _demo_packets(self):
        """
        Demo mode: generate synthetic network events
        Useful for testing without live network capture
        """
        demo_packets = [
            {
                "src_ip": "192.168.1.100",
                "dst_ip": "8.8.8.8",
                "src_port": 54321,
                "dst_port": 53,
                "protocol": "UDP",
            },
            {
                "src_ip": "203.0.113.42",
                "dst_ip": "10.0.0.1",
                "src_port": 443,
                "dst_port": 443,
                "protocol": "TCP",
            },
            {
                "src_ip": "192.168.1.50",
                "dst_ip": "192.168.1.1",
                "src_port": 22,
                "dst_port": 65000,
                "protocol": "TCP",
            },
        ]

        while self.running:
            for packet_data in demo_packets:
                event = {
                    "type": "network",
                    "timestamp": time.time(),
                    **packet_data,
                }
                await self.bus.publish("network_event", event)
                await asyncio.sleep(1)

    def stop(self):
        """Stop network monitoring"""
        self.running = False

    def get_statistics(self) -> Dict[str, Any]:
        """Get monitoring statistics"""
        return {
            "packets_processed": self.packets_processed,
            "packets_analyzed": self.packets_analyzed,
            "threats_detected": self.threats_detected,
            "queue_size": self.packet_queue.qsize(),
            "suspicious_ips": len(self.suspicious_ips),
            "tracked_ips": len(self.ip_activity_map),
            "reputation_cache": (
                self.reputation.get_cache_stats()
                if self.enable_reputation
                else None
            ),
        }
