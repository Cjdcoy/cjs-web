import { parseCodName } from "../../lib/codName";

export interface CodPlayerNameProps {
  readonly className?: string;
  readonly value: string;
}

export function CodPlayerName({ className, value }: CodPlayerNameProps) {
  const parsed = parseCodName(value);
  const classes = ["cjs-player-name", className].filter(Boolean).join(" ");

  return (
    <span className={classes} role="group" aria-label={parsed.plainText}>
      <span aria-hidden="true">
        {parsed.segments.map((segment, index) => (
          <span
            className="cjs-player-name__segment"
            data-cod-color={segment.color ?? undefined}
            key={`${index}-${segment.color ?? "default"}`}
          >
            {segment.text}
          </span>
        ))}
      </span>
    </span>
  );
}
