import type { CSSProperties } from "react";
import {
  angleHelperZone,
  HUD_ANGLE_HELPER_Y,
  HUD_JUMP_TIMER_Y,
  HUD_SPEED_METER_Y,
  REPLAY_KEYS,
  type AngleHelperState,
  type SpeedTrend,
} from "./replayHudModel";

type HudStyle = CSSProperties & Record<`--hud-${string}`, number>;

/**
 * CoD-style HUD drawn over the 3D view, on the game's 640×480 virtual screen centred and stretched
 * like CoD2. The angle helper uses the mod's 1 HUD unit per degree. Purely visual: nothing here is
 * announced.
 */
export function ReplayHud({
  fps,
  helper,
  jumpTimer,
  keys,
  position,
  speed,
}: {
  fps: number | null;
  helper: AngleHelperState | null;
  /** Seconds airborne, or null to hide the jump timer. */
  jumpTimer: number | null;
  /** Pressed state per REPLAY_KEYS entry, or null to hide the key display. */
  keys: readonly boolean[] | null;
  /** poshud lines, or null to hide them. */
  position: readonly [string, string] | null;
  speed: { value: number; trend: SpeedTrend } | null;
}) {
  return (
    <div className="cjs-replay-hud" aria-hidden="true">
      {helper && helper.display > 0 && (
        <>
          <span
            className="cjs-replay-hud__line"
            data-zone={helper.display === 2 ? angleHelperZone(helper) : "deadzone"}
            style={lineStyle(0, 26)}
          />
          {helper.display === 2 && (
            <>
              <span className="cjs-replay-hud__line" style={lineStyle(helper.deadzoneLeft, 19)} />
              <span className="cjs-replay-hud__line" style={lineStyle(helper.deadzoneRight, 19)} />
              <span
                className="cjs-replay-hud__bar"
                style={barStyle(helper.gainLimitLeft, helper.deadzoneLeft)}
              />
              <span
                className="cjs-replay-hud__bar"
                style={barStyle(helper.deadzoneRight, helper.gainLimitRight)}
              />
            </>
          )}
        </>
      )}
      {speed && (
        <span
          className="cjs-replay-hud__speed"
          data-trend={speed.trend}
          style={{ "--hud-y": HUD_SPEED_METER_Y } as HudStyle}
        >
          {speed.value}
        </span>
      )}
      {keys &&
        REPLAY_KEYS.map((key, index) => (
          <span
            key={key.id}
            className="cjs-replay-hud__key"
            data-key={key.id}
            data-pressed={keys[index] || undefined}
            style={{ "--hud-x": key.x, "--hud-y": key.y, "--hud-w": key.width } as HudStyle}
          >
            {key.label}
          </span>
        ))}
      {jumpTimer !== null && (
        <span
          className="cjs-replay-hud__jump-timer"
          style={{ "--hud-y": HUD_JUMP_TIMER_Y } as HudStyle}
        >
          {jumpTimer}
        </span>
      )}
      {fps !== null && <span className="cjs-replay-hud__fps">{fps} fps</span>}
      {position && <span className="cjs-replay-hud__position">{position.join("\n")}</span>}
    </div>
  );
}

function lineStyle(x: number, height: number): HudStyle {
  return { "--hud-x": x, "--hud-y": HUD_ANGLE_HELPER_Y, "--hud-h": height };
}

function barStyle(from: number, to: number): HudStyle {
  return { "--hud-from": from, "--hud-to": to, "--hud-y": HUD_ANGLE_HELPER_Y, "--hud-h": 6 };
}
