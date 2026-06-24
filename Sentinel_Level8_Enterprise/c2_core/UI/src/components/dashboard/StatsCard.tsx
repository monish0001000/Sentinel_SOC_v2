import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "./AnimatedCounter";

interface StatsCardProps {
  title: string;
  value: number;
  suffix?: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  index?: number;
  glowOnUpdate?: boolean;
}

export const StatsCard = ({
  title,
  value,
  suffix = "",
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-primary",
  index = 0,
  glowOnUpdate = true,
}: StatsCardProps) => {
  const changeColors = {
    positive: "text-success",
    negative: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="glass-card rounded-lg p-4 hover:bg-card/60 transition-all border border-border/50"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
            {title}
          </p>
          <div className="flex items-baseline gap-1">
            <AnimatedCounter
              value={value}
              suffix={suffix}
              className="text-2xl font-bold text-foreground"
            />
          </div>
          {change && (
            <p className={cn("text-[10px] mt-1.5 font-mono", changeColors[changeType])}>
              {change}
            </p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-lg bg-accent/50", iconColor)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </motion.div>
  );
};