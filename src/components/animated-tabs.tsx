"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Tab {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function AnimatedTabs({
  tabs,
  value,
  onValueChange,
  className,
}: AnimatedTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>(
      `[data-tab-value="${value}"]`
    );
    if (!activeBtn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [value]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex h-11 items-center rounded-xl border bg-muted/50 p-1 text-muted-foreground",
        className
      )}
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg bg-primary/15 shadow-sm ring-1 ring-primary/20"
        initial={false}
        animate={{
          left: indicator.left,
          width: indicator.width,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
      />

      {/* Tab buttons */}
      {tabs.map((tab) => (
        <button
          key={tab.value}
          data-tab-value={tab.value}
          onClick={() => onValueChange(tab.value)}
          className={cn(
            "relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer transition-colors duration-200",
            value === tab.value
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground/80"
          )}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          {tab.badge}
        </button>
      ))}
    </div>
  );
}
