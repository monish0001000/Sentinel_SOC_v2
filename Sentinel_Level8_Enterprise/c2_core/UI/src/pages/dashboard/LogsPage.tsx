import { motion } from "framer-motion";
import { Radio, Shield, AlertTriangle, Activity, Zap } from "lucide-react";
import { LiveLogViewer } from "@/components/dashboard/LiveLogViewer";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { LogEntry } from "@/data/mockData";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";

const LogsPage = () => {
  const { logs, stats, connectionStatus } = useWebSocket();
  const { toast } = useToast();

  const handleLogClick = (log: LogEntry) => {
    toast({
      title: `${log.level.toUpperCase()}: ${log.source}`,
      description: log.message,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Live Stream</h1>
            <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border ${
              connectionStatus === "connected"
                ? "bg-success/10 border-success/20"
                : "bg-muted/10 border-border/20"
            }`}>
              <Radio className={`w-3 h-3 ${
                connectionStatus === "connected" ? "text-success live-pulse" : "text-muted-foreground"
              }`} />
              <span className={`text-[10px] font-mono font-medium ${
                connectionStatus === "connected" ? "text-success" : "text-muted-foreground"
              }`}>
                {connectionStatus === "connected" ? "STREAMING" : connectionStatus.toUpperCase()}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Real-time packet inspection and threat detection</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30">
          <Zap className={connectionStatus === "connected" ? "w-4 h-4 text-success live-pulse" : "w-4 h-4 text-muted-foreground"} />
          <span className="text-xs font-mono text-muted-foreground">
            {connectionStatus === "connected" ? "LIVE FEED" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Live Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <div className="glass-card rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Packets</span>
          </div>
          <AnimatedCounter value={stats.totalPackets} className="text-lg font-bold font-mono text-foreground" />
        </div>

        <div className="glass-card rounded-lg p-3 border border-destructive/20">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Blocked</span>
          </div>
          <AnimatedCounter value={stats.threatsBlocked} className="text-lg font-bold font-mono text-destructive" />
        </div>

        <div className="glass-card rounded-lg p-3 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Suspicious</span>
          </div>
          <AnimatedCounter value={stats.suspicious} className="text-lg font-bold font-mono text-warning" />
        </div>

        <div className="glass-card rounded-lg p-3 border border-success/20">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-success" />
            <span className="text-[10px] text-muted-foreground font-medium uppercase">Allowed</span>
          </div>
          <AnimatedCounter value={stats.allowed} className="text-lg font-bold font-mono text-success" />
        </div>
      </motion.div>

      {/* Live Log Viewer */}
      <LiveLogViewer logs={logs} onLogClick={handleLogClick} />
    </div>
  );
};

export default LogsPage;
