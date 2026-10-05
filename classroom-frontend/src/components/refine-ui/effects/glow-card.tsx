import { useRef, type ComponentProps, type PointerEvent } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card with a radial glow that tracks the cursor along the border
 * (design brief §1 — "gentle radial glow that tracks the user's cursor").
 * Also adds a tactile hover lift; disabled under prefers-reduced-motion.
 */
export function GlowCard({ className, children, ...props }: ComponentProps<typeof Card>) {
  const ref = useRef<HTMLDivElement>(null);

  const trackGlow = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
    el.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
  };

  return (
    <Card
      ref={ref}
      onPointerEnter={trackGlow}
      onPointerMove={trackGlow}
      className={cn(
        "group/glow isolate relative overflow-hidden",
        "transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]",
        "hover:-translate-y-1 hover:shadow-lg",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-sm",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 opacity-0",
          "transition-opacity duration-300 group-hover/glow:opacity-100",
          "[--glow-x:50%] [--glow-y:50%]",
          "[background:radial-gradient(260px_circle_at_var(--glow-x)_var(--glow-y),oklch(0.7686_0.1647_70.0804/0.14),transparent_65%)]"
        )}
      />
      {children}
    </Card>
  );
}
