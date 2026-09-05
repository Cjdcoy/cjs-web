import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SkeletonGroup, VisuallyHidden } from "../components/ui";
import {
  getLegacyRedirect,
  markNavigationComplete,
  matchRoute,
  navigate,
  parseBrowserHref,
  SourceProvider,
  useBrowserLocation,
} from "../lib/routing";
import { applyRouteMetadata } from "./routeMetadata";
import { renderRoute } from "./routes";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { AppShell } from "./shell";

export function AppRouter() {
  const location = useBrowserLocation();
  const legacyRedirect = getLegacyRedirect(location);
  const routedLocation = legacyRedirect ? parseBrowserHref(legacyRedirect) : location;
  const navigationKey = `${location.pathname}${location.search}${location.hash}`;
  const match = matchRoute(routedLocation.pathname);
  const lastReadyPath = useRef(routedLocation.pathname);
  const [routeAnnouncement, setRouteAnnouncement] = useState("");

  useEffect(() => {
    if (legacyRedirect) {
      navigate(legacyRedirect, { replace: true });
    }
  }, [legacyRedirect]);

  useEffect(() => {
    applyRouteMetadata(match, routedLocation.pathname);
  }, [match, routedLocation.pathname]);

  const handleRouteReady = useCallback((pathname: string, label: string) => {
    const routeChanged = lastReadyPath.current !== pathname;
    lastReadyPath.current = pathname;
    markNavigationComplete();

    if (!routeChanged) return;
    setRouteAnnouncement(`${label} page loaded.`);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("#main-content")?.focus();
    });
  }, []);

  return (
    <SourceProvider>
      <AppShell route={match}>
        <RouteErrorBoundary resetKey={routedLocation.pathname}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <RouteReady
              label={routeLabels[match.id]}
              navigationKey={navigationKey}
              pathname={routedLocation.pathname}
              onReady={handleRouteReady}
            >
              {renderRoute(match)}
            </RouteReady>
          </Suspense>
        </RouteErrorBoundary>
        <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
          {routeAnnouncement}
        </VisuallyHidden>
      </AppShell>
    </SourceProvider>
  );
}

const routeLabels = {
  about: "About",
  favorites: "Favorites",
  leaderboards: "Leaderboards",
  "map-detail": "Map detail",
  maps: "Maps",
  "not-found": "Not found",
  "player-detail": "Player profile",
  players: "Players",
  recent: "Recent updates",
  servers: "Live servers",
} as const;

function RouteReady({
  children,
  label,
  navigationKey,
  onReady,
  pathname,
}: {
  children: ReactNode;
  label: string;
  navigationKey: string;
  onReady: (pathname: string, label: string) => void;
  pathname: string;
}) {
  useEffect(() => {
    onReady(pathname, label);
  }, [label, navigationKey, onReady, pathname]);

  return children;
}

function RouteLoadingFallback() {
  return (
    <div className="cjs-route-loading" role="status" aria-live="polite" aria-busy="true">
      <p>Loading page…</p>
      <SkeletonGroup count={4} label="Loading page content" />
    </div>
  );
}
