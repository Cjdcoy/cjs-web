import { useMemo, useSyncExternalStore } from "react";
import type { RouteLocation } from "./routes";

const navigationEvent = "cjs:navigate";
let navigationPending = false;
const navigationPendingListeners = new Set<() => void>();

export interface NavigateOptions {
  replace?: boolean;
}

export function useBrowserLocation(): RouteLocation {
  const href = useSyncExternalStore(subscribe, getBrowserHref, getServerHref);
  return useMemo(() => parseBrowserHref(href), [href]);
}

export function useNavigationPending(): boolean {
  return useSyncExternalStore(
    subscribeToNavigationPending,
    () => navigationPending,
    () => false,
  );
}

export function navigate(to: string | URL, options: NavigateOptions = {}): void {
  const target = new URL(to, window.location.href);
  if (target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }

  const href = `${target.pathname}${target.search}${target.hash}`;
  if (href === getBrowserHref()) return;

  const changedPage = target.pathname !== window.location.pathname;
  setNavigationPending(true);
  const method = options.replace ? "replaceState" : "pushState";
  window.history[method](null, "", href);
  window.dispatchEvent(new Event(navigationEvent));
  if (changedPage && !target.hash) window.scrollTo({ top: 0 });
}

export function markNavigationComplete(): void {
  setNavigationPending(false);
}

export function parseBrowserHref(href: string): RouteLocation {
  const url = new URL(href, "https://cjs.local");
  return {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
}

function getBrowserHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getServerHref(): string {
  return "/";
}

function subscribe(onStoreChange: () => void): () => void {
  const handlePopState = () => {
    setNavigationPending(true);
    onStoreChange();
  };
  const handleClick = (event: MouseEvent) => {
    if (!shouldHandleClick(event)) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (anchor.dataset.routerReload !== undefined) return;
    if (anchor.rel.split(/\s+/).includes("external")) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(destination);
  };

  window.addEventListener("popstate", handlePopState);
  window.addEventListener("hashchange", onStoreChange);
  window.addEventListener(navigationEvent, onStoreChange);
  document.addEventListener("click", handleClick);

  return () => {
    window.removeEventListener("popstate", handlePopState);
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener(navigationEvent, onStoreChange);
    document.removeEventListener("click", handleClick);
  };
}

function subscribeToNavigationPending(listener: () => void): () => void {
  navigationPendingListeners.add(listener);
  return () => navigationPendingListeners.delete(listener);
}

function setNavigationPending(pending: boolean): void {
  if (pending === navigationPending) return;
  navigationPending = pending;
  navigationPendingListeners.forEach((listener) => listener());
}

function shouldHandleClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
