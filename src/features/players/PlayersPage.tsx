import { Search } from "lucide-react";
import { useMemo } from "react";
import { Page } from "../../components";
import { Input, Panel, SegmentedControl, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { sourceOptions, useQueryState, useSourceContext, type SourceId } from "../../lib/routing";
import { PlayerResults } from "./PlayerResults";
import {
  PLAYER_SEARCH_LIMIT,
  PLAYER_SEARCH_MIN_LENGTH,
  filterPlayers,
  normalizePlayerCountry,
  playerCountryLabel,
  playerCountryOptions,
  playerDiscoveryQuerySchema,
  sortPlayers,
} from "./playerDiscovery";
import { useFavoritePlayers } from "./useFavoritePlayers";
import { usePlayerLevels } from "./usePlayerLevels";
import { usePlayerSearch } from "./usePlayerSearch";
import "./players.css";

export function PlayersPage({
  listPlayerRanks,
  listPlayers,
  searchPlayers,
}: {
  listPlayerRanks?: typeof api.rankXpLeaderboard;
  listPlayers?: typeof api.players;
  searchPlayers?: typeof api.searchPlayers;
} = {}) {
  const { source, setSource } = useSourceContext();
  const [queryState, setQueryState] = useQueryState(playerDiscoveryQuerySchema);
  const sort = queryState.sort === "level" && source !== "j4l" ? "last-seen" : queryState.sort;
  const { error, players, retry, status } = usePlayerSearch({
    listPlayers,
    query: queryState.q,
    searchPlayers,
    sort,
    source,
  });
  const {
    error: levelError,
    levelXp,
    levels: playerLevels,
    retry: retryLevels,
    status: levelStatus,
  } = usePlayerLevels({ listPlayerRanks, source });
  const filteredPlayers = useMemo(
    () => filterPlayers(players, { country: queryState.country, id: queryState.id }),
    [players, queryState.country, queryState.id],
  );
  const sortedPlayers = useMemo(
    () => sortPlayers(filteredPlayers, sort, levelXp),
    [filteredPlayers, levelXp, sort],
  );
  const countryOptions = useMemo(() => playerCountryOptions(players), [players]);
  const selectedCountry = normalizePlayerCountry(queryState.country);
  const isMissingCountryOption =
    selectedCountry !== null && !countryOptions.some((option) => option.code === selectedCountry);
  const { favoriteIds, toggleFavorite } = useFavoritePlayers(source);
  const normalizedQuery = queryState.q.trim();

  return (
    <Page active="/players" accent="teal">
      <div className="cjs-player-discovery">
        <header className="cjs-player-discovery__header">
          <div className="cjs-page-heading">
            <p className="cjs-player-discovery__eyebrow cjs-page-heading__eyebrow">
              Player directory
            </p>
            <h1>Find a player</h1>
            <p className="cjs-page-heading__description">
              Browse recently seen players or search the public directory by name.
            </p>
          </div>
        </header>

        <Panel className="cjs-player-search">
          <fieldset className="cjs-player-source">
            <legend>Data source</legend>
            <SegmentedControl<SourceId>
              ariaLabel="Player data source"
              value={source}
              onChange={setSource}
              options={sourceOptions.map((option) => ({
                accessibleLabel: option.label,
                label: option.shortLabel,
                value: option.value,
              }))}
            />
          </fieldset>
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
          <Input
            autoComplete="off"
            inputMode="numeric"
            label="Player ID"
            maxLength={12}
            onChange={(event) => setQueryState({ id: event.target.value }, { replace: true })}
            pattern="[0-9]*"
            placeholder="e.g. 128567"
            type="text"
            value={queryState.id}
          />
          <Select
            label="Country"
            onChange={(event) => setQueryState({ country: event.target.value })}
            value={selectedCountry ?? ""}
          >
            <option value="">All countries</option>
            {isMissingCountryOption && (
              <option value={selectedCountry}>{playerCountryLabel(selectedCountry)}</option>
            )}
            {countryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            label="Sort results"
            onChange={(event) =>
              setQueryState({ sort: playerDiscoveryQuerySchema.sort.parse(event.target.value) })
            }
            value={sort}
          >
            <option value="last-seen">Last seen</option>
            <option value="name">Player name</option>
            <option value="visits">Visit count</option>
            <option value="admin">Admin level</option>
            {source === "j4l" && <option value="level">Player level</option>}
          </Select>
        </Panel>

        <p className="cjs-player-discovery__note">
          Directory players are revealed in batches as you scroll. Name searches use the documented
          lookup and are limited to {PLAYER_SEARCH_LIMIT} results. Country, visits, admin level, and
          last-seen values appear only when the API supplies them. Player level is available for
          Jump4Life. Player ID and country filters apply to the loaded results.
        </p>

        <PlayerResults
          error={error}
          favoriteIds={favoriteIds}
          filtered={filteredPlayers !== players}
          levelError={levelError}
          levelStatus={levelStatus}
          players={sortedPlayers}
          playerLevels={playerLevels}
          query={normalizedQuery}
          retry={retry}
          retryLevels={retryLevels}
          source={source}
          status={status}
          toggleFavorite={toggleFavorite}
        />
      </div>
    </Page>
  );
}
