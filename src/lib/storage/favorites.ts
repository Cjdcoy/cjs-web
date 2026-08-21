import { useSyncExternalStore } from "react";
import type { GameMap, Player, Source } from "../api";

export const FAVORITES_SCHEMA_VERSION = 1 as const;
export const FAVORITES_STORAGE_KEY = "cjs:favorites";
export const LEGACY_FAVORITE_MAPS_KEY = "jhstats:favorite-maps";
export const LEGACY_FAVORITE_PLAYERS_KEY = "jhstats:favorite-players";

const FAVORITES_CHANGED_EVENT = "cjs:favorites-changed";

export type FavoriteEntityType = "map" | "player";
export type FavoriteKey = `${FavoriteEntityType}:${Source}:${number}`;

export interface FavoriteMapSnapshot {
  readonly author: string | null;
  readonly completionCount: number | null;
  readonly cpId: number;
  readonly name: string;
  readonly released: string | null;
  readonly routeType: string | null;
}

export interface FavoritePlayerSnapshot {
  readonly country: string | null;
  readonly lastSeen: string | null;
  readonly name: string;
  readonly visits: number | null;
}

interface FavoriteBase {
  readonly id: number;
  readonly key: FavoriteKey;
  readonly savedAt: string | null;
  readonly source: Source;
}

export interface MapFavorite extends FavoriteBase {
  readonly entityType: "map";
  readonly snapshot: FavoriteMapSnapshot | null;
}

export interface PlayerFavorite extends FavoriteBase {
  readonly entityType: "player";
  readonly snapshot: FavoritePlayerSnapshot | null;
}

export type FavoriteEntry = MapFavorite | PlayerFavorite;

export interface FavoritesDocumentV1 {
  readonly version: typeof FAVORITES_SCHEMA_VERSION;
  readonly entries: Readonly<Record<string, FavoriteEntry>>;
}

type FavoriteStorage = Pick<Storage, "getItem" | "setItem">;

export interface FavoriteStoreOptions {
  readonly getEventTarget?: () => EventTarget | null;
  readonly getStorage?: () => FavoriteStorage | null;
  readonly now?: () => string;
}

export interface FavoriteStore {
  readonly addMap: (map: GameMap, source: Source) => boolean;
  readonly addPlayer: (player: Player, source: Source) => boolean;
  readonly clear: (entityType?: FavoriteEntityType) => number;
  readonly getSnapshot: () => FavoritesDocumentV1;
  readonly remove: (entityType: FavoriteEntityType, source: Source, id: number) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly toggleMap: (map: GameMap, source: Source) => boolean;
  readonly togglePlayer: (player: Player, source: Source) => boolean;
}

const EMPTY_FAVORITES: FavoritesDocumentV1 = {
  version: FAVORITES_SCHEMA_VERSION,
  entries: {},
};

export function favoriteKey(
  entityType: FavoriteEntityType,
  source: Source,
  id: number,
): FavoriteKey {
  return `${entityType}:${source}:${id}`;
}

export function parseFavoritesDocument(value: unknown): FavoritesDocumentV1 | null {
  if (!isRecord(value) || value.version !== FAVORITES_SCHEMA_VERSION || !isRecord(value.entries)) {
    return null;
  }

  const entries: Record<string, FavoriteEntry> = {};
  for (const [storedKey, candidate] of Object.entries(value.entries)) {
    const entry = parseFavoriteEntry(candidate);
    if (entry && storedKey === entry.key) entries[entry.key] = entry;
  }

  return createDocument(entries);
}

export function decodeFavoritesDocument(raw: string | null): FavoritesDocumentV1 | null {
  if (raw === null) return null;

  try {
    return parseFavoritesDocument(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function migrateLegacyFavorites(
  legacyMaps: unknown,
  legacyPlayers: unknown,
  savedAt: string | null = new Date().toISOString(),
): FavoritesDocumentV1 {
  const entries: Record<string, FavoriteEntry> = {};

  if (Array.isArray(legacyMaps)) {
    for (const value of legacyMaps) {
      if (!isRecord(value)) continue;
      const id = readId(value.mapid);
      const source = readSource(value.source) ?? "jh";
      if (id === null) continue;

      const key = favoriteKey("map", source, id);
      entries[key] = {
        entityType: "map",
        id,
        key,
        savedAt,
        snapshot: parseLegacyMapSnapshot(value, id),
        source,
      };
    }
  }

  if (Array.isArray(legacyPlayers)) {
    for (const value of legacyPlayers) {
      if (!isRecord(value)) continue;
      const id = readId(value.player_id);
      const source = readSource(value.source) ?? "jh";
      if (id === null) continue;

      const key = favoriteKey("player", source, id);
      entries[key] = {
        entityType: "player",
        id,
        key,
        savedAt,
        snapshot: parseLegacyPlayerSnapshot(value),
        source,
      };
    }
  }

  return createDocument(entries);
}

export function selectMapFavorites(document: FavoritesDocumentV1): readonly MapFavorite[] {
  return Object.values(document.entries)
    .filter((entry): entry is MapFavorite => entry.entityType === "map")
    .sort(compareFavorites);
}

export function selectPlayerFavorites(document: FavoritesDocumentV1): readonly PlayerFavorite[] {
  return Object.values(document.entries)
    .filter((entry): entry is PlayerFavorite => entry.entityType === "player")
    .sort(compareFavorites);
}

export function hasFavorite(
  document: FavoritesDocumentV1,
  entityType: FavoriteEntityType,
  source: Source,
  id: number,
): boolean {
  return favoriteKey(entityType, source, id) in document.entries;
}

export function createFavoriteStore(options: FavoriteStoreOptions = {}): FavoriteStore {
  const getStorage = options.getStorage ?? defaultStorage;
  const getEventTarget = options.getEventTarget ?? defaultEventTarget;
  const now = options.now ?? (() => new Date().toISOString());
  let cachedRaw: string | null | undefined;
  let cachedSnapshot = EMPTY_FAVORITES;
  let fallbackRaw: string | null = null;

  const readStorageValue = (key: string): string | null => {
    try {
      return getStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const writeStorageValue = (raw: string): void => {
    try {
      const storage = getStorage();
      if (!storage) throw new Error("Storage is unavailable");
      storage.setItem(FAVORITES_STORAGE_KEY, raw);
      fallbackRaw = null;
    } catch {
      fallbackRaw = raw;
    }
  };

  const getSnapshot = (): FavoritesDocumentV1 => {
    const storedRaw = readStorageValue(FAVORITES_STORAGE_KEY);
    const raw = storedRaw ?? fallbackRaw;
    if (cachedRaw !== undefined && raw === cachedRaw) return cachedSnapshot;

    const current = decodeFavoritesDocument(raw);
    if (current) {
      cachedRaw = raw;
      cachedSnapshot = current;
      return cachedSnapshot;
    }

    const migrated = migrateLegacyFavorites(
      decodeJson(readStorageValue(LEGACY_FAVORITE_MAPS_KEY)),
      decodeJson(readStorageValue(LEGACY_FAVORITE_PLAYERS_KEY)),
      now(),
    );

    if (Object.keys(migrated.entries).length > 0) {
      const migratedRaw = JSON.stringify(migrated);
      writeStorageValue(migratedRaw);
      cachedRaw = migratedRaw;
      cachedSnapshot = migrated;
      return cachedSnapshot;
    }

    cachedRaw = raw;
    cachedSnapshot = EMPTY_FAVORITES;
    return cachedSnapshot;
  };

  const dispatchChange = (): void => {
    const target = getEventTarget();
    if (target && typeof Event !== "undefined") {
      target.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
    }
  };

  const commit = (entries: Record<string, FavoriteEntry>): FavoritesDocumentV1 => {
    const next = createDocument(entries);
    const raw = JSON.stringify(next);
    writeStorageValue(raw);
    cachedRaw = raw;
    cachedSnapshot = next;
    dispatchChange();
    return next;
  };

  const addEntry = (entry: FavoriteEntry): boolean => {
    const current = getSnapshot();
    if (current.entries[entry.key]) return false;
    commit({ ...current.entries, [entry.key]: entry });
    return true;
  };

  const remove = (entityType: FavoriteEntityType, source: Source, id: number): boolean => {
    const current = getSnapshot();
    const key = favoriteKey(entityType, source, id);
    if (!current.entries[key]) return false;
    const entries = Object.fromEntries(
      Object.entries(current.entries).filter(([entryKey]) => entryKey !== key),
    );
    commit(entries);
    return true;
  };

  const addMap = (map: GameMap, source: Source): boolean => {
    if (readId(map.mapid) === null) return false;
    return addEntry(createMapFavorite(map, source, now()));
  };

  const addPlayer = (player: Player, source: Source): boolean => {
    if (readId(player.player_id) === null) return false;
    return addEntry(createPlayerFavorite(player, source, now()));
  };

  return {
    addMap,
    addPlayer,
    clear(entityType) {
      const current = getSnapshot();
      const entries = Object.fromEntries(
        Object.entries(current.entries).filter(
          ([, entry]) => entityType !== undefined && entry.entityType !== entityType,
        ),
      );
      const removed = Object.keys(current.entries).length - Object.keys(entries).length;
      if (removed > 0) commit(entries);
      return removed;
    },
    getSnapshot,
    remove,
    subscribe(listener) {
      const target = getEventTarget();
      if (!target) return () => undefined;

      const handleStorage = (event: Event) => {
        const key = (event as StorageEvent).key;
        if (
          key !== null &&
          key !== FAVORITES_STORAGE_KEY &&
          key !== LEGACY_FAVORITE_MAPS_KEY &&
          key !== LEGACY_FAVORITE_PLAYERS_KEY
        ) {
          return;
        }
        fallbackRaw = null;
        cachedRaw = undefined;
        listener();
      };
      const handleLocalChange = () => {
        cachedRaw = undefined;
        listener();
      };

      target.addEventListener("storage", handleStorage);
      target.addEventListener(FAVORITES_CHANGED_EVENT, handleLocalChange);
      return () => {
        target.removeEventListener("storage", handleStorage);
        target.removeEventListener(FAVORITES_CHANGED_EVENT, handleLocalChange);
      };
    },
    toggleMap(map, source) {
      const key = favoriteKey("map", source, map.mapid);
      if (getSnapshot().entries[key]) {
        remove("map", source, map.mapid);
        return false;
      }
      return addMap(map, source);
    },
    togglePlayer(player, source) {
      const key = favoriteKey("player", source, player.player_id);
      if (getSnapshot().entries[key]) {
        remove("player", source, player.player_id);
        return false;
      }
      return addPlayer(player, source);
    },
  };
}

export const favoriteStore = createFavoriteStore();

export function useFavorites(store: FavoriteStore = favoriteStore): FavoritesDocumentV1 {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY_FAVORITES);
}

export const addMapFavorite = favoriteStore.addMap;
export const addPlayerFavorite = favoriteStore.addPlayer;
export const clearFavorites = favoriteStore.clear;
export const removeFavorite = favoriteStore.remove;
export const toggleMapFavorite = favoriteStore.toggleMap;
export const togglePlayerFavorite = favoriteStore.togglePlayer;

function createMapFavorite(map: GameMap, source: Source, savedAt: string): MapFavorite {
  const key = favoriteKey("map", source, map.mapid);
  return {
    entityType: "map",
    id: map.mapid,
    key,
    savedAt,
    snapshot: {
      author: optionalString(map.author),
      completionCount: optionalNumber(map.individual_finish_count),
      cpId: map.cp_id,
      name: map.mapname,
      released: optionalString(map.released),
      routeType: optionalString(map.type),
    },
    source,
  };
}

function createPlayerFavorite(player: Player, source: Source, savedAt: string): PlayerFavorite {
  const key = favoriteKey("player", source, player.player_id);
  return {
    entityType: "player",
    id: player.player_id,
    key,
    savedAt,
    snapshot: {
      country: optionalString(player.country),
      lastSeen: optionalString(player.last_seen),
      name: preferredPlayerName(player),
      visits: optionalNumber(player.visits),
    },
    source,
  };
}

function parseFavoriteEntry(value: unknown): FavoriteEntry | null {
  if (!isRecord(value)) return null;
  const entityType = value.entityType;
  const source = readSource(value.source);
  const id = readId(value.id);
  const savedAt = optionalString(value.savedAt);
  if ((entityType !== "map" && entityType !== "player") || source === null || id === null) {
    return null;
  }

  const key = favoriteKey(entityType, source, id);
  if (value.key !== key) return null;

  if (entityType === "map") {
    return {
      entityType,
      id,
      key,
      savedAt,
      snapshot: parseMapSnapshot(value.snapshot),
      source,
    };
  }

  return {
    entityType,
    id,
    key,
    savedAt,
    snapshot: parsePlayerSnapshot(value.snapshot),
    source,
  };
}

function parseMapSnapshot(value: unknown): FavoriteMapSnapshot | null {
  if (!isRecord(value)) return null;
  const name = requiredString(value.name);
  const cpId = readId(value.cpId);
  if (name === null || cpId === null) return null;

  return {
    author: optionalString(value.author),
    completionCount: optionalNumber(value.completionCount),
    cpId,
    name,
    released: optionalString(value.released),
    routeType: optionalString(value.routeType),
  };
}

function parsePlayerSnapshot(value: unknown): FavoritePlayerSnapshot | null {
  if (!isRecord(value)) return null;
  const name = requiredString(value.name);
  if (name === null) return null;

  return {
    country: optionalString(value.country),
    lastSeen: optionalString(value.lastSeen),
    name,
    visits: optionalNumber(value.visits),
  };
}

function parseLegacyMapSnapshot(
  value: Readonly<Record<string, unknown>>,
  id: number,
): FavoriteMapSnapshot | null {
  const name = requiredString(value.mapname);
  if (name === null) return null;

  return {
    author: optionalString(value.author),
    completionCount: optionalNumber(value.individual_finish_count),
    cpId: readId(value.cp_id) ?? id,
    name,
    released: optionalString(value.released),
    routeType: optionalString(value.type),
  };
}

function parseLegacyPlayerSnapshot(
  value: Readonly<Record<string, unknown>>,
): FavoritePlayerSnapshot | null {
  const name = requiredString(value.pref_name) ?? requiredString(value.playername);
  if (name === null) return null;

  return {
    country: optionalString(value.country),
    lastSeen: optionalString(value.last_seen),
    name,
    visits: optionalNumber(value.visits),
  };
}

function preferredPlayerName(player: Player): string {
  return player.pref_name?.trim() || player.playername.trim() || `Player #${player.player_id}`;
}

function createDocument(entries: Record<string, FavoriteEntry>): FavoritesDocumentV1 {
  return { version: FAVORITES_SCHEMA_VERSION, entries };
}

function compareFavorites(left: FavoriteEntry, right: FavoriteEntry): number {
  return (
    (right.savedAt ?? "").localeCompare(left.savedAt ?? "") || left.key.localeCompare(right.key)
  );
}

function decodeJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSource(value: unknown): Source | null {
  return value === "jh" || value === "j4l" ? value : null;
}

function readId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function requiredString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function defaultEventTarget(): EventTarget | null {
  return typeof window === "undefined" ? null : window;
}
