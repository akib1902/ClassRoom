import { useEffect, useMemo, useRef } from "react";
import { Route, Routes, Link } from "react-router";
import { ArrowLeft, ExternalLink, X } from "lucide-react";

import { PanelRouter } from "./panel-router";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Dashboard from "@/pages/dashboard";
import SubjectsList from "@/pages/subjects/list";
import SubjectCreate from "@/pages/subjects/create";
import SubjectEdit from "@/pages/subjects/edit";
import SubjectShow from "@/pages/subjects/show";
import NoticesList from "@/pages/notices/list";
import NoticeCreate from "@/pages/notices/create";
import NoticeEdit from "@/pages/notices/edit";
import NoticesManage from "@/pages/notices/manage";
import type { CampusTheme, PanelDestination } from "../config";

/**
 * Campus overlay panel.
 *
 * The real screens are mounted inside their own `MemoryRouter`, so every link,
 * redirect and tab inside the panel stays inside the panel — the 3D room keeps
 * running behind it and closing the panel returns you exactly where you were.
 * The surrounding `.dark` scope keeps the shadcn surfaces readable on top of
 * the scene whatever theme the rest of the app is using.
 */

/** Every screen reachable from inside a panel, at its real path. */
function PanelRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/subjects" element={<SubjectsList />} />
      <Route path="/subjects/create" element={<SubjectCreate />} />
      <Route path="/subjects/edit/:id" element={<SubjectEdit />} />
      <Route path="/subjects/show/:id" element={<SubjectShow />} />
      <Route path="/notices" element={<NoticesList />} />
      <Route path="/notices/create" element={<NoticeCreate />} />
      <Route path="/notices/edit/:id" element={<NoticeEdit />} />
      <Route path="/notices/manage" element={<NoticesManage />} />
      <Route
        path="*"
        element={
          <div className="p-10 text-center text-sm text-muted-foreground">
            This screen is not part of the campus overlay.
          </div>
        }
      />
    </Routes>
  );
}

export function DestinationPanel({
  destination,
  theme,
  onClose,
}: {
  destination: PanelDestination;
  theme: CampusTheme;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const Icon = destination.icon;
  const accent = theme.accentCss;

  // Esc closes; focus moves to the close button so keyboard users land inside.
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const transitionClass = useMemo(() => {
    switch (theme.transition) {
      case "iris":
        return "campus-panel--iris";
      case "wipe":
        return "campus-panel--wipe";
      default:
        return "campus-panel--cut";
    }
  }, [theme.transition]);

  return (
    <div
      className={cn(
        "campus-panel dark fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6",
        transitionClass,
      )}
      style={{ ["--campus-accent" as string]: accent }}
      role="dialog"
      aria-modal="true"
      aria-label={destination.label}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="campus-panel__scrim absolute inset-0 cursor-default"
      />

      <section className="campus-panel__frame relative z-10 flex h-[92svh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/85 backdrop-blur-2xl">
        <span className="campus-panel__accent" aria-hidden="true" />

        <header className="flex items-start gap-3 border-b border-border/70 px-4 py-3 sm:px-6 sm:py-4">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
            style={{
              borderColor: `${accent}66`,
              background: `${accent}1f`,
              color: accent,
            }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: accent }}
            >
              {theme.stage}
            </p>
            <h2 className="truncate text-lg font-semibold leading-tight">
              {destination.label}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {destination.blurb}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              asChild
            >
              <Link to="/">
                <ExternalLink className="h-3.5 w-3.5" />
                Open in app
              </Link>
            </Button>
            <Button
              ref={closeRef}
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close panel (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="campus-panel__body min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
          <PanelRouter initialPath={destination.path}>
            <PanelRoutes />
          </PanelRouter>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2 text-[11px] text-muted-foreground sm:px-6">
          <span className="flex items-center gap-1.5">
            <ArrowLeft className="h-3 w-3" />
            Esc closes this screen — the room keeps running behind it.
          </span>
          <span className="hidden sm:inline">
            Overlay navigation stays inside the campus.
          </span>
        </footer>
      </section>
    </div>
  );
}
