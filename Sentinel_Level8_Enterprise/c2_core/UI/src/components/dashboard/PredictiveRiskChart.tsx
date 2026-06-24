import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldAlert } from 'lucide-react';

interface PredictiveRiskChartProps {
    currentRisk: number;
}

const PredictiveRiskChart: React.FC<PredictiveRiskChartProps> = ({ currentRisk }) => {
    const [data, setData] = useState<{ time: string; risk: number }[]>([]);

    // Initialize with some empty data or previous state if needed
    useEffect(() => {
        // Initial fill if empty
        if (data.length === 0) {
            const initial = Array(10).fill(0).map((_, i) => ({
                time: new Date(Date.now() - (10 - i) * 1000).toLocaleTimeString(),
                risk: 10 // Baseline
            }));
            setData(initial);
        }
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setData(prev => {
                const newData = [
                    ...prev,
                    {
                        time: new Date().toLocaleTimeString(),
                        risk: currentRisk
                    }
                ];
                // Keep last 20 data points
                return newData.slice(-20);
            });
        }, 1000); // Update every second

        return () => clearInterval(interval);
    }, [currentRisk]);

    return (
        <div className="bg-gray-900/50 p-4 rounded-2xl border border-white/10 relative overflow-hidden h-[300px] flex flex-col">
            <div className="flex items-center gap-2 mb-4 z-10 relative">
                <ShieldAlert className="w-5 h-5 text-orange-500 animate-pulse" />
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Predictive Risk Trend</h3>
            </div>

            <div className="absolute top-0 right-0 p-4 z-10">
                <span className={`text-4xl font-black font-mono ${currentRisk > 80 ? 'text-red-500' : currentRisk > 50 ? 'text-orange-400' : 'text-emerald-400'}`}>
                    {currentRisk}
                </span>
                <span className="text-xs text-gray-500 block text-right">CURRENT SCORE</span>
            </div>

            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={currentRisk > 50 ? "#f97316" : "#10b981"} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={currentRisk > 50 ? "#f97316" : "#10b981"} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        {/* <XAxis dataKey="time" hide /> */}
                        <YAxis domain={[0, 100]} hide />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="risk"
                            stroke={currentRisk > 50 ? "#f97316" : "#10b981"}
                            fillOpacity={1}
                            fill="url(#colorRisk)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default PredictiveRiskChart;
