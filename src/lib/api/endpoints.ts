import {
  assertCapability,
  isFps,
  isGame,
  isLeaderboardKind,
  isPlayerLeaderboard,
  isReplayWatchMetric,
  isSource,
} from "./capabilities";
import type { ApiRetryListener, JsonClient } from "./client";
import type {
  Fps,
  Game,
  GameMap,
  LeaderboardEntry,
  LeaderboardKind,
  Player,
  PlayerActivitySummary,
  PlayerLeaderboard,
  PlayerLeaderboardPosition,
  PlayerJumpScores,
  PlayerPerformanceStats,
  PlayerRankInfo,
  PlayerRouteCompletion,
  PlayerSort,
  RankLeaderboardEntry,
  ReplayWatchAggregate,
  ReplayWatchFilters,
  ReplayWatchMetric,
  ReplayWatchRankingEntry,
  ReplayWatchScope,
  ServerResponse,
  Source,
  TopRun,
} from "./domain";
import { invalidArgument, invalidResponse } from "./errors";
import {
  normalizeLeaderboard,
  normalizeMaps,
  normalizePlayerActivity,
  normalizePlayerJumpScores,
  normalizePlayerMapRuns,
  normalizePlayerPerformance,
  normalizePlayerPositions,
  normalizePlayerRank,
  normalizePlayerRoutes,
  normalizePlayers,
  normalizeRankLeaderboard,
  normalizeReplayWatchAggregate,
  normalizeReplayWatchRankings,
  normalizeServerResponse,
  normalizeTopRuns,
} from "./normalizers";

const PATHS = {
  trackerServers: "/api/v1/tracker/servers",
  maps: "/api/v1/map/all",
  mapTops: "/api/v1/map/tops",
  players: "/api/v1/player/all",
  playerSearch: "/api/v1/player/id-from-name",
  playerPerformance: "/api/v1/player/performance-stats",
  playerPositions: "/api/v1/player/leaderboard-positions",
  playerJumpScores: "/api/v1/player/jump-scores",
  playerTops: "/api/v1/player/tops",
  playerMapRuns: "/api/v1/player/map-runs",
  playerRoutes: "/api/v1/player/routes-completion",
  playerRank: "/api/v1/player/rank",
  playerActivity: "/api/v1/player/activity-summary",
  rankXpLeaderboard: "/api/v1/leaderboard/rank-xp",
  replayWatchAggregate: "/api/v1/replay/watch-aggregate",
  replayWatchRankings: "/api/v1/replay/watch-rankings",
} as const;

export interface RequestContext {
  source: Source;
  game?: Game;
  signal?: AbortSignal;
  onRetry?: ApiRetryListener;
}

export interface CjsApi {
  trackerServers(options: RequestContext): Promise<ServerResponse>;
  leaderboard(
    options: RequestContext & { kind: LeaderboardKind; fps?: Fps },
  ): Promise<LeaderboardEntry[]>;
  rankXpLeaderboard(options: RequestContext & { limit?: number }): Promise<RankLeaderboardEntry[]>;
  maps(options: RequestContext): Promise<GameMap[]>;
  mapTops(
    options: RequestContext & { checkpointId: number | string; fps: Fps; limit?: number },
  ): Promise<TopRun[]>;
  players(options: RequestContext & { sort?: PlayerSort }): Promise<Player[]>;
  searchPlayers(options: RequestContext & { name: string; limit?: number }): Promise<Player[]>;
  playerPerformance(
    options: RequestContext & { playerId: number },
  ): Promise<PlayerPerformanceStats>;
  playerLeaderboardPositions(
    options: RequestContext & {
      playerId: number;
      fps: Fps;
      leaderboard?: PlayerLeaderboard;
    },
  ): Promise<PlayerLeaderboardPosition[]>;
  playerJumpScores(
    options: RequestContext & { playerId: number; fps: Fps },
  ): Promise<PlayerJumpScores>;
  playerTops(
    options: RequestContext & { playerId: number; fps: Fps; limit?: number },
  ): Promise<TopRun[]>;
  playerMapRuns(
    options: RequestContext & { playerId: number; checkpointId: number | string; fps: Fps },
  ): Promise<TopRun[]>;
  playerRoutes(options: RequestContext & { playerId: number }): Promise<PlayerRouteCompletion[]>;
  playerRank(options: RequestContext & { playerId: number }): Promise<PlayerRankInfo>;
  playerActivitySummary(
    options: RequestContext & { playerId: number },
  ): Promise<PlayerActivitySummary>;
  replayWatchAggregate(options: RequestContext & ReplayWatchScope): Promise<ReplayWatchAggregate>;
  replayWatchRankings(
    options: RequestContext &
      ReplayWatchFilters & { metric: ReplayWatchMetric; limit?: number; offset?: number },
  ): Promise<ReplayWatchRankingEntry[]>;
}

export function createCjsApi(client: JsonClient, replayClient: JsonClient = client): CjsApi {
  return {
    async trackerServers(options) {
      const game = context(options, PATHS.trackerServers);
      assertCapability("tracker", options.source, game);
      return normalizeServerResponse(
        await get(client, PATHS.trackerServers, options, { source: options.source }),
        PATHS.trackerServers,
      );
    },

    async leaderboard(options) {
      const game = context(options, "/api/v1/leaderboard");
      if (!isLeaderboardKind(options.kind)) {
        throw invalidArgument("/api/v1/leaderboard", "kind");
      }
      if (options.fps !== undefined && !isFps(options.fps)) {
        throw invalidArgument("/api/v1/leaderboard", "fps");
      }
      assertCapability("leaderboards", options.source, game);
      const path = `/api/v1/leaderboard/${encodeURIComponent(options.kind)}`;
      return normalizeLeaderboard(
        await get(client, path, options, {
          source: options.source,
          fps: options.kind === "howmany" ? undefined : options.fps,
        }),
        path,
      );
    },

    async rankXpLeaderboard(options) {
      const game = context(options, PATHS.rankXpLeaderboard);
      assertCapability("player-rank", options.source, game);
      limit(options.limit, PATHS.rankXpLeaderboard);
      return normalizeRankLeaderboard(
        await get(client, PATHS.rankXpLeaderboard, options, {
          source: options.source,
          limit: options.limit,
        }),
        PATHS.rankXpLeaderboard,
      );
    },

    async maps(options) {
      const game = context(options, PATHS.maps);
      assertCapability("maps", options.source, game);
      return normalizeMaps(
        await get(client, PATHS.maps, options, { source: options.source }),
        PATHS.maps,
      );
    },

    async mapTops(options) {
      const game = context(options, PATHS.mapTops);
      assertCapability("maps", options.source, game);
      requireFps(options.fps, PATHS.mapTops);
      limit(options.limit, PATHS.mapTops);
      if (
        (typeof options.checkpointId !== "string" && typeof options.checkpointId !== "number") ||
        String(options.checkpointId).trim() === ""
      ) {
        throw invalidArgument(PATHS.mapTops, "checkpointId");
      }
      return normalizeTopRuns(
        await get(client, PATHS.mapTops, options, {
          source: options.source,
          fps: options.fps,
          cpid: options.checkpointId,
          limit: options.limit,
        }),
        PATHS.mapTops,
      );
    },

    async players(options) {
      const game = context(options, PATHS.players);
      assertCapability("players", options.source, game);
      if (options.sort !== undefined && options.sort !== "last-seen" && options.sort !== "visits") {
        throw invalidArgument(PATHS.players, "sort");
      }
      return normalizePlayers(
        await get(client, PATHS.players, options, {
          source: options.source,
          sort: options.sort,
        }),
        PATHS.players,
      );
    },

    async searchPlayers(options) {
      const game = context(options, PATHS.playerSearch);
      assertCapability("players", options.source, game);
      if (!options.name.trim()) throw invalidArgument(PATHS.playerSearch, "name");
      limit(options.limit, PATHS.playerSearch);
      return normalizePlayers(
        await get(client, PATHS.playerSearch, options, {
          source: options.source,
          name: options.name,
          limit: options.limit,
        }),
        PATHS.playerSearch,
      );
    },

    async playerPerformance(options) {
      const game = playerContext(options, PATHS.playerPerformance);
      assertCapability("players", options.source, game);
      return normalizePlayerPerformance(
        await get(client, PATHS.playerPerformance, options, {
          source: options.source,
          playerid: options.playerId,
        }),
        PATHS.playerPerformance,
      );
    },

    async playerLeaderboardPositions(options) {
      const game = playerContext(options, PATHS.playerPositions);
      assertCapability("players", options.source, game);
      requireFps(options.fps, PATHS.playerPositions);
      if (options.leaderboard !== undefined && !isPlayerLeaderboard(options.leaderboard)) {
        throw invalidArgument(PATHS.playerPositions, "leaderboard");
      }
      return normalizePlayerPositions(
        await get(client, PATHS.playerPositions, options, {
          source: options.source,
          playerid: options.playerId,
          fps: options.fps,
          leaderboard: options.leaderboard,
        }),
        PATHS.playerPositions,
      );
    },

    async playerJumpScores(options) {
      const game = playerContext(options, PATHS.playerJumpScores);
      assertCapability("players", options.source, game);
      requireFps(options.fps, PATHS.playerJumpScores);
      return normalizePlayerJumpScores(
        await get(client, PATHS.playerJumpScores, options, {
          source: options.source,
          playerid: options.playerId,
          fps: options.fps,
        }),
        PATHS.playerJumpScores,
      );
    },

    async playerTops(options) {
      const game = playerContext(options, PATHS.playerTops);
      assertCapability("players", options.source, game);
      requireFps(options.fps, PATHS.playerTops);
      limit(options.limit, PATHS.playerTops);
      return normalizeTopRuns(
        await get(client, PATHS.playerTops, options, {
          source: options.source,
          playerid: options.playerId,
          fps: options.fps,
          limit: options.limit,
        }),
        PATHS.playerTops,
      );
    },

    async playerMapRuns(options) {
      const game = playerContext(options, PATHS.playerMapRuns);
      assertCapability("players", options.source, game);
      requireFps(options.fps, PATHS.playerMapRuns);
      requireCheckpointId(options.checkpointId, PATHS.playerMapRuns);
      return normalizePlayerMapRuns(
        await get(client, PATHS.playerMapRuns, options, {
          source: options.source,
          playerid: options.playerId,
          cpid: options.checkpointId,
          fps: options.fps,
        }),
        PATHS.playerMapRuns,
      );
    },

    async playerRoutes(options) {
      const game = playerContext(options, PATHS.playerRoutes);
      assertCapability("players", options.source, game);
      return normalizePlayerRoutes(
        await get(client, PATHS.playerRoutes, options, {
          source: options.source,
          playerid: options.playerId,
        }),
        PATHS.playerRoutes,
      );
    },

    async playerRank(options) {
      const game = playerContext(options, PATHS.playerRank);
      assertCapability("player-rank", options.source, game);
      return normalizePlayerRank(
        await get(client, PATHS.playerRank, options, {
          source: options.source,
          playerid: options.playerId,
        }),
        PATHS.playerRank,
      );
    },

    async playerActivitySummary(options) {
      const game = playerContext(options, PATHS.playerActivity);
      assertCapability("player-activity", options.source, game);
      return normalizePlayerActivity(
        await get(client, PATHS.playerActivity, options, {
          source: options.source,
          playerid: options.playerId,
        }),
        PATHS.playerActivity,
      );
    },

    async replayWatchAggregate(options) {
      const game = replayContext(options, PATHS.replayWatchAggregate);
      assertCapability("replay-analytics", options.source, game);
      const aggregate = normalizeReplayWatchAggregate(
        await get(replayClient, PATHS.replayWatchAggregate, options, {
          source: options.source,
          owner_playerid: options.ownerPlayerId,
          mapid: options.mapId,
        }),
        PATHS.replayWatchAggregate,
      );
      assertReplayAggregateScope(aggregate, options, PATHS.replayWatchAggregate);
      return aggregate;
    },

    async replayWatchRankings(options) {
      const game = replayFiltersContext(options, PATHS.replayWatchRankings);
      assertCapability("replay-analytics", options.source, game);
      if (!isReplayWatchMetric(options.metric)) {
        throw invalidArgument(PATHS.replayWatchRankings, "metric");
      }
      limit(options.limit, PATHS.replayWatchRankings);
      offset(options.offset, PATHS.replayWatchRankings);
      const rankings = normalizeReplayWatchRankings(
        await get(replayClient, PATHS.replayWatchRankings, options, {
          source: options.source,
          metric: options.metric,
          owner_playerid: options.ownerPlayerId,
          mapid: options.mapId,
          limit: options.limit,
          offset: options.offset,
        }),
        PATHS.replayWatchRankings,
      );
      assertReplayRankingScope(rankings, options, PATHS.replayWatchRankings);
      return rankings;
    },
  };
}

function context(options: RequestContext, path: string): Game {
  if (!isSource(options.source)) throw invalidArgument(path, "source");
  const game = options.game ?? "cod2";
  if (!isGame(game)) throw invalidArgument(path, "game");
  return game;
}

function playerContext(options: RequestContext & { playerId: number }, path: string): Game {
  const game = context(options, path);
  if (!Number.isInteger(options.playerId) || options.playerId < 0) {
    throw invalidArgument(path, "playerId");
  }
  return game;
}

function replayContext(options: RequestContext & ReplayWatchScope, path: string): Game {
  const game = replayFiltersContext(options, path);
  const ownerPlayerId = options.ownerPlayerId;
  const mapId = options.mapId;
  if (ownerPlayerId === undefined && mapId === undefined) {
    throw invalidArgument(path, "scope");
  }
  return game;
}

function replayFiltersContext(options: RequestContext & ReplayWatchFilters, path: string): Game {
  const game = context(options, path);
  const ownerPlayerId = options.ownerPlayerId;
  const mapId = options.mapId;
  if (ownerPlayerId !== undefined && (!Number.isInteger(ownerPlayerId) || ownerPlayerId <= 0)) {
    throw invalidArgument(path, "ownerPlayerId");
  }
  if (mapId !== undefined && (!Number.isInteger(mapId) || mapId <= 0)) {
    throw invalidArgument(path, "mapId");
  }
  return game;
}

function assertReplayAggregateScope(
  aggregate: ReplayWatchAggregate,
  filters: ReplayWatchFilters,
  path: string,
): void {
  if (filters.ownerPlayerId !== undefined && aggregate.owner_player_id !== filters.ownerPlayerId) {
    throw invalidResponse(path, "$response.owner_player_id.scope");
  }
  if (filters.mapId !== undefined && aggregate.mapid !== filters.mapId) {
    throw invalidResponse(path, "$response.mapid.scope");
  }
}

function assertReplayRankingScope(
  rankings: readonly ReplayWatchRankingEntry[],
  filters: ReplayWatchFilters,
  path: string,
): void {
  const mismatchedIndex = rankings.findIndex(
    (entry) =>
      (filters.ownerPlayerId !== undefined && entry.owner_player_id !== filters.ownerPlayerId) ||
      (filters.mapId !== undefined && entry.mapid !== filters.mapId),
  );
  if (mismatchedIndex >= 0) {
    throw invalidResponse(path, `$response[${mismatchedIndex}].scope`);
  }
}

function requireFps(value: unknown, path: string): asserts value is Fps {
  if (!isFps(value)) throw invalidArgument(path, "fps");
}

function requireCheckpointId(value: unknown, path: string): asserts value is number | string {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    throw invalidArgument(path, "checkpointId");
  }
}

function limit(value: number | undefined, path: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw invalidArgument(path, "limit");
  }
}

function offset(value: number | undefined, path: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw invalidArgument(path, "offset");
  }
}

async function get(
  client: JsonClient,
  path: string,
  options: Pick<RequestContext, "signal" | "onRetry">,
  query: Record<string, string | number | undefined>,
): Promise<unknown> {
  return client.get(path, {
    query,
    signal: options.signal,
    onRetry: options.onRetry,
  });
}
