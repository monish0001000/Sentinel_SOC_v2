import { useWebSocket } from "@/hooks/useWebSocket";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Brain, Send, Sparkles, AlertTriangle, Shield, Lightbulb, Network, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mockAIResponses } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const quickActions = [
  { id: "explain", label: "Explain this log", icon: Lightbulb },
  { id: "suspicious", label: "Is this suspicious?", icon: AlertTriangle },
  { id: "attackType", label: "Attack type", icon: Shield },
  { id: "recommendation", label: "Security tips", icon: Sparkles },
];

/* ──────────────────────────────────────────────────────────────
   Packet Analysis Intelligence
   ────────────────────────────────────────────────────────────── */

function generatePacketAnalysis(message: string): string {
  // Try to extract structured data from the prompt
  const protoMatch = message.match(/Protocol:\*?\*?\s*(\w+)/i);
  const statusMatch = message.match(/Status:\*?\*?\s*(\w+)/i);
  const processMatch = message.match(/Process:\*?\*?\s*([\w.]+)/i);
  const domainMatch = message.match(/Domain:\*?\*?\s*([\w.\-]+)/i);
  const serviceMatch = message.match(/Service:\*?\*?\s*([\w\-]+)/i);
  const dstPortMatch = message.match(/:(\d+)\n/);
  const srcIpMatch = message.match(/Connection:\*?\*?\s*([\d.]+)/);
  const dstIpMatch = message.match(/→\s*([\d.]+)/);

  const proto = protoMatch?.[1] || "Unknown";
  const status = statusMatch?.[1] || "Unknown";
  const processName = processMatch?.[1] || "Unknown";
  const domain = domainMatch?.[1] || "N/A";
  const service = serviceMatch?.[1] || "Unknown";
  const dstPort = dstPortMatch?.[1] ? parseInt(dstPortMatch[1]) : 0;
  const srcIp = srcIpMatch?.[1] || "?";
  const dstIp = dstIpMatch?.[1] || "?";

  let analysis = `## 🔍 Packet Analysis Report\n\n`;
  analysis += `**Connection:** \`${srcIp}\` → \`${dstIp}\`\n`;
  analysis += `**Protocol:** ${proto} | **Service:** ${service} | **Process:** ${processName}\n\n`;

  // ── Protocol-specific analysis ──
  analysis += `### Protocol Assessment\n`;
  if (service === "HTTPS" || dstPort === 443) {
    analysis += `✅ **TLS/HTTPS** — Traffic is encrypted. This is expected behavior for web browsing, API calls, and cloud services.\n`;
  } else if (service === "HTTP" || dstPort === 80) {
    analysis += `⚠️ **HTTP (Unencrypted)** — Cleartext traffic detected. Data could be intercepted via MITM attacks. Consider upgrading to HTTPS.\n`;
  } else if (service === "DNS" || dstPort === 53) {
    analysis += `ℹ️ **DNS Query** — Standard name resolution. Check if the queried domain is legitimate. Consider DNS-over-HTTPS for privacy.\n`;
  } else if (service === "SSH" || dstPort === 22) {
    analysis += `🔐 **SSH** — Encrypted remote shell. Verify this is an authorized administrative session. Monitor for brute-force attempts.\n`;
  } else if (service === "RDP" || dstPort === 3389) {
    analysis += `🚨 **RDP** — Remote Desktop Protocol. High-risk service frequently targeted by attackers. Ensure MFA is enabled and access is restricted.\n`;
  } else if (service === "SMB" || dstPort === 445) {
    analysis += `⚠️ **SMB** — Server Message Block. Used for file sharing. Verify this is internal traffic. SMB exposed externally is a critical vulnerability.\n`;
  } else if (dstPort > 1024 && dstPort < 10000) {
    analysis += `⚠️ **Non-standard port** (${dstPort}) — This port is not associated with a well-known service. Could indicate custom applications or potential C2 communication.\n`;
  } else {
    analysis += `ℹ️ Standard ${proto} traffic on port ${dstPort}.\n`;
  }

  // ── Status analysis ──
  analysis += `\n### Connection Status\n`;
  if (status === "BLOCKED") {
    analysis += `🛡️ **BLOCKED** — This connection was blocked by the Sentinel firewall. The firewall rule matched this traffic pattern. No data was exchanged.\n`;
  } else if (status === "ESTABLISHED") {
    analysis += `🟢 **ESTABLISHED** — Active connection. Data exchange is occurring between the endpoints.\n`;
  } else if (status === "SYN_SENT") {
    analysis += `🟡 **SYN_SENT** — TCP handshake initiated but not yet completed. If many SYN_SENT connections appear from the same source, this could indicate a **SYN flood attack** or **port scanning**.\n`;
  }

  // ── Process legitimacy ──
  analysis += `\n### Process Legitimacy\n`;
  const safeProcesses = ["chrome.exe", "firefox.exe", "msedge.exe", "svchost.exe", "system", "explorer.exe", "code.exe", "python.exe", "node.exe", "searchhost.exe", "runtimebroker.exe", "lsass.exe", "services.exe"];
  const lowerProc = processName.toLowerCase();
  if (safeProcesses.includes(lowerProc)) {
    analysis += `✅ **${processName}** is a known legitimate process. However, verify the process path matches the expected system directory to rule out masquerading.\n`;
  } else if (lowerProc === "unknown") {
    analysis += `⚠️ Process name could not be resolved. This may indicate elevated privilege requirements or a short-lived process. Further investigation recommended.\n`;
  } else {
    analysis += `🔍 **${processName}** is not in the common safe process list. Verify this application is authorized to make network connections. Check the executable path and digital signature.\n`;
  }

  // ── Threat indicators ──
  analysis += `\n### Threat Assessment\n`;
  let threatLevel = "LOW";

  if (status === "BLOCKED") {
    threatLevel = "MITIGATED";
    analysis += `- **C2 Communication:** Unlikely — connection was blocked\n`;
  } else {
    if (dstPort > 1024 && dstPort < 10000 && !["HTTP-ALT", "HTTPS-ALT", "Redis", "MySQL", "PostgreSQL", "Sentinel-WS"].includes(service)) {
      threatLevel = "MEDIUM";
      analysis += `- **C2 Communication:** ⚠️ Non-standard port usage could indicate beaconing to a command-and-control server\n`;
    } else {
      analysis += `- **C2 Communication:** Low risk — standard service port\n`;
    }

    if (service === "HTTP") {
      analysis += `- **Data Exfiltration:** ⚠️ Unencrypted channel — payload content could be monitored for sensitive data leaks\n`;
    } else {
      analysis += `- **Data Exfiltration:** Low risk — encrypted or internal traffic\n`;
    }

    if (dstPort === 3389 || dstPort === 22) {
      analysis += `- **Lateral Movement:** ⚠️ Remote access protocol detected — monitor for unusual login patterns\n`;
    }
  }

  analysis += `\n**Overall Threat Level:** ${
    threatLevel === "LOW" ? "🟢 LOW" :
    threatLevel === "MEDIUM" ? "🟡 MEDIUM" :
    threatLevel === "MITIGATED" ? "🛡️ MITIGATED" : "🔴 HIGH"
  }\n`;

  // ── Recommendations ──
  analysis += `\n### Recommendations\n`;
  if (status === "BLOCKED") {
    analysis += `1. Review the firewall rule that blocked this connection\n2. Add the source IP to a watchlist if repeated attempts occur\n3. No immediate action required — threat was mitigated\n`;
  } else {
    analysis += `1. Verify the process path and digital signature of **${processName}**\n`;
    analysis += `2. Check if the destination domain/IP has a clean reputation\n`;
    if (service === "HTTP") {
      analysis += `3. Investigate why unencrypted HTTP is being used — potential downgrade attack\n`;
    }
    if (dstPort > 1024 && dstPort < 10000) {
      analysis += `3. Monitor for periodic beacon patterns to this destination\n`;
    }
    analysis += `4. Cross-reference with SIEM logs for correlated events\n`;
  }

  return analysis;
}


/* ──────────────────────────────────────────────────────────────
   AI Analyst Page
   ────────────────────────────────────────────────────────────── */

const AIAnalystPage = () => {
  const { alerts, metrics, stats, firewall } = useWebSocket();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello, SOC Analyst. I'm Sentinel AI, your security intelligence assistant. I can help you analyze logs, identify attack patterns, and provide security recommendations.\n\n💡 **Tip:** Click the **Ask AI** button on any packet in the Live Traffic view to automatically send it here for analysis.",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auto-scroll to latest message ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Auto-inject packet data from Traffic page ──
  useEffect(() => {
    const pendingPrompt = localStorage.getItem("sentinel_ai_prompt");
    if (pendingPrompt) {
      localStorage.removeItem("sentinel_ai_prompt");
      setInput(pendingPrompt);
      // Auto-send after a brief delay for smooth transition
      const timer = setTimeout(() => {
        handleSend(pendingPrompt);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      // Focus input on normal navigation
      inputRef.current?.focus();
    }
  }, []); // Only run on mount

  const handleSend = (message: string) => {
    if (!message.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      let responseContent = "";
      const lowerMsg = message.toLowerCase();

      // ── Packet analysis detection ──
      if (lowerMsg.includes("analyze this network packet") || lowerMsg.includes("full packet json")) {
        responseContent = generatePacketAnalysis(message);
      }
      // ── Standard threat/alert queries ──
      else if (lowerMsg.includes("threat") || lowerMsg.includes("alert")) {
        if (alerts.length === 0) {
          responseContent = "I am currently detecting **0 active threats**. The system appears stable and secure.";
        } else {
          responseContent = `I have identified **${alerts.length} active threats** currently targeting the system.\n\nMost recent alert: **[${alerts[alerts.length - 1].level}] ${alerts[alerts.length - 1].message}**.\n\nRecommended Action: Investigate the source IP immediately and verify firewall rules.`;
        }
      } else if (lowerMsg.includes("status") || lowerMsg.includes("system")) {
        responseContent = `**System Status Report**:\n- Packet Rate: ${metrics?.packet_rate}/sec\n- Active Connections: ${metrics?.connections}\n- Total Packets Processed: ${stats?.totalPackets}\n\nThe system is operational.`;
      } else if (lowerMsg.includes("firewall") || lowerMsg.includes("block")) {
        if (lowerMsg.includes("auto")) {
          responseContent = `**Firewall Auto-Block** is currently **${firewall.autoBlock ? "ENABLED" : "DISABLED"}**.\n\nStatus: **${firewall.active ? "Active Enforcement" : "Bypassed"}**`;
        } else if (lowerMsg.includes("why") && (lowerMsg.includes("ip") || lowerMsg.includes("port"))) {
          const ipMatch = message.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          const portMatch = message.match(/port\s*(\d+)/i);

          if (ipMatch) {
            const rule = firewall.rules.find(r => r.target === ipMatch[0]);
            if (rule) {
              responseContent = `IP **${ipMatch[0]}** was blocked on **${new Date(rule.timestamp).toLocaleTimeString()}**.\n\nReason: **${rule.reason}**`;
            } else {
              responseContent = `IP **${ipMatch[0]}** is NOT currently blocked by the firewall.`;
            }
          } else if (portMatch) {
            const port = parseInt(portMatch[1]);
            const rule = firewall.rules.find(r => r.target === port);
            if (rule) {
              responseContent = `Port **${port}** was blocked on **${new Date(rule.timestamp).toLocaleTimeString()}**.\n\nReason: **${rule.reason}**`;
            } else {
              responseContent = `Port **${port}** is NOT currently blocked.`;
            }
          } else {
            responseContent = `I can explain why an IP or Port was blocked. Please specify the IP or Port number.`;
          }
        } else if (lowerMsg.includes("list") || lowerMsg.includes("show")) {
          responseContent = `**Firewall Block List**:\n- Blocked IPs: ${firewall.blockedIPs.length}\n- Blocked Ports: ${firewall.blockedPorts.length}\n\nTop blocked: ${firewall.blockedIPs.slice(0, 3).join(", ")}...`;
        } else {
          responseContent = `**Firewall Status**:\n- Active: ${firewall.active}\n- Auto-Block: ${firewall.autoBlock}\n- Rules Active: ${firewall.rules.length}\n\nI can help you manage the firewall or explain blocks.`;
        }
      } else {
        const responseKey = Object.keys(mockAIResponses).find((key) =>
          message.toLowerCase().includes(key.toLowerCase())
        ) as keyof typeof mockAIResponses || "default";
        if (responseKey !== "default" && mockAIResponses[responseKey as keyof typeof mockAIResponses]) {
          responseContent = mockAIResponses[responseKey as keyof typeof mockAIResponses].join("\n\n");
        } else {
          responseContent = "I am analyzing the latest security telemetry. I can help you identifying threats, explaining logs, or checking system status. What would you like to know?";
        }
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: responseContent,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1200);
  };

  const handleQuickAction = (action: string) => {
    const prompts = {
      explain: "Explain the latest brute force attack log entry",
      suspicious: "Is the SSH login attempt from 192.168.1.105 suspicious?",
      attackType: "What type of attack is happening based on recent logs?",
      recommendation: "What security recommendations do you have?",
    };
    handleSend(prompts[action as keyof typeof prompts]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Brain className="w-7 h-7 text-primary" />
          AI Security Analyst
        </h1>
        <p className="text-muted-foreground">Ask questions about logs, threats, or analyze packets from Live Traffic</p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 cyber-border bg-card/30 backdrop-blur-sm rounded-lg overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-4 h-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-lg p-4",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground font-mono text-sm"
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                <span className="text-xs opacity-50 mt-2 block">
                  {message.timestamp}
                </span>
              </div>
            </motion.div>
          ))}

          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Brain className="w-4 h-4 text-primary animate-pulse" />
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 border-t border-border">
          <div className="flex gap-2 flex-wrap">
            {quickActions.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction(action.id)}
                className="gap-2 text-xs"
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card/50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex gap-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about logs, threats, or security recommendations..."
              className="flex-1 bg-background/50"
            />
            <Button type="submit" className="gap-2">
              <Send className="w-4 h-4" />
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIAnalystPage;
