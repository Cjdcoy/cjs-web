import type { ServerResponse } from "../../lib/api";

interface UnknownRecord {
  readonly [key: string]: unknown;
}

export interface ServerPlayerViewModel {
  readonly id: number | null;
  readonly name: string;
  readonly ping: number | null;
}

export const SERVER_GAMES = ["cod2", "cod4"] as const;
export type ServerGame = (typeof SERVER_GAMES)[number];

export interface ServerViewModel {
  readonly connectionAddress: string | null;
  readonly domain: string;
  readonly game: ServerGame;
  readonly id: string;
  readonly ip: string;
  readonly mapId: number | null;
  readonly mapName: string;
  readonly online: boolean;
  readonly playerCount: number;
  readonly players: readonly ServerPlayerViewModel[] | null;
  readonly port: number | null;
}

export interface ServerDashboardViewModel {
  readonly omittedServerCount: number;
  readonly onlineServers: number;
  readonly servers: readonly ServerViewModel[];
  readonly totalPlayers: number;
}

export class InvalidServerDashboardError extends Error {
  constructor() {
    super("The server feed returned data that CJS could not understand.");
    this.name = "InvalidServerDashboardError";
  }
}

export function normalizeServerDashboard(
  value: ServerResponse | unknown,
): ServerDashboardViewModel {
  const response = asRecord(value);
  if (!response || !Array.isArray(response.servers)) {
    throw new InvalidServerDashboardError();
  }

  const normalized = response.servers.map(normalizeServer);
  const servers = normalized.filter((server): server is ServerViewModel => server !== null);
  const totalPlayers = nonNegativeInteger(response.total_players);
  const onlineServers = nonNegativeInteger(response.online_servers);

  return {
    omittedServerCount: normalized.length - servers.length,
    onlineServers: onlineServers ?? servers.filter((server) => server.online).length,
    servers,
    totalPlayers: totalPlayers ?? servers.reduce((total, server) => total + server.playerCount, 0),
  };
}

export function filterServers(
  servers: readonly ServerViewModel[],
  populatedOnly: boolean,
  game: ServerGame = "cod2",
): readonly ServerViewModel[] {
  return servers.filter(
    (server) => server.game === game && (!populatedOnly || server.playerCount > 0),
  );
}

export function formatUpdatedTime(timestamp: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (elapsedSeconds < 10) return "just now";
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes === 1) return "1 minute ago";
  if (elapsedMinutes < 60) return `${elapsedMinutes} minutes ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return elapsedHours === 1 ? "1 hour ago" : `${elapsedHours} hours ago`;
}

function normalizeServer(value: unknown, index: number): ServerViewModel | null {
  const server = asRecord(value);
  if (!server) return null;

  const domain = displayText(server.domain);
  const ip = displayText(server.ip);
  const mapName = displayText(server.map);
  if (!domain && !ip && !mapName) return null;

  const port = validPort(server.port);
  const players = normalizePlayers(server.players);
  const playerCount = nonNegativeInteger(server.player_count) ?? players?.length ?? 0;
  const mapId = nonNegativeInteger(server.mapid);
  const game = normalizeServerGame(server.game_type);
  const host = validHost(domain) ?? validHost(ip);

  return {
    connectionAddress: host && port ? `${host}:${port}` : null,
    domain: domain || ip || "Unnamed server",
    game,
    id: `${game}:${domain || ip || "server"}:${port ?? "unknown"}:${mapId ?? (mapName || "map")}:${index}`,
    ip,
    mapId,
    mapName: mapName || "Map unavailable",
    online: server.online === true,
    playerCount,
    players,
    port,
  };
}

function normalizePlayers(value: unknown): readonly ServerPlayerViewModel[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;

  return value.flatMap((entry) => {
    const player = asRecord(entry);
    if (!player) return [];

    const name = displayText(player.playername);
    return [
      {
        id: nonNegativeInteger(player.playerid),
        name: name || "Unknown player",
        ping: nonNegativeInteger(player.ping),
      },
    ];
  });
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function displayText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function validPort(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65_535
    ? value
    : null;
}

function validHost(value: string): string | null {
  if (
    !value ||
    value.length > 253 ||
    /[\s/:\\?#@]/.test(value) ||
    value.includes("[") ||
    value.includes("]")
  ) {
    return null;
  }

  const labels = value.split(".");
  return labels.every(
    (label) =>
      label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  )
    ? value
    : null;
}

function normalizeServerGame(value: unknown): ServerGame {
  return displayText(value).toLocaleLowerCase() === "cod4" ? "cod4" : "cod2";
}
