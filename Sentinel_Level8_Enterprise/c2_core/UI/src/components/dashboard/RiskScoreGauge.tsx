import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface RiskScoreGaugeProps {
  score: number;
  className?: string;
}

export const RiskScoreGauge = ({ score, className }: RiskScoreGaugeProps) => {
  const getScoreLevel = (score: number) => {
    if (score >= 75) return { label: "CRITICAL", color: "text-destructive", bg: "bg-destructive" };
    if (score >= 50) return { label: "HIGH", color: "text-threat-high", bg: "bg-threat-high" };
    if (score >= 25) return { label: "MEDIUM", color: "text-warning", bg: "bg-warning" };
    return { label: "LOW", color: "text-success", bg: "bg-success" };
  };

  const level = getScoreLevel(score);
  const percentage = Math.min(100, Math.max(0, score));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex flex-col items-end">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
          Risk Score
        </span>
        <div className="flex items-baseline gap-1">
          <motion.span
            key={score}
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("text-lg font-bold font-mono", level.color)}
          >
            {score}
          </motion.span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      
      <div className="flex flex-col gap-1">
        <div className="w-24 h-2 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", level.bg)}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
          />
        </div>
        <span className={cn("text-[9px] font-mono font-bold", level.color)}>
          {level.label}
        </span>
      </div>
    </div>
  );
};
