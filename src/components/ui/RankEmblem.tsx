import { useState } from "react";
import { levelEmblemUrl, prestigeEmblemUrl } from "../../lib/ranks";

export interface RankEmblemProps {
  className?: string;
  /** Jump4Life level; drives the core or mythic emblem for non-prestige players. */
  level?: number;
  /** Prestige count; from 1 upward it replaces the level emblem. */
  prestige?: number;
  size?: "small" | "medium" | "large";
  /** Reserves a fixed-width slot so rows in a list align despite mixed aspects. */
  fixedSlot?: boolean;
  /** Accessible label. Omit to hide the emblem from assistive technology. */
  label?: string | null;
}

/**
 * Jump4Life rank artwork. Prestige players are represented by their prestige
 * emblem alone; the level emblems belong to players who have not prestiged.
 * Renders nothing when no emblem resolves or the image fails to load, so a
 * missing emblem never leaves a broken frame.
 */
export function RankEmblem({
  className,
  fixedSlot,
  label,
  level,
  prestige,
  size = "medium",
}: RankEmblemProps) {
  const [failed, setFailed] = useState(false);
  const prestigeSource = prestigeEmblemUrl(prestige);
  const source = prestigeSource ?? levelEmblemUrl(level);

  if (source === null || failed) return null;

  const accessibleLabel = label?.trim();

  return (
    <span
      className={["cjs-rank-emblem", className].filter(Boolean).join(" ")}
      data-size={size}
      data-slot={fixedSlot ? "fixed" : undefined}
      data-variant={prestigeSource ? "prestige" : "level"}
      {...(accessibleLabel
        ? { role: "img", "aria-label": accessibleLabel, title: accessibleLabel }
        : { "aria-hidden": true })}
    >
      <img alt="" decoding="async" loading="lazy" onError={() => setFailed(true)} src={source} />
    </span>
  );
}
