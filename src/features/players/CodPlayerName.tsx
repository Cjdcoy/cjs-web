import { VisuallyHidden } from "../../components/ui";
import { parseCodName } from "./playerDiscovery";

export function CodPlayerName({ value }: { value: string }) {
  const parsed = parseCodName(value);

  return (
    <span className="cjs-player-name">
      <VisuallyHidden>{parsed.plainText}</VisuallyHidden>
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
