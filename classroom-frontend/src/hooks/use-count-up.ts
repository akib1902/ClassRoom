import { useEffect, useState } from "react";

/**
 * Animates a number from 0 to `target` on mount.
 * Respects `prefers-reduced-motion` by jumping straight to the target.
 */
export function useCountUp(target: number, duration = 900, decimals = 0): string {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setValue(target);
      return;
    }

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Number((target * eased).toFixed(decimals)));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, decimals]);

  return value.toFixed(decimals);
}
