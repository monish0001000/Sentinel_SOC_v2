# collectors/IMPLEMENTATION_GUIDE.md
# Quick Start: Enhanced Network Collector Implementation

## Complete Example - Minimal Setup

```python
# example_usage.py
import asyncio
import os
from core.event_bus import EventBus
from collectors.network_monitor import NetworkMonitor

# Setup
bus = EventBus()

# Create enhanced monitor with minimal config
monitor = NetworkMonitor(
    bus=bus,
    virustotal_api_key=os.getenv("VIRUSTOTAL_API_KEY"),
    abuseipdb_api_key=os.getenv("ABUSEIPDB_API_KEY"),
    enable_reputation_check=True,  # API keys optional, can run without
    enable_dpi=True,  # Always enabled if scapy available
)

# Subscribe to events
async def on_network_event(event):
    print(f"[EVENT] {event.get('protocol')} from {event.get('src_ip')}")
    
    # Access reputation data
    if "reputation" in event:
        rep = event["reputation"]
        risk = rep.get("combined_risk_score", 0)
        if risk > 50:
            print(f"  ⚠️ HIGH RISK: {risk:.1f}")
    
    # Access DPI data
    if "dpi" in event:
        dpi = event["dpi"]
        l7 = dpi.get("l7", {})
        if l7:
            print(f"  Protocol: {l7.get('protocol')}")
    
    # Check for anomalies
    if "anomalies" in event:
        for anomaly in event["anomalies"]:
            print(f"  🚨 {anomaly.get('type')}: {anomaly.get('description')}")

bus.subscribe("network_event", on_network_event)

# Start monitoring
if __name__ == "__main__":
    monitor.start(packet_count=100)  # Capture 100 packets
```

## Advanced Example - With Risk Scoring Integration

```python
# advanced_usage.py
import asyncio
import os
import threading
from core.event_bus import EventBus
from collectors.network_monitor import NetworkMonitor
from ai.risk_scoring import RiskScorer

# Setup
bus = EventBus()
risk_scorer = RiskScorer(bus)

# Create monitor
monitor = NetworkMonitor(
    bus=bus,
    virustotal_api_key=os.getenv("VIRUSTOTAL_API_KEY"),
    abuseipdb_api_key=os.getenv("ABUSEIPDB_API_KEY"),
    enable_reputation_check=True,
    enable_dpi=True,
)

# Alert handler for high-risk events
async def on_high_risk_alert(event):
    risk_score = event.get("risk_score", 0)
    src_ip = event.get("source_ip", "Unknown")
    
    if risk_score > 60:
        print(f"🚨 CRITICAL ALERT: Risk {risk_score:.1f} from {src_ip}")
        print(f"   Sources: {event.get('sources')}")
        
        # Take action - could trigger SOAR playbook
        # await soar_engine.trigger_playbook("isolate_ip", src_ip)

bus.subscribe("alert", on_high_risk_alert)

# Periodic reporting
async def report_loop():
    while True:
        await asyncio.sleep(60)  # Every minute
        
        stats = monitor.get_statistics()
        report = risk_scorer.export_risk_report()
        
        print(f"\n[REPORT] Packets: {stats['packets_processed']}")
        print(f"         Threats: {stats['threats_detected']}")
        print(f"         Global Risk: {report['global_risk_score']:.1f}/100")
        print(f"         High-Risk Hosts: {len(report['high_risk_hosts'])}")

# Run monitoring in background
def run_monitor():
    monitor.start()

if __name__ == "__main__":
    # Start monitor thread
    monitor_thread = threading.Thread(target=run_monitor, daemon=True)
    monitor_thread.start()
    
    # Run reporting loop
    asyncio.run(report_loop())
```

## Configuration Options

### Enable/Disable Features

```python
# Full featured (requires API keys for optimal results)
monitor = NetworkMonitor(
    bus=bus,
    virustotal_api_key="vt_key",
    abuseipdb_api_key="abuse_key",
    enable_reputation_check=True,
    enable_dpi=True,
)

# DPI only (no API calls)
monitor = NetworkMonitor(
    bus=bus,
    enable_reputation_check=False,
    enable_dpi=True,
)

# Reputation only (requires API keys)
monitor = NetworkMonitor(
    bus=bus,
    virustotal_api_key="vt_key",
    abuseipdb_api_key="abuse_key",
    enable_reputation_check=True,
    enable_dpi=False,
)

# Minimal (no extra processing)
monitor = NetworkMonitor(
    bus=bus,
    enable_reputation_check=False,
    enable_dpi=False,
)
```

### Cache Configuration

```python
from datetime import timedelta

# Create monitor
monitor = NetworkMonitor(bus, ...)

# Change cache TTL (default: 24 hours)
monitor.reputation.cache_ttl = timedelta(hours=12)  # Shorter TTL
monitor.reputation.cache_ttl = timedelta(days=7)    # Longer TTL

# Get cache stats
stats = monitor.reputation.get_cache_stats()
print(f"Cache hit rate: {stats['hit_rate_percent']:.1f}%")
print(f"Cached entries: {stats['cache_size']}")

# Clear cache manually
monitor.reputation.clear_cache()

# Monitor API quotas
remaining = stats['abuseipdb_calls_remaining']
print(f"AbuseIPDB quota: {remaining}/15 remaining today")
```

## Event Processing Patterns

### Pattern 1: Threat Detection

```python
async def threat_detector(event):
    """Extract and process threat data"""
    
    src_ip = event.get("src_ip")
    reputation = event.get("reputation", {})
    
    # Check reputation
    risk_score = reputation.get("combined_risk_score", 0)
    if risk_score > 70:  # High threshold
        threat_types = reputation.get("threat_types", [])
        print(f"Threat detected: {src_ip} -> {threat_types}")
        return True
    
    # Check anomalies
    anomalies = event.get("anomalies", [])
    for anomaly in anomalies:
        if anomaly.get("severity") == "critical":
            print(f"Critical anomaly: {anomaly.get('type')}")
            return True
    
    return False

bus.subscribe("network_event", threat_detector)
```

### Pattern 2: Protocol-Specific Analysis

```python
async def http_analyzer(event):
    """Analyze HTTP traffic specifically"""
    
    protocol = event.get("protocol", "").upper()
    if protocol != "TCP":
        return
    
    dst_port = event.get("dst_port", 0)
    if dst_port not in [80, 8080]:  # HTTP ports
        return
    
    dpi = event.get("dpi", {})
    l7 = dpi.get("l7", {})
    
    if l7.get("protocol") == "HTTP":
        method = l7.get("method")
        uri = l7.get("uri")
        user_agent = l7.get("user_agent")
        
        print(f"HTTP {method} {uri}")
        if user_agent:
            print(f"  User-Agent: {user_agent}")

bus.subscribe("network_event", http_analyzer)
```

### Pattern 3: DPI-Based Filtering

```python
async def payload_analyzer(event):
    """Analyze suspicious payloads"""
    
    dpi = event.get("dpi", {})
    payload = dpi.get("payload", {})
    
    if not payload:
        return
    
    # Check for executables
    if payload.get("has_executable"):
        print(f"⚠️ Executable detected in payload")
        print(f"   Size: {payload.get('size_bytes')} bytes")
        print(f"   Hash: {payload.get('payload_hash')}")
    
    # Check entropy
    entropy = payload.get("entropy", 0)
    if entropy > 7.5:
        print(f"⚠️ Highly encrypted/compressed payload")
        print(f"   Entropy: {entropy:.2f}")
    
    # Check patterns
    patterns = payload.get("suspicious_strings", [])
    if patterns:
        print(f"⚠️ Suspicious patterns found:")
        for pattern in patterns[:5]:  # Show first 5
            print(f"   - {pattern}")

bus.subscribe("network_event", payload_analyzer)
```

### Pattern 4: Risk Trend Monitoring

```python
async def risk_monitor(event):
    """Monitor risk scores over time"""
    
    src_ip = event.get("src_ip")
    reputation = event.get("reputation", {})
    
    if not src_ip or not reputation:
        return
    
    risk_score = reputation.get("combined_risk_score", 0)
    
    # Track risk trend for this IP
    if not hasattr(risk_monitor, "trends"):
        risk_monitor.trends = {}
    
    if src_ip not in risk_monitor.trends:
        risk_monitor.trends[src_ip] = []
    
    risk_monitor.trends[src_ip].append(risk_score)
    
    # Keep last 100 scores
    if len(risk_monitor.trends[src_ip]) > 100:
        risk_monitor.trends[src_ip] = risk_monitor.trends[src_ip][-100:]
    
    # Detect escalation (risk increasing rapidly)
    scores = risk_monitor.trends[src_ip]
    if len(scores) >= 3:
        recent_avg = sum(scores[-3:]) / 3
        historical_avg = sum(scores[:-3]) / len(scores[:-3]) if len(scores) > 3 else 0
        
        if recent_avg > historical_avg + 20:
            print(f"🔴 Risk escalation for {src_ip}")
            print(f"   Recent: {recent_avg:.1f}, Historical: {historical_avg:.1f}")

bus.subscribe("network_event", risk_monitor)
```

## Testing & Validation

### Unit Test Example

```python
# test_dpi_analyzer.py
import unittest
from collectors.dpi_analyzer import DPIAnalyzer

class TestDPIAnalyzer(unittest.TestCase):
    def setUp(self):
        self.dpi = DPIAnalyzer()
    
    def test_entropy_calculation(self):
        """Test entropy calculation for different payloads"""
        # Highly random (should be ~7-8)
        random_payload = bytes(range(256)) * 4
        entropy = self.dpi._calculate_entropy(random_payload)
        self.assertGreater(entropy, 6.5)
        
        # Repetitive (should be < 2)
        repetitive = b"AAAA" * 100
        entropy = self.dpi._calculate_entropy(repetitive)
        self.assertLess(entropy, 2)
    
    def test_executable_detection(self):
        """Test executable signature detection"""
        # PE executable header
        pe_header = b"MZ" + b"\x00" * 100
        has_exec = self.dpi._detect_executable_patterns(pe_header)
        self.assertTrue(has_exec)
        
        # ELF header
        elf_header = b"\x7fELF" + b"\x00" * 100
        has_exec = self.dpi._detect_executable_patterns(elf_header)
        self.assertTrue(has_exec)

class TestReputationAnalyzer(unittest.TestCase):
    def test_cache_functionality(self):
        """Test cache hit/miss tracking"""
        from collectors.reputation_analyzer import ReputationAnalyzer
        
        reputation = ReputationAnalyzer()
        
        # Initial lookup (miss)
        self.assertEqual(reputation.cache_misses, 0)
        
        # Manually cache a score
        from collectors.reputation_analyzer import ReputationScore
        score = ReputationScore(
            entity="192.0.2.1",
            entity_type="ip",
            virustotal_score=0.2,
            virustotal_detections=1,
            abuseipdb_score=10,
            abuseipdb_reports=2,
            combined_risk_score=15,
            is_blacklisted=False,
            threat_types=["spammer"],
            last_analysis_date="2024-06-17",
            is_cached=False,
            confidence=0.9,
            metadata={}
        )
        reputation._cache_score("192.0.2.1", score)
        
        # Retrieve (should be hit)
        cached = reputation._get_cached_score("192.0.2.1")
        self.assertIsNotNone(cached)
        self.assertEqual(reputation.cache_hits, 1)

if __name__ == "__main__":
    unittest.main()
```

## Performance Tuning

### Optimize for Throughput

```python
# Disable features not needed
monitor = NetworkMonitor(
    bus=bus,
    enable_reputation_check=False,  # Skip API calls
    enable_dpi=True,  # Keep DPI for local analysis
)

# Disable payload analysis for very high throughput
monitor.dpi.MAX_PAYLOAD_SIZE = 0  # Don't analyze payloads
```

### Optimize for Accuracy

```python
# Enable all features with longer cache
from datetime import timedelta

monitor = NetworkMonitor(
    bus=bus,
    virustotal_api_key="...",
    abuseipdb_api_key="...",
    enable_reputation_check=True,
    enable_dpi=True,
)

# Use longer cache TTL
monitor.reputation.cache_ttl = timedelta(days=7)

# Process more carefully
monitor.dpi_analyzer.ENABLE_DEEP_ANALYSIS = True
```

### Memory-Constrained Environment

```python
# Limit cache size and history
monitor = NetworkMonitor(bus=bus)
monitor.reputation.cache_ttl = timedelta(hours=1)

# Reduce IP tracking
monitor.ip_activity_map = {}  # Clear tracking
monitor.port_scan_threshold = 50  # Higher threshold

# Process events synchronously
monitor.running = False  # Stop async loop
```

---

**See Also:**
- [UPGRADED_COLLECTOR_INTEGRATION.md](../UPGRADED_COLLECTOR_INTEGRATION.md) - Full architecture guide
- [DPI Analyzer API](./dpi_analyzer.py) - Implementation details
- [Reputation Analyzer API](./reputation_analyzer.py) - API reference
