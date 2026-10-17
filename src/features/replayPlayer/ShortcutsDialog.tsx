import { X } from "lucide-react";
import type { Ref } from "react";
import { IconButton } from "../../components/ui";

const SHORTCUTS: readonly [keys: string, action: string][] = [
  ["K or Space", "Play or pause"],
  ["Left and Right arrows", "Seek 5 seconds"],
  ["P and N", "Previous or next save or load"],
  ["[ and ]", "Slower or faster"],
  ["C", "Free camera on or off"],
  ["F", "Full screen on or off"],
  ["T", "Cinema mode on or off"],
  ["M", "Mute or unmute"],
  ["Esc", "Leave cinema mode or full screen"],
  ["?", "Show these shortcuts"],
];

const FREE_CAMERA_KEYS: readonly [keys: string, action: string][] = [
  ["W A S D", "Fly"],
  ["Space or E / Q", "Rise / sink"],
  ["Arrow keys or mouse", "Look (click the view to capture the mouse)"],
  ["Shift", "Move faster"],
];

/** Modal list of replay shortcuts. A native dialog keeps focus inside and restores it on close. */
export function ShortcutsDialog({ ref }: { ref: Ref<HTMLDialogElement> }) {
  return (
    <dialog ref={ref} className="cjs-replay-shortcuts" aria-labelledby="replay-shortcuts-title">
      <div className="cjs-replay-shortcuts__header">
        <h2 id="replay-shortcuts-title">Keyboard shortcuts</h2>
        <form method="dialog">
          <IconButton label="Close keyboard shortcuts" type="submit" variant="ghost" size="small">
            <X size={18} aria-hidden="true" />
          </IconButton>
        </form>
      </div>
      <ShortcutList items={SHORTCUTS} />
      <h3>Free camera (with the view focused)</h3>
      <ShortcutList items={FREE_CAMERA_KEYS} />
    </dialog>
  );
}

function ShortcutList({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <dl>
      {items.map(([keys, action]) => (
        <div key={keys}>
          <dt>{keys}</dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}
