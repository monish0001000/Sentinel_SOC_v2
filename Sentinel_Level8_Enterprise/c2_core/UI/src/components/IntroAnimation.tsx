import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, Shield, Cpu, Wifi, Lock } from "lucide-react";

interface IntroAnimationProps {
    onComplete: () => void;
}

const bootLines = [
    { text: "INITIALIZING SENTINEL KERNEL v2.5.0...", delay: 0 },
    { text: "LOADING SECURITY MODULES...", delay: 800 },
    { text: "> MOUNTING FILE SYSTEM [OK]", delay: 1500 },
    { text: "> ESTABLISHING SECURE HANDSHAKE [OK]", delay: 2200 },
    { text: "> VERIFYING INTEGRITY SIGNATURES...", delay: 3000 },
    { text: "ACCESS GRANTED. WELCOME ANALYST.", delay: 4000 },
];

export const IntroAnimation = ({ onComplete }: IntroAnimationProps) => {
    const [currentLine, setCurrentLine] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Progress Bar Animation
        const progressInterval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(progressInterval);
                    return 100;
                }
                return prev + 1; // Approx 3-4 seconds to reach 100%
            });
        }, 35);

        // Text Lines Animation
        bootLines.forEach((line, index) => {
            setTimeout(() => {
                setCurrentLine(index + 1);
            }, line.delay);
        });

        // Complete Animation
        const totalTime = bootLines[bootLines.length - 1].delay + 1500;
        const timeout = setTimeout(() => {
            onComplete();
        }, totalTime);

        return () => {
            clearInterval(progressInterval);
            clearTimeout(timeout);
        };
    }, [onComplete]);

    return (
        <motion.div
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center font-mono text-blue-500 overflow-hidden"
            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
            transition={{ duration: 0.8 }}
        >
            {/* Background Matrix/Scanline Effects */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(0,0,255,0.06),rgba(0,0,255,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] opacity-20 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.1),transparent)] pointer-events-none" />

            <div className="max-w-xl w-full p-8 relative z-10">
                {/* LOGO ANIMATION */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-3 mb-10"
                >
                    <div className="relative">
                        <Shield className="w-12 h-12 text-blue-500" />
                        <motion.div
                            className="absolute inset-0 bg-blue-500 blur-md opacity-50"
                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        />
                    </div>
                    <h1 className="text-3xl font-black tracking-[0.2em] text-white">SENTINEL<span className="text-blue-500">.OS</span></h1>
                </motion.div>

                {/* TERMINAL OUTPUT */}
                <div className="space-y-2 mb-8 h-40 font-mono text-sm pl-4 border-l-2 border-blue-500/30">
                    <AnimatePresence>
                        {bootLines.slice(0, currentLine).map((line, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="flex items-center gap-2"
                            >
                                <span className="text-blue-500/50">{">"}</span>
                                <span className={index === bootLines.length - 1 ? "text-white font-bold animate-pulse" : "text-blue-400"}>
                                    {line.text}
                                </span>
                                {index === currentLine - 1 && index !== bootLines.length - 1 && (
                                    <span className="w-2 h-4 bg-blue-500 animate-pulse inline-block ml-1" />
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                {/* LOADING BAR */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs uppercase tracking-widest text-blue-500/70">
                        <span>System Initialization</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-blue-900/20 rounded-full overflow-hidden border border-blue-500/20">
                        <motion.div
                            className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-4 gap-4 text-[10px] text-blue-500/40 uppercase tracking-widest">
                    <div className="flex flex-col items-center gap-1">
                        <Cpu className="w-4 h-4" />
                        <span>Core</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Lock className="w-4 h-4" />
                        <span>Crypto</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Wifi className="w-4 h-4" />
                        <span>Net</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Terminal className="w-4 h-4" />
                        <span>Shell</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
