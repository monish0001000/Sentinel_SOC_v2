# collectors/dpi_analyzer.py
"""
Deep Packet Inspection (DPI) Analyzer
Extracts header details and payload analysis from network packets
Provides Wireshark-style visibility with L2/L3/L4/L7 layer analysis
"""

import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class L2Header:
    """Data Link Layer (Ethernet)"""
    src_mac: str
    dst_mac: str
    ether_type: str
    vlan_id: Optional[int] = None


@dataclass
class L3Header:
    """Network Layer (IP)"""
    version: int
    header_length: int
    ttl: int
    protocol: str
    src_ip: str
    dst_ip: str
    total_length: int
    flags: List[str]
    fragment_offset: int


@dataclass
class L4Header:
    """Transport Layer (TCP/UDP)"""
    protocol: str  # TCP, UDP, ICMP
    src_port: int
    dst_port: int
    sequence: Optional[int] = None
    acknowledgment: Optional[int] = None
    flags: Optional[List[str]] = None  # TCP flags (SYN, ACK, FIN, RST, etc.)
    window_size: Optional[int] = None
    checksum: Optional[str] = None


@dataclass
class ApplicationLayer:
    """Application Layer (L7) Data"""
    protocol: str  # HTTP, HTTPS, DNS, FTP, SSH, etc.
    method: Optional[str] = None  # GET, POST, etc. for HTTP
    uri: Optional[str] = None
    status_code: Optional[int] = None
    hostname: Optional[str] = None
    query_type: Optional[str] = None  # DNS query type
    query_name: Optional[str] = None  # DNS query name
    user_agent: Optional[str] = None
    content_type: Optional[str] = None
    payload_size: int = 0
    payload_hash: Optional[str] = None


@dataclass
class PayloadAnalysis:
    """Payload-level Analysis"""
    entropy: float  # 0-8 (8 = highest entropy, likely encrypted/compressed)
    has_executable: bool  # Contains executable signatures
    has_malware_signatures: bool  # Contains known malware patterns
    suspicious_strings: List[str]  # Suspicious patterns found
    encoding: str  # ASCII, UTF-8, Binary, etc.
    size_bytes: int


class DPIAnalyzer:
    """
    Deep Packet Inspection Engine
    Extracts and analyzes packet headers and payloads similar to Wireshark
    """

    # Known suspicious patterns
    MALWARE_PATTERNS = [
        r"cmd\.exe\s+/c",  # Windows command execution
        r"powershell\s+-",  # PowerShell execution
        r"wget\s+",  # File download
        r"curl\s+",  # File download
        r"nc\s+-",  # Netcat reverse shell
        r"bash\s+-",  # Bash execution
        r"base64",  # Encoding/obfuscation
        r"eval\(",  # Code evaluation
        r"exec\(",  # Code execution
    ]

    # Port-to-service mapping
    PORT_SERVICES = {
        20: "FTP-DATA",
        21: "FTP",
        22: "SSH",
        23: "TELNET",
        25: "SMTP",
        53: "DNS",
        80: "HTTP",
        110: "POP3",
        143: "IMAP",
        443: "HTTPS",
        445: "SMB",
        3306: "MySQL",
        3389: "RDP",
        5432: "PostgreSQL",
        5985: "WinRM",
        8080: "HTTP-ALT",
        8443: "HTTPS-ALT",
    }

    # HTTP status code categories
    HTTP_STATUS_CATEGORIES = {
        "1xx": "Informational",
        "2xx": "Success",
        "3xx": "Redirection",
        "4xx": "Client Error",
        "5xx": "Server Error",
    }

    def __init__(self):
        self.packet_cache = {}  # Cache for recently analyzed packets
        self.dns_queries = {}  # Track DNS queries for correlation

    def analyze_packet(self, packet_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main entry point for packet analysis
        Returns comprehensive Wireshark-style packet breakdown
        """
        try:
            # Try to extract scapy packet, otherwise work with dict representation
            if hasattr(packet_data, "summary"):
                packet = packet_data
                analysis = {
                    "timestamp": datetime.now().isoformat(),
                    "summary": self._extract_from_scapy_packet(packet),
                }
            else:
                analysis = {
                    "timestamp": datetime.now().isoformat(),
                    "summary": self._extract_from_dict_packet(packet_data),
                }

            return analysis
        except Exception as e:
            return {
                "timestamp": datetime.now().isoformat(),
                "error": str(e),
                "raw_data": packet_data,
            }

    def _extract_from_scapy_packet(self, packet) -> Dict[str, Any]:
        """Extract data from Scapy packet object"""
        try:
            from scapy.layers.inet import IP, TCP, UDP, ICMP
            from scapy.layers.l2 import Ether
            from scapy.layers.dns import DNS, DNSQR, DNSRR
            from scapy.layers.http import HTTP, HTTPRequest

            analysis = {
                "l2": None,
                "l3": None,
                "l4": None,
                "l7": None,
                "payload": None,
                "packet_size": len(packet),
            }

            # L2 - Ethernet
            if packet.haslayer(Ether):
                eth = packet[Ether]
                analysis["l2"] = asdict(
                    L2Header(
                        src_mac=eth.src,
                        dst_mac=eth.dst,
                        ether_type=self._get_ether_type(eth.type),
                    )
                )

            # L3 - IP
            if packet.haslayer(IP):
                ip = packet[IP]
                analysis["l3"] = asdict(
                    L3Header(
                        version=ip.version,
                        header_length=ip.ihl,
                        ttl=ip.ttl,
                        protocol=self._get_protocol_name(ip.proto),
                        src_ip=ip.src,
                        dst_ip=ip.dst,
                        total_length=ip.len,
                        flags=self._parse_ip_flags(ip.flags),
                        fragment_offset=ip.frag,
                    )
                )

            # L4 - TCP/UDP/ICMP
            if packet.haslayer(TCP):
                tcp = packet[TCP]
                analysis["l4"] = asdict(
                    L4Header(
                        protocol="TCP",
                        src_port=tcp.sport,
                        dst_port=tcp.dport,
                        sequence=tcp.seq,
                        acknowledgment=tcp.ack,
                        flags=self._parse_tcp_flags(tcp.flags),
                        window_size=tcp.window,
                        checksum=str(tcp.chksum),
                    )
                )
            elif packet.haslayer(UDP):
                udp = packet[UDP]
                analysis["l4"] = asdict(
                    L4Header(
                        protocol="UDP",
                        src_port=udp.sport,
                        dst_port=udp.dport,
                    )
                )
            elif packet.haslayer(ICMP):
                icmp = packet[ICMP]
                analysis["l4"] = asdict(
                    L4Header(
                        protocol="ICMP",
                        src_port=0,
                        dst_port=0,
                    )
                )

            # L7 - Application Layer (DNS, HTTP, etc.)
            analysis["l7"] = self._analyze_application_layer(packet)

            # Payload Analysis
            payload = self._extract_payload(packet)
            if payload:
                analysis["payload"] = asdict(
                    self._analyze_payload(payload)
                )

            return analysis
        except Exception as e:
            return {"error": f"Scapy analysis failed: {str(e)}"}

    def _extract_from_dict_packet(self, packet_data: Dict) -> Dict[str, Any]:
        """Extract data from dictionary representation of packet"""
        analysis = {
            "l3": None,
            "l4": None,
            "l7": None,
            "payload": None,
            "packet_size": packet_data.get("size", 0),
        }

        # L3 - IP
        if "src_ip" in packet_data and "dst_ip" in packet_data:
            analysis["l3"] = asdict(
                L3Header(
                    version=packet_data.get("ip_version", 4),
                    header_length=20,
                    ttl=packet_data.get("ttl", 64),
                    protocol=packet_data.get("protocol", "TCP"),
                    src_ip=packet_data["src_ip"],
                    dst_ip=packet_data["dst_ip"],
                    total_length=packet_data.get("size", 0),
                    flags=[],
                    fragment_offset=0,
                )
            )

        # L4 - TCP/UDP
        if "src_port" in packet_data and "dst_port" in packet_data:
            analysis["l4"] = asdict(
                L4Header(
                    protocol=packet_data.get("protocol", "TCP"),
                    src_port=packet_data["src_port"],
                    dst_port=packet_data["dst_port"],
                )
            )

        # L7 - Application Layer
        if "hostname" in packet_data or "uri" in packet_data:
            analysis["l7"] = asdict(
                ApplicationLayer(
                    protocol=self._detect_application_protocol(
                        packet_data.get("dst_port", 0)
                    ),
                    hostname=packet_data.get("hostname"),
                    uri=packet_data.get("uri"),
                    user_agent=packet_data.get("user_agent"),
                    payload_size=packet_data.get("size", 0),
                )
            )

        return analysis

    def _analyze_application_layer(self, packet) -> Optional[Dict[str, Any]]:
        """Analyze L7 (Application Layer) protocols"""
        try:
            from scapy.layers.dns import DNS, DNSQR
            from scapy.layers.inet import TCP, UDP

            # DNS Analysis
            if packet.haslayer(DNS):
                dns = packet[DNS]
                query_name = None
                query_type = None

                if dns.qdcount > 0:
                    query_name = dns.qd.qname.decode() if dns.qd.qname else None
                    query_type = self._get_dns_type(dns.qd.qtype)

                return asdict(
                    ApplicationLayer(
                        protocol="DNS",
                        query_type=query_type,
                        query_name=query_name,
                    )
                )

            # HTTP/HTTPS Analysis
            if packet.haslayer(TCP):
                tcp = packet[TCP]
                dst_port = tcp.dport

                if dst_port == 80 or dst_port == 8080:
                    # Attempt HTTP parsing
                    try:
                        payload = bytes(packet[TCP].payload)
                        if b"HTTP" in payload[:50]:
                            return self._parse_http_payload(payload)
                    except:
                        pass

                elif dst_port == 443 or dst_port == 8443:
                    # HTTPS - try to extract SNI from TLS
                    try:
                        payload = bytes(packet[TCP].payload)
                        hostname = self._extract_tls_sni(payload)
                        if hostname:
                            return asdict(
                                ApplicationLayer(
                                    protocol="HTTPS/TLS",
                                    hostname=hostname,
                                )
                            )
                    except:
                        pass

            return None
        except Exception as e:
            return None

    def _parse_http_payload(self, payload: bytes) -> Dict[str, Any]:
        """Parse HTTP request/response from payload"""
        try:
            payload_str = payload.decode("utf-8", errors="ignore")
            lines = payload_str.split("\r\n")

            if len(lines) > 0:
                # Parse request line
                first_line = lines[0]
                parts = first_line.split()

                if len(parts) >= 2:
                    method = parts[0]
                    uri = parts[1]
                    app_layer = ApplicationLayer(
                        protocol="HTTP",
                        method=method,
                        uri=uri,
                    )

                    # Extract headers
                    for line in lines[1:]:
                        if ":" not in line:
                            break
                        header, value = line.split(":", 1)
                        header = header.strip().lower()

                        if header == "host":
                            app_layer.hostname = value.strip()
                        elif header == "user-agent":
                            app_layer.user_agent = value.strip()
                        elif header == "content-type":
                            app_layer.content_type = value.strip()

                    return asdict(app_layer)
        except:
            pass

        return None

    def _extract_tls_sni(self, payload: bytes) -> Optional[str]:
        """Extract SNI (Server Name Indication) from TLS handshake"""
        try:
            # TLS Record: Check for Client Hello (type 0x16, handshake 0x01)
            if len(payload) < 43:
                return None

            if payload[0] != 0x16:  # TLS Handshake
                return None

            # Skip to handshake header
            handshake_offset = 5
            if len(payload) < handshake_offset + 1:
                return None

            if payload[handshake_offset] != 0x01:  # Client Hello
                return None

            # Skip to extensions
            offset = handshake_offset + 43  # Fixed header size

            while offset < len(payload) - 4:
                ext_type = int.from_bytes(payload[offset:offset+2], "big")
                ext_len = int.from_bytes(payload[offset+2:offset+4], "big")

                if ext_type == 0:  # SNI extension
                    sni_offset = offset + 8  # Skip extension header and SNI list header
                    if sni_offset + 2 <= len(payload):
                        name_len = int.from_bytes(
                            payload[sni_offset:sni_offset+2], "big"
                        )
                        if sni_offset + 2 + name_len <= len(payload):
                            return payload[
                                sni_offset + 2 : sni_offset + 2 + name_len
                            ].decode("utf-8", errors="ignore")

                offset += 4 + ext_len

        except:
            pass

        return None

    def _analyze_payload(self, payload: bytes) -> PayloadAnalysis:
        """Analyze raw payload for entropy, signatures, and content"""
        entropy = self._calculate_entropy(payload)
        suspicious_strings = self._find_suspicious_patterns(payload)
        has_executable = self._detect_executable_patterns(payload)
        encoding = self._detect_encoding(payload)

        import hashlib

        payload_hash = hashlib.sha256(payload[:1000]).hexdigest()[:16]  # First 1KB

        return PayloadAnalysis(
            entropy=entropy,
            has_executable=has_executable,
            has_malware_signatures=len(suspicious_strings) > 0,
            suspicious_strings=suspicious_strings[:5],  # Top 5
            encoding=encoding,
            size_bytes=len(payload),
            payload_hash=payload_hash,
        )

    def _calculate_entropy(self, data: bytes) -> float:
        """Calculate Shannon entropy (0-8, higher = more random/encrypted)"""
        if not data:
            return 0.0

        byte_counts = [0] * 256
        for byte in data:
            byte_counts[byte] += 1

        entropy = 0.0
        data_len = len(data)

        for count in byte_counts:
            if count > 0:
                probability = count / data_len
                entropy -= probability * (probability ** 0.5)  # Log2 approximation

        return min(8.0, entropy * 1.44)  # Scale to 0-8

    def _find_suspicious_patterns(self, payload: bytes) -> List[str]:
        """Find suspicious patterns in payload"""
        suspicious = []

        try:
            payload_str = payload.decode("utf-8", errors="ignore")

            for pattern in self.MALWARE_PATTERNS:
                if re.search(pattern, payload_str, re.IGNORECASE):
                    suspicious.append(pattern)
        except:
            pass

        return suspicious

    def _detect_executable_patterns(self, payload: bytes) -> bool:
        """Detect executable file signatures (PE, ELF, etc.)"""
        if len(payload) < 4:
            return False

        # PE executable (Windows)
        if payload[:2] == b"MZ":
            return True

        # ELF executable (Linux)
        if payload[:4] == b"\x7fELF":
            return True

        # Mach-O (macOS)
        if payload[:4] in [b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf"]:
            return True

        return False

    def _detect_encoding(self, payload: bytes) -> str:
        """Detect payload encoding type"""
        if len(payload) == 0:
            return "Empty"

        # Check for common encodings
        try:
            payload.decode("utf-8")
            return "UTF-8"
        except:
            pass

        try:
            payload.decode("ascii")
            return "ASCII"
        except:
            pass

        # High entropy = likely binary/encrypted
        entropy = self._calculate_entropy(payload)
        if entropy > 6.0:
            return "Binary/Encrypted"

        return "Unknown"

    def _extract_payload(self, packet) -> Optional[bytes]:
        """Extract raw payload data from packet"""
        try:
            from scapy.layers.inet import TCP, UDP, Raw

            if packet.haslayer(Raw):
                return bytes(packet[Raw].load)

            # For TCP without explicit Raw layer
            if packet.haslayer(TCP):
                tcp_payload = packet[TCP].payload
                if tcp_payload:
                    return bytes(tcp_payload)

            # For UDP without explicit Raw layer
            if packet.haslayer(UDP):
                udp_payload = packet[UDP].payload
                if udp_payload:
                    return bytes(udp_payload)
        except:
            pass

        return None

    def _get_protocol_name(self, proto_num: int) -> str:
        """Convert IP protocol number to name"""
        protocols = {
            1: "ICMP",
            6: "TCP",
            17: "UDP",
            41: "IPv6",
            47: "GRE",
            50: "ESP",
            51: "AH",
        }
        return protocols.get(proto_num, f"Protocol-{proto_num}")

    def _parse_tcp_flags(self, flags) -> List[str]:
        """Parse TCP flags into readable list"""
        flag_names = []
        if flags & 0x01:
            flag_names.append("FIN")
        if flags & 0x02:
            flag_names.append("SYN")
        if flags & 0x04:
            flag_names.append("RST")
        if flags & 0x08:
            flag_names.append("PSH")
        if flags & 0x10:
            flag_names.append("ACK")
        if flags & 0x20:
            flag_names.append("URG")
        return flag_names

    def _parse_ip_flags(self, flags) -> List[str]:
        """Parse IP flags"""
        flag_names = []
        if flags & 0x02:
            flag_names.append("DF")  # Don't Fragment
        if flags & 0x01:
            flag_names.append("MF")  # More Fragments
        return flag_names

    def _get_ether_type(self, ether_type: int) -> str:
        """Convert EtherType to name"""
        types = {0x0800: "IPv4", 0x0806: "ARP", 0x86DD: "IPv6"}
        return types.get(ether_type, f"0x{ether_type:04x}")

    def _get_dns_type(self, dns_type: int) -> str:
        """Convert DNS type to name"""
        types = {
            1: "A",
            2: "NS",
            5: "CNAME",
            15: "MX",
            28: "AAAA",
            33: "SRV",
            255: "ANY",
        }
        return types.get(dns_type, f"Type-{dns_type}")

    def _detect_application_protocol(self, port: int) -> str:
        """Detect application protocol from port"""
        return self.PORT_SERVICES.get(port, f"Unknown-{port}")

    def get_traffic_signature(self, analysis: Dict[str, Any]) -> str:
        """Generate traffic signature for pattern matching"""
        try:
            l3 = analysis.get("l3", {})
            l4 = analysis.get("l4", {})
            l7 = analysis.get("l7", {})

            sig_parts = [
                l3.get("protocol", "?"),
                f"{l4.get('protocol', '?')}",
                f"{l4.get('dst_port', '?')}",
            ]

            if l7:
                sig_parts.append(l7.get("protocol", "?"))

            return ":".join(sig_parts)
        except:
            return "UNKNOWN"
