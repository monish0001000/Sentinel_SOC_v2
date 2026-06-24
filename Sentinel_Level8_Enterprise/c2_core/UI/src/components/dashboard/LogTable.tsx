import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "critical";
  source: string;
  message: string;
  ip?: string;
}

interface LogTableProps {
  logs: LogEntry[];
  onLogClick?: (log: LogEntry) => void;
}

export const LogTable = ({ logs, onLogClick }: LogTableProps) => {
  const levelConfig = {
    info: { color: "text-threat-info", bg: "bg-threat-info/10", label: "INFO" },
    warning: { color: "text-warning", bg: "bg-warning/10", label: "WARN" },
    error: { color: "text-threat-high", bg: "bg-threat-high/10", label: "ERROR" },
    critical: { color: "text-destructive", bg: "bg-destructive/10", label: "CRIT" },
  };

  return (
    <div className="rounded-lg border border-border bg-card/30 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <div className="col-span-2">Timestamp</div>
        <div className="col-span-1">Level</div>
        <div className="col-span-2">Source</div>
        <div className="col-span-2">IP Address</div>
        <div className="col-span-5">Message</div>
      </div>

      {/* Logs */}
      <div className="divide-y divide-border/50 font-mono text-sm max-h-96 overflow-y-auto">
        {logs.map((log, index) => {
          const config = levelConfig[log.level];
          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.02 }}
              onClick={() => onLogClick?.(log)}
              className={cn(
                "grid grid-cols-12 gap-4 px-4 py-2.5 hover:bg-accent/30 cursor-pointer transition-colors",
                log.level === "critical" && "bg-destructive/5"
              )}
            >
              <div className="col-span-2 text-muted-foreground text-xs">
                {log.timestamp}
              </div>
              <div className="col-span-1">
                <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold", config.bg, config.color)}>
                  {config.label}
                </span>
              </div>
              <div className="col-span-2 text-foreground truncate">{log.source}</div>
              <div className="col-span-2 text-primary text-xs">{log.ip || "—"}</div>
              <div className="col-span-5 text-muted-foreground truncate">{log.message}</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
