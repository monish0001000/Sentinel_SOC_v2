import { motion } from "framer-motion";
import { Shield, Activity, Brain, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-6">
      <div className="max-w-6xl mx-auto text-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="flex items-center justify-center gap-4 mb-8"
        >
          <div className="relative">
            <Shield className="w-16 h-16 text-primary" />
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            <span className="text-foreground">SENT</span>
            <span className="text-primary glow-text">INEL</span>
          </h1>
        </motion.div>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl md:text-2xl text-muted-foreground mb-4 font-mono"
        >
          AI-Powered Real-Time Security Monitoring
        </motion.p>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-lg text-muted-foreground/70 mb-12 max-w-2xl mx-auto"
        >
          Real-time threat detection, intelligent log analysis, and AI-driven security insights 
          for SOC analysts and security professionals.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-20"
        >
          <Button asChild size="lg" className="group glow-cyan">
            <Link to="/login" className="flex items-center gap-2">
              Launch Dashboard
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-primary/30 hover:border-primary/60">
            <a href="#features">Explore Features</a>
          </Button>
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="grid md:grid-cols-3 gap-6"
          id="features"
        >
          <FeatureCard
            icon={<Activity className="w-8 h-8" />}
            title="Live Monitoring"
            description="Real-time packet inspection and traffic analysis via WebSocket streaming with sub-second latency."
            delay={0.7}
          />
          <FeatureCard
            icon={<Shield className="w-8 h-8" />}
            title="Threat Detection"
            description="Identify brute-force attacks, suspicious IPs, and anomalous behavior as they happen in real-time."
            delay={0.8}
          />
          <FeatureCard
            icon={<Brain className="w-8 h-8" />}
            title="AI Security Analyst"
            description="AI-powered threat classification, confidence scoring, and automated response recommendations."
            delay={0.9}
          />
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="mt-20 grid grid-cols-3 gap-8 max-w-3xl mx-auto"
        >
          <StatItem value="99.9%" label="Uptime" />
          <StatItem value="<50ms" label="Detection Time" />
          <StatItem value="24/7" label="Monitoring" />
        </motion.div>
      </div>
    </section>
  );
};

const FeatureCard = ({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay }}
    whileHover={{ scale: 1.02, y: -5 }}
    className="cyber-border bg-card/50 backdrop-blur-sm rounded-lg p-6 text-left hover:bg-card/80 transition-colors"
  >
    <div className="text-primary mb-4">{icon}</div>
    <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
    <p className="text-muted-foreground text-sm">{description}</p>
  </motion.div>
);

const StatItem = ({ value, label }: { value: string; label: string }) => (
  <div className="text-center">
    <div className="text-3xl font-bold text-primary font-mono">{value}</div>
    <div className="text-sm text-muted-foreground">{label}</div>
  </div>
);
