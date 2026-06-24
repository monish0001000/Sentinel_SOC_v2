import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { LogEntry } from "@/data/mockData";
import { Radio, Pause, Play, ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LiveLogViewerProps {
  logs: LogEntry[];
  onLogClick?: (log: LogEntry) => void;
}

type FilterType = "all" | "critical" | "suspicious" | "allowed";

export const LiveLogViewer = ({ logs, onLogClick }: LiveLogViewerProps) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [displayedLogs, setDisplayedLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const levelConfig = {
    info: { color: "text-threat-info", bg: "bg-threat-info/10", label: "INFO" },
    warning: { color: "text-warning", bg: "bg-warning/10", label: "WARN" },
    error: { color: "text-threat-high", bg: "bg-threat-high/10", label: "ERR" },
    critical: { color: "text-destructive", bg: "bg-destructive/10", label: "CRIT" },
  };

  const statusConfig = {
    allowed: { color: "text-success", icon: "●" },
    blocked: { color: "text-destructive", icon: "◉" },
    suspicious: { color: "text-warning", icon: "◐" },
  };

  // Simulate live streaming
  useEffect(() => {
    if (isPaused) return;

    let index = 0;
    const interval = setInterval(() => {
      if (index < logs.length) {
        setDisplayedLogs((prev) => {
          const newLog = { ...logs[index], id: `${logs[index].id}-${Date.now()}` };
          return [newLog, ...prev].slice(0, 100);
        });
        index++;
      } else {
        index = 0;
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [logs, isPaused]);

  // Auto scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [displayedLogs, autoScroll]);

  const filteredLogs = displayedLogs.filter((log) => {
    if (filter === "all") return true;
    if (filter === "critical") return log.level === "critical" || log.level === "error";
    if (filter === "suspicious") return log.status === "suspicious" || log.status === "blocked";
    if (filter === "allowed") return log.status === "allowed";
    return true;
  });

  const filterOptions: { value: FilterType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "critical", label: "Critical" },
    { value: "suspicious", label: "Suspicious" },
    { value: "allowed", label: "Allowed" },
  ];

  return (
    <div className="rounded-lg glass-card border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio
              className={cn(
                "w-4 h-4",
                isPaused ? "text-muted-foreground" : "text-success live-pulse"
              )}
            />
            <span className="text-sm font-medium text-foreground">Live Stream</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {filteredLogs.length} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="hidden md:flex items-center gap-1 mr-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={filter === option.value ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilter(option.value)}
                className={cn(
                  "h-6 px-2 text-[10px] font-mono",
                  filter === option.value && "bg-primary/20 text-primary hover:bg-primary/30"
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {/* Auto-scroll */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "h-7 gap-1.5 text-xs",
              autoScroll && "text-primary"
            )}
          >
            <ChevronDown className={cn("w-3.5 h-3.5", autoScroll && "text-primary")} />
            Auto
          </Button>

          {/* Pause/Play */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
            className="h-7 gap-1.5 text-xs"
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Log Stream */}
      <div
        ref={scrollRef}
        className="font-mono text-xs max-h-[500px] overflow-y-auto bg-background/50"
      >
        <AnimatePresence mode="popLayout">
          {(filteredLogs || []).map((log) => { // Safety check
            if (!log) return null; // Extra safety
            const level = levelConfig[log.level] || levelConfig["info"]; // Fallback if level is missing
            const status = statusConfig[log.status || "allowed"]; // Fallback if status is missing

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onClick={() => onLogClick?.(log)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 border-b border-border/30 hover:bg-accent/30 cursor-pointer transition-colors log-entry-new",
                  log.level === "critical" && "bg-destructive/5"
                )}
              >
                {/* Timestamp */}
                <span className="text-muted-foreground w-24 flex-shrink-0">
                  {log.timestamp}
                </span>

                {/* Status Indicator */}
                <span className={cn("w-4 text-center", status.color)}>
                  {status.icon}
                </span>

                {/* Level Badge */}
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-bold w-10 text-center",
                    level.bg,
                    level.color
                  )}
                >
                  {level.label}
                </span>

                {/* Source */}
                <span className="text-primary w-16 flex-shrink-0 truncate">
                  {log.source}
                </span>

                {/* Protocol & Port */}
                {log.protocol && (
                  <span className="text-muted-foreground w-16 flex-shrink-0">
                    {log.protocol}
                    {log.port ? `:${log.port}` : ""}
                  </span>
                )}

                {/* IP */}
                <span className="text-foreground w-28 flex-shrink-0 truncate">
                  {log.ip || "—"}
                </span>

                {/* Message */}
                <span className="text-muted-foreground flex-1 truncate">
                  {log.message}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredLogs.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <span>Waiting for log stream...</span>
          </div>
        )}
      </div>
    </div>
  );
};