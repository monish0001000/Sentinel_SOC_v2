# UPGRADED_COLLECTOR_INTEGRATION.md
# Deep Packet Inspection & Reputation Analysis Integration Guide

## Overview

The Sentinel Level 8 Enterprise system has been upgraded with:

1. **Deep Packet Inspection (DPI)** - Wireshark-style packet analysis
2. **Reputation Analysis** - VirusTotal & AbuseIPDB integration  
3. **Enhanced Risk Scoring** - Combines reputation + DPI + traditional alerts
4. **Comprehensive Threat Inventory** - Tracks all detected threats

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Network Traffic                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │ NetworkMonitor   │
                    │ (Enhanced)       │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
    ┌───────▼────────┐  ┌───▼──────────┐  ┌──▼──────────────┐
    │ DPIAnalyzer    │  │ Reputation   │  │ Anomaly         │
    │                │  │ Analyzer     │  │ Detection       │
    │ • L2/L3/L4/L7  │  │              │  │                 │
    │ • Payload      │  │ • VirusTotal │  │ • Port scans    │
    │ • Signatures   │  │ • AbuseIPDB  │  │ • Executables   │
    └────────┬───────┘  └────┬─────────┘  │ • Patterns      │
             │                │            └────────┬────────┘
             └────────────────┼──────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Enriched Events    │
                    │ (to EventBus)      │
                    └──────────┬─────────┘
                               │
                    ┌──────────▼────────────┐
                    │ Enhanced RiskScorer   │
                    │                       │
                    │ • Reputation risk     │
                    │ • DPI risk            │
                    │ • Anomaly risk        │
                    │ • Global risk calc    │
                    └──────────┬────────────┘
                               │
                    ┌──────────▼────────────┐
                    │ Alerts & Risk Events  │
                    │ (to SOC Dashboard)    │
                    └───────────────────────┘
```

## Installation & Configuration

### 1. API Keys Setup

Create an environment configuration:

```bash
export VIRUSTOTAL_API_KEY="your_virustotal_api_key_here"
export ABUSEIPDB_API_KEY="your_abuseipdb_api_key_here"
```

Or add to `.env` file:

```env
# VT API: Get from https://www.virustotal.com/gui/home/upload
VIRUSTOTAL_API_KEY=your_key_here

# AbuseIPDB API: Get from https://www.abuseipdb.com/
ABUSEIPDB_API_KEY=your_key_here

# Optional: Cache settings
REPUTATION_CACHE_TTL_HOURS=24
```

### 2. Initialize Enhanced NetworkMonitor

**Before (Legacy):**
```python
from collectors.network_monitor import NetworkMonitor

monitor = NetworkMonitor(bus)
monitor.start()
```

**After (Enhanced):**
```python
import os
from collectors.network_monitor import NetworkMonitor

monitor = NetworkMonitor(
    bus=bus,
    virustotal_api_key=os.getenv("VIRUSTOTAL_API_KEY"),
    abuseipdb_api_key=os.getenv("ABUSEIPDB_API_KEY"),
    enable_reputation_check=True,  # Enable reputation analysis
    enable_dpi=True,  # Enable deep packet inspection
)
monitor.start()
```

### 3. Update main.py

Add to the imports section:

```python
from collectors.network_monitor import NetworkMonitor as EnhancedNetworkMonitor
from collectors.dpi_analyzer import DPIAnalyzer
from collectors.reputation_analyzer import ReputationAnalyzer
```

In the `async def main()` function, replace the old NetworkCollector with:

```python
# Start Enhanced Network Monitor (with DPI + Reputation)
enhanced_monitor = EnhancedNetworkMonitor(
    bus=bus,
    virustotal_api_key=os.getenv("VIRUSTOTAL_API_KEY"),
    abuseipdb_api_key=os.getenv("ABUSEIPDB_API_KEY"),
    enable_reputation_check=True,
    enable_dpi=True,
)

# Run in background thread
def run_monitor():
    enhanced_monitor.start()

monitor_thread = threading.Thread(target=run_monitor, daemon=True)
monitor_thread.start()
```

## Event Structure

### Enhanced Network Event (with DPI + Reputation)

```json
{
  "type": "network",
  "timestamp": 1234567890.123,
  "protocol": "TCP",
  "src_ip": "203.0.113.42",
  "dst_ip": "10.0.0.1",
  "src_port": 443,
  "dst_port": 443,
  "size": 1024,
  "traffic_signature": "TCP:TCP:443:HTTPS/TLS",
  
  "dpi": {
    "l2": {
      "src_mac": "aa:bb:cc:dd:ee:ff",
      "dst_mac": "ff:ee:dd:cc:bb:aa",
      "ether_type": "IPv4",
      "vlan_id": null
    },
    "l3": {
      "version": 4,
      "header_length": 5,
      "ttl": 64,
      "protocol": "TCP",
      "src_ip": "203.0.113.42",
      "dst_ip": "10.0.0.1",
      "total_length": 1024,
      "flags": ["DF"],
      "fragment_offset": 0
    },
    "l4": {
      "protocol": "TCP",
      "src_port": 443,
      "dst_port": 443,
      "sequence": 1234567890,
      "acknowledgment": 9876543210,
      "flags": ["SYN", "ACK"],
      "window_size": 65535,
      "checksum": "0x1234"
    },
    "l7": {
      "protocol": "HTTPS/TLS",
      "hostname": "api.example.com",
      "payload_size": 512
    },
    "payload": {
      "entropy": 6.2,
      "has_executable": false,
      "has_malware_signatures": false,
      "suspicious_strings": [],
      "encoding": "Binary/Encrypted",
      "size_bytes": 512,
      "payload_hash": "a1b2c3d4e5f6g7h8"
    }
  },
  
  "reputation": {
    "entity": "203.0.113.42",
    "entity_type": "ip",
    "virustotal_score": 0.15,
    "virustotal_detections": 3,
    "abuseipdb_score": 25,
    "abuseipdb_reports": 5,
    "combined_risk_score": 22.5,
    "is_blacklisted": false,
    "threat_types": ["spammer", "datacenter"],
    "is_cached": false,
    "confidence": 0.95
  },
  
  "anomalies": [
    {
      "type": "port_scan",
      "severity": "high",
      "description": "Port scan detected: 25 ports from 203.0.113.42",
      "ports_scanned": [21, 22, 23, 25, 53, 80, 443, ...]
    }
  ],
  
  "alert": {
    "severity": "high",
    "reason": "High-risk IP detected: 22.5",
    "threat_types": ["spammer", "datacenter"]
  }
}
```

## Risk Scoring Algorithm

### Combined Risk Calculation

```
Event Risk = (Reputation Risk × 0.4) + (DPI Payload Risk × 0.3) + (Anomaly Risk × 0.3)

Where:
  - Reputation Risk: 0-100 from combined VT + AbuseIPDB scores
  - DPI Payload Risk: 0-100 from entropy, executables, malware patterns
  - Anomaly Risk: 0-100 from port scans, suspicious patterns

Host Risk = (Current Risk × 0.6) + (Event Risk × 0.4) with exponential decay
Global Risk = (Max Host Risk × 0.7) + (Average Host Risk × 0.3)
```

### Threat Type Risk Weights

| Threat Type | Base Risk | Notes |
|-------------|-----------|-------|
| malware | 90 | Known malicious software |
| botnet | 85 | Bot command & control |
| ransomware | 95 | Encryption/extortion threat |
| c2 | 100 | Active command & control |
| phishing | 80 | Social engineering |
| trojan | 88 | Trojan horse malware |
| compromised | 75 | Compromised server |
| spammer | 50 | Email/network spammer |
| proxy | 35 | Proxy/anonymizer |
| vpn | 20 | VPN service |
| datacenter | 15 | Cloud/datacenter IP |

## Features & Capabilities

### 1. Deep Packet Inspection (DPI)

**Extracted Information:**
- **L2 (Ethernet):** Source/dest MAC, VLAN ID
- **L3 (IP):** Version, TTL, protocol, flags, fragment info
- **L4 (TCP/UDP):** Ports, sequence numbers, TCP flags, window size
- **L7 (Application):** 
  - HTTP: Method, URI, status code, headers
  - HTTPS: SNI (Server Name Indication)
  - DNS: Query type, query name
  - Other protocols based on port

**Payload Analysis:**
- Shannon entropy calculation (0-8, where 8 = most encrypted)
- Executable file signature detection (PE, ELF, Mach-O)
- Malware pattern matching (cmd.exe, powershell, wget, etc.)
- Encoding detection (ASCII, UTF-8, Binary, etc.)
- Payload hashing for deduplication

### 2. Reputation Analysis

**VirusTotal Integration:**
- IP reputation scoring
- Domain reputation scoring
- Detection ratio from 90+ antivirus vendors
- Last analysis date tracking
- Threat type extraction from categories

**AbuseIPDB Integration:**
- Abuse confidence score (0-100)
- Report history analysis
- Usage type detection (proxy, VPN, datacenter)
- Report category mapping

**Caching:**
- Local cache with configurable TTL (default: 24 hours)
- Reduces API calls and improves performance
- Rate limiting compliance (VT: 4 req/min, AbuseIPDB: 15 req/day)
- Cache hit statistics tracking

### 3. Anomaly Detection

**Port Scanning Detection:**
- Threshold: 10+ unique ports from same source IP
- Severity: HIGH
- Suggested Action: Isolate and investigate

**Executable Detection:**
- Identifies PE, ELF, Mach-O signatures in payloads
- Severity: CRITICAL
- Suggested Action: Immediate containment

**Malware Pattern Detection:**
- Regex patterns for command execution, obfuscation
- Severity: CRITICAL
- Suggested Action: Isolation and forensics

**High Entropy Payloads:**
- Entropy > 7.0 indicates encryption/compression
- Severity: MEDIUM
- Suggested Action: Investigate encryption source

### 4. Threat Inventory

Maintains persistent record of:
- All detected malicious IPs with threat types
- Domain reputation scores
- Threat type aggregations
- Historical threat data
- Export capabilities for incident response

## API Endpoint Examples

### Get Cache Statistics

```python
stats = monitor.reputation.get_cache_stats()
# Returns:
# {
#   "cache_size": 127,
#   "cache_hits": 3421,
#   "cache_misses": 89,
#   "hit_rate_percent": 97.5,
#   "vt_api_calls": 45,
#   "abuseipdb_api_calls": 12,
#   "abuseipdb_calls_remaining": 3,
#   "cache_ttl_hours": 24
# }
```

### Get Monitor Statistics

```python
stats = monitor.get_statistics()
# Returns:
# {
#   "packets_processed": 15234,
#   "packets_analyzed": 14891,
#   "threats_detected": 127,
#   "queue_size": 3,
#   "suspicious_ips": 42,
#   "tracked_ips": 356,
#   "reputation_cache": {...}
# }
```

### Get Risk Report

```python
from ai.risk_scoring import RiskScorer

report = risk_scorer.export_risk_report()
# Returns comprehensive threat assessment with:
# - Global risk score
# - Per-host scores
# - Threat inventory
# - High-risk hosts
# - Critical threats
```

### Get Threat Inventory

```python
inventory = risk_scorer.get_threat_inventory()
# Returns:
# {
#   "total_threats": 42,
#   "threats": {
#     "ip:203.0.113.42": {...},
#     "ip:192.0.2.15": {...},
#     ...
#   },
#   "last_updated": "2024-06-17T12:34:56"
# }
```

## Performance Considerations

### DPI Overhead
- Minimal: ~0.1-0.5ms per packet for analysis
- Payload inspection only on packets > 64 bytes
- Caching of signatures for rapid matching

### Reputation API Rate Limits
- **VirusTotal:** 4 requests/minute (free tier)
- **AbuseIPDB:** 15 requests/day (free tier)
- Cache hit rate: ~95-98% in production
- Queued lookups if rate limit approached

### Memory Usage
- DPI analyzer: ~5-10 MB
- Reputation cache: ~2-5 MB (depends on unique entities)
- Anomaly tracking: ~1-2 MB
- Total overhead: ~10-20 MB above baseline

### Recommendations for Production
1. **API Keys:** Use premium API tiers for higher quotas
2. **Caching:** Set TTL to 48-72 hours for higher hit rates
3. **Filtering:** Pre-filter internal IPs to avoid wasting API calls
4. **Threading:** Run monitor in separate thread to avoid blocking
5. **Async:** Use async reputation checks for latency-sensitive applications

## Troubleshooting

### No Reputation Data

```python
# Check API keys
print(monitor.reputation.vt_api_key)
print(monitor.reputation.abuseipdb_api_key)

# Check cache stats
stats = monitor.reputation.get_cache_stats()
print(f"API Calls Made: VT={stats['vt_api_calls']}, AbuseIPDB={stats['abuseipdb_api_calls']}")

# Clear cache if needed
monitor.reputation.clear_cache()
```

### High Memory Usage

```python
# Monitor statistics
stats = monitor.get_statistics()
print(f"Suspicious IPs tracked: {stats['suspicious_ips']}")
print(f"Queue size: {stats['queue_size']}")

# Reduce cache TTL
monitor.reputation.cache_ttl = timedelta(hours=12)

# Clear old entries
monitor.reputation.clear_cache()
```

### Rate Limit Issues

```python
# Check remaining quota
stats = monitor.reputation.get_cache_stats()
remaining = stats['abuseipdb_calls_remaining']
print(f"AbuseIPDB calls remaining: {remaining}/15")

# Increase cache TTL or disable API temporarily
if remaining < 2:
    monitor.enable_reputation = False
```

## Migration Path

### Step 1: Update Requirements

Add to `requirements.txt`:
```
aiohttp>=3.8.0      # For async API calls
scapy>=2.4.5        # For packet parsing (already included)
```

### Step 2: Update Imports

Replace in existing code:
```python
# Old
from collectors.network_monitor import NetworkMonitor

# New  
from collectors.network_monitor import NetworkMonitor  # Now enhanced
from collectors.dpi_analyzer import DPIAnalyzer
from collectors.reputation_analyzer import ReputationAnalyzer
```

### Step 3: Update Risk Scorer

```python
# Old imports still work, but new functionality available
from ai.risk_scoring import RiskScorer, ReputationRiskScorer, DPIRiskScorer

# Use enhanced methods
risk = risk_scorer.export_risk_report()
threats = risk_scorer.get_threat_inventory()
```

### Step 4: Update Dashboard Events

React component receives enriched events:
```typescript
// Event now includes:
event.dpi           // Deep packet inspection data
event.reputation    // Reputation scores
event.anomalies     // Detected anomalies
event.alert         // Enriched alert info
```

## Dashboard Integration

### Traffic Page Enhancement

The React TrafficPage component now displays:

1. **Packet Details Panel:** Shows DPI breakdown
   - L2/L3/L4/L7 headers
   - Payload analysis (entropy, encoding)
   - Traffic signatures

2. **Threat Indicators:** 
   - Reputation score badge
   - Threat type tags
   - Blacklist status

3. **Anomaly Alerts:**
   - Port scan warnings
   - Executable detection
   - Malware pattern matches

4. **Export Features:**
   - Export with full DPI data
   - Include reputation scores
   - CSV format for analysis

## Success Metrics

After deployment, monitor:

1. **Detection Improvement:**
   - % increase in threats detected
   - Mean time to detection (MTTD)
   - False positive rate

2. **Performance:**
   - API cache hit rate (target: >95%)
   - Packet analysis latency
   - Memory usage stability

3. **Operational:**
   - Number of high-risk IPs identified
   - Threat inventory size
   - Policy violations detected

---

**Last Updated:** June 2024  
**Version:** 2.0 (Enhanced with DPI + Reputation)
