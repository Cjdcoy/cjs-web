import type {
  Fps,
  PlayerLeaderboard,
  PlayerLeaderboardPosition,
  PlayerJumpScores,
  PlayerPerformanceStats,
  PlayerRankInfo,
  PlayerRouteCompletion,
  Source,
  TopRun,
} from "../../lib/api";
import { FPS_VALUES, PLAYER_LEADERBOARDS } from "../../lib/api";
import { defineQuerySchema, enumQueryParam } from "../../lib/routing";

export const PLAYER_PROFILE_VIEWS = ["overview", "runs", "routes"] as const;
export type PlayerProfileView = (typeof PLAYER_PROFILE_VIEWS)[number];

export const playerProfileQuerySchema = defineQuerySchema({
  board: enumQueryParam(PLAYER_LEADERBOARDS, "speed"),
  fps: enumQueryParam(FPS_VALUES, "125"),
  view: enumQueryParam(PLAYER_PROFILE_VIEWS, "overview"),
});

export interface PlayerProfileIdentity {
  country: string | null;
  countryCode: string | null;
  lastSeen: string | null;
  name: string;
  playerId: number;
  region: string | null;
}

export interface PlayerIdentityInputs {
  performance: PlayerPerformanceStats | null;
  positions: readonly PlayerLeaderboardPosition[] | null;
  rank: PlayerRankInfo | null;
  routes: readonly PlayerRouteCompletion[] | null;
  scores: PlayerJumpScores | null;
}

const boardLabels: Readonly<Record<PlayerLeaderboard, string>> = {
  defrag: "Defrag skill",
  howmany: "Map completion",
  jump: "Jump skill",
  speed: "Speed skill",
  surf: "Surf skill",
};

const sourceLabels: Readonly<Record<Source, string>> = {
  j4l: "Jump4Life",
  jh: "JumpersHeaven",
};

const numberFormatter = new Intl.NumberFormat();
const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

export function playerBoardLabel(board: PlayerLeaderboard): string {
  return boardLabels[board];
}

export function playerSourceLabel(source: Source): string {
  return sourceLabels[source];
}

export function createPlayerProfileIdentity(
  playerId: number,
  { performance, positions, rank, routes, scores }: PlayerIdentityInputs,
): PlayerProfileIdentity {
  const embeddedRank = rank ?? performance?.rank ?? null;
  const position = positions?.[0];
  const route = routes?.[0];
  const name = firstText(
    embeddedRank?.player_name,
    position?.player_name,
    scores?.player_name,
    route?.player_name,
  );

  return {
    country: firstText(embeddedRank?.country, position?.country, scores?.country) || null,
    countryCode:
      firstText(embeddedRank?.country_code, position?.country_code, scores?.country_code) || null,
    lastSeen: firstText(embeddedRank?.last_seen, position?.last_seen, scores?.last_seen) || null,
    name: name || `Player #${playerId}`,
    playerId,
    region: firstText(embeddedRank?.region, position?.region, scores?.region) || null,
  };
}

export function hasProfileIdentity(identity: PlayerProfileIdentity): boolean {
  return identity.name !== `Player #${identity.playerId}`;
}

export function formatProfileNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : numberFormatter.format(value);
}

export function formatProfileDecimal(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : decimalFormatter.format(value);
}

export function formatProfilePercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Not available";
  return `${Math.round(value * 100)}%`;
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Not available";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;

  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(1, Math.round(milliseconds / 1_000))}s`;
}

export function formatDistance(distance: number): string {
  if (!Number.isFinite(distance) || distance < 0) return "Not available";
  return `${numberFormatter.format(Math.round(distance))} units`;
}

export function formatRunTime(run: TopRun): string {
  if (run.time_played_string?.trim()) return run.time_played_string;
  if (!Number.isFinite(run.time_played)) return "Not available";
  return `${numberFormatter.format(run.time_played)} ms`;
}

export function fpsLabel(fps: Fps): string {
  return fps === "0" ? "Mix" : `${fps} FPS`;
}

function firstText(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}
