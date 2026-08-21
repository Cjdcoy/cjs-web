import type { ReactNode } from "react";

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
    <div
      className={`cjs-page-view accent-${accent}`}
      data-page-route={active}
      data-page-footer={footer || undefined}
    >
      {children}
    </div>
  );
}
