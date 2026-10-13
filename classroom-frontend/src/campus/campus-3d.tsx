import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { usePermissions } from "@refinedev/core";

import { CampusEngine } from "./engine/campus-engine";
import { CampusHud } from "./components/campus-hud";
import { DestinationPanel } from "./panel/destination-panel";
import {
  CAMPUS_THEMES,
  destinationsForRole,
  isCampusRole,
  type CampusRole,
  type Destination,
  type PanelDestination,
} from "./config";
import "./campus.css";

/**
 * Campus 3D — the interactive shell.
 *
 * The room is the navigation: cards floating around you are the application's
 * destinations. Choosing one flies the camera in and opens the real screen in
 * an overlay panel, so every feature keeps working exactly as before while the
 * scene stays alive behind it. Scrolling, dragging and the arrow keys orbit the
 * room; the HUD rail mirrors the same destinations for keyboard and no-WebGL
 * visitors.
 */

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
};

export default function Campus3D() {
  const navigate = useNavigate();
  const { data: permissions } = usePermissions<string>({});
  const role: CampusRole | null = isCampusRole(permissions) ? permissions : null;

  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<CampusEngine | null>(null);
  const openTimer = useRef<number | null>(null);
  const veilTimer = useRef<number | null>(null);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelDestination | null>(null);
  const [failed, setFailed] = useState(false);
  const [veil, setVeil] = useState<string | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const theme = role ? CAMPUS_THEMES[role] : null;
  const destinations = useMemo(
    () => (role ? destinationsForRole(role) : []),
    [role],
  );

  /* --------------------------- interactions --------------------------- */

  const closePanel = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    setPanel(null);
    setActiveId(null);
    engineRef.current?.release();
  }, []);

  const vanish = useCallback(
    (to: string, label: string) => {
      setVeil(label);
      if (veilTimer.current) window.clearTimeout(veilTimer.current);
      veilTimer.current = window.setTimeout(
        () => navigate(to),
        reducedMotion ? 60 : 460,
      );
    },
    [navigate, reducedMotion],
  );

  const selectDestination = useCallback(
    (destination: Destination) => {
      if (destination.kind === "route") {
        vanish(destination.to, destination.label);
        return;
      }
      if (openTimer.current) window.clearTimeout(openTimer.current);
      setActiveId(destination.id);
      engineRef.current?.focus(destination.id);
      setPanel(null);
      openTimer.current = window.setTimeout(
        () => setPanel(destination),
        reducedMotion || failed ? 0 : 640,
      );
    },
    [failed, reducedMotion, vanish],
  );

  /**
   * The engine is built once per role; callbacks go through a ref so the latest
   * render's handlers are always used without rebuilding the scene.
   */
  const handlers = useRef({ select: selectDestination });
  handlers.current.select = selectDestination;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !role || !theme) return;

    const engine = new CampusEngine({
      mount,
      theme,
      nodes: destinations.map(({ id, label, code, blurb }) => ({
        id,
        label,
        code,
        blurb,
      })),
      reducedMotion,
      onHover: setHoveredId,
      onSelect: (id) => {
        const destination = destinations.find((item) => item.id === id);
        if (destination) handlers.current.select(destination);
      },
      onFail: () => setFailed(true),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [destinations, reducedMotion, role, theme]);

  /* ----------------------------- keyboard ----------------------------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (panel) {
          event.preventDefault();
          closePanel();
        } else if (activeId) {
          event.preventDefault();
          closePanel();
        }
        return;
      }
      if (panel || isTypingTarget(event.target)) return;

      if (event.key === "ArrowLeft") {
        engineRef.current?.rotateBy(-0.24);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        engineRef.current?.rotateBy(0.24);
        event.preventDefault();
      } else if (/^[1-9]$/.test(event.key)) {
        const destination = destinations[Number(event.key) - 1];
        if (destination) {
          event.preventDefault();
          selectDestination(destination);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, closePanel, destinations, panel, selectDestination]);

  useEffect(
    () => () => {
      if (openTimer.current) window.clearTimeout(openTimer.current);
      if (veilTimer.current) window.clearTimeout(veilTimer.current);
    },
    [],
  );

  /* ------------------------------- render ------------------------------ */

  return (
    <div
      className="campus-root"
      data-role={role ?? "loading"}
      data-stage={theme?.stage ?? "loading"}
    >
      <div ref={mountRef} className="campus-canvas" aria-hidden="true" />

      {!role && (
        <div className="campus-loading" role="status">
          <span>Preparing your campus</span>
          <span className="campus-loading__bar" />
        </div>
      )}

      {role && theme && (
        <CampusHud
          theme={theme}
          role={role}
          destinations={destinations}
          activeId={activeId}
          hoveredId={hoveredId}
          dimmed={Boolean(panel)}
          onSelect={selectDestination}
          onExit={() => vanish("/", "Leaving the campus")}
          onRotate={(delta) => engineRef.current?.rotateBy(delta)}
        />
      )}

      {failed && theme && (
        <div className="campus-fallback">
          <div>
            <p className="campus-hud__eyebrow">WebGL unavailable</p>
            <h2 className="campus-hud__title">
              {theme.stage} — plain list mode
            </h2>
            <p className="campus-hud__tagline">
              This browser could not start the 3D scene, so here is the same
              campus as a list. Every destination still opens in place.
            </p>
          </div>
          <div className="campus-fallback__grid">
            {destinations.map((destination) => {
              const Icon = destination.icon;
              return (
                <button
                  key={destination.id}
                  type="button"
                  className="campus-fallback__card"
                  onClick={() => selectDestination(destination)}
                >
                  <Icon />
                  <span>
                    <span className="campus-rail-item__label">
                      {destination.label}
                    </span>
                    <br />
                    <span className="campus-rail-item__blurb">
                      {destination.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {panel && theme && (
        <DestinationPanel
          destination={panel}
          theme={theme}
          onClose={closePanel}
        />
      )}

      {veil && (
        <div
          className="campus-veil"
          style={{ ["--campus-accent" as string]: theme?.accentCss }}
          role="status"
        >
          <span className="campus-veil__bar" />
          <span className="campus-veil__label">{veil}</span>
        </div>
      )}

      <p className="sr-only">
        Interactive 3D campus. Around you float panels that open the
        application&apos;s screens: the dashboard, classrooms, the notice board
        and — for staff — the subject and notice editors, plus a door into the
        live 3D classroom. Scroll, drag or use the arrow keys to look around;
        press a number key or activate an item in the list to open it; press
        Escape to step back.
      </p>
    </div>
  );
}
