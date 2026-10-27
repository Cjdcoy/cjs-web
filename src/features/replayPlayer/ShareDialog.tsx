import { X } from "lucide-react";
import { useRef, useState, type Ref } from "react";
import { Button, IconButton, Input, VisuallyHidden } from "../../components/ui";
import { formatReplayClockMs } from "./replayPlayback";
import { replaySharePath } from "./replayShare";

/**
 * Modal with the replay's link, optionally starting at `offsetMs` (captured when it opened). A
 * native dialog like ShortcutsDialog, whose look it shares.
 */
export function ShareDialog({
  offsetMs,
  ref,
  runId,
  search,
}: {
  offsetMs: number;
  ref: Ref<HTMLDialogElement>;
  runId: number;
  search: string;
}) {
  const [atTime, setAtTime] = useState(false);
  const [status, setStatus] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const link = new URL(
    replaySharePath(runId, search, atTime ? offsetMs : 0),
    window.location.origin,
  ).href;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied");
    } catch {
      // No clipboard (insecure context, denied permission): leave the link selected to copy by hand.
      field.current?.focus();
      field.current?.select();
    }
  };

  return (
    <dialog
      ref={ref}
      className="cjs-replay-shortcuts"
      aria-labelledby="replay-share-title"
      onClose={() => {
        setAtTime(false);
        setStatus("");
      }}
    >
      <div className="cjs-replay-shortcuts__header">
        <h2 id="replay-share-title">Share replay</h2>
        <form method="dialog">
          <IconButton label="Close share replay" type="submit" variant="ghost" size="small">
            <X size={18} aria-hidden="true" />
          </IconButton>
        </form>
      </div>
      <div className="cjs-replay-share cjs-stack">
        <Input ref={field} label="Link" readOnly value={link} />
        <label>
          <input
            type="checkbox"
            checked={atTime}
            onChange={(event) => setAtTime(event.currentTarget.checked)}
          />
          Start at {formatReplayClockMs(offsetMs)}
        </label>
        <Button variant="secondary" onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
      {/* The modal makes the player's live region inert, so the dialog announces its own status. */}
      <VisuallyHidden role="status" aria-live="polite">
        {status}
      </VisuallyHidden>
    </dialog>
  );
}
