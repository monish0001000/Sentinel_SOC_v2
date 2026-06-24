import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}

export const AnimatedCounter = ({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  className,
  duration = 1,
}: AnimatedCounterProps) => {
  const [hasUpdated, setHasUpdated] = useState(false);
  const prevValue = useRef(value);

  const spring = useSpring(value, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });

  const display = useTransform(spring, (current) =>
    current.toFixed(decimals)
  );

  useEffect(() => {
    spring.set(value);
    
    if (prevValue.current !== value) {
      setHasUpdated(true);
      const timeout = setTimeout(() => setHasUpdated(false), 500);
      prevValue.current = value;
      return () => clearTimeout(timeout);
    }
  }, [value, spring]);

  return (
    <motion.span
      className={cn(
        "font-mono tabular-nums transition-all",
        hasUpdated && "update-glow animate-counter-update",
        className
      )}
    >
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </motion.span>
  );
};