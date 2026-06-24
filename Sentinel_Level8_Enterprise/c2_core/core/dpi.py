from scapy.all import IP, TCP, UDP, Raw
from scapy.layers.http import HTTPRequest
import re

class DPIEngine:
    def __init__(self):
        self.signatures = {
            "bittorrent": [b"BitTorrent protocol", b"\x13BitTorrent"],
            "ssh": [b"SSH-"],
            "tls": [b"\x16\x03\x01", b"\x16\x03\x02", b"\x16\x03\x03"], # TLS Handshake
            "http": [b"GET ", b"POST ", b"HEAD ", b"HTTP/"],
            "rdp": [b"\x03\x00\x00"], # Common TPU header start
        }
        # Precompute regex for faster matching if complex strings needed
        self.malicious_patterns = [
            re.compile(b"eval\(base64_decode"),  # PHP Shell
            re.compile(b"/etc/passwd"),           # LFI
            re.compile(b"union select"),          # SQLi
        ]

    def identify_protocol(self, payload: bytes) -> str:
        """
        Identify application protocol from raw payload bytes.
        """
        if not payload:
            return "unknown"
            
        for name, sigs in self.signatures.items():
            for sig in sigs:
                if isinstance(sig, bytes) and payload.startswith(sig):
                    return name
        
        # Heuristic checks
        if b"User-Agent:" in payload:
            return "http"
            
        return "unknown"

    def analyze_risk(self, payload: bytes) -> dict:
        """
        Scan payload for malicious signatures.
        """
        risks = []
        if not payload:
            return {"risk_score": 0, "alerts": []}

        for pattern in self.malicious_patterns:
            if pattern.search(payload):
                risks.append(f"Detected suspicious pattern: {pattern.pattern}")

        score = len(risks) * 25 # simple scoring
        return {
            "risk_score": min(score, 100),
            "alerts": risks,
            "is_malicious": score > 50
        }

    def inspect_packet(self, packet_data: bytes) -> dict:
        """
        Parse raw packet data (from WinDivert) and analyze.
        """
        try:
            # We use Scapy to parse the raw IP packet
            pkt = IP(packet_data)
            protocol = "unknown"
            payload = b""

            if pkt.haslayer(TCP):
                payload = bytes(pkt[TCP].payload)
                protocol = self.identify_protocol(payload)
            elif pkt.haslayer(UDP):
                payload = bytes(pkt[UDP].payload)
                # Check for DNS
                if pkt[UDP].dport == 53 or pkt[UDP].sport == 53:
                    protocol = "dns"
                else:
                    protocol = self.identify_protocol(payload)

            risk_analysis = self.analyze_risk(payload)

            return {
                "src": pkt.src,
                "dst": pkt.dst,
                "proto": protocol, # inferred from DPI
                "transport": "tcp" if pkt.haslayer(TCP) else "udp",
                "risk": risk_analysis
            }
        except Exception as e:
            # Packet parse error (maybe non-IP)
            return {"error": str(e)}
