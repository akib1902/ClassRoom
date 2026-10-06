import { cn } from "@/lib/utils";

const RADIUS = 11;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Progressive form-fill indicator (design brief §1 — "a masked stroke
 * animation around a circle to dynamically track progress as fields are
 * completed"). Read-only; respects prefers-reduced-motion via Tailwind.
 */
export function FieldProgress({
  value,
  className,
}: {
  /** 0..1 */
  value: number;
  className?: string;
}) {
  const clamped = Math.min(1, Math.max(0, value));
  const percent = Math.round(clamped * 100);

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="status"
      aria-label={`Form ${percent} percent complete`}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="14"
          cy="14"
          r={RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth="3"
        />
        <circle
          cx="14"
          cy="14"
          r={RADIUS}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}
