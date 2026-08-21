import { Search } from "lucide-react";
import { useMemo } from "react";
import { Page } from "../../components";
import { Badge, Input, Panel, Select } from "../../components/ui";
import { api, type Source } from "../../lib/api";
import { sourceOptions, useQueryState, useSourceContext } from "../../lib/routing";
import { PlayerResults } from "./PlayerResults";
import {
  PLAYER_SEARCH_LIMIT,
  PLAYER_SEARCH_MIN_LENGTH,
  playerDiscoveryQuerySchema,
  sortPlayers,
} from "./playerDiscovery";
import { useFavoritePlayers } from "./useFavoritePlayers";
import { usePlayerSearch } from "./usePlayerSearch";
import "./players.css";

const sourceLabels: Readonly<Record<Source, string>> = {
  j4l: "Jump4Life",
  jh: "JumpersHeaven",
};

export function PlayersPage({
  listPlayers,
  searchPlayers,
}: {
  listPlayers?: typeof api.players;
  searchPlayers?: typeof api.searchPlayers;
} = {}) {
  const { source, setSource } = useSourceContext();
  const [queryState, setQueryState] = useQueryState(playerDiscoveryQuerySchema);
  const { error, players, retry, status } = usePlayerSearch({
    listPlayers,
    query: queryState.q,
    searchPlayers,
    sort: queryState.sort,
    source,
  });
  const sortedPlayers = useMemo(
    () => sortPlayers(players, queryState.sort),
    [players, queryState.sort],
  );
  const { favoriteIds, toggleFavorite } = useFavoritePlayers(source);
  const normalizedQuery = queryState.q.trim();

  return (
    <Page active="/players" accent="teal">
      <div className="cjs-player-discovery">
        <header className="cjs-player-discovery__header">
          <div>
            <p className="cjs-player-discovery__eyebrow">Player directory</p>
            <h1>Find a player</h1>
            <p>Browse recently seen players or search the public directory by name.</p>
          </div>
          <Badge tone="information">{sourceLabels[source]} data</Badge>
        </header>

        <Panel className="cjs-player-search" padding="large" variant="strong">
          <Input
            autoComplete="off"
            enterKeyHint="search"
            helperText={`Enter at least ${PLAYER_SEARCH_MIN_LENGTH} characters. Search runs after a short pause.`}
            label="Player name"
            leading={<Search size={17} />}
            maxLength={64}
            onChange={(event) => setQueryState({ q: event.target.value }, { replace: true })}
            placeholder="Search names"
            spellCheck={false}
            type="search"
            value={queryState.q}
          />
          <Select
            label="Data source"
            onChange={(event) => {
              const nextSource = event.target.value;
              if (nextSource === "jh" || nextSource === "j4l") setSource(nextSource);
            }}
            value={source}
          >
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            label="Sort results"
            onChange={(event) => {
              const sort = event.target.value;
              if (sort === "last-seen" || sort === "name" || sort === "visits") {
                setQueryState({ sort });
              }
            }}
            value={queryState.sort}
          >
            <option value="last-seen">Last seen</option>
            <option value="name">Player name</option>
            <option value="visits">Visit count</option>
          </Select>
        </Panel>

        <p className="cjs-player-discovery__note">
          Directory players are revealed in batches as you scroll. Name searches use the documented
          lookup and are limited to {PLAYER_SEARCH_LIMIT} results. Country, visits, and last-seen
          values appear only when the API supplies them.
        </p>

        <PlayerResults
          error={error}
          favoriteIds={favoriteIds}
          players={sortedPlayers}
          query={normalizedQuery}
          retry={retry}
          source={source}
          status={status}
          toggleFavorite={toggleFavorite}
        />
      </div>
    </Page>
  );
}
