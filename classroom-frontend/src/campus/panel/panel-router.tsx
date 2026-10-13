import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  UNSAFE_LocationContext as LocationContext,
  UNSAFE_NavigationContext as NavigationContext,
  UNSAFE_RouteContext as RouteContext,
  UNSAFE_createMemoryHistory as createMemoryHistory,
  type Location,
  type NavigationType,
} from "react-router";

/**
 * A memory router for the campus overlay panel.
 *
 * React Router 7 refuses to mount `<Router>` inside another `<Router>`, which
 * rules out `<MemoryRouter>` for a panel that lives inside the app's
 * `<BrowserRouter>`. A router is really just two contexts — a navigation
 * context (the navigator) and a location context — so this provides exactly
 * those, backed by a private memory history. Screens inside the panel get
 * their own real `Link`, `useNavigate`, `useParams`, `useSearchParams` and
 * `<Routes>` behaviour, while the browser URL (and the 3D room behind the
 * panel) is left completely untouched.
 *
 * Two details are load-bearing, and both mirror what `<MemoryRouter>` itself
 * does:
 *
 * - `v5Compat: true` — react-router's memory history only notifies listeners
 *   on `push`/`replace` in that mode, so without it in-panel navigation would
 *   silently update the history and never re-render.
 * - the route context is reset — otherwise a nested `<Routes>` is matched
 *   *relative to* the app's `/campus` match (leaving an empty remainder), and
 *   every panel would render the index route instead of its own screen.
 */

type PanelHistory = ReturnType<typeof createMemoryHistory>;

export function PanelRouter({
  initialPath,
  children,
}: {
  initialPath: string;
  children: ReactNode;
}) {
  const historyRef = useRef<PanelHistory | null>(null);
  if (historyRef.current === null) {
    historyRef.current = createMemoryHistory({
      initialEntries: [initialPath],
      v5Compat: true,
    });
  }
  const history = historyRef.current;

  const [entry, setEntry] = useState<{
    location: Location;
    action: NavigationType;
  }>(() => ({ location: history.location, action: history.action }));

  useLayoutEffect(
    () =>
      history.listen((update) =>
        setEntry({ location: update.location, action: update.action }),
      ),
    [history],
  );

  const navigation = useMemo(
    () => ({
      basename: "",
      navigator: history,
      static: false,
      useTransitions: false,
      future: {},
    }),
    [history],
  );

  const location = useMemo(
    () => ({ location: entry.location, navigationType: entry.action }),
    [entry],
  );

  // Detach the panel from the surrounding route match (see note above).
  const routeContext = useMemo(
    () => ({ outlet: null, matches: [], isDataRoute: false }),
    [],
  );

  return (
    <NavigationContext.Provider value={navigation}>
      <LocationContext.Provider value={location}>
        <RouteContext.Provider value={routeContext}>
          {children}
        </RouteContext.Provider>
      </LocationContext.Provider>
    </NavigationContext.Provider>
  );
}
