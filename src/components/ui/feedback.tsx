import { CircleOff, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Button } from "./controls";
import { classNames } from "./classNames";
import { VisuallyHidden } from "./VisuallyHidden";

type SkeletonStyle = CSSProperties & {
  "--cjs-skeleton-width"?: string;
  "--cjs-skeleton-height"?: string;
};

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "text" | "circle" | "card";
  width?: string;
  height?: string;
}

export function Skeleton({
  className,
  height,
  style,
  variant = "text",
  width,
  ...props
}: SkeletonProps) {
  return (
    <span
      className={classNames("cjs-skeleton", className)}
      data-variant={variant}
      aria-hidden="true"
      style={
        {
          ...style,
          "--cjs-skeleton-width": width,
          "--cjs-skeleton-height": height,
        } as SkeletonStyle
      }
      {...props}
    />
  );
}

export interface SkeletonGroupProps {
  label?: string;
  count?: number;
  variant?: SkeletonProps["variant"];
  className?: string;
}

export function SkeletonGroup({
  className,
  count = 3,
  label = "Loading content",
  variant = "text",
}: SkeletonGroupProps) {
  return (
    <div className={classNames("cjs-skeleton-group", className)} role="status" aria-live="polite">
      <VisuallyHidden>{label}</VisuallyHidden>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} variant={variant} />
      ))}
    </div>
  );
}

interface StateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon = CircleOff,
  title,
}: StateProps) {
  return (
    <div className={classNames("cjs-state", className)} role="status">
      <span className="cjs-state__icon" aria-hidden="true">
        <Icon size={24} />
      </span>
      <h2 className="cjs-state__title">{title}</h2>
      <p className="cjs-state__description">{description}</p>
      {action && <div className="cjs-state__action">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps extends Omit<StateProps, "action"> {
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
}

export function ErrorState({
  action,
  className,
  description,
  icon: Icon = TriangleAlert,
  onRetry,
  retryLabel = "Try again",
  title,
}: ErrorStateProps) {
  return (
    <div className={classNames("cjs-state", className)} data-tone="danger" role="alert">
      <span className="cjs-state__icon" aria-hidden="true">
        <Icon size={24} />
      </span>
      <h2 className="cjs-state__title">{title}</h2>
      <p className="cjs-state__description">{description}</p>
      {(action || onRetry) && (
        <div className="cjs-state__action">
          {action ?? (
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw size={16} aria-hidden="true" />
              {retryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
