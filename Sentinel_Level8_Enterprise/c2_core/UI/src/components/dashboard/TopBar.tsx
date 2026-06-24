import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Shield, AlertTriangle, Clock, X, Settings, LogOut, User as UserIcon } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { RiskScoreGauge } from "./RiskScoreGauge";

// ─── In-App Toast Banner ─────────────────────────────────
const IsolationToast = ({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onDismiss, 12000);
      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[999998] w-full max-w-2xl px-4"
        >
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red-950/95 border border-red-500/40 shadow-2xl shadow-red-500/20 backdrop-blur-xl">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 border border-red-500/30">
              <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-red-400 font-mono tracking-wide">
                CRITICAL: System Network Isolated — Host Offline
              </p>
              <p className="text-[11px] text-red-300/70 font-mono mt-0.5">
                External traffic blocked at kernel level. SOC ports remain active.
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="p-1 rounded-md hover:bg-red-500/20 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-red-400/60" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

// ─── Emergency Modal (via React Portal) ──────────────────
const EmergencyModal = ({
  isOpen,
  onClose,
  onConfirm,
  isPanicking,
  isAlreadyOffline,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPanicking: boolean;
  isAlreadyOffline: boolean;
}) => {
  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="w-full max-w-md bg-zinc-950 border border-red-500/30 rounded-xl shadow-2xl shadow-red-500/10 overflow-hidden"
          >
            <div className="p-6">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Emergency Network Isolation</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                You are about to engage the Network Kill Switch. This will drop 100% of external and outbound internet traffic immediately.
                <br /><br />
                <span className="text-red-400 font-medium">Critical internal SOC connection ports and loopback will remain functional.</span>
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg font-medium text-sm border border-white/10 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  disabled={isPanicking || isAlreadyOffline}
                  className="px-4 py-2 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isPanicking ? "Isolating..." : isAlreadyOffline ? "Already Offline" : "Go Offline"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export const TopBar = () => {
  // @ts-ignore
  const { connectionStatus, packetRate, aiMode, riskScore, threats, reconnect, firewall, siemEvents } = useWebSocket();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPanicModalOpen, setIsPanicModalOpen] = useState(false);
  const [isPanicking, setIsPanicking] = useState(false);
  const [showIsolationToast, setShowIsolationToast] = useState(false);
  const navigate = useNavigate();
  
  // UI States for Dropdowns
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [clearedEventIds, setClearedEventIds] = useState<Set<string>>(new Set());

  // Click outside handlers
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Derive unread high-severity alerts from siemEvents
  const safeSiemEvents = Array.isArray(siemEvents) ? siemEvents : [];
  const unreadAlerts = safeSiemEvents
    .filter((e: any) => e?.level && ["CRITICAL", "HIGH", "ERROR", "WARNING"].includes(e.level) && !clearedEventIds.has(e?.id))
    .slice(0, 5);
  const alertCount = unreadAlerts?.length ?? 0;

  const handleClearAlerts = () => {
    const newCleared = new Set(clearedEventIds);
    unreadAlerts?.forEach((e: any) => { if (e?.id) newCleared.add(e.id); });
    setClearedEventIds(newCleared);
    setIsNotificationsOpen(false);
  };

  // Real-time clock
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Request native notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const threatLevel = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";

  const threatConfig = {
    low: { color: "text-success", bg: "bg-success/10", border: "border-success/30", label: "LOW" },
    medium: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/30", label: "MEDIUM" },
    high: { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", label: "HIGH" },
  };

  const config = threatConfig[threatLevel];

  // ─── Dual-Layer Notification Trigger ───────────────────
  const fireIsolationNotifications = useCallback(() => {
    // Layer 1: In-App Toast Banner
    setShowIsolationToast(true);

    // Layer 2: Native OS Desktop Notification
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Sentinel SOC Alert", {
          body: "HOST ISOLATION ACTIVATED: External network traffic blocked at kernel level.",
          icon: "/favicon.ico",
          tag: "sentinel-isolation",
          requireInteraction: true,
        });
      } catch (e) {
        console.warn("[TopBar] Native notification failed:", e);
      }
    }
  }, []);

  // ─── Go Offline Handler ────────────────────────────────
  const handleGoOffline = useCallback(async () => {
    setIsPanicking(true);
    try {
      const token = localStorage.getItem("sentinel_token");
      const res = await fetch("http://localhost:8000/firewall/panic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: true }),
      });
      if (res.ok) {
        // Fire dual-layer notifications on successful isolation
        fireIsolationNotifications();
      }
      setIsPanicModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPanicking(false);
    }
  }, [fireIsolationNotifications]);

  const handleLogout = () => {
    localStorage.removeItem("sentinel_token");
    localStorage.removeItem("sentinel_role");
    navigate("/");
  };

  return (
    <>
      {/* ADDED relative and z-[100] to header to fix stacking contexts against main panels */}
      <header className="relative z-[100] h-14 glass-card border-b border-border/50 px-4 md:px-6 flex items-center justify-between bg-background/80 backdrop-blur-xl">
        {/* Left: Connection Status & Packet Rate */}
        <div className="flex items-center gap-3 md:gap-6">
          <ConnectionIndicator status={firewall?.panicMode ? "isolated" : connectionStatus} onReconnect={reconnect} />

          {/* Kill Switch Trigger */}
          <button
            onClick={() => setIsPanicModalOpen(true)}
            className={cn(
              "p-1.5 rounded-md border transition-all duration-300",
              firewall?.panicMode
                ? "bg-red-500/20 border-red-500/50 text-red-500 threat-pulse"
                : "bg-white/5 border-white/10 text-white/40 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
            )}
            title={firewall?.panicMode ? "Host Isolated" : "Emergency Kill Switch"}
          >
            <AlertTriangle className="w-4 h-4" />
          </button>

          <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-md bg-muted/20 border border-border/30">
            <span className="text-[10px] text-muted-foreground font-mono">PKT/s:</span>
            <motion.span
              key={packetRate}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="text-xs font-mono font-bold text-primary update-glow"
            >
              {connectionStatus === "connected" ? packetRate.toLocaleString() : "—"}
            </motion.span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded-md bg-muted/20 border border-border/30">
            <span className="text-[10px] text-muted-foreground font-mono">AI:</span>
            <span className={cn(
              "text-[10px] font-mono font-bold uppercase",
              aiMode === "active" ? "text-success" : aiMode === "learning" ? "text-warning" : "text-muted-foreground"
            )}>
              {aiMode}
            </span>
          </div>

          <div className="h-6 w-px bg-border/50 hidden md:block" />

          {/* Threat Level */}
          <div className="hidden md:flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-mono">THREAT:</span>
            <motion.span
              key={threatLevel}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold font-mono border",
                config.bg,
                config.color,
                config.border,
                threatLevel === "high" && "threat-pulse"
              )}
            >
              {config.label}
            </motion.span>
          </div>
        </div>

        {/* Right: Risk Score, Alerts & Time */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Risk Score Gauge */}
          <div className="hidden lg:block">
            <RiskScoreGauge score={riskScore} />
          </div>

          {/* Active Threat Warning */}
          {threatLevel === "high" && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden md:flex items-center gap-2 px-3 py-1 rounded-md bg-destructive/10 border border-destructive/20"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-destructive animate-pulse" />
              <span className="text-[10px] font-mono font-medium text-destructive">
                ACTIVE THREATS
              </span>
            </motion.div>
          )}

          {/* Alert Bell with Notification Center */}
          <div className="relative" ref={bellRef}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsNotificationsOpen(!isNotificationsOpen);
                setIsProfileOpen(false);
              }}
              className={cn(
                "relative p-2 rounded-lg transition-colors border outline-none",
                isNotificationsOpen ? "bg-accent/50 border-white/10" : "hover:bg-accent/50 border-transparent"
              )}
            >
              <Bell className="w-4 h-4 text-muted-foreground" />
              {alertCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold shadow-[0_0_10px_rgba(220,38,38,0.5)]"
                >
                  {alertCount > 9 ? "9+" : alertCount}
                </motion.span>
              )}
            </button>

            {/* Notification Dropdown */}
            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-[#0d1527] border border-cyan-500/30 rounded-xl shadow-2xl p-4 z-[99999] animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 text-primary" />
                      Critical Alerts
                    </h3>
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-mono font-bold">
                      {alertCount} UNREAD
                    </span>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {(unreadAlerts?.length ?? 0) === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-xs font-mono">
                        No critical alerts.
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {unreadAlerts?.map((alert: any) => (
                          <div key={alert?.id || Math.random()} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors flex gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                              alert?.level === "CRITICAL" ? "bg-red-500 animate-pulse" :
                              alert?.level === "ERROR" ? "bg-orange-500" : "bg-amber-400"
                            )} />
                            <div>
                              <p className="text-xs font-medium text-white/90 line-clamp-2">{alert?.message || "Unknown Alert"}</p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[9px] font-mono text-muted-foreground">
                                  {alert?.timestamp ? new Date(alert.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "—"}
                                </span>
                                <span className="text-[9px] font-mono px-1 rounded bg-white/10 text-white/50">{alert?.source || "System"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {(unreadAlerts?.length ?? 0) > 0 && (
                    <div className="p-2 border-t border-white/5 bg-white/[0.02]">
                      <button
                        onClick={handleClearAlerts}
                        className="w-full py-1.5 text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/5 rounded transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-5 w-px bg-border/50" />

          {/* Current Time */}
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">
              {currentTime.toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          {/* User Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setIsProfileOpen(!isProfileOpen);
                setIsNotificationsOpen(false);
              }}
              className={cn(
                "hidden md:flex items-center gap-2 pl-3 border-l border-border/50 cursor-pointer transition-all outline-none rounded-r-lg p-1",
                isProfileOpen ? "bg-accent/30" : "hover:opacity-80 hover:bg-accent/10"
              )}
            >
              <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shadow-[0_0_10px_rgba(var(--primary),0.2)]">
                <UserIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-foreground">Monish S.</p>
                <p className="text-[10px] text-primary font-mono font-bold tracking-wider">SOC-L1</p>
              </div>
            </button>

            {/* Profile Overlay Modal */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-[#0d1527] border border-cyan-500/30 rounded-xl shadow-2xl p-4 z-[99999] animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col"
                >
                  <div className="p-4 border-b border-primary/20 bg-primary/5 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                      <UserIcon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white leading-tight">Monish S.</h3>
                      <p className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest mt-0.5">Lead Security Analyst (SOC-L1)</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-4 flex-1">
                    <div>
                      <p className="text-[9px] text-muted-foreground font-mono mb-1 tracking-widest">ROLE</p>
                      <p className="text-xs text-white/90 font-medium">Lead Security Analyst (SOC-L1)</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-mono mb-1 tracking-widest">DEPARTMENT</p>
                      <p className="text-xs text-white/90 font-medium">Cyber Security Engineering</p>
                    </div>
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-[9px] text-muted-foreground font-mono mb-1 tracking-widest">SYSTEM CORE</p>
                      <p className="text-xs text-primary font-mono bg-primary/10 px-2 py-1 rounded inline-block border border-primary/20 shadow-inner">Sentinel SOC Engine v8.2</p>
                    </div>
                  </div>
                  <div className="border-t border-white/10 bg-white/[0.02] grid grid-cols-2 divide-x divide-white/10">
                    <Link 
                      to="/dashboard/settings"
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center justify-center gap-2 py-3 text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Settings
                    </Link>
                    <button 
                      onClick={handleLogout}
                      className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Logout
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Portal: Emergency Network Isolation Modal */}
      <EmergencyModal
        isOpen={isPanicModalOpen}
        onClose={() => setIsPanicModalOpen(false)}
        onConfirm={handleGoOffline}
        isPanicking={isPanicking}
        isAlreadyOffline={!!firewall?.panicMode}
      />

      {/* Portal: In-App Isolation Toast */}
      <IsolationToast
        visible={showIsolationToast}
        onDismiss={() => setShowIsolationToast(false)}
      />
    </>
  );
};
