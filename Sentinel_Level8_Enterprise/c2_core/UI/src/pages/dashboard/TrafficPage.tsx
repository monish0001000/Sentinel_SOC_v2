import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Network, Activity, Pause, Play, AlertCircle, Trash2, Download,
    X, Brain, ChevronRight, Cpu, Globe, Server, Shield, FileCode, Copy
} from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { PacketEvent } from '@/utils/packetQueue';
import { useNavigate } from 'react-router-dom';
import { useTraffic } from '@/context/TrafficContext';

/* ──────────────────────────────────────────────────────────────
   Utilities & Filters
   ────────────────────────────────────────────────────────────── */

function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(str: string, max: number): string {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function matchesFilter(packet: PacketEvent, filter: string): boolean {
    if (!filter) return true;
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;

    return terms.every(term => {
        if (term.includes('==')) {
            const [key, value] = term.split('==');
            if (!value) return false;

            if (key === 'protocol' || key === 'proto') {
                return packet.protocol.toLowerCase() === value;
            }
            if (key === 'ip') {
                return packet.src_ip.toLowerCase().includes(value) ||
                       packet.dst_ip.toLowerCase().includes(value) ||
                       (packet.domain && packet.domain.toLowerCase().includes(value));
            }
            if (key === 'port') {
                return packet.src_port.toString() === value ||
                       packet.dst_port.toString() === value;
            }
            if (key === 'process' || key === 'proc' || key === 'app') {
                return (packet.process_name || '').toLowerCase().includes(value);
            }
            return false;
        } else {
            return packet.protocol.toLowerCase().includes(term) ||
                   packet.src_ip.toLowerCase().includes(term) ||
                   packet.dst_ip.toLowerCase().includes(term) ||
                   (packet.domain && packet.domain.toLowerCase().includes(term)) ||
                   (packet.process_name || '').toLowerCase().includes(term) ||
                   packet.src_port.toString().includes(term) ||
                   packet.dst_port.toString().includes(term) ||
                   packet.status.toLowerCase().includes(term);
        }
    });
}

/* ──────────────────────────────────────────────────────────────
   Packet Row  (Virtualized, memoized)
   ────────────────────────────────────────────────────────────── */

interface PacketRowProps {
    index: number;
    style: React.CSSProperties;
    data: {
        packets: PacketEvent[];
        selectedId: string | null;
        onSelect: (id: string) => void;
        onAskAI: (packet: PacketEvent) => void;
        getProtocolColor: (protocol: string) => string;
        getProtocolBadge: (protocol: string) => string;
        getStatusBadge: (status: string, direction?: string) => { bg: string; text: string; label: string };
    };
}

const PacketRow = ({ index, style, data }: PacketRowProps) => {
    const packet = data.packets[index];
    if (!packet) return null;

    const isSelected = data.selectedId === packet.id;
    const protocolColor = data.getProtocolColor(packet.protocol);
    const protocolBadge = data.getProtocolBadge(packet.protocol);
    const statusBadge = data.getStatusBadge(packet.status, packet.direction);

    return (
        <div style={style} className="px-2">
            <div
                onClick={() => data.onSelect(packet.id)}
                className={`grid grid-cols-[60px_56px_1fr_1fr_minmax(100px,1.2fr)_70px_minmax(90px,1fr)_80px_44px] gap-2 py-2 font-mono text-xs border-b items-center cursor-pointer transition-all duration-150 ${
                    isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/30'
                        : 'border-white/5 hover:bg-white/[0.03]'
                }`}
            >
                {/* TIME */}
                <div className="text-muted-foreground/70 pl-1 tabular-nums">{packet.timestamp}</div>

                {/* PROTO */}
                <div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${protocolBadge}`}>
                        {packet.protocol}
                    </span>
                </div>

                {/* SOURCE */}
                <div className={`truncate ${protocolColor}`}>
                    {packet.src_ip}<span className="text-white/20">:</span><span className="text-white/40">{packet.src_port}</span>
                </div>

                {/* DESTINATION */}
                <div className="truncate text-purple-400/90">
                    {packet.dst_ip}<span className="text-white/20">:</span><span className="text-white/40">{packet.dst_port}</span>
                </div>

                {/* DOMAIN */}
                <div className="truncate text-sky-400/70" title={packet.domain || packet.dst_ip}>
                    <Globe className="w-3 h-3 inline-block mr-1 opacity-40" />
                    {packet.domain && packet.domain !== packet.dst_ip
                        ? truncate(packet.domain, 28)
                        : <span className="opacity-30">—</span>
                    }
                </div>

                {/* LENGTH */}
                <div className="text-right text-muted-foreground/50 tabular-nums">
                    {formatBytes(packet.length)}
                </div>

                {/* PROCESS */}
                <div className="truncate flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-amber-400/50 flex-shrink-0" />
                    <span className="text-amber-300/80" title={packet.process_name || 'Unknown'}>
                        {packet.process_name && packet.process_name !== 'Unknown'
                            ? truncate(packet.process_name, 14)
                            : <span className="opacity-30">—</span>
                        }
                    </span>
                    {packet.pid > 0 && (
                        <span className="text-[9px] text-white/20 ml-0.5">:{packet.pid}</span>
                    )}
                </div>

                {/* STATUS */}
                <div>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                        {statusBadge.label}
                    </span>
                </div>

                {/* ASK AI */}
                <div className="flex justify-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); data.onAskAI(packet); }}
                        className="p-1 rounded hover:bg-cyan-500/20 text-cyan-400/40 hover:text-cyan-400 transition-colors"
                        title="Ask AI to analyze this packet"
                    >
                        <Brain className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ──────────────────────────────────────────────────────────────
   Packet Detail Panel  (Slide-out right panel)
   ────────────────────────────────────────────────────────────── */

interface DetailPanelProps {
    packet: PacketEvent;
    onClose: () => void;
    onAskAI: (packet: PacketEvent) => void;
}

const DetailPanel = ({ packet, onClose, onAskAI }: DetailPanelProps) => {
    const [showRawJson, setShowRawJson] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(packet, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const service = packet.dpi?.service || '—';

    return (
        <motion.div
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="w-[420px] h-full border-l border-white/10 bg-black/60 backdrop-blur-xl flex flex-col flex-shrink-0 overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/[0.03]">
                <h3 className="font-bold text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-cyan-400" />
                    Packet Inspection
                </h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onAskAI(packet)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-colors"
                    >
                        <Brain className="w-3.5 h-3.5" />
                        Ask AI
                    </button>
                    <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono custom-scrollbar">

                {/* Connection Summary */}
                <section>
                    <h4 className="text-[10px] uppercase text-cyan-400/60 font-bold mb-2 tracking-wider">Connection</h4>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                        <div className="flex justify-between"><span className="text-white/40">Source</span><span className="text-emerald-400">{packet.src_ip}:{packet.src_port}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Destination</span><span className="text-purple-400">{packet.dst_ip}:{packet.dst_port}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Domain</span><span className="text-sky-400">{packet.domain && packet.domain !== packet.dst_ip ? packet.domain : '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Protocol</span><span>{packet.protocol}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Service</span><span className="text-amber-400">{service}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Length</span><span>{formatBytes(packet.length)}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Direction</span><span className="text-cyan-400">{packet.direction || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">Status</span>
                            <span className={packet.status === 'BLOCKED' ? 'text-red-400 font-bold' : 'text-green-400'}>{packet.status}</span>
                        </div>
                        <div className="flex justify-between"><span className="text-white/40">Time</span><span>{packet.timestamp}</span></div>
                    </div>
                </section>

                {/* L3 Headers */}
                {packet.dpi?.l3 && (
                    <section>
                        <h4 className="text-[10px] uppercase text-cyan-400/60 font-bold mb-2 tracking-wider">
                            <Server className="w-3 h-3 inline mr-1" />L3 — Network Layer
                        </h4>
                        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                            <div className="flex justify-between"><span className="text-white/40">IP Version</span><span>IPv{packet.dpi.l3.version}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">TTL</span><span>{packet.dpi.l3.ttl}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Protocol</span><span>{packet.dpi.l3.protocol}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Flags</span>
                                <span className="flex gap-1">{(packet.dpi.l3.flags || []).map(f => (
                                    <span key={f} className="px-1 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[9px]">{f}</span>
                                ))}</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* L4 Headers */}
                {packet.dpi?.l4 && (
                    <section>
                        <h4 className="text-[10px] uppercase text-cyan-400/60 font-bold mb-2 tracking-wider">
                            <Network className="w-3 h-3 inline mr-1" />L4 — Transport Layer
                        </h4>
                        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                            <div className="flex justify-between"><span className="text-white/40">Protocol</span><span>{packet.dpi.l4.protocol}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Src Port</span><span>{packet.dpi.l4.src_port}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Dst Port</span><span>{packet.dpi.l4.dst_port}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Window</span><span>{packet.dpi.l4.window_size}</span></div>
                            <div className="flex justify-between"><span className="text-white/40">Flags</span>
                                <span className="flex gap-1">{(packet.dpi.l4.flags || []).map(f => (
                                    <span key={f} className={`px-1 py-0.5 rounded text-[9px] ${
                                        f === 'SYN' ? 'bg-yellow-500/10 text-yellow-400'
                                        : f === 'RST' ? 'bg-red-500/10 text-red-400'
                                        : f === 'FIN' ? 'bg-orange-500/10 text-orange-400'
                                        : 'bg-green-500/10 text-green-400'
                                    }`}>{f}</span>
                                ))}</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* Process Telemetry */}
                <section>
                    <h4 className="text-[10px] uppercase text-cyan-400/60 font-bold mb-2 tracking-wider">
                        <Cpu className="w-3 h-3 inline mr-1" />Process Telemetry
                    </h4>
                    <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5 space-y-1.5">
                        <div className="flex justify-between"><span className="text-white/40">Process</span><span className="text-amber-300">{packet.process_name || '—'}</span></div>
                        <div className="flex justify-between"><span className="text-white/40">PID</span><span>{packet.pid || '—'}</span></div>
                        <div><span className="text-white/40">Path</span><div className="text-white/60 break-all mt-0.5">{packet.process_path || '—'}</div></div>
                        <div><span className="text-white/40">Command</span><div className="text-white/60 break-all mt-0.5">{packet.process_cmdline || '—'}</div></div>
                        <div className="flex justify-between"><span className="text-white/40">User</span><span>{packet.process_user || '—'}</span></div>
                    </div>
                </section>

                {/* Hex Dump */}
                {packet.hex_dump && (
                    <section>
                        <h4 className="text-[10px] uppercase text-cyan-400/60 font-bold mb-2 tracking-wider">
                            <FileCode className="w-3 h-3 inline mr-1" />Hex Dump
                        </h4>
                        <pre className="bg-black/50 rounded-lg p-3 border border-white/5 text-[10px] leading-relaxed text-green-400/80 overflow-x-auto whitespace-pre">
{packet.hex_dump}
                        </pre>
                    </section>
                )}

                {/* Raw JSON Toggle */}
                <section>
                    <button
                        onClick={() => setShowRawJson(!showRawJson)}
                        className="flex items-center gap-1 text-[10px] uppercase text-white/30 hover:text-white/60 transition-colors mb-2"
                    >
                        <ChevronRight className={`w-3 h-3 transition-transform ${showRawJson ? 'rotate-90' : ''}`} />
                        Raw JSON Data
                    </button>
                    {showRawJson && (
                        <div className="relative">
                            <button
                                onClick={handleCopy}
                                className="absolute top-2 right-2 p-1 rounded bg-white/5 hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                                title="Copy JSON"
                            >
                                <Copy className="w-3 h-3" />
                            </button>
                            {copied && (
                                <span className="absolute top-2 right-8 text-[9px] text-green-400">Copied!</span>
                            )}
                            <pre className="bg-black/50 rounded-lg p-3 border border-white/5 text-[10px] leading-relaxed text-white/50 overflow-x-auto whitespace-pre max-h-60 overflow-y-auto">
{JSON.stringify(packet, null, 2)}
                            </pre>
                        </div>
                    )}
                </section>
            </div>
        </motion.div>
    );
};


/* ──────────────────────────────────────────────────────────────
   Main TrafficPage
   ────────────────────────────────────────────────────────────── */

const TrafficPage = () => {
    const { stats, packetRate } = useWebSocket();
    const navigate = useNavigate();
    const {
        packets: rawPackets,
        queueSize,
        memoryEstimate,
        isPaused,
        setIsPaused,
        selectedPacketId,
        setSelectedPacketId,
        scrollOffset,
        setScrollOffset,
        clearBuffer,
        filterExpression,
        setFilterExpression,
        isScrolledToTop,
        setIsScrolledToTop,
    } = useTraffic();

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const listRef = useRef<List>(null);

    // Apply Wireshark-style Display Filters
    const packets = useMemo(() => {
        return rawPackets.filter(packet => matchesFilter(packet, filterExpression));
    }, [rawPackets, filterExpression]);

    // Find selected packet
    const selectedPacket = useMemo(
        () => (selectedPacketId ? packets.find(p => p.id === selectedPacketId) || null : null),
        [selectedPacketId, packets]
    );

    // Ask AI handler
    const handleAskAI = useCallback((packet: PacketEvent) => {
        const prompt = `🔍 **Analyze this network packet for security implications:**\n\n` +
            `**Connection:** ${packet.src_ip}:${packet.src_port} → ${packet.dst_ip}:${packet.dst_port}\n` +
            `**Protocol:** ${packet.protocol} | **Status:** ${packet.status}\n` +
            `**Domain:** ${packet.domain || 'N/A'} | **Service:** ${packet.dpi?.service || 'Unknown'}\n` +
            `**Process:** ${packet.process_name || 'Unknown'} (PID: ${packet.pid})\n` +
            `**Process Path:** ${packet.process_path || 'N/A'}\n` +
            `**User:** ${packet.process_user || 'N/A'}\n` +
            `**Length:** ${formatBytes(packet.length)}\n\n` +
            `**Full Packet JSON:**\n\`\`\`json\n${JSON.stringify(packet, null, 2)}\n\`\`\`\n\n` +
            `Analyze for: C2 communication, data exfiltration, port scans, protocol anomalies, and process legitimacy.`;

        localStorage.setItem('sentinel_ai_prompt', prompt);
        navigate('/dashboard/ai');
    }, [navigate]);

    // Row selection
    const handleSelectPacket = useCallback((id: string) => {
        setSelectedPacketId(prev => prev === id ? null : id);
    }, [setSelectedPacketId]);

    // Color helpers
    const getProtocolColor = useCallback((protocol: string) => {
        return protocol === 'TCP' ? 'text-emerald-400/90' : protocol === 'UDP' ? 'text-blue-400/90' : 'text-orange-400/90';
    }, []);

    const getProtocolBadge = useCallback((protocol: string) => {
        return protocol === 'TCP'
            ? 'bg-emerald-500/15 text-emerald-400'
            : protocol === 'UDP'
                ? 'bg-blue-500/15 text-blue-400'
                : 'bg-orange-500/15 text-orange-400';
    }, []);

    // Set status badge to "IN" or "OUT" (or "BLOCKED")
    const getStatusBadge = useCallback((status: string, direction?: string): { bg: string; text: string; label: string } => {
        if (status === 'BLOCKED') return { bg: 'bg-red-500/15', text: 'text-red-400', label: 'BLOCKED' };
        if (direction === 'IN') return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'IN' };
        if (direction === 'OUT') return { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'OUT' };
        
        // Fallback checks
        if (status === 'ESTABLISHED') return { bg: 'bg-green-500/10', text: 'text-green-400/70', label: 'OUT' };
        if (status === 'SYN_SENT') return { bg: 'bg-yellow-500/10', text: 'text-yellow-400/70', label: 'OUT' };
        return { bg: 'bg-white/5', text: 'text-white/40', label: direction || status };
    }, []);

    // Memoized list item data
    const itemData = useMemo(() => ({
        packets,
        selectedId: selectedPacketId,
        onSelect: handleSelectPacket,
        onAskAI: handleAskAI,
        getProtocolColor,
        getProtocolBadge,
        getStatusBadge,
    }), [packets, selectedPacketId, handleSelectPacket, handleAskAI, getProtocolColor, getProtocolBadge, getStatusBadge]);

    // Scroll handling (low overhead, no context updates while dragging)
    const scrollOffsetRef = useRef(scrollOffset);
    const handleScroll = useCallback(({ scrollOffset }: { scrollOffset: number }) => {
        scrollOffsetRef.current = scrollOffset;
        setIsScrolledToTop(scrollOffset === 0);
    }, [setIsScrolledToTop]);

    // Save scroll position to context on unmount
    useEffect(() => {
        return () => {
            setScrollOffset(scrollOffsetRef.current);
        };
    }, [setScrollOffset]);

    // Scroll to saved position on mount
    useEffect(() => {
        if (listRef.current && scrollOffset > 0) {
            listRef.current.scrollTo(scrollOffset);
        }
    }, [scrollOffset]);

    // Auto-scroll to top for new packets if user is at the top
    useEffect(() => {
        if (isScrolledToTop && listRef.current && packets.length > 0) {
            listRef.current.scrollToItem(0, 'start');
        }
    }, [packets.length, isScrolledToTop]);

    // Clear logs handler using TrafficContext
    const handleClearLogs = useCallback(() => {
        setIsClearing(true);
        setTimeout(() => {
            clearBuffer();
            setIsClearing(false);
            setShowClearConfirm(false);
            setSelectedPacketId(null);
        }, 300);
    }, [clearBuffer, setSelectedPacketId]);

    // Export CSV
    const handleExportLogs = useCallback(() => {
        if (packets.length === 0) return;

        const headers = ['Timestamp', 'Protocol', 'Source IP', 'Source Port', 'Dest IP', 'Dest Port', 'Domain', 'Length', 'Process', 'PID', 'Direction', 'Status'];
        const rows = packets.map(p => [
            p.timestamp, p.protocol,
            p.src_ip, p.src_port.toString(),
            p.dst_ip, p.dst_port.toString(),
            p.domain || '', (p.length || 0).toString(),
            p.process_name || '', p.pid.toString(),
            p.direction || '', p.status,
        ]);

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sentinel-traffic-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }, [packets]);

    const ITEM_HEIGHT = 36;

    return (
        <div className="flex h-[calc(100vh-5rem)] text-foreground">
            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col min-w-0 p-6 space-y-4">

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Network className="w-8 h-8 text-cyan-400" />
                            Live Network Traffic
                        </h1>
                        <p className="text-muted-foreground font-mono text-xs">
                            DEEP PACKET INSPECTION // WIRESHARK-STYLE MONITORING
                        </p>
                    </div>

                    <div className="flex gap-3 items-center">
                        {/* Flow Rate */}
                        <div className="glass-card px-4 py-2 flex items-center gap-3 border border-cyan-500/30">
                            <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                            <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground uppercase">Flow Rate</span>
                                <span className="font-mono font-bold text-lg leading-none">
                                    {packetRate} <span className="text-xs opacity-50">pps</span>
                                </span>
                            </div>
                        </div>

                        {/* Memory */}
                        <div className="glass-card px-3 py-2 flex items-center gap-2 border border-amber-500/30">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                            <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground uppercase">Mem</span>
                                <span className="font-mono font-bold text-sm leading-none">{Math.round(memoryEstimate)} KB</span>
                            </div>
                        </div>

                        {/* Export */}
                        <button
                            onClick={handleExportLogs}
                            disabled={packets.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/30 disabled:cursor-not-allowed text-white p-2.5 rounded-full transition-colors"
                            title="Export as CSV"
                        >
                            <Download className="w-4 h-4" />
                        </button>

                        {/* Clear */}
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            disabled={packets.length === 0}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-red-600/30 disabled:cursor-not-allowed text-white p-2.5 rounded-full transition-colors"
                            title="Clear traffic logs"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Pause/Play */}
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground p-2.5 rounded-full transition-colors"
                            title={isPaused ? 'Resume' : 'Pause'}
                        >
                            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Wireshark-style Display Filters input bar */}
                <div className="flex gap-2 items-center bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex-shrink-0">
                    <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider whitespace-nowrap">Display Filter:</span>
                    <input
                        type="text"
                        placeholder="e.g. protocol==TCP ip==192.168.1.5 port==443 process==chrome.exe"
                        value={filterExpression}
                        onChange={(e) => setFilterExpression(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs font-mono text-white flex-1 placeholder:text-white/20"
                    />
                    {filterExpression && (
                        <button
                            onClick={() => setFilterExpression('')}
                            className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Clear Confirmation Dialog */}
                {showClearConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => !isClearing && setShowClearConfirm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="glass-card rounded-xl border border-white/10 p-6 max-w-sm"
                            onClick={e => e.stopPropagation()}
                        >
                            <h2 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2">
                                <Trash2 className="w-5 h-5" />
                                Clear Traffic Logs?
                            </h2>
                            <p className="text-muted-foreground mb-4 text-sm">
                                This will delete all {packets.length} captured packets from memory. This action cannot be undone.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    disabled={isClearing}
                                    className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleClearLogs}
                                    disabled={isClearing}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isClearing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Clearing...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" />
                                            Clear All
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}

                {/* ── Packet Table ── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-xl border border-white/10 overflow-hidden relative bg-black/40 flex-1 flex flex-col"
                >
                    {/* Column Headers */}
                    <div className="grid grid-cols-[60px_56px_1fr_1fr_minmax(100px,1.2fr)_70px_minmax(90px,1fr)_80px_44px] gap-2 px-2 py-2.5 bg-white/5 font-mono text-[10px] font-bold text-cyan-400/60 border-b border-white/10 uppercase tracking-wider flex-shrink-0">
                        <div className="pl-1">Time</div>
                        <div>Proto</div>
                        <div>Source</div>
                        <div>Destination</div>
                        <div>Domain</div>
                        <div className="text-right">Length</div>
                        <div>Process</div>
                        <div>Status</div>
                        <div className="text-center">AI</div>
                    </div>

                    {/* Virtualized List */}
                    {packets.length > 0 ? (
                        <div className="relative flex-1" style={{ minHeight: '400px' }}>
                            <List
                                ref={listRef}
                                height={500}
                                itemCount={packets.length}
                                itemSize={ITEM_HEIGHT}
                                width="100%"
                                itemData={itemData}
                                onScroll={handleScroll}
                                overscanCount={10}
                            >
                                {PacketRow}
                            </List>

                            {/* Scanline overlay */}
                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.4)_50%)] bg-[length:100%_4px] opacity-10" />
                        </div>
                    ) : (
                        <div className="h-96 flex items-center justify-center text-muted-foreground/30 font-mono">
                            {isPaused ? (
                                <span>PAUSED — WAITING FOR INTERACTION</span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                                    WAITING FOR TRAFFIC...
                                </span>
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="px-4 py-2 bg-white/5 border-t border-white/10 font-mono text-[10px] text-muted-foreground flex justify-between flex-shrink-0">
                        <span>Packets: {packets.length} / 1000</span>
                        <span>Queue: {queueSize}</span>
                        <span>Memory: {Math.round(memoryEstimate)} KB</span>
                        <span className={isPaused ? 'text-yellow-400' : 'text-green-400'}>{isPaused ? '⏸ PAUSED' : '● LIVE'}</span>
                    </div>
                </motion.div>
            </div>

            {/* ── Detail Panel (slides in from right) ── */}
            <AnimatePresence>
                {selectedPacket && (
                    <DetailPanel
                        key={selectedPacket.id}
                        packet={selectedPacket}
                        onClose={() => setSelectedPacketId(null)}
                        onAskAI={handleAskAI}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default TrafficPage;
