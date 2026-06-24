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
    | "error";

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
    policies: any[]; // NGFW Policies
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
        hostRiskScores: {}
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
                            } else if (payload.type === "rule_added") {
                                // basic sync
                                newState.rules = [...newState.rules, payload.rule];
                            } else if (payload.type === "policy_updated") {
                                newState.policies = payload.policies;
                                console.log("🔄 Policies Synced via WS", newState.policies);
                            }
                            // ... other firewall logic ...

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
