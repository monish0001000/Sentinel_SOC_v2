import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, Save, X, ToggleLeft, ToggleRight, ShieldAlert, Lock, Cpu, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useWebSocket } from '@/hooks/useWebSocket';

const API_URL = "http://localhost:8000";

interface Policy {
    id: string;
    name: string;
    source_zone: string;
    dest_zone: string;
    source_ip: string;
    app: string;
    process_name: string;
    action: "allow" | "deny";
    hits: number;
}

// ─── Compliance Preset Definitions ────────────────────────────
interface CompliancePreset {
    id: string;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    rules: Array<{
        name: string;
        source_zone: string;
        dest_zone: string;
        source_ip: string;
        app: string;
        action: string;
        process_name?: string;
    }>;
}

const COMPLIANCE_PRESETS: CompliancePreset[] = [
    {
        id: "lateral_movement",
        label: "Block Lateral Movement",
        description: "Prevents east-west traffic between trusted zones",
        icon: <Network className="w-5 h-5" />,
        color: "from-red-500/20 to-orange-500/20 border-red-500/30",
        rules: [
            { name: "[Compliance] Block Lateral Movement", source_zone: "Trust", dest_zone: "Trust", source_ip: "any", app: "any", action: "deny" }
        ]
    },
    {
        id: "zero_trust",
        label: "Enforce Zero Trust Framework",
        description: "Blocks all untrusted process traffic by default",
        icon: <ShieldAlert className="w-5 h-5" />,
        color: "from-purple-500/20 to-blue-500/20 border-purple-500/30",
        rules: [
            { name: "[Compliance] Zero Trust — Block Untrusted", source_zone: "Untrust", dest_zone: "any", source_ip: "any", app: "any", action: "deny", process_name: "unknown" }
        ]
    },
    {
        id: "high_risk_ports",
        label: "Block High-Risk Ports",
        description: "Blocks RDP (3389), SMB (445), Telnet (23)",
        icon: <Lock className="w-5 h-5" />,
        color: "from-amber-500/20 to-yellow-500/20 border-amber-500/30",
        rules: [
            { name: "[Compliance] Block RDP", source_zone: "any", dest_zone: "any", source_ip: "any", app: "rdp", action: "deny" },
            { name: "[Compliance] Block SMB", source_zone: "any", dest_zone: "any", source_ip: "any", app: "smb", action: "deny" },
            { name: "[Compliance] Block Telnet", source_zone: "any", dest_zone: "any", source_ip: "any", app: "telnet", action: "deny" }
        ]
    },
    {
        id: "deny_unsigned",
        label: "Deny Unsigned Processes",
        description: "Blocks traffic from unknown/unidentified processes",
        icon: <Cpu className="w-5 h-5" />,
        color: "from-cyan-500/20 to-teal-500/20 border-cyan-500/30",
        rules: [
            { name: "[Compliance] Deny Unsigned Processes", source_zone: "any", dest_zone: "any", source_ip: "any", app: "any", action: "deny", process_name: "unknown" }
        ]
    }
];


const PoliciesPage = () => {
    const { firewall } = useWebSocket();
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [activePresets, setActivePresets] = useState<Record<string, string[]>>({});
    const [newPolicy, setNewPolicy] = useState({
        name: "New Policy",
        source_zone: "Any",
        dest_zone: "Any",
        source_ip: "Any",
        app: "Any",
        process_name: "Any",
        action: "deny"
    });

    const getAuthHeaders = () => {
        const token = localStorage.getItem("sentinel_token");
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };
    };

    const fetchPolicies = async () => {
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) { window.location.href = "/login"; return; }

            const res = await fetch(`${API_URL}/firewall/policies`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.status === 401) { window.location.href = "/login"; return; }
            if (!res.ok) throw new Error("Failed to fetch policies");
            const data = await res.json();
            if (Array.isArray(data)) {
                setPolicies(data);
            } else {
                setPolicies([]);
            }
        } catch (e) {
            console.error("Failed to fetch policies");
            setPolicies([]);
        }
    };

    useEffect(() => {
        fetchPolicies();
    }, []);

    // Sync with WebSocket
    useEffect(() => {
        if (firewall.policies && firewall.policies.length > 0) {
            setPolicies(firewall.policies);
        }
    }, [firewall.policies]);

    // Detect active compliance presets from current policies
    useEffect(() => {
        const detected: Record<string, string[]> = {};
        for (const preset of COMPLIANCE_PRESETS) {
            const matchedIds: string[] = [];
            for (const rule of preset.rules) {
                const found = policies.find(p => p.name === rule.name);
                if (found) matchedIds.push(found.id);
            }
            if (matchedIds.length === preset.rules.length) {
                detected[preset.id] = matchedIds;
            }
        }
        setActivePresets(detected);
    }, [policies]);

    const handleTogglePreset = async (preset: CompliancePreset) => {
        const isActive = !!activePresets[preset.id];

        if (isActive) {
            // Delete all rules belonging to this preset
            const idsToDelete = activePresets[preset.id];
            for (const ruleId of idsToDelete) {
                try {
                    await fetch(`${API_URL}/firewall/policies/${ruleId}`, {
                        method: "DELETE",
                        headers: getAuthHeaders()
                    });
                } catch (e) {
                    console.error(`Failed to delete rule ${ruleId}`);
                }
            }
            toast.success(`${preset.label} — Disabled`);
        } else {
            // Create all rules for this preset
            for (const rule of preset.rules) {
                try {
                    await fetch(`${API_URL}/firewall/policies`, {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify(rule)
                    });
                } catch (e) {
                    console.error(`Failed to create rule: ${rule.name}`);
                }
            }
            toast.success(`${preset.label} — Enabled`);
        }

        // Refresh to sync
        setTimeout(fetchPolicies, 200);
    };

    const handleAddPolicy = async () => {
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) { window.location.href = "/login"; return; }

            const res = await fetch(`${API_URL}/firewall/policies`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(newPolicy),
            });

            if (res.status === 401) { toast.error("Session expired"); window.location.href = "/login"; return; }
            if (res.ok) {
                toast.success("Policy Created");
                setIsAdding(false);
                fetchPolicies();
            } else {
                toast.error("Failed to create policy");
            }
        } catch (e) {
            toast.error("Error creating policy");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this policy?")) return;
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) { window.location.href = "/login"; return; }

            const res = await fetch(`${API_URL}/firewall/policies/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.status === 401) { toast.error("Session expired"); window.location.href = "/login"; return; }
            if (res.ok) {
                toast.success("Policy Deleted");
                fetchPolicies();
            }
        } catch (e) {
            toast.error("Error deleting policy");
        }
    };

    return (
        <div className="space-y-6 text-foreground p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="w-8 h-8 text-primary" />
                        Security Policies (Zero Trust)
                    </h1>
                    <p className="text-muted-foreground">Manage Next-Gen Firewall traffic rules & compliance frameworks.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Policy
                </button>
            </div>

            {/* ─── Compliance Toggles ──────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {COMPLIANCE_PRESETS.map((preset) => {
                    const isActive = !!activePresets[preset.id];
                    return (
                        <motion.button
                            key={preset.id}
                            onClick={() => handleTogglePreset(preset)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                                "relative p-4 rounded-xl border transition-all duration-300 text-left",
                                "bg-gradient-to-br backdrop-blur-sm",
                                preset.color,
                                isActive
                                    ? "ring-2 ring-green-500/50 shadow-lg shadow-green-500/10"
                                    : "opacity-70 hover:opacity-100"
                            )}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className={cn(
                                    "p-2 rounded-lg",
                                    isActive ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/60"
                                )}>
                                    {preset.icon}
                                </div>
                                <div className="transition-colors duration-200">
                                    {isActive
                                        ? <ToggleRight className="w-6 h-6 text-green-400" />
                                        : <ToggleLeft className="w-6 h-6 text-white/30" />
                                    }
                                </div>
                            </div>
                            <h3 className="font-bold text-sm mt-2">{preset.label}</h3>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{preset.description}</p>
                            <div className={cn(
                                "mt-3 text-[10px] font-mono uppercase tracking-widest font-bold",
                                isActive ? "text-green-400" : "text-white/30"
                            )}>
                                {isActive ? "● ENFORCED" : "○ INACTIVE"}
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* ─── Policies Table ──────────────────────────────────── */}
            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-4 bg-muted/20 font-bold text-sm uppercase tracking-wider text-muted-foreground border-b border-white/10">
                    <div className="col-span-2">Name</div>
                    <div className="col-span-1">Src</div>
                    <div className="col-span-1">Dst</div>
                    <div className="col-span-2">App</div>
                    <div className="col-span-3">Process Identity</div>
                    <div className="col-span-1">Action</div>
                    <div className="col-span-1">Hits</div>
                    <div className="col-span-1"></div>
                </div>

                <div className="divide-y divide-white/10 max-h-[500px] overflow-y-auto">
                    <AnimatePresence>
                        {isAdding && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-12 gap-2 p-4 bg-primary/5 items-center"
                            >
                                <div className="col-span-2">
                                    <input className="bg-transparent border-b border-white/20 w-full focus:outline-none focus:border-primary transition-colors" value={newPolicy.name} onChange={e => setNewPolicy({ ...newPolicy, name: e.target.value })} />
                                </div>
                                <div className="col-span-1">
                                    <select className="bg-transparent border-b border-white/20 w-full text-xs" value={newPolicy.source_zone} onChange={e => setNewPolicy({ ...newPolicy, source_zone: e.target.value })}>
                                        <option value="Any">Any</option>
                                        <option value="Trust">Trust</option>
                                        <option value="Untrust">Untrust</option>
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <select className="bg-transparent border-b border-white/20 w-full text-xs" value={newPolicy.dest_zone} onChange={e => setNewPolicy({ ...newPolicy, dest_zone: e.target.value })}>
                                        <option value="Any">Any</option>
                                        <option value="Trust">Trust</option>
                                        <option value="Untrust">Untrust</option>
                                        <option value="DMZ">DMZ</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <input className="bg-transparent border-b border-white/20 w-full" placeholder="App (e.g. ssh)" value={newPolicy.app} onChange={e => setNewPolicy({ ...newPolicy, app: e.target.value })} />
                                </div>
                                <div className="col-span-3">
                                    <input className="bg-transparent border-b border-white/20 w-full text-blue-300" placeholder="Process (e.g. chrome.exe)" value={newPolicy.process_name} onChange={e => setNewPolicy({ ...newPolicy, process_name: e.target.value })} />
                                </div>
                                <div className="col-span-1">
                                    <select className="bg-transparent border-b border-white/20 w-full" value={newPolicy.action} onChange={e => setNewPolicy({ ...newPolicy, action: e.target.value as any })}>
                                        <option value="allow">Allow</option>
                                        <option value="deny">Deny</option>
                                    </select>
                                </div>
                                <div className="col-span-1 text-muted-foreground">-</div>
                                <div className="col-span-1 flex gap-2">
                                    <button onClick={handleAddPolicy} className="p-1 hover:text-green-400 transition-colors"><Save className="w-4 h-4" /></button>
                                    <button onClick={() => setIsAdding(false)} className="p-1 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
                                </div>
                            </motion.div>
                        )}

                        {policies.map((policy) => (
                            <motion.div
                                key={policy.id}
                                layout
                                className={cn(
                                    "grid grid-cols-12 gap-2 p-4 items-center hover:bg-white/5 transition-colors group",
                                    policy.name.startsWith("[Compliance]") && "bg-gradient-to-r from-primary/5 to-transparent"
                                )}
                            >
                                <div className="col-span-2 font-medium truncate" title={policy.name}>
                                    {policy.name.startsWith("[Compliance]") && (
                                        <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse" />
                                    )}
                                    {policy.name}
                                </div>
                                <div className="col-span-1 flex items-center gap-2 text-xs">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 truncate">{policy.source_zone}</span>
                                </div>
                                <div className="col-span-1 flex items-center gap-2 text-xs">
                                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 truncate">{policy.dest_zone}</span>
                                </div>
                                <div className="col-span-2 text-sm opacity-80 truncate">{policy.app}</div>
                                <div className="col-span-3 text-sm text-blue-200 font-mono truncate" title={policy.process_name || "Any"}>
                                    {policy.process_name || "Any"}
                                </div>
                                <div className="col-span-1">
                                    <span className={cn(
                                        "px-2 py-1 rounded text-xs font-bold uppercase",
                                        policy.action === "allow" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    )}>
                                        {policy.action}
                                    </span>
                                </div>
                                <div className="col-span-1 font-mono text-sm opacity-60">{policy.hits}</div>
                                <div className="col-span-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDelete(policy.id)} className="p-2 hover:bg-red-500/20 text-red-400 rounded transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {policies.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                            No policies configured. Use the compliance toggles above or add a custom policy.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PoliciesPage;
