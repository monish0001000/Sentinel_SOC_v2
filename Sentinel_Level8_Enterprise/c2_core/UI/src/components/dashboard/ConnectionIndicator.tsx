import { Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectionStatus } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
  className?: string;
}

export const ConnectionIndicator = ({ status, onReconnect, className }: ConnectionIndicatorProps) => {
  const statusConfig = {
    connected: {
      icon: Wifi,
      label: "CONNECTED",
      color: "text-success",
      bg: "bg-success/10",
      border: "border-success/30",
      pulse: true,
    },
    disconnected: {
      icon: WifiOff,
      label: "DISCONNECTED",
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/30",
      pulse: false,
    },
    connecting: {
      icon: Loader2,
      label: "CONNECTING",
      color: "text-warning",
      bg: "bg-warning/10",
      border: "border-warning/30",
      pulse: false,
    },
    error: {
      icon: AlertCircle,
      label: "ERROR",
      color: "text-destructive",
      bg: "bg-destructive/10",
      border: "border-destructive/30",
      pulse: true,
    },
    isolated: {
      icon: AlertCircle,
      label: "ISOLATED",
      color: "text-red-500",
      bg: "bg-red-500/20",
      border: "border-red-500/50",
      pulse: true,
    },
  };

  const config = statusConfig[status] || statusConfig["disconnected"];
  const Icon = config.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.button
        key={status}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={status === "disconnected" || status === "error" ? onReconnect : undefined}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
          config.bg,
          config.border,
          (status === "disconnected" || status === "error") && "cursor-pointer hover:opacity-80",
          className
        )}
      >
        <div className="relative">
          <Icon
            className={cn(
              "w-3.5 h-3.5",
              config.color,
              status === "connecting" && "animate-spin"
            )}
          />
          {config.pulse && status === "connected" && (
            <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-75" />
          )}
        </div>
        <span className={cn("text-[10px] font-mono font-bold tracking-wider", config.color)}>
          {config.label}
        </span>
      </motion.button>
    </AnimatePresence>
  );
};
