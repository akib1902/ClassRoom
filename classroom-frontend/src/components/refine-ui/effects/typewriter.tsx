import { cn } from "@/lib/utils";

const WORDS = ["subjects", "grades", "attendance", "rosters"] as const;

/**
 * Pure-CSS typewriter (design brief §4 — "text cycles through a dynamic list
 * of features... in pure CSS"). Words are absolutely stacked and revealed via
 * clip-path steps, so the line has zero layout shift. Falls back to the first
 * word under prefers-reduced-motion.
 */
export function Typewriter({
  sentence = "One place for",
  className,
}: {
  sentence?: string;
  className?: string;
}) {
  return (
    <>
      {sentence}{" "}
      <span className={cn("typewriter", className)} aria-hidden="true">
        {WORDS.map((word) => (
          <span key={word} className="typewriter-word">
            {word}
          </span>
        ))}
      </span>
      <span className="sr-only">{WORDS.join(", ")}</span>
    </>
  );
}
