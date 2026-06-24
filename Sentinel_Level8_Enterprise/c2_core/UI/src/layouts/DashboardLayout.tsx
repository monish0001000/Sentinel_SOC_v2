import { useEffect, useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AlertTriangle, Wifi } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("sentinel_token");
    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  let wsState;
  try {
    wsState = useWebSocket();
  } catch (err) {
    wsState = null;
  }

  const firewall = wsState?.firewall;

  const handleRestoreConnectivity = useCallback(async () => {
    setIsRestoring(true);
    try {
      const token = localStorage.getItem("sentinel_token");
      const res = await fetch("http://localhost:8000/firewall/panic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: false }),
      });
      if (!res.ok) {
        console.error("[DashboardLayout] Restore connectivity failed:", res.status);
      }
    } catch (err) {
      console.error("[DashboardLayout] Restore connectivity error:", err);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Loading / Disconnected Warning */}
        <AnimatePresence>
          {(!wsState || wsState.connectionStatus !== "connected") && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-orange-500/10 border-b border-orange-500/20 flex items-center justify-center py-1.5 px-4 z-40"
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-orange-400 font-mono text-xs">CONNECTING TO AGENT...</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lockdown Banner with Restore Connectivity Action */}
        <AnimatePresence>
          {firewall?.panicMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 border-b border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.4)] flex items-center justify-center py-2 px-6 z-50 overflow-hidden"
            >
              <div className="flex items-center gap-4 w-full justify-center">
                <AlertTriangle className="w-5 h-5 text-white animate-pulse flex-shrink-0" />
                <span className="text-white font-bold font-mono tracking-widest text-sm text-center">
                  SYSTEM LOCKDOWN ACTIVE — HOST ISOLATED
                </span>
                <AlertTriangle className="w-5 h-5 text-white animate-pulse flex-shrink-0" />

                {/* ── Restore Connectivity Button ── */}
                <motion.button
                  onClick={handleRestoreConnectivity}
                  disabled={isRestoring}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="ml-4 flex items-center gap-2 px-4 py-1.5 rounded-lg font-bold text-xs font-mono tracking-wider
                             bg-white/15 hover:bg-white/25 border border-white/30 hover:border-white/50
                             text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_20px_rgba(255,255,255,0.2)]
                             transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0
                             backdrop-blur-sm"
                >
                  {isRestoring ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      RESTORING...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5" />
                      GET ONLINE
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <TopBar />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
