import { motion } from "framer-motion";
import { AlertTriangle, Shield, Zap } from "lucide-react";
import { ThreatCard } from "@/components/dashboard/ThreatCard";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";

const ThreatsPage = () => {
  const { threats, connectionStatus } = useWebSocket();

  const criticalCount = threats.filter((t) => t.severity === "critical").length;
  const highCount = threats.filter((t) => t.severity === "high").length;
  const mediumCount = threats.filter((t) => t.severity === "medium").length;
  const lowCount = threats.filter((t) => t.severity === "low").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Threat Detection</h1>
          <p className="text-muted-foreground">Active threats and security incidents</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/30">
          <Zap className={connectionStatus === "connected" ? "w-4 h-4 text-success live-pulse" : "w-4 h-4 text-muted-foreground"} />
          <span className="text-xs font-mono text-muted-foreground">
            {connectionStatus === "connected" ? "LIVE DETECTION" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Threat Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <span className="text-sm text-muted-foreground">Critical</span>
          </div>
          <AnimatedCounter value={criticalCount} className="text-3xl font-bold text-destructive font-mono" />
        </div>
        <div className="p-4 rounded-lg bg-threat-high/10 border border-threat-high/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-threat-high" />
            <span className="text-sm text-muted-foreground">High</span>
          </div>
          <AnimatedCounter value={highCount} className="text-3xl font-bold text-threat-high font-mono" />
        </div>
        <div className="p-4 rounded-lg bg-warning/10 border border-warning/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-warning" />
            <span className="text-sm text-muted-foreground">Medium</span>
          </div>
          <AnimatedCounter value={mediumCount} className="text-3xl font-bold text-warning font-mono" />
        </div>
        <div className="p-4 rounded-lg bg-success/10 border border-success/20 glass-card">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-success" />
            <span className="text-sm text-muted-foreground">Low</span>
          </div>
          <AnimatedCounter value={lowCount} className="text-3xl font-bold text-success font-mono" />
        </div>
      </motion.div>

      {/* Threat List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Active Threats</h2>
          <span className="text-xs font-mono text-muted-foreground">
            {threats.length} detected
          </span>
        </div>
        <div className="grid gap-4">
          {threats.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground glass-card rounded-lg border border-border/30">
              <Shield className="w-12 h-12 mx-auto mb-4 text-success/50" />
              <p className="font-mono text-sm">No active threats detected</p>
              <p className="text-xs mt-1">System is secure</p>
            </div>
          ) : (
            threats.map((threat, index) => (
              <ThreatCard key={threat.id} threat={threat} index={index} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreatsPage;
