import { LogOut, MousePointerClick, Move, ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ROLE_LABEL,
  type CampusRole,
  type CampusTheme,
  type Destination,
} from "../config";

/**
 * 2D chrome above the scene: where you are, who you are, what you can open.
 *
 * The rail is a real, keyboard-navigable button list — it doubles as the
 * accessible (and WebGL-less) way to reach every destination, and it mirrors
 * hover state coming back from the 3D cards.
 */
export function CampusHud({
  theme,
  role,
  destinations,
  activeId,
  hoveredId,
  dimmed,
  onSelect,
  onExit,
  onHoverItem,
}: {
  theme: CampusTheme;
  role: CampusRole;
  destinations: Destination[];
  activeId: string | null;
  hoveredId: string | null;
  dimmed: boolean;
  onSelect: (destination: Destination) => void;
  onExit: () => void;
  onHoverItem: (id: string | null) => void;
}) {
  return (
    <div
      className={cn("campus-hud", dimmed && "campus-hud--dimmed")}
      style={{ ["--campus-accent" as string]: theme.accentCss }}
    >
      <header className="campus-hud__top">
        <div className="campus-hud__brand">
          <span className="campus-hud__pulse" aria-hidden="true" />
          <div>
            <p className="campus-hud__eyebrow">Campus 3D</p>
            <h1 className="campus-hud__title">{theme.stage}</h1>
            <p className="campus-hud__tagline">{theme.tagline}</p>
          </div>
        </div>

        <div className="campus-hud__top-right">
          <span className="campus-hud__role">
            <span className="campus-hud__role-dot" aria-hidden="true" />
            {ROLE_LABEL[role]}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onExit}
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Exit to app
          </Button>
        </div>
      </header>

      <nav className="campus-hud__rail" aria-label="Campus destinations">
        <p className="campus-hud__rail-title">
          {destinations.length} destinations
        </p>
        <ul>
          {destinations.map((destination, index) => {
            const Icon = destination.icon;
            const isActive = destination.id === activeId;
            const isHovered = destination.id === hoveredId;
            return (
              <li key={destination.id}>
                <button
                  type="button"
                  onClick={() => onSelect(destination)}
                  onMouseEnter={() => onHoverItem(destination.id)}
                  onMouseLeave={() => onHoverItem(null)}
                  onFocus={() => onHoverItem(destination.id)}
                  onBlur={() => onHoverItem(null)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "campus-rail-item",
                    (isHovered || isActive) && "is-lit",
                  )}
                >
                  <span className="campus-rail-item__index">
                    {index + 1}
                  </span>
                  <Icon className="campus-rail-item__icon" />
                  <span className="campus-rail-item__text">
                    <span className="campus-rail-item__label">
                      {destination.label}
                    </span>
                    <span className="campus-rail-item__blurb">
                      {destination.blurb}
                    </span>
                  </span>
                  <span className="campus-rail-item__code">
                    {destination.kind === "route" ? "door" : destination.code}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="campus-hud__hint">
        <span>
          <ScrollText className="h-3.5 w-3.5" />
          Scroll
        </span>
        <span className="campus-hud__hint-sep" aria-hidden="true" />
        <span>
          <Move className="h-3.5 w-3.5" />
          Drag or ←/→ to look around
        </span>
        <span className="campus-hud__hint-sep" aria-hidden="true" />
        <span>
          <MousePointerClick className="h-3.5 w-3.5" />
          Click a panel · 1–9 shortcuts · Esc to step back
        </span>
      </div>
    </div>
  );
}
