import { Play } from "lucide-react";
import { Link } from "./ui";
import type { Source } from "../lib/api";
import { hasMapModels } from "../lib/mapModels";
import { replayPath } from "../lib/routing";

/** Link to the 3D replay of a J4L run. Renders nothing when replays cannot be shown. */
export function ReplayLink({
  label,
  runId,
  source,
}: {
  label?: string;
  runId: number | null | undefined;
  source: Source;
}) {
  if (source !== "j4l" || !runId || !hasMapModels()) return null;

  return (
    <Link
      href={replayPath(runId)}
      variant="standalone"
      aria-label={label ?? `Watch replay of run ${runId}`}
    >
      <Play size={14} aria-hidden="true" />
      Replay
    </Link>
  );
}
