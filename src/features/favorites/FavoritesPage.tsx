import { CloudOff, Heart, Map as MapIcon, Trash2, UserRound, Users } from "lucide-react";
import { useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Badge,
  Button,
  Card,
  CodPlayerName,
  EmptyState,
  IconButton,
  Link,
  Panel,
  SegmentedControl,
  VisuallyHidden,
} from "../../components/ui";
import { stripCodColorCodes } from "../../lib/codName";
import {
  defineQuerySchema,
  enumQueryParam,
  mapDetailPath,
  playerDetailPath,
  useQueryState,
} from "../../lib/routing";
import {
  clearFavorites,
  removeFavorite,
  selectMapFavorites,
  selectPlayerFavorites,
  useFavorites,
  type MapFavorite,
  type PlayerFavorite,
} from "../../lib/storage";
import "./favorites.css";

const favoritesQuerySchema = defineQuerySchema({
  tab: enumQueryParam(["maps", "players"] as const, "maps"),
});

const numberFormatter = new Intl.NumberFormat();

export function FavoritesPage() {
  const [queryState, setQueryState] = useQueryState(favoritesQuerySchema);
  const document = useFavorites();
  const [announcement, setAnnouncement] = useState("");
  const mapEmptyAction = useRef<HTMLAnchorElement>(null);
  const playerEmptyAction = useRef<HTMLAnchorElement>(null);
  const maps = useMemo(() => selectMapFavorites(document), [document]);
  const players = useMemo(() => selectPlayerFavorites(document), [document]);
  const activeFavorites = queryState.tab === "maps" ? maps : players;
  const total = maps.length + players.length;

  const clearActiveFavorites = () => {
    const entityType = queryState.tab === "maps" ? "map" : "player";
    const removed = clearFavorites(entityType);
    setAnnouncement(
      `${removed} favorite ${queryState.tab === "maps" ? "map" : "player"}${removed === 1 ? "" : "s"} removed.`,
    );
    const fallback = queryState.tab === "maps" ? mapEmptyAction : playerEmptyAction;
    window.requestAnimationFrame(() => fallback.current?.focus());
  };

  const removeEntry = (
    entityType: "map" | "player",
    entry: MapFavorite | PlayerFavorite,
    trigger: HTMLButtonElement,
  ) => {
    const buttons = Array.from(
      trigger
        .closest(".cjs-favorites__grid")
        ?.querySelectorAll<HTMLButtonElement>("[data-favorite-remove]") ?? [],
    );
    const index = buttons.indexOf(trigger);
    const nextButton = buttons[index + 1] ?? buttons[index - 1];
    const fallback = entityType === "map" ? mapEmptyAction : playerEmptyAction;

    removeFavorite(entityType, entry.source, entry.id);
    setAnnouncement(
      `${entityType === "map" ? mapName(entry as MapFavorite) : playerName(entry as PlayerFavorite)} removed from favorites.`,
    );
    window.requestAnimationFrame(() => {
      if (nextButton?.isConnected) nextButton.focus();
      else fallback.current?.focus();
    });
  };

  return (
    <div className="cjs-favorites cjs-stack">
      <header className="cjs-favorites__header">
        <div>
          <p className="cjs-favorites__eyebrow">
            <Heart aria-hidden="true" size={16} />
            Browser-local collection
          </p>
          <h1>Your favorites</h1>
          <p>
            Keep useful maps and players together. Every favorite is separated by data source, so
            matching IDs from JumpersHeaven and Jump4Life stay distinct.
          </p>
        </div>
        <Badge tone="information">{total} saved</Badge>
      </header>

      <Panel className="cjs-favorites__notice" variant="warm">
        <CloudOff aria-hidden="true" size={20} />
        <div>
          <strong>Stored only in this browser</strong>
          <p>
            Cards show the last saved snapshot and can become stale. Open a record to check current
            API data; unavailable records remain removable here.
          </p>
        </div>
      </Panel>

      <div className="cjs-favorites__toolbar">
        <SegmentedControl
          ariaLabel="Favorite type"
          options={[
            {
              accessibleLabel: `Maps, ${maps.length} favorites`,
              label: (
                <>
                  <MapIcon aria-hidden="true" size={16} /> Maps <span>{maps.length}</span>
                </>
              ),
              value: "maps",
            },
            {
              accessibleLabel: `Players, ${players.length} favorites`,
              label: (
                <>
                  <Users aria-hidden="true" size={16} /> Players <span>{players.length}</span>
                </>
              ),
              value: "players",
            },
          ]}
          value={queryState.tab}
          onChange={(tab) => setQueryState({ tab })}
        />
        <Button
          disabled={activeFavorites.length === 0}
          onClick={clearActiveFavorites}
          size="small"
          variant="danger"
        >
          <Trash2 aria-hidden="true" size={16} />
          Clear {queryState.tab}
        </Button>
      </div>

      <p className="cjs-favorites__count" role="status" aria-live="polite">
        {total === 0
          ? "No favorites are saved."
          : `${maps.length} favorite ${maps.length === 1 ? "map" : "maps"} and ${players.length} favorite ${players.length === 1 ? "player" : "players"} saved.`}
      </p>
      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>

      {queryState.tab === "maps" && (
        <FavoriteMaps
          emptyActionRef={mapEmptyAction}
          entries={maps}
          onRemove={(entry, trigger) => removeEntry("map", entry, trigger)}
        />
      )}
      {queryState.tab === "players" && (
        <FavoritePlayers
          emptyActionRef={playerEmptyAction}
          entries={players}
          onRemove={(entry, trigger) => removeEntry("player", entry, trigger)}
        />
      )}
    </div>
  );
}

function FavoriteMaps({
  emptyActionRef,
  entries,
  onRemove,
}: {
  emptyActionRef: RefObject<HTMLAnchorElement | null>;
  entries: readonly MapFavorite[];
  onRemove: (entry: MapFavorite, trigger: HTMLButtonElement) => void;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={MapIcon}
        title="No favorite maps yet"
        description="Save a map from discovery or a map detail page to keep it here."
        action={
          <Link ref={emptyActionRef} href="/maps" variant="standalone">
            Browse maps
          </Link>
        }
      />
    );
  }

  return (
    <section aria-labelledby="favorite-maps-heading">
      <h2 className="cjs-visually-hidden" id="favorite-maps-heading">
        Favorite maps
      </h2>
      <div className="cjs-favorites__grid">
        {entries.map((entry) => (
          <FavoriteCard
            key={entry.key}
            badge={entry.snapshot?.routeType || "Map"}
            details={
              entry.snapshot
                ? `${entry.snapshot.author ? `By ${entry.snapshot.author}` : "Author unavailable"} · ${formatCount(entry.snapshot.completionCount)} completions`
                : "Saved details are unavailable"
            }
            href={mapDetailPath(entry.id, { source: entry.source })}
            icon={<MapIcon aria-hidden="true" size={24} />}
            name={mapName(entry)}
            onRemove={(trigger) => onRemove(entry, trigger)}
            source={entry.source}
            snapshotAvailable={entry.snapshot !== null}
          />
        ))}
      </div>
    </section>
  );
}

function FavoritePlayers({
  emptyActionRef,
  entries,
  onRemove,
}: {
  emptyActionRef: RefObject<HTMLAnchorElement | null>;
  entries: readonly PlayerFavorite[];
  onRemove: (entry: PlayerFavorite, trigger: HTMLButtonElement) => void;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No favorite players yet"
        description="Save a player from search or a profile to keep them here."
        action={
          <Link ref={emptyActionRef} href="/players" variant="standalone">
            Search players
          </Link>
        }
      />
    );
  }

  return (
    <section aria-labelledby="favorite-players-heading">
      <h2 className="cjs-visually-hidden" id="favorite-players-heading">
        Favorite players
      </h2>
      <div className="cjs-favorites__grid">
        {entries.map((entry) => (
          <FavoriteCard
            key={entry.key}
            badge={`Player #${entry.id}`}
            details={
              entry.snapshot
                ? `${entry.snapshot.country || "Country unavailable"} · ${formatCount(entry.snapshot.visits)} visits`
                : "Saved details are unavailable"
            }
            href={playerDetailPath(entry.id, entry.source)}
            icon={<UserRound aria-hidden="true" size={24} />}
            name={playerName(entry)}
            renderedName={<CodPlayerName value={playerRawName(entry)} />}
            linkVariant="player"
            onRemove={(trigger) => onRemove(entry, trigger)}
            source={entry.source}
            snapshotAvailable={entry.snapshot !== null}
          />
        ))}
      </div>
    </section>
  );
}

function FavoriteCard({
  badge,
  details,
  href,
  icon,
  name,
  onRemove,
  renderedName,
  linkVariant = "standalone",
  snapshotAvailable,
  source,
}: {
  badge: string;
  details: string;
  href: string;
  icon: ReactNode;
  name: string;
  onRemove: (trigger: HTMLButtonElement) => void;
  renderedName?: ReactNode;
  linkVariant?: "player" | "standalone";
  snapshotAvailable: boolean;
  source: "jh" | "j4l";
}) {
  const titleId = useId();

  return (
    <Card className="cjs-favorite-card" aria-labelledby={titleId}>
      <span className="cjs-favorite-card__icon">{icon}</span>
      <div className="cjs-favorite-card__body">
        <div className="cjs-favorite-card__badges">
          <Badge>{source === "jh" ? "JumpersHeaven" : "Jump4Life"}</Badge>
          <Badge>{badge}</Badge>
          <Badge tone={snapshotAvailable ? "information" : "warning"}>
            {snapshotAvailable ? "Saved snapshot" : "Details unavailable"}
          </Badge>
        </div>
        <Link id={titleId} href={href} variant={linkVariant}>
          {renderedName ?? name}
        </Link>
        <p>{details}</p>
      </div>
      <IconButton
        data-favorite-remove
        label={`Remove ${name} from favorites`}
        onClick={(event) => onRemove(event.currentTarget)}
        variant="danger"
      >
        <Trash2 aria-hidden="true" size={17} />
      </IconButton>
    </Card>
  );
}

function mapName(entry: MapFavorite): string {
  return entry.snapshot?.name ?? `Map #${entry.id}`;
}

function playerName(entry: PlayerFavorite): string {
  return stripCodColorCodes(playerRawName(entry));
}

function playerRawName(entry: PlayerFavorite): string {
  return entry.snapshot?.name?.trim() || `Player #${entry.id}`;
}

function formatCount(value: number | null): string {
  return value === null ? "Unknown" : numberFormatter.format(value);
}
