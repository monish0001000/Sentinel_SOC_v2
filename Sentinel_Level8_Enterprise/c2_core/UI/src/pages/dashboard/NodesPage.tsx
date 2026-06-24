import { Server, Cpu, HardDrive, Activity, Laptop } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";

const NodesPage = () => {
    // Access real-time agent list and risk scores from WebSocket
    const { agents, hostRiskScores } = useWebSocket();

    // No need for local state or polling anymore!
    // But if agents is empty, maybe fallback to fetch? 
    // The WS should send the list on connect or change.
    // However, if we want robust initial load, we can keep the fetch but sync it with context?
    // Let's rely on WS for "All Hosts" view as per plan.

    return (
        <div className="space-y-6 text-foreground p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Server className="w-8 h-8 text-indigo-400" />
                        Network Nodes (EDR)
                    </h1>
                    <p className="text-muted-foreground font-mono text-xs">REMOTE ENDPOINT MONITORING & RESPONSE</p>
                </div>
                <div className="flex gap-2">
                    <div className="glass-card px-3 py-1 text-xs font-mono flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        {agents.filter(a => a.status?.toLowerCase() === 'online').length} ONLINE
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agents.map(agent => {
                    const risk = hostRiskScores?.[agent.id] || 0;
                    return (
                        <div key={agent.id} className={cn(
                            "glass-card p-6 rounded-xl border relative overflow-hidden transition-all",
                            // Visual indication of Online is Green Border
                            "border-indigo-500/30"
                        )}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-3 items-center">
                                    <div className={cn("p-2 rounded-lg", "bg-indigo-500/10")}>
                                        <Laptop className={cn("w-6 h-6", "text-indigo-400")} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg">{agent.hostname}</h3>
                                        <p className="text-xs font-mono text-muted-foreground">{agent.ip}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={cn(
                                        "px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider",
                                        "bg-emerald-500/20 text-emerald-400"
                                    )}>
                                        ONLINE
                                    </span>
                                    {/* Risk Score Badge */}
                                    {risk > 0 && (
                                        <span className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-bold tracking-wider border",
                                            risk > 70 ? "bg-red-950/50 border-red-500 text-red-500" :
                                                risk > 30 ? "bg-amber-950/50 border-amber-500 text-amber-500" :
                                                    "bg-blue-950/50 border-blue-500 text-blue-500"
                                        )}>
                                            RISK: {risk}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* OS Info */}
                                <div className="text-xs text-muted-foreground border-b border-white/5 pb-2">
                                    {agent.os}
                                </div>

                                {/* Stats */}
                                {agent.stats ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-white/5 p-2 rounded flex flex-col items-center">
                                            <Cpu className="w-4 h-4 text-cyan-400 mb-1" />
                                            <span className="text-xs font-bold">{agent.stats.cpu ? agent.stats.cpu.toFixed(1) : 0}%</span>
                                            <span className="text-[10px] text-muted-foreground">CPU</span>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded flex flex-col items-center">
                                            <Activity className="w-4 h-4 text-purple-400 mb-1" />
                                            <span className="text-xs font-bold">{agent.stats.memory ? agent.stats.memory.toFixed(1) : 0}%</span>
                                            <span className="text-[10px] text-muted-foreground">RAM</span>
                                        </div>
                                        <div className="bg-white/5 p-2 rounded flex flex-col items-center">
                                            <HardDrive className="w-4 h-4 text-orange-400 mb-1" />
                                            <span className="text-xs font-bold">{agent.stats.disk ? agent.stats.disk.toFixed(1) : 0}%</span>
                                            <span className="text-[10px] text-muted-foreground">DISK</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-20 flex items-center justify-center text-xs text-muted-foreground italic">
                                        Agent Offline - No Telemetry
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {agents.length === 0 && (
                    <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-xl">
                        <Server className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                        <h3 className="text-lg font-bold text-muted-foreground">No Agents Connected</h3>
                        <p className="text-sm text-muted-foreground/50 max-w-md mx-auto mt-2">
                            Run the <code>agent/sentinel_agent.py</code> script on a client machine to connect it to this SOC.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NodesPage;
