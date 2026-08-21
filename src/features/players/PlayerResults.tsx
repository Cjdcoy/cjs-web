import { Heart, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  CodPlayerName,
  CountryFlag,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Link,
  SkeletonGroup,
  type DataTableColumn,
} from "../../components/ui";
import type { Player, Source } from "../../lib/api";
import { playerDetailPath } from "../../lib/routing";
import { formatDate, formatNumber, timeAgo } from "../../lib/format";
import {
  PLAYER_DIRECTORY_BATCH_SIZE,
  PLAYER_SEARCH_MIN_LENGTH,
  parseCodName,
  playerDisplayName,
} from "./playerDiscovery";
import type { PlayerSearchStatus } from "./usePlayerSearch";

const sourceLabels: Readonly<Record<Source, string>> = {
  j4l: "Jump4Life",
  jh: "JumpersHeaven",
};

interface PlayerResultsProps {
  error: string | null;
  favoriteIds: ReadonlySet<number>;
  players: Player[];
  query: string;
  retry: () => void;
  source: Source;
  status: PlayerSearchStatus;
  toggleFavorite: (player: Player) => void;
}

export function PlayerResults({
  error,
  favoriteIds,
  players,
  query,
  retry,
  source,
  status,
  toggleFavorite,
}: PlayerResultsProps) {
  const hasSearch = query.length >= PLAYER_SEARCH_MIN_LENGTH;
  const hasStaleResults = status === "error" && players.length > 0;
  const [visibleCount, setVisibleCount] = useState(PLAYER_DIRECTORY_BATCH_SIZE);
  const loadMoreTarget = useRef<HTMLDivElement>(null);
  const visiblePlayers = useMemo(() => players.slice(0, visibleCount), [players, visibleCount]);
  const hasMore = visiblePlayers.length < players.length;
  const loadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + PLAYER_DIRECTORY_BATCH_SIZE, players.length));
  }, [players.length]);

  useEffect(() => {
    setVisibleCount(PLAYER_DIRECTORY_BATCH_SIZE);
  }, [players]);

  useEffect(() => {
    const target = loadMoreTarget.current;
    if (!hasMore || !target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const columns = useMemo<readonly DataTableColumn<Player>[]>(
    () => [
      {
        id: "player",
        header: "Player",
        priority: "primary",
        cell: (player) => <PlayerLink player={player} source={source} />,
      },
      {
        id: "country",
        header: "Country",
        cell: (player) => {
          const country = player.country?.trim();
          return country ? (
            <span className="cjs-player-country">
              <CountryFlag code={country} label={country} size="small" />
              <span>{country}</span>
            </span>
          ) : (
            "Not provided"
          );
        },
      },
      {
        id: "visits",
        header: "Visits",
        align: "end",
        cell: (player) =>
          player.visits === undefined ? "Not provided" : formatNumber(player.visits),
      },
      {
        id: "last-seen",
        header: "Last seen",
        cell: (player) => (
          <span title={player.last_seen ? formatDate(player.last_seen) : undefined}>
            {player.last_seen ? timeAgo(player.last_seen) : "Not provided"}
          </span>
        ),
      },
      {
        id: "favorite",
        header: "Favorite",
        align: "end",
        cell: (player) => {
          const favorite = favoriteIds.has(player.player_id);
          const name = parseCodName(playerDisplayName(player)).plainText;
          return (
            <IconButton
              className="cjs-player-favorite"
              label={`${favorite ? "Remove" : "Add"} ${name} ${favorite ? "from" : "to"} favorites`}
              aria-pressed={favorite}
              onClick={() => toggleFavorite(player)}
              size="small"
              variant={favorite ? "ghost" : "secondary"}
            >
              <Heart aria-hidden="true" fill={favorite ? "currentColor" : "none"} size={16} />
            </IconButton>
          );
        },
      },
    ],
    [favoriteIds, source, toggleFavorite],
  );

  return (
    <section className="cjs-player-results" aria-labelledby="player-results-heading">
      <div className="cjs-player-results__heading">
        <div>
          <h2 id="player-results-heading">{hasSearch ? "Search results" : "Players"}</h2>
          <p aria-live="polite" role="status">
            <PlayerResultSummary
              count={visiblePlayers.length}
              hasSearch={hasSearch}
              query={query}
              source={source}
              status={status}
              total={players.length}
            />
          </p>
        </div>
      </div>

      {(status === "debouncing" || status === "loading") && (
        <SkeletonGroup
          count={5}
          label={
            hasSearch
              ? `Searching ${sourceLabels[source]} players`
              : `Loading ${sourceLabels[source]} players`
          }
          variant="card"
        />
      )}

      {status === "error" && !hasStaleResults && (
        <ErrorState
          description={
            hasSearch
              ? `The ${sourceLabels[source]} player search for “${query}” could not be completed${error ? `: ${error}` : "."}`
              : `The ${sourceLabels[source]} player directory could not be loaded${error ? `: ${error}` : "."}`
          }
          onRetry={retry}
          title={hasSearch ? "Unable to search players" : "Unable to load players"}
        />
      )}

      {hasStaleResults && (
        <div className="cjs-player-results__refresh-error" role="alert">
          <p>The latest refresh failed{error ? `: ${error}` : "."} Showing previous results.</p>
          <Button onClick={retry} size="small" variant="secondary">
            Try again
          </Button>
        </div>
      )}

      {status === "success" && players.length === 0 && (
        <EmptyState
          description={
            hasSearch
              ? `No ${sourceLabels[source]} player names matched “${query}”. Try a broader spelling.`
              : `The ${sourceLabels[source]} directory did not return any players.`
          }
          icon={UsersRound}
          title={hasSearch ? "No players found" : "No directory players"}
        />
      )}

      {players.length > 0 && (
        <>
          {status === "refreshing" && (
            <p className="cjs-player-results__refreshing" aria-live="polite" role="status">
              Refreshing results…
            </p>
          )}
          <DataTable
            caption={
              hasSearch
                ? `${sourceLabels[source]} players matching ${query}`
                : `${sourceLabels[source]} player directory`
            }
            className="cjs-player-table"
            columns={columns}
            getRowKey={(player) => player.player_id}
            getRowLabel={(player) =>
              `${parseCodName(playerDisplayName(player)).plainText}, player ${player.player_id}`
            }
            rows={visiblePlayers}
          />
          {hasMore && (
            <div className="cjs-player-results__load-more" ref={loadMoreTarget}>
              <Button onClick={loadMore} size="small" variant="secondary">
                Load more players
              </Button>
              <span>
                Showing {visiblePlayers.length} of {players.length}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PlayerLink({ player, source }: { player: Player; source: Source }) {
  const parsedName = parseCodName(playerDisplayName(player));
  const initial = parsedName.plainText.slice(0, 1).toUpperCase() || "?";

  return (
    <Link
      className="cjs-player-link"
      href={playerDetailPath(player.player_id, source)}
      variant="player"
    >
      <span className="cjs-player-link__avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="cjs-player-link__identity">
        <strong>
          <CodPlayerName value={playerDisplayName(player)} />
        </strong>
        <small>Player #{player.player_id}</small>
      </span>
    </Link>
  );
}

function PlayerResultSummary({
  count,
  hasSearch,
  query,
  source,
  status,
  total,
}: {
  count: number;
  hasSearch: boolean;
  query: string;
  source: Source;
  status: PlayerSearchStatus;
  total: number;
}) {
  if (!hasSearch && status === "loading")
    return <>Loading recently seen players from {sourceLabels[source]}.</>;
  if (!hasSearch && status === "refreshing")
    return (
      <>
        Refreshing {total} players from {sourceLabels[source]}.
      </>
    );
  if (!hasSearch && status === "error" && total === 0) return <>Player directory failed.</>;
  if (!hasSearch)
    return (
      <>
        Showing {count} of {total} players from {sourceLabels[source]}.
      </>
    );
  if (status === "debouncing") return <>Waiting to search for “{query}”.</>;
  if (status === "loading")
    return (
      <>
        Searching {sourceLabels[source]} for “{query}”.
      </>
    );
  if (status === "refreshing")
    return (
      <>
        Refreshing {count} results for “{query}”.
      </>
    );
  if (status === "error" && count === 0) return <>Search failed for “{query}”.</>;
  return (
    <>
      {count} {count === 1 ? "match" : "matches"} for “{query}” in {sourceLabels[source]}.
    </>
  );
}
