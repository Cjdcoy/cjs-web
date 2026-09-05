import { ArrowDown, ArrowUp, ArrowUpDown, Globe2, RefreshCw, Search, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Button,
  CodPlayerName,
  EmptyState,
  ErrorState,
  Input,
  Link,
  Panel,
  RankEmblem,
  SegmentedControl,
  Select,
  SkeletonGroup,
} from "../../components/ui";
import { stripCodColorCodes } from "../../lib/codName";
import {
  navigate,
  playerDetailPath,
  sourceOptions,
  useBrowserLocation,
  useQueryState,
  useSourceContext,
  type SourceId,
} from "../../lib/routing";
import {
  LEADERBOARD_BOARDS,
  boardLabel,
  boardUsesFps,
  canonicalizeLeaderboardSearch,
  createLeaderboardRows,
  createDifficultySplit,
  createTopPlaceDistribution,
  filterLeaderboardRows,
  leaderboardQuerySchema,
  metricLabel,
  normalizeLeaderboardState,
  sortLeaderboardRows,
  type LeaderboardBoard,
  type LeaderboardQueryState,
  type LeaderboardRow,
  type LeaderboardSort,
  type SortOrder,
  topListKind,
} from "./leaderboardModel";
import { useLeaderboardData } from "./useLeaderboardData";
import "./leaderboards.css";

const fpsOptions = ["43", "76", "125", "250", "333", "0"] as const;
const PLAYER_BATCH_SIZE = 25;
const boardOptions = LEADERBOARD_BOARDS.map((board) => ({
  value: board,
  label:
    board === "speed-skill"
      ? "Speed"
      : board === "jump-skill"
        ? "Jump"
        : board === "defrag-skill"
          ? "Defrag"
          : board === "surf-skill"
            ? "Surf"
            : board === "howmany"
              ? "Completions"
              : "Rank XP",
}));
const fpsFilterOptions = fpsOptions.map((fps) => ({
  value: fps,
  label: fps === "0" ? "Mix" : fps,
}));
const numberFormatter = new Intl.NumberFormat();
const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const DEFAULT_LEADERBOARD_VIEW = {
  board: "jump-skill",
  fps: "125",
  order: "asc",
  query: "",
  sort: "rank",
} satisfies LeaderboardQueryState;

export function LeaderboardsPage() {
  const location = useBrowserLocation();
  const { source, setSource } = useSourceContext();
  const sourceName = source === "j4l" ? "Jump4Life" : "JumpersHeaven";
  const [rawState, setQueryState] = useQueryState(leaderboardQuerySchema);
  const state = useMemo(() => normalizeLeaderboardState(rawState, source), [rawState, source]);
  const canonicalSearch = useMemo(
    () => canonicalizeLeaderboardSearch(location.search, source),
    [location.search, source],
  );
  const { data, error, isInitialLoading, isRefreshing, reload } = useLeaderboardData({
    board: state.board,
    fps: state.fps,
    source,
  });
  const [visiblePlayerCount, setVisiblePlayerCount] = useState(PLAYER_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (canonicalSearch === location.search) return;
    navigate(`${location.pathname}${canonicalSearch}${location.hash}`, { replace: true });
  }, [canonicalSearch, location.hash, location.pathname, location.search]);

  const rankedRows = useMemo(() => {
    const rows = createLeaderboardRows(data ?? [], state.board);
    const filteredRows = filterLeaderboardRows(rows, state.query);
    return sortLeaderboardRows(filteredRows, state.sort, state.order);
  }, [data, state.board, state.order, state.query, state.sort]);

  const visibleRows = rankedRows.slice(0, visiblePlayerCount);
  const remainingPlayerCount = Math.max(rankedRows.length - visibleRows.length, 0);
  const hasMorePlayers = remainingPlayerCount > 0;
  const hasCustomizedView =
    state.board !== DEFAULT_LEADERBOARD_VIEW.board ||
    state.fps !== DEFAULT_LEADERBOARD_VIEW.fps ||
    state.order !== DEFAULT_LEADERBOARD_VIEW.order ||
    state.query !== DEFAULT_LEADERBOARD_VIEW.query ||
    state.sort !== DEFAULT_LEADERBOARD_VIEW.sort;

  useEffect(() => {
    setVisiblePlayerCount(PLAYER_BATCH_SIZE);
  }, [data, source, state.board, state.fps, state.order, state.query, state.sort]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!hasMorePlayers || !target || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisiblePlayerCount((count) => Math.min(count + PLAYER_BATCH_SIZE, rankedRows.length));
      },
      { rootMargin: "320px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMorePlayers, rankedRows.length]);

  const updateFilters = (update: Partial<LeaderboardQueryState>) => {
    setQueryState(update);
  };

  const changeBoard = (board: LeaderboardBoard) => {
    updateFilters({
      board,
      fps: boardUsesFps(board) ? state.fps : "125",
      order: "asc",
      sort: "rank",
    });
  };

  const changeSort = (sort: LeaderboardSort) => {
    const order = state.sort === sort ? toggleOrder(state.order) : defaultOrder(sort);
    updateFilters({ order, sort });
  };

  const resetFilters = () => {
    setQueryState(DEFAULT_LEADERBOARD_VIEW);
  };

  return (
    <section className="cjs-leaderboards cjs-stack" aria-labelledby="leaderboards-title">
      <header className="cjs-leaderboards__hero cjs-page-heading">
        <div className="cjs-leaderboards__eyebrow cjs-page-heading__eyebrow">
          <Trophy size={18} aria-hidden="true" />
          <span>Competitive records</span>
        </div>
        <h1 id="leaderboards-title">{sourceName} leaderboards</h1>
        <p className="cjs-page-heading__description">
          Compare official {sourceName} player rankings across skill and completion boards
          {source === "j4l" ? ", including Rank XP" : ""}. Filters and presentation choices stay in
          the URL for direct sharing.
        </p>
      </header>

      <Panel className="cjs-leaderboards__filters" aria-label="Leaderboard filters">
        <div className="cjs-leaderboards__primary-filters">
          <fieldset className="cjs-leaderboards__source-field">
            <legend>Data source</legend>
            <SegmentedControl<SourceId>
              ariaLabel="Leaderboard data source"
              value={source}
              onChange={setSource}
              options={sourceOptions.map((option) => ({
                accessibleLabel: option.label,
                label: option.shortLabel,
                value: option.value,
              }))}
            />
          </fieldset>

          <div className="cjs-leaderboards__choice-group">
            <h2>Board</h2>
            <SegmentedControl
              className="cjs-leaderboards__choice-control cjs-leaderboards__choice-control--boards"
              ariaLabel="Board"
              options={boardOptions.map((option) => ({
                ...option,
                disabled: source === "jh" && option.value === "rank-xp",
                accessibleLabel:
                  option.value === "rank-xp" ? `${option.label} · Jump4Life only` : option.label,
              }))}
              value={state.board}
              onChange={changeBoard}
            />
          </div>

          <div className="cjs-leaderboards__choice-group">
            <div className="cjs-leaderboards__choice-heading">
              <h2>FPS</h2>
              <small>
                {boardUsesFps(state.board) ? "Mix includes every FPS." : "Not used by this board."}
              </small>
            </div>
            <SegmentedControl
              className="cjs-leaderboards__choice-control cjs-leaderboards__choice-control--fps"
              ariaLabel="FPS"
              options={fpsFilterOptions}
              value={state.fps}
              disabled={!boardUsesFps(state.board)}
              onChange={(fps) => updateFilters({ fps })}
            />
          </div>
        </div>

        <div className="cjs-leaderboards__utility-filters">
          <Input
            type="search"
            label="Find a player or country"
            leading={<Search size={17} />}
            placeholder="Player name, country, or region"
            value={state.query}
            onChange={(event) => setQueryState({ query: event.target.value }, { replace: true })}
          />
        </div>

        {(state.board === "rank-xp" || hasCustomizedView) && (
          <div className="cjs-leaderboards__filter-actions">
            {state.board === "rank-xp" && <p>Rank XP is published for Jump4Life only.</p>}
            {hasCustomizedView && (
              <Button variant="ghost" size="small" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
          </div>
        )}
      </Panel>

      <section className="cjs-leaderboards__results" aria-labelledby="leaderboard-results-title">
        <header className="cjs-leaderboards__results-header">
          <div>
            <h2 id="leaderboard-results-title">{boardLabel(state.board)}</h2>
            <p aria-live="polite">
              {isInitialLoading
                ? "Loading ranked players…"
                : rankedRows.length
                  ? `Showing ${visibleRows.length} of ${rankedRows.length} matching players.`
                  : "No matching players to show."}
            </p>
          </div>
          <div className="cjs-leaderboards__refresh-action">
            <Button
              variant="ghost"
              size="small"
              isLoading={isRefreshing}
              loadingLabel="Refreshing"
              onClick={reload}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </Button>
            <span className="cjs-visually-hidden" role="status" aria-live="polite">
              {isRefreshing ? "Refreshing leaderboard results." : ""}
            </span>
          </div>
        </header>

        {isInitialLoading && (
          <Panel>
            <SkeletonGroup count={6} label={`Loading ${boardLabel(state.board)} leaderboard`} />
          </Panel>
        )}

        {!isInitialLoading && error && !data && (
          <ErrorState
            title="Leaderboard unavailable"
            description={error.message}
            onRetry={reload}
          />
        )}

        {error && data && (
          <div className="cjs-leaderboards__refresh-error" role="alert">
            <span>Refresh failed. The previous results are still shown.</span>
            <Button variant="ghost" size="small" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {!isInitialLoading && !error && data && data.length === 0 && (
          <EmptyState
            title="No ranked players yet"
            description="The API returned no entries for this source and board combination."
          />
        )}

        {data && data.length > 0 && rankedRows.length === 0 && (
          <EmptyState
            title="No players match"
            description="Try a broader player, country, or region search."
            action={
              <Button variant="secondary" onClick={() => updateFilters({ query: "" })}>
                Clear search
              </Button>
            }
          />
        )}

        {data && rankedRows.length > 0 && (
          <>
            <div className="cjs-leaderboards__mobile-sort" aria-label="Leaderboard sorting">
              <Select
                label="Sort leaderboard"
                value={state.sort}
                onChange={(event) => {
                  const sort = event.target.value as LeaderboardSort;
                  updateFilters({
                    order: sort === state.sort ? state.order : defaultOrder(sort),
                    sort,
                  });
                }}
              >
                <option value="rank">Rank</option>
                <option value="player">Player</option>
                <option value="value">{metricLabel(state.board)}</option>
              </Select>
              <Select
                label="Sort direction"
                value={state.order}
                onChange={(event) => updateFilters({ order: event.target.value as SortOrder })}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </Select>
            </div>
            <LeaderboardTable
              board={state.board}
              order={state.order}
              rows={visibleRows}
              sort={state.sort}
              source={source}
              onSort={changeSort}
            />
            {hasMorePlayers && (
              <div className="cjs-leaderboards__load-more" ref={loadMoreRef}>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setVisiblePlayerCount((count) =>
                      Math.min(count + PLAYER_BATCH_SIZE, rankedRows.length),
                    )
                  }
                >
                  Load {Math.min(PLAYER_BATCH_SIZE, remainingPlayerCount)} more players
                </Button>
                <small>More players load automatically as you scroll.</small>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}

interface LeaderboardTableProps {
  board: LeaderboardBoard;
  order: SortOrder;
  rows: readonly LeaderboardRow[];
  sort: LeaderboardSort;
  source: "jh" | "j4l";
  onSort: (sort: LeaderboardSort) => void;
}

function LeaderboardTable({ board, onSort, order, rows, sort, source }: LeaderboardTableProps) {
  const valueLabel = metricLabel(board);

  return (
    <div className="cjs-data-table cjs-leaderboards__table-wrap">
      <table className="cjs-table cjs-leaderboards__table">
        <caption>
          <span>{boardLabel(board)} rankings</span>
          <small>
            Official rank remains visible when the presentation is sorted by another column.
          </small>
        </caption>
        <thead>
          <tr>
            <SortableHeader
              label="Rank"
              sortKey="rank"
              activeSort={sort}
              order={order}
              onSort={onSort}
            />
            <SortableHeader
              label="Player"
              sortKey="player"
              activeSort={sort}
              order={order}
              onSort={onSort}
            />
            <SortableHeader
              label={valueLabel}
              sortKey="value"
              activeSort={sort}
              order={order}
              onSort={onSort}
              align="end"
            />
            {board !== "rank-xp" && board !== "howmany" && (
              <th scope="col" data-align="end">
                Points
              </th>
            )}
            <th scope="col">{distributionLabel(board)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.playerId}
              aria-label={`${stripCodColorCodes(row.playerName)}, official rank ${row.rank}`}
            >
              <td className="cjs-table__cell" data-label="Rank" data-priority="primary">
                <span className="cjs-leaderboards__rank" data-podium={row.rank <= 3 || undefined}>
                  <span className="cjs-visually-hidden">Official rank </span>
                  {numberFormatter.format(row.rank)}
                </span>
              </td>
              <td className="cjs-table__cell" data-label="Player" data-priority="primary">
                <span className="cjs-leaderboards__player">
                  <CountryFlag row={row} />
                  <Link href={playerDetailPath(row.playerId, source)} variant="player">
                    <CodPlayerName value={row.playerName} />
                  </Link>
                </span>
              </td>
              <td className="cjs-table__cell" data-label={valueLabel} data-align="end">
                <strong>{formatMetric(row, board)}</strong>
              </td>
              {board !== "rank-xp" && board !== "howmany" && (
                <td className="cjs-table__cell" data-label="Points" data-align="end">
                  {row.score === undefined ? (
                    <span className="cjs-leaderboards__muted">—</span>
                  ) : (
                    numberFormatter.format(row.score)
                  )}
                </td>
              )}
              <td
                className="cjs-table__cell cjs-leaderboards__distribution-cell"
                data-label={distributionLabel(board)}
              >
                {board === "rank-xp" ? (
                  <RankProgress row={row} />
                ) : topListKind(board) === "difficulty" ? (
                  <DifficultySplit row={row} />
                ) : (
                  <TopPlaceDistribution row={row} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  sortKey: LeaderboardSort;
  activeSort: LeaderboardSort;
  order: SortOrder;
  onSort: (sort: LeaderboardSort) => void;
  align?: "start" | "end";
}

function SortableHeader({
  activeSort,
  align = "start",
  label,
  onSort,
  order,
  sortKey,
}: SortableHeaderProps) {
  const active = activeSort === sortKey;
  const nextOrder = active ? toggleOrder(order) : defaultOrder(sortKey);

  return (
    <th
      scope="col"
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      data-align={align}
    >
      <button
        type="button"
        className="cjs-leaderboards__sort-button"
        aria-label={`Sort by ${label.toLocaleLowerCase()}, ${nextOrder === "asc" ? "ascending" : "descending"}`}
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {active ? (
          order === "asc" ? (
            <ArrowUp size={14} aria-hidden="true" />
          ) : (
            <ArrowDown size={14} aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown size={14} aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

function CountryFlag({ row }: { row: LeaderboardRow }) {
  const countryLabel = row.country ?? row.region ?? row.countryCode ?? "Country unavailable";
  const flagCode = normalizeCountryCode(row.countryCode);

  return (
    <span
      className="cjs-leaderboards__flag"
      data-fallback={!flagCode || undefined}
      data-podium={row.rank <= 3 ? row.rank : undefined}
      role="img"
      aria-label={countryLabel}
      title={countryLabel}
    >
      {flagCode ? (
        <img
          className="cjs-leaderboards__flag-art"
          src={`/country-flags/${flagCode}.svg`}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      ) : (
        <Globe2 className="cjs-leaderboards__flag-fallback" size={18} aria-hidden="true" />
      )}
    </span>
  );
}

function RankProgress({ row }: { row: LeaderboardRow }) {
  return (
    <span className="cjs-leaderboards__rank-progress">
      <RankEmblem fixedSlot level={row.level} prestige={row.prestige} size="small" />
      <span className="cjs-leaderboards__details">
        {row.prestige !== undefined && row.prestige > 0 && (
          <small className="cjs-leaderboards__prestige">
            Prestige {numberFormatter.format(row.prestige)}
          </small>
        )}
        {formatRankLevel(row)}
      </span>
    </span>
  );
}

function formatRankLevel(row: LeaderboardRow): string {
  const level = row.levelDisplay?.trim() || (row.level === undefined ? "" : String(row.level));
  return level ? `Lv ${level}` : "Level unavailable";
}

function distributionLabel(board: LeaderboardBoard): string {
  if (board === "rank-xp") return "Progress";
  return topListKind(board) === "difficulty" ? "Points by difficulty" : "Tops 1–10";
}

function DifficultySplit({ row }: { row: LeaderboardRow }) {
  const split = createDifficultySplit(row.topList);

  if (!split) return <span className="cjs-leaderboards__muted">—</span>;

  const summary = split.bands
    .map(({ band, points }) => `difficulty ${band}: ${numberFormatter.format(points)}`)
    .join(", ");

  return (
    <div
      className="cjs-leaderboards__difficulty"
      role="img"
      aria-label={`Average map difficulty ${split.average.toFixed(1)}. Points by difficulty: ${summary}`}
    >
      <span className="cjs-leaderboards__difficulty-average">
        Avg <strong>{split.average.toFixed(1)}</strong>
      </span>
      <span className="cjs-leaderboards__difficulty-bar" aria-hidden="true">
        {split.bands.map(({ band, points }) => (
          <span
            key={band}
            title={`Difficulty ${band}: ${numberFormatter.format(points)} points`}
            style={{ flexGrow: points, "--cjs-band": band } as CSSProperties}
          />
        ))}
      </span>
    </div>
  );
}

function TopPlaceDistribution({ row }: { row: LeaderboardRow }) {
  const distribution = createTopPlaceDistribution(row.topList);

  if (!distribution) return <span className="cjs-leaderboards__muted">—</span>;

  const maximum = Math.max(...distribution.map(({ count }) => count), 1);
  const summary = distribution.map(({ count, place }) => `top ${place}: ${count}`).join(", ");

  return (
    <ol className="cjs-leaderboards__top-places" aria-label={`Top-place distribution: ${summary}`}>
      {distribution.map(({ count, place }) => (
        <li key={place} data-place={place}>
          <span className="cjs-leaderboards__top-place-label">#{place}</span>
          <strong>{numberFormatter.format(count)}</strong>
          <progress aria-hidden="true" max={maximum} value={count} />
        </li>
      ))}
    </ol>
  );
}

function normalizeCountryCode(countryCode: string | undefined): string | null {
  if (!countryCode) return null;

  const normalizedCode =
    countryCode.trim().toLocaleUpperCase() === "UK" ? "GB" : countryCode.trim().toLocaleUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCode)) return null;

  return normalizedCode.toLocaleLowerCase();
}

function formatMetric(row: LeaderboardRow, board: LeaderboardBoard): ReactNode {
  if (row.metric === null) return <span className="cjs-leaderboards__muted">—</span>;
  if (board === "rank-xp" || board === "howmany") return numberFormatter.format(row.metric);
  return decimalFormatter.format(row.metric);
}

function defaultOrder(sort: LeaderboardSort): SortOrder {
  return sort === "value" ? "desc" : "asc";
}

function toggleOrder(order: SortOrder): SortOrder {
  return order === "asc" ? "desc" : "asc";
}
