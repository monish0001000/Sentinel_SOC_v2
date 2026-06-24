import { useWebSocket } from "@/hooks/useWebSocket";
import { ShieldAlert, Activity, Network, Monitor, Cpu, HardDrive, MemoryStick, Terminal, Server, Globe, Lock, Wifi } from "lucide-react";
import SelfHealingWidget from "@/components/dashboard/SelfHealingWidget";
import PredictiveRiskChart from "@/components/dashboard/PredictiveRiskChart";

// --- Components ---

const StatCard = ({
  title,
  value,
  icon: Icon,
  trend,
  color = "blue",
  delay = 0,
}: {
  title: string;
  value: string | number;
  icon: any;
  trend?: string;
  color?: "blue" | "red" | "purple" | "cyan";
  delay?: number;
}) => {
  const colorStyles = {
    blue: "from-blue-500/10 via-blue-900/5 to-transparent border-blue-500/20 text-blue-400 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.2)]",
    red: "from-red-500/10 via-red-900/5 to-transparent border-red-500/20 text-red-400 hover:border-red-400/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.2)]",
    purple: "from-purple-500/10 via-purple-900/5 to-transparent border-purple-500/20 text-purple-400 hover:border-purple-400/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]",
    cyan: "from-cyan-500/10 via-cyan-900/5 to-transparent border-cyan-500/20 text-cyan-400 hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)]",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${colorStyles[color]} p-6 transition-all duration-500 group animate-in fade-in slide-in-from-bottom-4`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Background Noise & Grid */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:15px_15px] [mask-image:radial-gradient(black,transparent)] opacity-30" />

      <div className="relative z-10 flex justify-between items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-white/5 border border-white/10">
              <Icon className="w-4 h-4 opacity-80" />
            </div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">{title}</p>
          </div>

          <div className="flex items-baseline gap-1">
            <h2 className="text-4xl font-black tracking-tighter text-white font-mono shadow-black drop-shadow-lg">{value}</h2>
          </div>

          {trend && (
            <div className="flex items-center gap-2 py-1 px-2 rounded-full bg-white/5 w-fit border border-white/5">
              <div className="h-1.5 w-1.5 rounded-full bg-current animate-pulse shadow-[0_0_5px_currentColor]" />
              <p className="text-[10px] font-mono opacity-80 uppercase tracking-wider">{trend}</p>
            </div>
          )}
        </div>

        {/* Animated Ring */}
        <div className="absolute -right-8 -top-8 w-32 h-32 opacity-20 group-hover:opacity-40 transition-opacity">
          <div className="absolute inset-0 border-2 border-dashed border-current rounded-full animate-[spin_20s_linear_infinite]" />
          <div className="absolute inset-4 border border-current rounded-full animate-[spin_15s_linear_infinite_reverse]" />
        </div>
      </div>
    </div>
  );
};

const MetricBar = ({ label, value, max = 100, color = "bg-blue-500", subtext }: { label: string, value: number, max?: number, color?: string, subtext?: string }) => {
  const percent = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-2 group">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          {label}
        </span>
        <div className="text-right">
          <span className="text-lg font-mono font-bold text-white">{value.toFixed(1)}</span>
          <span className="text-[10px] text-gray-500 ml-1">%</span>
        </div>
      </div>
      <div className="h-2 w-full bg-black/50 border border-white/10 rounded-full overflow-hidden relative">
        <div
          className={`h-full ${color} shadow-[0_0_10px_currentColor] transition-all duration-500 ease-out`}
          style={{ width: `${percent}%` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)] translate-x-[-100%] group-hover:animate-[shimmer_2s_infinite]" />
      </div>
      {subtext && <p className="text-[10px] font-mono text-gray-600 truncate border-l border-white/10 pl-2">{subtext}</p>}
    </div>
  );
};

// --- Main Page ---

export default function DashboardHome() {
  const { connected, metrics, alerts, systemInfo, riskScore, adaptiveActions, agents } = useWebSocket();
  const activeAgent = agents && agents.length > 0 ? agents[0] : null;

  // Deduplicate alerts
  const uniqueAlerts = alerts.reduce((acc: any[], current: any) => {
    const existingIndex = acc.findIndex((item: any) => item.message === current.message);
    if (existingIndex > -1) acc[existingIndex] = current;
    else acc.push(current);
    return acc;
  }, []);

  // Use dynamic CPU/MEM from metrics if available, else static
  const cpuUsage = metrics?.cpu_usage || 0;
  const memUsage = metrics?.memory_usage || 0;

  // Risk Level Color
  const riskColor = riskScore > 80 ? "red" : riskScore > 50 ? "orange" : "emerald";

  return (
    <div className="space-y-6 min-h-screen pb-10 font-sans selection:bg-blue-500/30">

      {/* HEROBANNER: SENTINEL COMMAND */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#050A14] shadow-2xl group">
        <div className="absolute top-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay" />

        {/* Abstract Data Streams Background */}
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-blue-900/10 to-transparent skew-x-12 opacity-30" />

        <div className="p-8 relative z-10 flex flex-col md:flex-row justify-between items-end gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <ShieldAlert className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <h1 className="text-5xl font-black text-white tracking-tighter">
                  SENTINEL<span className="text-blue-500">.CORE</span>
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-blue-400/60 uppercase tracking-widest pl-1">
              <span>v2.5.0 STABLE</span>
              <span className="w-1 h-1 bg-current rounded-full" />
              <span>ENCRYPTION: AES-256</span>
              <span className="w-1 h-1 bg-current rounded-full ml-auto md:ml-0" />
              <span className="hidden md:inline">AUTHORIZED ACCESS ONLY</span>
            </div>
          </div>

          {/* Connection Status Module */}
          <div className="flex items-center gap-6 bg-black/20 border border-white/5 p-3 rounded-xl backdrop-blur-sm">
            <div className="text-right space-y-0.5">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">System Status</p>
              <p className={`text-sm font-bold font-mono ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                {connected ? 'OPERATIONAL' : 'CONNECTION LOST'}
              </p>
            </div>
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_15px_#10b981]' : 'bg-red-500 shadow-[0_0_15px_#ef4444]'}`} />
              {connected && <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-50" />}
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="text-right space-y-0.5">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Uptime</p>
              <p className="text-sm font-mono text-gray-300">{new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full">

        {/* LEFT COLUMN: METRICS & SYSTEM (8 cols) */}
        <div className="xl:col-span-8 space-y-6 flex flex-col">

          {/* STAT CARDS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Net Flow" value={metrics?.packet_rate ?? "0"} icon={Activity} trend="Pkts/Sec" color="blue" delay={100} />
            <StatCard title="Risk Score" value={riskScore} icon={ShieldAlert} trend="Predictive AI" color={riskColor as any} delay={150} />
            <StatCard title="Active Threats" value={alerts?.length ?? 0} icon={ShieldAlert} trend="Detected" color="red" delay={200} />
            <StatCard title="Sessions" value={metrics?.connections ?? "0"} icon={Network} trend="Live" color="cyan" delay={300} />
          </div>

          {/* AI ACTIONS & SELF HEALING */}
          {adaptiveActions && adaptiveActions.length > 0 && (
            <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-left-4">
              <div className="flex items-center gap-2 mb-3">
                <Monitor className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-bold text-blue-300 uppercase tracking-widest">Adaptive SOC Actions</h3>
              </div>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                {adaptiveActions.map((action, i) => (
                  <div key={i} className="flex justify-between items-center text-xs p-2 bg-black/20 rounded border border-white/5">
                    <span className="text-gray-300 font-mono">{action.reason || "Automatic Response"}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${action.status === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {action.playbook?.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 6 WIDGETS (New) */}
          <div className="flex-1 min-h-[300px] rounded-2xl border border-white/10 bg-[#0B101A] overflow-hidden relative shadow-lg flex flex-col">
            <div className="p-5 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Level 6 Intelligence</h3>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
              <PredictiveRiskChart currentRisk={riskScore} />
              <SelfHealingWidget alerts={alerts} />
            </div>
          </div>

          {/* ORIGINAL SYSTEM HEALTH MATRIX (Restored) */}
          <div className="flex-1 min-h-[300px] rounded-2xl border border-white/10 bg-[#0B101A] overflow-hidden relative shadow-lg flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-widest">System Health Matrix</h3>
              </div>
              <div className="flex gap-2 text-[10px] font-mono text-gray-500">
                <span>ID: {activeAgent?.hostname || systemInfo?.hostname || "..."}</span>
                <span className="text-gray-700">|</span>
                <span>IPv4: {activeAgent?.ip || systemInfo?.ip || "..."}</span>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
              {/* LEFT: Gauge Clusters */}
              <div className="space-y-6">
                <MetricBar
                  label="Processing Unit (CPU)"
                  value={activeAgent?.stats?.cpu ?? cpuUsage}
                  color="bg-gradient-to-r from-blue-600 to-cyan-400"
                  subtext={activeAgent ? "Agent Telemetry" : (systemInfo?.cpu_model || "Waiting for Telemetry...")}
                />
                <MetricBar
                  label="Memory Allocation (RAM)"
                  value={activeAgent?.stats?.memory ?? memUsage}
                  color="bg-gradient-to-r from-purple-600 to-pink-400"
                  subtext={activeAgent ? "Agent RAM Usage" : `Available: ${systemInfo?.ram_total || "..."}`}
                />
                <MetricBar
                  label="Storage Volume (Primary)"
                  value={activeAgent?.stats?.disk ?? 75}
                  color="bg-gradient-to-r from-emerald-600 to-green-400"
                  subtext={activeAgent ? "Agent Disk Usage" : `Free Space: ${systemInfo?.disk_free || "..."}`}
                />
              </div>

              {/* RIGHT: System Details & Status */}
              <div className="bg-black/20 rounded-xl p-6 border border-white/5 flex flex-col justify-center space-y-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/5 rounded-lg">
                    <Server className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Operating System</p>
                    <p className="text-white font-mono text-sm">{activeAgent?.os || systemInfo?.os || "Waiting for Agent..."}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-bold border border-green-500/20">KERNEL SECURE</span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-bold border border-blue-500/20">SENTINEL DAEMON: ACTIVE</span>
                    </div>
                  </div>
                </div>

                <div className="h-[1px] w-full bg-white/5" />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Security Patch</p>
                    <p className="text-gray-300 font-mono text-xs">v2026.01.06-L6</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Encryption</p>
                    <div className="flex items-center gap-1.5 text-gray-300 font-mono text-xs">
                      <Lock className="w-3 h-3 text-gold-400" /> AES-GCM-256
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: FEED (4 cols) */}
        <div className="xl:col-span-4 h-full min-h-[500px]">
          <div className="h-full rounded-2xl border border-white/10 bg-[#080C14] flex flex-col shadow-2xl overflow-hidden relative">
            {/* Header */}
            <div className="p-4 bg-white/5 border-b border-white/10 flex justify-between items-center z-20">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-red-500 animate-pulse" />
                <h3 className="text-xs font-black text-white uppercase tracking-[0.2em]">Live Threat Stream</h3>
              </div>
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500/40" />
                <div className="w-2 h-2 rounded-full bg-amber-500/40" />
                <div className="w-2 h-2 rounded-full bg-green-500/40" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-0 relative font-mono text-xs bg-black/50">
              {/* Matrix Rain Effect Placeholder / Scanlines */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(0,255,0,0.03)_1px,transparent_1px)] bg-[size:100%_4px] opacity-20 z-10" />

              {uniqueAlerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-40">
                  <Globe className="w-16 h-16 text-blue-500 mb-4 animate-spin-slow" style={{ animationDuration: '20s' }} />
                  <p className="text-blue-400 font-bold tracking-widest uppercase mb-1">Sector Clear</p>
                  <p className="text-gray-500 text-[10px]">Scanning Vector Space...</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {uniqueAlerts.map((alert: any, i: number) => (
                    <div key={i} className="border-b border-white/5 p-4 hover:bg-white/5 transition-colors group relative cursor-crosshair">
                      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${alert.level === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-500' :
                          alert.level === 'high' ? 'bg-orange-500/10 border-orange-500/30 text-orange-500' :
                            'bg-blue-500/10 border-blue-500/30 text-blue-500'
                          }`}>
                          {alert.level?.toUpperCase() || "INFO"}
                        </span>
                        <span className="text-gray-600 text-[10px]">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-gray-300 mb-2 leading-relaxed">{alert.message}</p>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500">
                        <span>SRC: {alert.source || "UNKNOWN"}</span>
                        <span>•</span>
                        <span>ID: {alert.id || "---"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-white/5 bg-black/80 flex justify-between items-center text-[10px] text-gray-500 font-mono z-20">
              <span className="flex items-center gap-2">
                <Wifi className="w-3 h-3" />
                LINK_ESTABLISHED
              </span>
              <span className="animate-pulse text-green-500">● MONITORING</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
