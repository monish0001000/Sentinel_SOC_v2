import { motion } from "framer-motion";
import { AlertTriangle, Shield, Clock, MapPin, Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Threat } from "@/data/mockData";

interface ThreatCardProps {
  threat: Threat;
  index: number;
  compact?: boolean;
}

export const ThreatCard = ({ threat, index, compact = false }: ThreatCardProps) => {
  const severityConfig = {
    critical: {
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/30",
      icon: AlertTriangle,
    },
    high: {
      color: "text-threat-high",
      bg: "bg-threat-high/10",
      border: "border-threat-high/30",
      icon: AlertTriangle,
    },
    medium: {
      color: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/30",
      icon: Shield,
    },
    low: {
      color: "text-success",
      bg: "bg-success/10",
      border: "border-success/30",
      icon: Shield,
    },
  };

  const actionConfig = {
    blocked: "action-blocked",
    allowed: "action-allowed",
    "rate-limited": "action-rate-limited",
  };

  const config = severityConfig[threat.severity];
  const Icon = config.icon;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        className={cn(
          "p-3 rounded-lg glass-card border transition-all hover:bg-card/60 cursor-pointer group",
          config.border,
          threat.severity === "critical" && "threat-pulse"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-1.5 rounded-md", config.bg)}>
              <Icon className={cn("w-4 h-4", config.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{threat.type}</span>
                <span className={cn("severity-badge", config.bg, config.color)}>
                  {threat.severity}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">{threat.sourceIp}</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </motion.div>
    );
  }

  const isNew = (threat as any).isNew;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "p-4 rounded-lg glass-card border transition-all hover:bg-card/60",
        config.border,
        threat.severity === "critical" && "threat-pulse",
        isNew && "update-glow"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", config.bg)}>
            <Icon className={cn("w-5 h-5", config.color)} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{threat.type}</h3>
            <p className="text-xs text-muted-foreground font-mono">{threat.sourceIp}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("severity-badge", config.bg, config.color)}>
            {threat.severity}
          </span>
          <span className={cn("action-badge", actionConfig[threat.actionTaken])}>
            {threat.actionTaken}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-3">{threat.description}</p>

      {/* AI Confidence & Explanation */}
      <div className="p-2.5 rounded-md bg-muted/30 border border-border/50 mb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Brain className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">AI Analysis</span>
          <span className="text-xs font-mono text-primary ml-auto">
            {threat.aiConfidence}% confidence
          </span>
        </div>
        <p className="text-xs text-muted-foreground font-mono leading-relaxed">
          {threat.aiExplanation}
        </p>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{threat.timestamp}</span>
        </div>
        {threat.location && (
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>{threat.location}</span>
          </div>
        )}
        {threat.targetPort !== undefined && threat.targetPort > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Port:</span>
            <span className="font-mono text-foreground">{threat.targetPort}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};