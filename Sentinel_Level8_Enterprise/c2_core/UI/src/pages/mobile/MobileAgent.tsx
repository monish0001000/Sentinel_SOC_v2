import { useState, useEffect } from 'react';
import { Smartphone, Wifi, Radio, Battery, Shield } from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// In a real PWA, this would potentially use a Service Worker or local storage for the ID
const generateId = () => 'mobile-' + Math.random().toString(36).substr(2, 9);

const MobileAgent = () => {
    const [connected, setConnected] = useState(false);
    const [deviceId] = useState(localStorage.getItem('sentinel_mobile_id') || generateId());
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        localStorage.setItem('sentinel_mobile_id', deviceId);
    }, [deviceId]);

    const sendHeartbeat = async () => {
        // Collect Pseudo-Stats from Browser
        const battery = (navigator as any).getBattery ? await (navigator as any).getBattery() : null;

        const telemetry = {
            cpu: Math.random() * 30 + 10, // Simulated CPU for browser
            memory: (performance as any).memory ? (performance as any).memory.usedJSHeapSize / (performance as any).memory.jsHeapSizeLimit * 100 : 40,
            disk: 50, // Static for mobile
            boot_time: Date.now() / 1000 - 86400,
            processes: 5
        };

        const payload = {
            id: deviceId,
            hostname: `Mobile (${navigator.platform})`,
            os: navigator.userAgent.split(')')[0].split('(')[1] || 'Mobile OS',
            ip: 'Mobile Net', // Server will see the tunnel IP
            status: 'online'
        };

        const heartbeat = {
            id: deviceId,
            stats: telemetry,
            timestamp: Date.now() / 1000
        };

        try {
            // 1. Register (Idempotent)
            await fetch('http://localhost:8000/api/agent/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // 2. Heartbeat
            await fetch('http://localhost:8000/api/agent/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(heartbeat)
            });

            setStats(telemetry);
        } catch (e) {
            console.error("Connect failed", e);
            // Fallback for demo if running on same network but different IP
            // Real implementation would use the relative URL if served from same origin
        }
    };

    useEffect(() => {
        let interval: any;
        if (connected) {
            sendHeartbeat(); // Immediate
            interval = setInterval(sendHeartbeat, 5000);
            toast.success("Agent Active: Monitoring Device");
        }
        return () => clearInterval(interval);
    }, [connected]);

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Pulse */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black animate-pulse" />

            <div className="z-10 w-full max-w-sm flex flex-col gap-8">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="mx-auto w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/50 mb-4 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                        <Shield className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tighter">SENTINEL<br /><span className="text-indigo-500">MOBILE AGENT</span></h1>
                    <p className="text-gray-500 text-sm font-mono">EDR ENDPOINT NODE</p>
                </div>

                {/* Dynamic Status Card */}
                <div className={cn(
                    "rounded-2xl border p-6 transition-all duration-500",
                    connected
                        ? "bg-indigo-950/30 border-indigo-500/50 shadow-[0_0_50px_rgba(99,102,241,0.15)]"
                        : "bg-gray-900/50 border-white/10"
                )}>
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <Smartphone className="w-5 h-5 text-gray-400" />
                            <span className="font-bold text-sm tracking-wide">DEVICE STATUS</span>
                        </div>
                        <div className={cn("w-3 h-3 rounded-full", connected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                    </div>

                    {connected && stats ? (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                <span className="text-xs text-gray-400">CPU LOAD</span>
                                <span className="font-mono text-indigo-300">{stats.cpu.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                <span className="text-xs text-gray-400">MEMORY</span>
                                <span className="font-mono text-indigo-300">{stats.memory.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-400">UPTIME</span>
                                <span className="font-mono text-emerald-400">ACTIVE</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-6 text-gray-500 text-sm">
                            Disconnected from SOC
                        </div>
                    )}
                </div>

                {/* Action Button */}
                <button
                    onClick={() => setConnected(!connected)}
                    className={cn(
                        "w-full py-4 rounded-xl font-bold tracking-widest transition-all duration-200 active:scale-95 shadow-lg",
                        connected
                            ? "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/25"
                    )}
                >
                    {connected ? "TERMINATE UPLINK" : "INITIALIZE AGENT"}
                </button>

                {/* Footer Info */}
                <div className="text-center space-y-2">
                    <div className="flex justify-center items-center gap-2 text-[10px] text-gray-600 font-mono">
                        <Wifi className="w-3 h-3" />
                        <span>SECURE TUNNEL READY</span>
                    </div>
                    <p className="text-[10px] text-gray-700">ID: {deviceId}</p>
                </div>
            </div>
        </div>
    );
};

export default MobileAgent;
