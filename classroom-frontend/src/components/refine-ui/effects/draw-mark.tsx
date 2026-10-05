import { cn } from "@/lib/utils";

/**
 * Line-drawing vector mark (design brief §3/§4 — "self-drawing paths that
 * trace icons/logos when the page initializes"). Each path uses pathLength=1
 * so the CSS stroke-dash animation is exact regardless of geometry.
 */
export function DrawMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("draw-mark", className)}
    >
      {/* mortarboard */}
      <path pathLength={1} d="M4 18 L24 8 L44 18 L24 28 Z" />
      {/* cap body */}
      <path pathLength={1} d="M12 22.5 V32 C12 36 17.5 39.5 24 39.5 C30.5 39.5 36 36 36 32 V22.5" />
      {/* tassel */}
      <path pathLength={1} d="M44 18 V31 M44 31 L41.5 35.5 M44 31 L46.5 35.5" />
    </svg>
  );
}
