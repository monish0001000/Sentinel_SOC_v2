export interface Threat {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  sourceIp: string;
  timestamp: string;
  description: string;
  location?: string;
  aiConfidence: number;
  actionTaken: "blocked" | "allowed" | "rate-limited";
  aiExplanation: string;
  targetPort?: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
  ip?: string;
  status: "allowed" | "blocked" | "suspicious";
  protocol?: string;
  port?: number;
}

export const mockThreats: Threat[] = [
  {
    id: "1",
    type: "Brute Force Attack",
    severity: "critical",
    sourceIp: "192.168.1.105",
    timestamp: "14:32:18",
    description: "Credential stuffing detected. 847 auth failures in 10 min.",
    location: "Russia",
    aiConfidence: 98.5,
    actionTaken: "blocked",
    aiExplanation: "Pattern matches known credential stuffing tool. Source IP flagged in 12 threat intel feeds.",
    targetPort: 22,
  },
  {
    id: "2",
    type: "SQL Injection",
    severity: "high",
    sourceIp: "10.0.0.42",
    timestamp: "14:28:05",
    description: "Malicious SQL payload in POST /api/users endpoint.",
    location: "China",
    aiConfidence: 94.2,
    actionTaken: "blocked",
    aiExplanation: "Union-based injection attempt. Payload signature: SELECT FROM users WHERE 1=1.",
    targetPort: 443,
  },
  {
    id: "3",
    type: "Port Scan",
    severity: "medium",
    sourceIp: "172.16.0.88",
    timestamp: "14:15:33",
    description: "SYN scan detected. 1024 ports probed in 45 seconds.",
    location: "Internal",
    aiConfidence: 87.1,
    actionTaken: "rate-limited",
    aiExplanation: "Reconnaissance activity. Internal source suggests compromised host or rogue device.",
    targetPort: 0,
  },
  {
    id: "4",
    type: "Geo-Anomaly Login",
    severity: "medium",
    sourceIp: "203.45.67.89",
    timestamp: "13:58:12",
    description: "User 'admin' login from Vietnam. Previous: US.",
    location: "Vietnam",
    aiConfidence: 76.8,
    actionTaken: "allowed",
    aiExplanation: "Impossible travel detected. 8,500 miles in 2 hours. Flagged for review.",
    targetPort: 443,
  },
  {
    id: "5",
    type: "Malware C2 Beacon",
    severity: "critical",
    sourceIp: "192.168.5.22",
    timestamp: "13:45:00",
    description: "Outbound connection to known C2 infrastructure.",
    location: "Internal",
    aiConfidence: 99.1,
    actionTaken: "blocked",
    aiExplanation: "Host sending encrypted beacons every 60s. IP matches Emotet C2 list.",
    targetPort: 8443,
  },
  {
    id: "6",
    type: "DNS Tunneling",
    severity: "high",
    sourceIp: "10.0.2.155",
    timestamp: "13:22:47",
    description: "Unusual DNS query patterns. High entropy subdomain requests.",
    location: "Internal",
    aiConfidence: 91.3,
    actionTaken: "blocked",
    aiExplanation: "Base64-encoded data in DNS TXT queries. Likely data exfiltration attempt.",
    targetPort: 53,
  },
];

export const mockLogs: LogEntry[] = [
  {
    id: "log1",
    timestamp: "14:32:18.847",
    level: "critical",
    source: "sshd",
    message: "AUTH FAIL root@192.168.1.105 [attempt 847/847]",
    ip: "192.168.1.105",
    status: "blocked",
    protocol: "SSH",
    port: 22,
  },
  {
    id: "log2",
    timestamp: "14:32:17.234",
    level: "critical",
    source: "sshd",
    message: "AUTH FAIL admin@192.168.1.105 [attempt 846/847]",
    ip: "192.168.1.105",
    status: "blocked",
    protocol: "SSH",
    port: 22,
  },
  {
    id: "log3",
    timestamp: "14:31:55.102",
    level: "error",
    source: "waf",
    message: "SQLi BLOCKED: UNION SELECT * FROM users--",
    ip: "10.0.0.42",
    status: "blocked",
    protocol: "HTTPS",
    port: 443,
  },
  {
    id: "log4",
    timestamp: "14:28:05.445",
    level: "warning",
    source: "firewall",
    message: "SYN_SCAN ports 1-1024 from 172.16.0.88",
    ip: "172.16.0.88",
    status: "suspicious",
    protocol: "TCP",
    port: 0,
  },
  {
    id: "log5",
    timestamp: "14:25:33.889",
    level: "info",
    source: "auth",
    message: "MFA SUCCESS user:john.doe@10.0.0.15",
    ip: "10.0.0.15",
    status: "allowed",
    protocol: "HTTPS",
    port: 443,
  },
  {
    id: "log6",
    timestamp: "14:22:18.223",
    level: "warning",
    source: "ids",
    message: "C2_BEACON outbound to 185.234.72.11:8443",
    ip: "192.168.2.44",
    status: "blocked",
    protocol: "TCP",
    port: 8443,
  },
  {
    id: "log7",
    timestamp: "14:20:00.001",
    level: "info",
    source: "system",
    message: "PATCH KB5034441 applied successfully",
    status: "allowed",
    protocol: "SYSTEM",
  },
  {
    id: "log8",
    timestamp: "14:18:45.667",
    level: "error",
    source: "edr",
    message: "MALWARE QUARANTINE Trojan.GenericKD in /tmp/update.exe",
    ip: "192.168.5.22",
    status: "blocked",
    protocol: "FILE",
  },
  {
    id: "log9",
    timestamp: "14:15:30.112",
    level: "info",
    source: "vpn",
    message: "VPN CONNECT user:jane.smith@203.45.67.89",
    ip: "203.45.67.89",
    status: "allowed",
    protocol: "IKEv2",
    port: 500,
  },
  {
    id: "log10",
    timestamp: "14:12:00.998",
    level: "warning",
    source: "waf",
    message: "XSS PATTERN in request body - sanitized",
    ip: "185.22.33.44",
    status: "blocked",
    protocol: "HTTPS",
    port: 443,
  },
];

export const mockChartData = [
  { time: "00:00", threats: 2, packets: 14500 },
  { time: "02:00", threats: 1, packets: 8900 },
  { time: "04:00", threats: 0, packets: 5200 },
  { time: "06:00", threats: 3, packets: 17800 },
  { time: "08:00", threats: 5, packets: 32400 },
  { time: "10:00", threats: 8, packets: 45600 },
  { time: "12:00", threats: 12, packets: 52100 },
  { time: "14:00", threats: 15, packets: 63400 },
];

export const riskScoreTrend = [
  { time: "00:00", score: 32 },
  { time: "04:00", score: 28 },
  { time: "08:00", score: 45 },
  { time: "12:00", score: 67 },
  { time: "14:00", score: 78 },
];

export const topAttackingIPs = [
  { ip: "192.168.1.105", attacks: 847, country: "RU", blocked: true },
  { ip: "10.0.0.42", attacks: 234, country: "CN", blocked: true },
  { ip: "185.22.33.44", attacks: 156, country: "UA", blocked: true },
  { ip: "172.16.0.88", attacks: 89, country: "INT", blocked: false },
  { ip: "203.45.67.89", attacks: 45, country: "VN", blocked: false },
];

export const targetedPorts = [
  { port: 22, name: "SSH", attempts: 1247 },
  { port: 443, name: "HTTPS", attempts: 892 },
  { port: 3389, name: "RDP", attempts: 456 },
  { port: 445, name: "SMB", attempts: 234 },
  { port: 53, name: "DNS", attempts: 178 },
];

export const threatDistribution = [
  { name: "Brute Force", value: 45, color: "hsl(0, 84%, 60%)" },
  { name: "SQL Injection", value: 25, color: "hsl(25, 95%, 53%)" },
  { name: "XSS", value: 15, color: "hsl(48, 96%, 55%)" },
  { name: "Port Scan", value: 10, color: "hsl(187, 94%, 50%)" },
  { name: "C2 Beacon", value: 5, color: "hsl(271, 91%, 65%)" },
];

export const mockAIResponses = {
  explain: [
    "**ANALYSIS SUMMARY**",
    "Attack Vector: SSH Brute Force",
    "Confidence: 98.5%",
    "MITRE ATT&CK: T1110.001",
    "",
    "**INDICATORS**",
    "• 847 failed auth attempts in 600s",
    "• Source IP in 12 threat intel feeds",
    "• Dictionary attack pattern detected",
    "",
    "**ACTION TAKEN**: IP blocked at perimeter firewall",
  ],
  suspicious: [
    "**VERDICT: HIGH RISK**",
    "",
    "This activity is confirmed malicious:",
    "• Velocity: 1.4 attempts/second (threshold: 0.1)",
    "• Target: Privileged accounts (root, admin)",
    "• Origin: Known botnet infrastructure",
    "• Tooling: Matches Hydra/Medusa signatures",
  ],
  attackType: [
    "**CLASSIFICATION**",
    "",
    "Primary: Credential Stuffing",
    "Secondary: Password Spraying",
    "",
    "**MITRE ATT&CK Mapping**",
    "• T1110.001 - Brute Force",
    "• T1078 - Valid Accounts",
    "• T1133 - External Remote Services",
  ],
  recommendation: [
    "**IMMEDIATE ACTIONS**",
    "1. ✓ Source IP blocked (auto)",
    "2. ✓ Rate limiting enabled",
    "3. → Review account lockout policy",
    "4. → Enable GeoIP restrictions",
    "",
    "**LONG-TERM**",
    "• Implement fail2ban (threshold: 3)",
    "• Deploy MFA for all SSH access",
    "• Consider certificate-based auth",
  ],
};

export const agentStatus = {
  connected: true,
  packetRate: 2847,
  aiMode: "active" as const,
  lastSync: "2 sec ago",
  uptime: "14d 7h 23m",
  version: "2.4.1",
};