import React, { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Activity } from 'lucide-react';

interface HealingLog {
    timestamp: string;
    message: string;
    item: string;
}

interface SelfHealingWidgetProps {
    alerts: any[];
}

const SelfHealingWidget: React.FC<SelfHealingWidgetProps> = ({ alerts }) => {
    const [logs, setLogs] = useState<HealingLog[]>([]);

    useEffect(() => {
        // Filter alerts for Self-Healing events
        const healingAlerts = alerts
            .filter(a => a.type === 'Self-Healing' || a.source === 'Self-Healing Engine')
            .map(a => ({
                timestamp: new Date(a.timestamp).toLocaleTimeString(),
                message: a.message,
                item: a.message.includes(':') ? a.message.split(': ')[1] : 'System Restoration'
            }))
            .slice(0, 5); // Keep last 5

        if (healingAlerts.length > 0) {
            setLogs(healingAlerts);
        }
    }, [alerts]);

    return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-lg">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-green-400 flex items-center gap-2">
                    <ShieldCheck size={20} /> Self-Healing Matrix
                </h3>
                <Activity size={16} className="text-gray-500 animate-pulse" />
            </div>

            <div className="space-y-3">
                {logs.length === 0 ? (
                    <div className="text-gray-500 text-sm text-center py-4">No healing actions required yet.</div>
                ) : (
                    logs.map((log, idx) => (
                        <div key={idx} className="flex items-start gap-3 bg-gray-900/50 p-2 rounded border border-green-900/30">
                            <RefreshCw size={16} className="text-green-500 mt-1 shrink-0 animate-spin-slow" />
                            <div>
                                <p className="text-green-300 text-sm font-medium">{log.message}</p>
                                <p className="text-gray-500 text-xs">{log.timestamp}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default SelfHealingWidget;
