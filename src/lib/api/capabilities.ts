import {
  FPS_VALUES,
  GAMES,
  LEADERBOARD_KINDS,
  PLAYER_LEADERBOARDS,
  REPLAY_WATCH_METRICS,
  SOURCES,
  type Fps,
  type Game,
  type LeaderboardKind,
  type PlayerLeaderboard,
  type ReplayWatchMetric,
  type Source,
} from "./domain";
import { UnsupportedCapabilityError } from "./errors";

export const CAPABILITIES = [
  "tracker",
  "leaderboards",
  "maps",
  "players",
  "player-rank",
  "player-activity",
  "replay-analytics",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const J4L_ONLY = new Set<Capability>(["player-rank", "player-activity", "replay-analytics"]);

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && SOURCES.some((source) => source === value);
}

export function isGame(value: unknown): value is Game {
  return typeof value === "string" && GAMES.some((game) => game === value);
}

export function isFps(value: unknown): value is Fps {
  return typeof value === "string" && FPS_VALUES.some((fps) => fps === value);
}

export function isLeaderboardKind(value: unknown): value is LeaderboardKind {
  return typeof value === "string" && LEADERBOARD_KINDS.some((kind) => kind === value);
}

export function isPlayerLeaderboard(value: unknown): value is PlayerLeaderboard {
  return (
    typeof value === "string" && PLAYER_LEADERBOARDS.some((leaderboard) => leaderboard === value)
  );
}

export function isReplayWatchMetric(value: unknown): value is ReplayWatchMetric {
  return typeof value === "string" && REPLAY_WATCH_METRICS.some((metric) => metric === value);
}

export function supportsCapability(
  capability: Capability,
  source: Source,
  game: Game = "cod2",
): boolean {
  return game === "cod2" && (!J4L_ONLY.has(capability) || source === "j4l");
}

export function assertCapability(
  capability: Capability,
  source: Source,
  game: Game = "cod2",
): void {
  if (!supportsCapability(capability, source, game)) {
    throw new UnsupportedCapabilityError(capability, source, game);
  }
}
