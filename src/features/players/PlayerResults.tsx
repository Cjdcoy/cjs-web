import { Heart, UsersRound } from "lucide-react";
import { useMemo } from "react";
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  SkeletonGroup,
  type DataTableColumn,
} from "../../components/ui";
import type { Player, Source } from "../../lib/api";
import { playerDetailPath } from "../../lib/routing";
import { formatDate, formatNumber, timeAgo } from "../../lib/format";
import { CodPlayerName } from "./CodPlayerName";
import { PLAYER_SEARCH_MIN_LENGTH, parseCodName, playerDisplayName } from "./playerDiscovery";
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
        cell: (player) => player.country?.trim() || "Not provided",
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
          <h2 id="player-results-heading">Search results</h2>
          <p aria-live="polite" role="status">
            <PlayerResultSummary
              count={players.length}
              hasSearch={hasSearch}
              query={query}
              source={source}
              status={status}
            />
          </p>
        </div>
      </div>

      {!hasSearch && (
        <EmptyState
          description={`Enter at least ${PLAYER_SEARCH_MIN_LENGTH} characters to search ${sourceLabels[source]}.`}
          icon={UsersRound}
          title="Search by player name"
        />
      )}

      {hasSearch && (status === "debouncing" || status === "loading") && (
        <SkeletonGroup
          count={5}
          label={`Searching ${sourceLabels[source]} players`}
          variant="card"
        />
      )}

      {hasSearch && status === "error" && !hasStaleResults && (
        <ErrorState
          description={`The ${sourceLabels[source]} player search for “${query}” could not be completed${error ? `: ${error}` : "."}`}
          onRetry={retry}
          title="Unable to search players"
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

      {hasSearch && status === "success" && players.length === 0 && (
        <EmptyState
          description={`No ${sourceLabels[source]} player names matched “${query}”. Try a broader spelling.`}
          icon={UsersRound}
          title="No players found"
        />
      )}

      {hasSearch && players.length > 0 && (
        <>
          {status === "refreshing" && (
            <p className="cjs-player-results__refreshing" aria-live="polite" role="status">
              Refreshing results…
            </p>
          )}
          <DataTable
            caption={`${sourceLabels[source]} players matching ${query}`}
            className="cjs-player-table"
            columns={columns}
            getRowKey={(player) => player.player_id}
            getRowLabel={(player) =>
              `${parseCodName(playerDisplayName(player)).plainText}, player ${player.player_id}`
            }
            rows={players}
          />
        </>
      )}
    </section>
  );
}

function PlayerLink({ player, source }: { player: Player; source: Source }) {
  const parsedName = parseCodName(playerDisplayName(player));
  const initial = parsedName.plainText.slice(0, 1).toUpperCase() || "?";

  return (
    <a className="cjs-player-link" href={playerDetailPath(player.player_id, source)}>
      <span className="cjs-player-link__avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="cjs-player-link__identity">
        <strong>
          <CodPlayerName value={playerDisplayName(player)} />
        </strong>
        <small>Player #{player.player_id}</small>
      </span>
    </a>
  );
}

function PlayerResultSummary({
  count,
  hasSearch,
  query,
  source,
  status,
}: {
  count: number;
  hasSearch: boolean;
  query: string;
  source: Source;
  status: PlayerSearchStatus;
}) {
  if (!hasSearch) return <>Waiting for a name.</>;
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
