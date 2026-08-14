import type { ReactNode } from "react";
import {
  BarChart3,
  CircleHelp,
  Heart,
  Info,
  Map,
  Menu,
  Server,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type IconType = LucideIcon;

const navigation: Array<{ href: string; label: string; icon: IconType }> = [
  { href: "/", label: "Servers", icon: Server },
  { href: "/leaderboards", label: "Leaderboards", icon: BarChart3 },
  { href: "/maps", label: "Maps", icon: Map },
  { href: "/players", label: "Players", icon: Users },
  { href: "/about", label: "About", icon: Info },
  { href: "/favorites", label: "Favorites", icon: Heart },
];

export function Header({ active }: { active: string }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="CodJumper Stats home">
          <img src="/logo.svg" alt="" />
          <span>CodJumper Stats</span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => (
            <a className={active === href ? "active" : ""} href={href} key={href}>
              <Icon size={18} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <details className="mobile-menu">
          <summary aria-label="Open navigation"><Menu size={22} /></summary>
          <nav>
            {navigation.map(({ href, label, icon: Icon }) => (
              <a className={active === href ? "active" : ""} href={href} key={href}>
                <Icon size={18} /> {label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}

export function Page({
  active,
  accent = "amber",
  children,
  footer = true,
}: {
  active: string;
  accent?: "amber" | "orange" | "blue" | "teal";
  children: ReactNode;
  footer?: boolean;
}) {
  return (
    <div className={`app accent-${accent}`}>
      <Header active={active} />
      <main className="page-shell">{children}</main>
      {footer && <Footer />}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <img src="/logo.svg" alt="" />
        <p><strong>CodJumper Stats</strong><br />Competitive jump statistics, made easier to explore.</p>
      </div>
      <p>Community project · Data from api.jump4life.org</p>
    </footer>
  );
}

export function FilterGroup({
  label,
  help,
  children,
  className = "",
}: {
  label: string;
  help?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`filter-group ${className}`}>
      <h3>{label} {help && <span title={help}><CircleHelp size={14} /></span>}</h3>
      <div className="filter-options">{children}</div>
    </section>
  );
}

export function Choice<T extends string>({
  value,
  current,
  onSelect,
  children,
  disabled,
}: {
  value: T;
  current: T;
  onSelect: (value: T) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={`choice ${current === value ? "selected" : ""}`}
      onClick={() => onSelect(value)}
      disabled={disabled}
      type="button"
    >
      {children}
    </button>
  );
}

export function ToolbarButton({
  children,
  active,
  label,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`toolbar-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon: Icon = X,
  title,
  description,
}: {
  icon?: IconType;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={26} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <strong>Couldn’t load this data.</strong>
      <span>{message}</span>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function SkeletonRows({ cards = false, count = 6 }: { cards?: boolean; count?: number }) {
  return (
    <div className={cards ? "skeleton-grid" : "skeleton-list"} aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <i /><i /><i /><i /><i />
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat"><span>{label}</span><strong>{value}</strong></div>
  );
}
