import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, VisuallyHidden } from "../../components/ui";
import { useNavigationPending, type RouteMatch } from "../../lib/routing";
import { primaryNavigation, type PrimaryNavigationItem } from "./navigation";

export function AppShell({ children, route }: { children: ReactNode; route: RouteMatch }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileNavigationButton = useRef<HTMLButtonElement>(null);
  const navigationPending = useNavigationPending();

  useEffect(() => {
    if (!mobileNavigationOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNavigationOpen(false);
      mobileNavigationButton.current?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavigationOpen]);

  const closeMobileNavigation = () => setMobileNavigationOpen(false);

  return (
    <div className="cjs-app-shell">
      <a
        className="cjs-skip-link"
        href="#main-content"
        onClick={() =>
          window.requestAnimationFrame(() =>
            document.querySelector<HTMLElement>("#main-content")?.focus(),
          )
        }
      >
        Skip to main content
      </a>
      <RoutePendingIndicator pending={navigationPending} />
      <header className="cjs-site-header">
        <div className="cjs-site-header__inner cjs-page">
          <a className="cjs-brand" href="/">
            <img src="/cjs-logo.png" alt="" width="48" height="48" />
            <span>
              <strong>CodJumper</strong>
              <small>Stats</small>
            </span>
          </a>

          <nav className="cjs-primary-navigation" aria-label="Primary navigation">
            {primaryNavigation.map((item) => (
              <NavigationLink item={item} route={route} key={item.href} />
            ))}
          </nav>

          <div className="cjs-site-header__actions">
            <IconButton
              ref={mobileNavigationButton}
              className="cjs-mobile-navigation__toggle"
              label={mobileNavigationOpen ? "Close navigation" : "Open navigation"}
              variant="ghost"
              aria-controls="mobile-navigation"
              aria-expanded={mobileNavigationOpen}
              onClick={() => setMobileNavigationOpen((open) => !open)}
            >
              {mobileNavigationOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </IconButton>
          </div>
        </div>

        {mobileNavigationOpen && (
          <nav
            id="mobile-navigation"
            className="cjs-mobile-navigation cjs-page"
            aria-label="Mobile navigation"
          >
            {primaryNavigation.map((item) => (
              <NavigationLink
                item={item}
                route={route}
                key={item.href}
                onNavigate={closeMobileNavigation}
              />
            ))}
          </nav>
        )}
      </header>

      <main
        id="main-content"
        className="cjs-page-container cjs-page"
        tabIndex={-1}
        aria-busy={navigationPending || undefined}
      >
        {children}
      </main>

      <footer className="cjs-site-footer">
        <div className="cjs-site-footer__inner cjs-page">
          <div className="cjs-site-footer__identity">
            <img src="/cjs-logo.png" alt="" width="40" height="40" />
            <p>
              <strong>CodJumper Stats</strong>
              <span>An independent interface for public jump statistics.</span>
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <a href="/about">About CJS</a>
            <a href="https://api.jump4life.org/docs" target="_blank" rel="noreferrer">
              API documentation
              <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function NavigationLink({
  item,
  onNavigate,
  route,
}: {
  item: PrimaryNavigationItem;
  onNavigate?: () => void;
  route: RouteMatch;
}) {
  const active = item.activeRoutes.includes(route.id);
  const Icon = item.icon;

  return (
    <a
      className="cjs-navigation-link"
      data-active={active || undefined}
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <Icon aria-hidden="true" size={18} />
      <span>{item.label}</span>
      {active && <span className="cjs-navigation-link__marker" aria-hidden="true" />}
    </a>
  );
}

function RoutePendingIndicator({ pending }: { pending: boolean }) {
  return (
    <>
      <div className="cjs-route-progress" data-pending={pending || undefined} aria-hidden="true">
        <span />
      </div>
      <VisuallyHidden role="status" aria-live="polite">
        {pending ? "Loading page" : ""}
      </VisuallyHidden>
    </>
  );
}
