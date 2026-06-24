import { useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";
import {
    Shield,
    ShieldAlert,
    ShieldCheck,
    Ban,
    Activity,
    Plus,
    Trash2,
    Lock,
    Unlock,
    Power,
    Zap
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const API_URL = "http://localhost:8000"; // Should be env var

const getAuthHeaders = () => {
    const token = localStorage.getItem("sentinel_token");
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
};

const FirewallPage = () => {
    const { firewall, logs, connected, setFirewallState } = useWebSocket();
    const [ipInput, setIpInput] = useState("");
    const [portInput, setPortInput] = useState("");
    const [countryInput, setCountryInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Initial fetch of status
    // Initial fetch of status
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const token = localStorage.getItem("sentinel_token");
                if (!token) {
                    window.location.href = "/login";
                    return;
                }

                const res = await fetch(`${API_URL}/firewall/status`, {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (res.status === 401) {
                    window.location.href = "/login";
                    return;
                }

                const data = await res.json();

                // Map backend snake_case to frontend camelCase
                setFirewallState({
                    active: data.active,
                    autoBlock: data.auto_block,
                    panicMode: data.panic_mode,
                    blockedIPs: data.blocked_ips || [],
                    blockedPorts: data.blocked_ports || [],
                    blockedCountries: data.blocked_countries || [],
                    rules: data.rules || []
                });
            } catch (error) {
                console.error("Failed to fetch firewall status:", error);
            }
        };
        fetchStatus();
    }, [setFirewallState]);

    const handleToggleFirewall = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/firewall/toggle`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ active: !firewall.active }),
            });
            if (!res.ok) throw new Error("Failed to toggle firewall");
            toast.success(firewall.active ? "Firewall Deactivated" : "Firewall Activated");
        } catch (error) {
            toast.error("Error toggling firewall");
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleAutoBlock = async () => {
        try {
            const res = await fetch(`${API_URL}/firewall/auto-block`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ enabled: !firewall.autoBlock }),
            });
            if (!res.ok) throw new Error("Failed to toggle auto-block");
            toast.success(firewall.autoBlock ? "Auto-Block Disabled" : "Auto-Block Enabled");
        } catch (error) {
            toast.error("Error toggling auto-block");
        }
    };

    const handleBlockIP = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ipInput) return;
        try {
            const res = await fetch(`${API_URL}/firewall/block-ip`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ ip: ipInput, reason: "Manual Admin Block" }),
            });
            if (!res.ok) throw new Error("Failed to block IP");
            setIpInput("");
            toast.success(`IP ${ipInput} Blocked`);
        } catch (error) {
            toast.error("Error blocking IP");
        }
    };

    const handleUnblockIP = async (ip: string) => {
        try {
            const res = await fetch(`${API_URL}/firewall/unblock-ip`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ ip }),
            });
            if (!res.ok) throw new Error("Failed to unblock IP");
            toast.success(`IP ${ip} Unblocked`);
        } catch (error) {
            toast.error("Error unblocking IP");
        }
    };

    const handleBlockPort = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!portInput) return;
        try {
            const res = await fetch(`${API_URL}/firewall/block-port`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ port: parseInt(portInput), reason: "Manual Admin Block" }),
            });
            if (!res.ok) throw new Error("Failed to block Port");
            setPortInput("");
            toast.success(`Port ${portInput} Blocked`);
        } catch (error) {
            toast.error("Error blocking Port");
        }
    };

    const handleUnblockPort = async (port: number) => {
        try {
            const res = await fetch(`${API_URL}/firewall/unblock-port`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ port }),
            });
            if (!res.ok) throw new Error("Failed to unblock Port");
            toast.success(`Port ${port} Unblocked`);
        } catch (error) {
            toast.error("Error unblocking Port");
        }
    };

    const handleTogglePanic = async () => {
        try {
            const res = await fetch(`${API_URL}/firewall/panic`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ enabled: !firewall.panicMode }),
            });
            if (!res.ok) throw new Error("Failed to toggle panic mode");
            if (!firewall.panicMode) {
                toast.error("LOCKDOWN INITIATED: ALL TRAFFIC BLOCKED");
            } else {
                toast.success("Lockdown Lifted");
            }
        } catch (error) {
            toast.error("Error toggling panic mode");
        }
    };

    const handleBlockCountry = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!countryInput) return;
        try {
            const res = await fetch(`${API_URL}/firewall/block-country`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ country_code: countryInput.toUpperCase() }),
            });
            if (!res.ok) throw new Error("Failed to block country");
            setCountryInput("");
            toast.success(`Country ${countryInput} Blocked`);
        } catch (error) {
            toast.error("Error blocking country");
        }
    };

    const handleUnblockCountry = async (country_code: string) => {
        try {
            const token = localStorage.getItem("sentinel_token");
            const res = await fetch(`${API_URL}/firewall/unblock-country`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ country_code }),
            });
            if (!res.ok) throw new Error("Failed to unblock country");
            toast.success(`Country ${country_code} Unblocked`);
        } catch (error) {
            toast.error("Error unblocking country");
        }
    };

    return (
        <div className="space-y-6 text-foreground">
            {/* Panic Mode Banner */}
            <AnimatePresence>
                {firewall.panicMode && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-destructive text-destructive-foreground p-4 rounded-xl flex items-center justify-between shadow-[0_0_50px_hsl(var(--destructive))]"
                    >
                        <div className="flex items-center gap-4">
                            <ShieldAlert className="w-10 h-10 animate-pulse" />
                            <div>
                                <h2 className="text-xl font-bold tracking-widest">SYSTEM LOCKDOWN ACTIVE</h2>
                                <p className="text-sm opacity-90">All non-admin traffic is being rejected. Emergency protocols in effect.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleTogglePanic}
                            className="bg-white/20 hover:bg-white/30 text-white px-6 py-2 rounded font-bold border border-white/50"
                        >
                            DEACTIVATE
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header & Status */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {/* Main Status Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                        "col-span-2 glass-card p-6 rounded-xl border relative overflow-hidden transition-colors duration-500",
                        firewall.active ? "border-primary/50 shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)]" : "border-destructive/50 shadow-[0_0_30px_-5px_hsl(var(--destructive)/0.3)]"
                    )}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Shield className="w-32 h-32" />
                    </div>

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div>
                            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                                <ShieldCheck className="w-6 h-6" />
                                FIREWALL STATUS
                            </h2>
                            <div className="flex items-center gap-3 mb-6">
                                <div className={cn("w-3 h-3 rounded-full animate-pulse", firewall.active ? "bg-primary shadow-[0_0_10px_hsl(var(--primary))]" : "bg-destructive shadow-[0_0_10px_hsl(var(--destructive))]")} />
                                <span className="text-2xl font-mono tracking-wider font-bold">
                                    {firewall.active ? "ACTIVE ENFORCEMENT" : "SYSTEM BYPASSED"}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button
                                disabled={isLoading}
                                onClick={handleToggleFirewall}
                                className={cn(
                                    "flex-1 py-3 px-4 rounded-lg font-bold uppercase tracking-widest transition-all text-sm flex items-center justify-center gap-2",
                                    firewall.active
                                        ? "bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/50"
                                        : "bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50"
                                )}
                            >
                                <Power className="w-4 h-4" />
                                {firewall.active ? "Deactivate" : "Activate"}
                            </button>

                            <button
                                onClick={handleToggleAutoBlock}
                                className={cn(
                                    "flex-1 py-3 px-4 rounded-lg font-bold uppercase tracking-widest transition-all text-sm flex items-center justify-center gap-2",
                                    firewall.autoBlock
                                        ? "bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 border border-teal-500/50"
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted border border-border"
                                )}
                            >
                                <Zap className="w-4 h-4" />
                                Auto-Block: {firewall.autoBlock ? "ON" : "OFF"}
                            </button>

                            <button
                                onClick={handleTogglePanic}
                                className={cn(
                                    "flex-1 py-3 px-4 rounded-lg font-bold uppercase tracking-widest transition-all text-sm flex items-center justify-center gap-2",
                                    firewall.panicMode
                                        ? "bg-destructive text-white hover:bg-destructive/90 shadow-[0_0_15px_hsl(var(--destructive))]"
                                        : "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
                                )}
                            >
                                <ShieldAlert className="w-4 h-4" />
                                {firewall.panicMode ? "LOCKDOWN" : "PANIC"}
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Cards */}
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="glass-card p-4 rounded-xl border border-white/5 flex flex-col justify-center items-center">
                    <Ban className="w-8 h-8 text-destructive mb-2" />
                    <span className="text-4xl font-bold text-white">{firewall.blockedIPs.length}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Blocked IPs</span>
                </motion.div>

                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="glass-card p-4 rounded-xl border border-white/5 flex flex-col justify-center items-center">
                    <Lock className="w-8 h-8 text-orange-400 mb-2" />
                    <span className="text-4xl font-bold text-white">{firewall.blockedPorts.length}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Blocked Ports</span>
                </motion.div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* IP Control */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Ban className="w-5 h-5 text-destructive" />
                        IP Enforcement
                    </h3>

                    <form onSubmit={handleBlockIP} className="flex gap-2 mb-6">
                        <input
                            type="text"
                            placeholder="Enter IP Address..."
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary/50 text-white font-mono"
                        />
                        <button type="submit" className="bg-destructive/20 text-destructive border border-destructive/50 px-4 py-2 rounded hover:bg-destructive/30 transition-colors uppercase text-xs font-bold">
                            Block
                        </button>
                    </form>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        <AnimatePresence>
                            {firewall.blockedIPs.map((ip) => (
                                <motion.div
                                    key={ip}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5 group hover:border-destructive/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-destructive" />
                                        <span className="font-mono text-sm">{ip}</span>
                                    </div>
                                    <button
                                        onClick={() => handleUnblockIP(ip)}
                                        className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Unlock className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                            {firewall.blockedIPs.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">No IPs blocked</div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* Port Control */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6 rounded-xl border border-white/10">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-orange-400" />
                        Port Control
                    </h3>

                    <form onSubmit={handleBlockPort} className="flex gap-2 mb-6">
                        <input
                            type="number"
                            placeholder="Enter Port..."
                            value={portInput}
                            onChange={(e) => setPortInput(e.target.value)}
                            className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-primary/50 text-white font-mono"
                        />
                        <button type="submit" className="bg-orange-500/20 text-orange-500 border border-orange-500/50 px-4 py-2 rounded hover:bg-orange-500/30 transition-colors uppercase text-xs font-bold">
                            Block
                        </button>
                    </form>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                        <AnimatePresence>
                            {firewall.blockedPorts.map((port) => (
                                <motion.div
                                    key={port}
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center justify-between p-3 bg-white/5 rounded border border-white/5 group hover:border-orange-500/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                                        <span className="font-mono text-sm">Port {port}</span>
                                    </div>
                                    <button
                                        onClick={() => handleUnblockPort(port)}
                                        className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Unlock className="w-4 h-4" />
                                    </button>
                                </motion.div>
                            ))}
                            {firewall.blockedPorts.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground text-sm">No ports blocked</div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                {/* Geo Blocking */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6 rounded-xl border border-white/10 md:col-span-2">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Ban className="w-5 h-5 text-purple-400" />
                        Geo-Blocking Enforcement
                    </h3>

                    <div className="flex gap-6">
                        <form onSubmit={handleBlockCountry} className="flex-1">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Country Code (e.g. CN, RU)..."
                                    value={countryInput}
                                    onChange={(e) => setCountryInput(e.target.value)}
                                    className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50 text-white font-mono uppercase"
                                    maxLength={2}
                                />
                                <button type="submit" className="bg-purple-500/20 text-purple-400 border border-purple-500/50 px-4 py-2 rounded hover:bg-purple-500/30 transition-colors uppercase text-xs font-bold">
                                    Block Country
                                </button>
                            </div>
                        </form>

                        <div className="flex-1 flex flex-wrap gap-2">
                            <AnimatePresence>
                                {firewall.blockedCountries.map((code) => (
                                    <motion.div
                                        key={code}
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0 }}
                                        className="bg-purple-500/20 border border-purple-500/40 text-purple-200 px-3 py-1 rounded flex items-center gap-2"
                                    >
                                        <span className="font-bold">{code}</span>
                                        <button onClick={() => handleUnblockCountry(code)} className="hover:text-white">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </motion.div>
                                ))}
                                {firewall.blockedCountries.length === 0 && (
                                    <div className="text-sm text-muted-foreground italic self-center">No active geographic blocks</div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Live Stream Context */}
            <div className="glass-card p-4 rounded-xl border border-white/10">
                <h3 className="text-sm font-bold uppercase text-muted-foreground mb-4">Live Firewall Actions</h3>
                <div className="space-y-1 font-mono text-xs">
                    {logs
                        .filter(log => log.message.includes("Firewall"))
                        .slice(0, 5)
                        .map(log => (
                            <div key={log.id} className="flex gap-2">
                                <span className="text-primary opacity-50">[{log.timestamp}]</span>
                                <span className="text-primary/90">{log.message}</span>
                            </div>
                        ))}
                    {logs.filter(log => log.message.includes("Firewall")).length === 0 && (
                        <div className="text-muted-foreground italic">No recent firewall events</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FirewallPage;
