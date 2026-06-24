import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
  ReactNode,
} from "react";

/**
 * WebSocket connection state
 */
export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  | "isolated";

export interface Alert {
  message: string;
  level: string;
  timestamp: string;
}

export interface Agent {
  id: string;
  hostname: string;
  os: string;
  ip: string;
  status: string;
  last_seen: number;
  stats?: {
    cpu: number;
    memory: number;
    disk: number;
    processes: number;
  };
}

export interface FirewallState {
  active: boolean;
  autoBlock: boolean;
  panicMode: boolean;
  blockedIPs: string[];
  blockedPorts: number[];
  blockedCountries: string[];
  rules: any[];
  policies: any[];
}

/**
 * Data exposed to UI
 */
interface WebSocketState {
  connectionStatus: ConnectionStatus;
  agents: Agent[];
  logs: any[];
  metrics: any | null;
  alerts: any[];
  stats: any;
  chartData: any[];
  topIPs: any[];
  threatTypes: any[];
  targetedPorts: any[];
  systemInfo: any | null;
  firewall: FirewallState;
  packetStream: any | null;
  setFirewallState: (state: FirewallState) => void;
  adaptiveActions: any[];
  riskScore: number;
  hostRiskScores: Record<string, number>;
  siemEvents: any[];
}

/**
 * Context
 */
const WebSocketContext = createContext<WebSocketState | null>(null);

/**
 * WebSocket Provider
 */
export const WebSocketProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const socketRef = useRef<WebSocket | null>(null);

  const [state, setState] = useState<WebSocketState>({
    connectionStatus: "disconnected",
    agents: [],
    logs: [],
    metrics: null,
    alerts: [],
    stats: { totalPackets: 0, threatsBlocked: 0, suspicious: 0, allowed: 0 },
    chartData: [],
    topIPs: [],
    threatTypes: [],
    targetedPorts: [],
    systemInfo: null,
    firewall: {
      active: true,
      autoBlock: true,
      panicMode: false,
      blockedIPs: [],
      blockedPorts: [],
      blockedCountries: [],
      rules: [],
      policies: []
    },
    packetStream: null,
    setFirewallState: () => { },
    adaptiveActions: [],
    riskScore: 0,
    hostRiskScores: {},
    siemEvents: []
  });

  const setFirewallState = useCallback((firewallFn: FirewallState | ((prev: FirewallState) => FirewallState)) => {
    setState(prev => ({
      ...prev,
      firewall: typeof firewallFn === 'function' ? firewallFn(prev.firewall) : firewallFn
    }));
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      setState((prev) => ({ ...prev, connectionStatus: "connecting" }));

      // 🔗 Connect to Sentinel Agent (LOCAL)
      socket = new WebSocket("ws://127.0.0.1:8765");
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("🟢 Connected to Sentinel Agent");
        setState((prev) => ({
          ...prev,
          connectionStatus: "connected",
        }));
        // --- HANDSHAKE ---
        socket.send(JSON.stringify({ type: "ui_client" }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Debug Logging (Requested by User)
          // console.log("📥 WS Message:", data.type); 

          // 1. Critical Agent Update
          if (data.type === "agent_update") {
            console.log("📥 AGENT UPDATE RECV:", data.data);
            setState((prev) => ({
              ...prev,
              agents: data.data
            }));
          }

          // 2. Critical Firewall Update
          if (data.type === "firewall_event" || data.type === "firewall_update") {
            console.log("📥 FIREWALL UPDATE RECV:", data.payload || data);
            const payload = data.payload || data;

            setState((prev) => {
              const newState = { ...prev.firewall };

              if (payload.type === "status_change") {
                newState.active = payload.active;
                newState.panicMode = payload.panic_mode;
              } else if (payload.type === "panic_change") {
                newState.panicMode = payload.panic_mode;
              } else if (payload.type === "config_change") {
                newState.autoBlock = payload.auto_block;
              } else if (payload.type === "rule_added") {
                // Check duplicate before adding to rules list
                if (!newState.rules.some(r => r.target === payload.rule.target && r.type === payload.rule.type)) {
                  newState.rules = [...newState.rules, payload.rule];
                }
                
                if (payload.rule.type === "IP") {
                  if (!newState.blockedIPs.includes(payload.rule.target)) {
                    newState.blockedIPs = [...newState.blockedIPs, payload.rule.target];
                  }
                } else if (payload.rule.type === "Port") {
                  const portVal = parseInt(payload.rule.target);
                  if (!newState.blockedPorts.includes(portVal)) {
                    newState.blockedPorts = [...newState.blockedPorts, portVal];
                  }
                } else if (payload.rule.type === "Country") {
                  if (!newState.blockedCountries.includes(payload.rule.target)) {
                    newState.blockedCountries = [...newState.blockedCountries, payload.rule.target];
                  }
                }
              } else if (payload.type === "rule_removed") {
                newState.rules = newState.rules.filter(r => !(r.target === payload.target && r.type === payload.rule_type));
                
                if (payload.rule_type === "IP") {
                  newState.blockedIPs = newState.blockedIPs.filter(ip => ip !== payload.target);
                } else if (payload.rule_type === "Port") {
                  const portVal = parseInt(payload.target);
                  newState.blockedPorts = newState.blockedPorts.filter(port => port !== portVal);
                } else if (payload.rule_type === "Country") {
                  newState.blockedCountries = newState.blockedCountries.filter(c => c !== payload.target);
                }
              } else if (payload.type === "policy_updated" && payload.policies) {
                newState.policies = payload.policies;
              }

              return { ...prev, firewall: newState };
            });
          }

          // 3. Standard Metrics
          if (data.type === "update") {
            setState((prev) => ({
              ...prev,
              metrics: data.metrics,
              alerts: data.alerts,
              stats: data.stats || prev.stats,
              chartData: data.analytics?.chartData || prev.chartData,
              topIPs: data.analytics?.topIPs || prev.topIPs,
              threatTypes: data.analytics?.threatTypes || prev.threatTypes,
              targetedPorts: data.analytics?.targetedPorts || prev.targetedPorts,
            }));
          }

          if (data.type === "system_info") {
            setState((prev) => ({
              ...prev,
              systemInfo: data.payload
            }));
          }

          if (data.type === "packet_event") {
            setState(prev => ({ ...prev, packetStream: data.payload }));
          }

          // SIEM Live Event
          if (data.type === "siem_event") {
            setState(prev => ({
              ...prev,
              siemEvents: [data.payload, ...prev.siemEvents].slice(0, 500)
            }));
          }

          if (data.type === "risk" || data.type === "global_risk") {
            setState(prev => ({
              ...prev,
              riskScore: data.payload?.score ?? prev.riskScore,
              hostRiskScores: data.payload?.host_scores ?? prev.hostRiskScores
            }));
          }

        } catch (err) {
          console.error("Invalid WS message", err);
        }
      };

      socket.onerror = () => {
        console.error("🔴 WebSocket error");
      };

      socket.onclose = () => {
        console.warn("⚠️ WebSocket disconnected");

        // Debounce Disconnect UI
        setTimeout(() => {
          if (socket?.readyState === WebSocket.CLOSED) {
            setState((prev) => ({
              ...prev,
              connectionStatus: "disconnected",
            }));
          }
        }, 1000);

        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  const reconnect = () => {
    window.location.reload();
  };

  return (
    <WebSocketContext.Provider value={{ ...state, reconnect, setFirewallState } as any}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocket must be used inside WebSocketProvider"
    );
  }
  return {
    ...context,
    connected: context.connectionStatus === "connected",
    packetRate: context.metrics?.packet_rate ?? 0,
    threats: context.alerts ?? [],
    reconnect: (context as any).reconnect,
  };
};
