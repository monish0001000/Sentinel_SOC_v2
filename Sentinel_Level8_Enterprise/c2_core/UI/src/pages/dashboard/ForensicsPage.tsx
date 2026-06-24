import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Database, Filter, RefreshCw, ChevronDown, ChevronRight, Shield, AlertTriangle, Info, Zap, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = "http://localhost:8000";

interface LogEntry {
    id: string;
    timestamp: string;
    level: string;
    message: string;
    source: string;
    type: string;
    metadata: string;
    prev_hash?: string;
    hash?: string;
}

const ForensicsPage = () => {
    const { siemEvents } = useWebSocket();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filterLevel, setFilterLevel] = useState("all");
    const [filterType, setFilterType] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [liveMode, setLiveMode] = useState(true);
    const [liveCount, setLiveCount] = useState(0);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const getAuthHeaders = () => {
        const token = localStorage.getItem("sentinel_token");
        return { "Authorization": `Bearer ${token}` };
    };

    // ─── Fetch historical logs ────────────────────────────────
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/logs?limit=200`;
            if (filterLevel !== "all") url += `&level=${filterLevel}`;
            if (filterType !== "all") url += `&type=${filterType}`;

            const token = localStorage.getItem("sentinel_token");
            if (!token) { window.location.href = "/login"; return; }

            const res = await fetch(url, { headers: getAuthHeaders() });
            if (res.status === 401) { window.location.href = "/login"; return; }
            if (!res.ok) throw new Error("Failed to fetch logs");

            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filterLevel, filterType]);

    // ─── Search logs ──────────────────────────────────────────
    const searchLogs = useCallback(async (query: string) => {
        if (!query.trim()) {
            fetchLogs();
            return;
        }
        setLoading(true);
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) { window.location.href = "/login"; return; }

            const res = await fetch(`${API_URL}/logs/search?q=${encodeURIComponent(query)}&limit=200`, {
                headers: getAuthHeaders()
            });
            if (res.status === 401) { window.location.href = "/login"; return; }
            if (!res.ok) throw new Error("Search failed");

            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [fetchLogs]);

    // Debounced search
    const handleSearchInput = (value: string) => {
        setSearchQuery(value);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(() => {
            if (value.trim()) {
                setLiveMode(false);
                searchLogs(value);
            } else {
                setLiveMode(true);
                fetchLogs();
            }
        }, 400);
    };

    // Initial fetch
    useEffect(() => { fetchLogs(); }, [filterLevel, filterType]);

    // ─── Live WebSocket ingestion ─────────────────────────────
    useEffect(() => {
        if (!liveMode || siemEvents.length === 0) return;

        // Filter new events before prepending
        const filtered = siemEvents.filter(evt => {
            if (filterLevel !== "all" && evt.level !== filterLevel) return false;
            if (filterType !== "all" && evt.type !== filterType) return false;
            return true;
        });

        if (filtered.length > 0) {
            setLogs(prev => {
                // Deduplicate by ID
                const existingIds = new Set(prev.map(l => l.id));
                const newEntries = filtered.filter(e => !existingIds.has(e.id));
                if (newEntries.length === 0) return prev;
                setLiveCount(c => c + newEntries.length);
                return [...newEntries, ...prev].slice(0, 500);
            });
        }
    }, [siemEvents, liveMode, filterLevel, filterType]);

    // ─── Helpers ──────────────────────────────────────────────
    const parseMetadata = (metaStr: string) => {
        try { return JSON.parse(metaStr); }
        catch { return {}; }
    };

    const getRiskScore = (log: LogEntry): number | null => {
        const meta = parseMetadata(log.metadata);
        return meta.risk_score ?? meta.severity_score ?? null;
    };

    const formatLocalTimestamp = (raw: string | number): string => {
        try {
            let date: Date;
            if (typeof raw === "number") {
                // UNIX epoch: seconds (10 digits) vs milliseconds (13 digits)
                date = new Date(raw > 1e12 ? raw : raw * 1000);
            } else {
                // ISO string — if it has NO timezone designator, treat as UTC
                // This is the critical fix: `datetime.utcnow().isoformat()` produces
                // "2026-06-18T10:47:36" (no Z), which browsers parse as LOCAL time.
                let isoStr = raw;
                if (
                    typeof isoStr === "string" &&
                    !isoStr.endsWith("Z") &&
                    !/[+-]\d{2}:\d{2}$/.test(isoStr) &&
                    !/[+-]\d{4}$/.test(isoStr)
                ) {
                    isoStr = isoStr + "Z";
                }
                date = new Date(isoStr);
            }
            if (isNaN(date.getTime())) return String(raw);

            // Format in the browser's local timezone, matching system tray clock
            return date.toLocaleString(undefined, {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            });
        } catch {
            return String(raw);
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level) {
            case "CRITICAL": return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
            case "WARNING": return <Zap className="w-3.5 h-3.5 text-amber-400" />;
            case "ERROR": return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />;
            default: return <Info className="w-3.5 h-3.5 text-blue-400" />;
        }
    };

    return (
        <div className="space-y-6 text-foreground p-6">
            {/* ─── Header ──────────────────────────────────────── */}
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Database className="w-8 h-8 text-amber-500" />
                        Digital Forensics (SIEM)
                    </h1>
                    <p className="text-muted-foreground font-mono text-xs">
                        PERSISTENT EVENT STORAGE // BLOCKCHAIN-VERIFIED // REAL-TIME STREAM
                    </p>
                </div>
                <div className="flex gap-3 items-center">
                    {/* Live indicator */}
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border transition-all",
                        liveMode
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : "bg-white/5 text-white/40 border-white/10"
                    )}>
                        <span className={cn(
                            "w-2 h-2 rounded-full",
                            liveMode ? "bg-green-400 animate-pulse" : "bg-white/20"
                        )} />
                        {liveMode ? `LIVE — ${liveCount} events` : "SEARCH MODE"}
                    </div>
                    <button
                        onClick={() => { setLiveMode(true); setSearchQuery(""); fetchLogs(); setLiveCount(0); }}
                        className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg font-bold border border-primary/30 flex items-center gap-2 transition-colors"
                    >
                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* ─── Controls ────────────────────────────────────── */}
            <div className="flex gap-4 flex-wrap">
                {/* Search */}
                <div className="glass-card px-4 py-2 flex items-center gap-2 border border-white/10 rounded-lg flex-1 min-w-[250px]">
                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => handleSearchInput(e.target.value)}
                        placeholder="Search logs... (message, source, metadata)"
                        className="bg-transparent text-sm focus:outline-none w-full placeholder:text-white/20"
                    />
                    {searchQuery && (
                        <button onClick={() => { setSearchQuery(""); setLiveMode(true); fetchLogs(); }} className="text-white/30 hover:text-white/60">
                            ✕
                        </button>
                    )}
                </div>

                {/* Level filter */}
                <div className="glass-card px-4 py-2 flex items-center gap-2 border border-white/10 rounded-lg">
                    <Filter className="w-4 h-4 text-muted-foreground" />
                    <select
                        value={filterLevel}
                        onChange={e => setFilterLevel(e.target.value)}
                        className="bg-transparent text-sm focus:outline-none"
                    >
                        <option value="all">All Levels</option>
                        <option value="INFO">INFO</option>
                        <option value="WARNING">WARNING</option>
                        <option value="ERROR">ERROR</option>
                        <option value="CRITICAL">CRITICAL</option>
                    </select>
                </div>

                {/* Type filter */}
                <div className="glass-card px-4 py-2 flex items-center gap-2 border border-white/10 rounded-lg">
                    <Shield className="w-4 h-4 text-muted-foreground" />
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="bg-transparent text-sm focus:outline-none"
                    >
                        <option value="all">All Types</option>
                        <option value="Alert">Security Alerts</option>
                        <option value="Config">Config Changes</option>
                        <option value="Security">Auth Events</option>
                        <option value="Error">Errors</option>
                        <option value="Policy Violation">Policy Violations</option>
                    </select>
                </div>
            </div>

            {/* ─── Table ───────────────────────────────────────── */}
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-3 bg-white/5 font-mono text-[11px] font-bold text-muted-foreground border-b border-white/10 uppercase tracking-wider">
                    <div className="col-span-1"></div>
                    <div className="col-span-2">Timestamp</div>
                    <div className="col-span-1">Level</div>
                    <div className="col-span-1">Source</div>
                    <div className="col-span-1">Category</div>
                    <div className="col-span-4">Message</div>
                    <div className="col-span-1">Risk</div>
                    <div className="col-span-1">Chain</div>
                </div>

                <div className="max-h-[600px] overflow-y-auto">
                    <AnimatePresence initial={false}>
                        {logs.map((log) => {
                            const isExpanded = expandedRow === log.id;
                            const meta = parseMetadata(log.metadata);
                            const risk = getRiskScore(log);

                            return (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    {/* Main Row */}
                                    <div
                                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                        className={cn(
                                            "grid grid-cols-12 gap-2 p-3 border-b border-white/5 hover:bg-white/5 transition-colors font-mono text-xs items-center cursor-pointer",
                                            isExpanded && "bg-white/5"
                                        )}
                                    >
                                        <div className="col-span-1 flex justify-center">
                                            {isExpanded
                                                ? <ChevronDown className="w-3.5 h-3.5 text-primary" />
                                                : <ChevronRight className="w-3.5 h-3.5 text-white/30" />
                                            }
                                        </div>
                                        <div className="col-span-2 opacity-70 truncate">
                                            {formatLocalTimestamp(log.timestamp)}
                                        </div>
                                        <div className="col-span-1">
                                            <span className={cn(
                                                "px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1",
                                                log.level === "CRITICAL" ? "bg-red-500/20 text-red-500" :
                                                    log.level === "ERROR" ? "bg-orange-500/20 text-orange-400" :
                                                        log.level === "WARNING" ? "bg-amber-500/20 text-amber-400" :
                                                            "bg-blue-500/20 text-blue-400"
                                            )}>
                                                {getLevelIcon(log.level)}
                                                {log.level}
                                            </span>
                                        </div>
                                        <div className="col-span-1 text-cyan-400 truncate">{log.source}</div>
                                        <div className="col-span-1">
                                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 border border-white/10 text-[10px]">
                                                {log.type}
                                            </span>
                                        </div>
                                        <div className="col-span-4 truncate text-white/90" title={log.message}>{log.message}</div>
                                        <div className="col-span-1">
                                            {risk !== null ? (
                                                <span className={cn(
                                                    "px-1.5 py-0.5 rounded font-bold text-[10px]",
                                                    risk >= 80 ? "bg-red-500/20 text-red-400" :
                                                        risk >= 50 ? "bg-amber-500/20 text-amber-400" :
                                                            "bg-green-500/20 text-green-400"
                                                )}>
                                                    {risk}
                                                </span>
                                            ) : (
                                                <span className="text-white/15">—</span>
                                            )}
                                        </div>
                                        <div className="col-span-1">
                                            {log.hash ? (
                                                <span className="text-green-500/60 text-[10px]" title={log.hash}>
                                                    ✓ {log.hash?.substring(0, 6)}
                                                </span>
                                            ) : (
                                                <span className="text-white/15">—</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Expanded Detail Panel */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="bg-black/30 border-b border-white/10 px-6 py-4"
                                            >
                                                <div className="grid grid-cols-2 gap-6">
                                                    {/* Left: Metadata */}
                                                    <div>
                                                        <h4 className="text-[10px] uppercase text-muted-foreground font-bold mb-2 tracking-widest">Event Metadata</h4>
                                                        <pre className="text-[11px] font-mono text-white/70 bg-black/40 rounded-lg p-3 max-h-[200px] overflow-auto border border-white/5">
                                                            {JSON.stringify(meta, null, 2)}
                                                        </pre>
                                                    </div>

                                                    {/* Right: Chain Info */}
                                                    <div className="space-y-3">
                                                        <h4 className="text-[10px] uppercase text-muted-foreground font-bold mb-2 tracking-widest">Blockchain Integrity</h4>
                                                        <div className="space-y-2 font-mono text-[11px]">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-white/40">Event ID</span>
                                                                <span className="text-cyan-300">{log.id}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-white/40">Current Hash</span>
                                                                <span className="text-green-400 truncate max-w-[300px]" title={log.hash}>
                                                                    {log.hash || "N/A"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-white/40">Previous Hash</span>
                                                                <span className="text-amber-400 truncate max-w-[300px]" title={log.prev_hash}>
                                                                    {log.prev_hash || "N/A"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-white/40">Source</span>
                                                                <span className="text-cyan-400">{log.source}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-white/40">Type</span>
                                                                <span className="text-purple-400">{log.type}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>

                    {logs.length === 0 && !loading && (
                        <div className="p-12 text-center text-muted-foreground">
                            <Database className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-medium">No logs found</p>
                            <p className="text-sm mt-1">Events will appear here in real-time as they are recorded.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="p-8 text-center text-muted-foreground">
                            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-40" />
                            <p className="text-sm">Loading forensic data...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Footer Stats ─────────────────────────────────── */}
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono px-1">
                <span>{logs.length} events loaded</span>
                <span className="flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    {liveMode ? "Live streaming active" : `Search: "${searchQuery}"`}
                </span>
            </div>
        </div>
    );
};

export default ForensicsPage;
