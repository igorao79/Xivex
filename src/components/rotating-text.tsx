"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";

interface RotatingTextProps {
  texts: string[];
  rotationInterval?: number;
  className?: string;
}

export function RotatingText({
  texts,
  rotationInterval = 2000,
  className = "",
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % texts.length);
  }, [texts.length]);

  useEffect(() => {
    const interval = setInterval(next, rotationInterval);
    return () => clearInterval(interval);
  }, [next, rotationInterval]);

  return (
    <span className={`inline-flex overflow-hidden ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={texts[index]}
          initial={{ y: "100%", opacity: 0, filter: "blur(4px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-100%", opacity: 0, filter: "blur(4px)" }}
          transition={{
            y: { type: "spring", stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
            filter: { duration: 0.2 },
          }}
          className="inline-block text-primary"
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
