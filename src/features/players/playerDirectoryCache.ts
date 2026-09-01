import type { CjsApi, Player, Source } from "../../lib/api";

interface CachedDirectory {
  complete: boolean;
  players: Map<number, Player>;
}

const directories = new Map<Source, CachedDirectory>();

export function cachePlayerDirectory(
  source: Source,
  players: readonly Player[],
  complete = false,
): void {
  const directory = directories.get(source) ?? {
    complete: false,
    players: new Map<number, Player>(),
  };

  for (const player of players) {
    directory.players.set(player.player_id, player);
  }
  directory.complete ||= complete;
  directories.set(source, directory);
}

export function getCachedPlayer(source: Source, playerId: number): Player | null {
  return directories.get(source)?.players.get(playerId) ?? null;
}

export async function loadPlayerDirectoryEntry(
  listPlayers: CjsApi["players"],
  source: Source,
  playerId: number,
  signal: AbortSignal,
): Promise<Player | null> {
  const directory = directories.get(source);
  const cachedPlayer = directory?.players.get(playerId);
  if (cachedPlayer) return cachedPlayer;
  if (directory?.complete) return null;

  const players = await listPlayers({ signal, sort: "last-seen", source });
  cachePlayerDirectory(source, players, true);
  return getCachedPlayer(source, playerId);
}

export function clearPlayerDirectoryCache(): void {
  directories.clear();
}
