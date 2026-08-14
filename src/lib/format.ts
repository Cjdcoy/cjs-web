export function formatNumber(value: unknown): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? new Intl.NumberFormat().format(number) : "0";
}

export function formatDate(value?: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function timeAgo(value?: string): string {
  if (!value) return "Never";
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return value;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(value);
}
