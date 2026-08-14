import type {
  GameMap,
  LeaderboardEntry,
  Player,
  ServerResponse,
  Source,
  TopRun,
} from "./types";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
  "https://api.jump4life.org";

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

function params(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
}

export const api = {
  servers: (source: Source, signal?: AbortSignal) =>
    request<ServerResponse>(`/api/v1/tracker/servers?${params({ source })}`, signal),

  maps: (source: Source, signal?: AbortSignal) =>
    request<GameMap[]>(`/api/v1/map/all?${params({ source })}`, signal),

  players: (source: Source, signal?: AbortSignal) =>
    request<Player[]>(`/api/v1/player/all?${params({ source })}`, signal),

  leaderboard: (
    kind: string,
    source: Source,
    fps?: string,
    signal?: AbortSignal,
  ) =>
    request<LeaderboardEntry[]>(
      `/api/v1/leaderboard/${kind}?${params({ source, fps })}`,
      signal,
    ),

  mapTops: (source: Source, cpid: number, fps: string, signal?: AbortSignal) =>
    request<TopRun[]>(
      `/api/v1/map/tops?${params({ source, cpid, fps, limit: 100 })}`,
      signal,
    ),

  playerStats: (source: Source, playerid: number, signal?: AbortSignal) =>
    request<Record<string, unknown>>(
      `/api/v1/player/performance-stats?${params({ source, playerid })}`,
      signal,
    ),

  playerTops: (
    source: Source,
    playerid: number,
    fps: string,
    signal?: AbortSignal,
  ) =>
    request<TopRun[]>(
      `/api/v1/player/tops?${params({ source, playerid, fps, limit: 100 })}`,
      signal,
    ),
};
