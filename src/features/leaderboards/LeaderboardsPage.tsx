import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search, Trophy } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Link,
  Pagination,
  Panel,
  Select,
  SkeletonGroup,
} from "../../components/ui";
import { playerDetailPath } from "../../lib/routing";
import { navigate, useBrowserLocation, useQueryState, useSourceContext } from "../../lib/routing";
import {
  LEADERBOARD_BOARDS,
  PAGE_SIZES,
  boardLabel,
  boardUsesFps,
  canonicalizeLeaderboardSearch,
  createLeaderboardRows,
  filterLeaderboardRows,
  leaderboardQuerySchema,
  metricLabel,
  normalizeLeaderboardState,
  paginateLeaderboardRows,
  sortLeaderboardRows,
  type LeaderboardBoard,
  type LeaderboardQueryState,
  type LeaderboardRow,
  type LeaderboardSort,
  type SortOrder,
} from "./leaderboardModel";
import { useLeaderboardData } from "./useLeaderboardData";
import "./leaderboards.css";

const fpsOptions = ["43", "76", "125", "250", "333", "0"] as const;
const numberFormatter = new Intl.NumberFormat();
const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function LeaderboardsPage() {
  const location = useBrowserLocation();
  const { source } = useSourceContext();
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

  useEffect(() => {
    if (canonicalSearch === location.search) return;
    navigate(`${location.pathname}${canonicalSearch}${location.hash}`, { replace: true });
  }, [canonicalSearch, location.hash, location.pathname, location.search]);

  const result = useMemo(() => {
    const rows = createLeaderboardRows(data ?? [], state.board);
    const filteredRows = filterLeaderboardRows(rows, state.query);
    const sortedRows = sortLeaderboardRows(filteredRows, state.sort, state.order);
    return paginateLeaderboardRows(sortedRows, state.page, Number(state.limit));
  }, [data, state.board, state.limit, state.order, state.page, state.query, state.sort]);

  useEffect(() => {
    if (!data || state.page === result.page) return;
    setQueryState({ page: result.page }, { replace: true });
  }, [data, result.page, setQueryState, state.page]);

  const updateFilters = (update: Partial<LeaderboardQueryState>) => {
    setQueryState({ ...update, page: 1 });
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
    setQueryState({
      board: "speed-skill",
      fps: "125",
      limit: "25",
      order: "asc",
      page: 1,
      query: "",
      sort: "rank",
    });
  };

  return (
    <section className="cjs-leaderboards cjs-stack" aria-labelledby="leaderboards-title">
      <header className="cjs-leaderboards__hero">
        <div className="cjs-leaderboards__eyebrow">
          <Trophy size={18} aria-hidden="true" />
          <span>Competitive records</span>
          <Badge tone={source === "j4l" ? "success" : "information"}>
            {source === "j4l" ? "Jump4Life" : "JumpersHeaven"}
          </Badge>
        </div>
        <h1 id="leaderboards-title">Leaderboards</h1>
        <p>
          Compare official ranks across the supported skill, completion, and J4L XP boards. Filters
          and presentation choices stay in the URL for direct sharing.
        </p>
      </header>

      <Panel
        className="cjs-leaderboards__filters"
        variant="strong"
        aria-label="Leaderboard filters"
      >
        <div className="cjs-leaderboards__filter-grid">
          <Select
            label="Board"
            value={state.board}
            onChange={(event) => changeBoard(event.target.value as LeaderboardBoard)}
          >
            {LEADERBOARD_BOARDS.map((board) => (
              <option key={board} value={board} disabled={source === "jh" && board === "rank-xp"}>
                {boardLabel(board)}
                {board === "rank-xp" ? " · J4L only" : ""}
              </option>
            ))}
          </Select>

          <Select
            label="FPS"
            helperText={
              boardUsesFps(state.board)
                ? "Mix represents records without a fixed FPS."
                : "This board does not accept an FPS parameter."
            }
            value={state.fps}
            disabled={!boardUsesFps(state.board)}
            onChange={(event) => updateFilters({ fps: event.target.value as typeof state.fps })}
          >
            {fpsOptions.map((fps) => (
              <option key={fps} value={fps}>
                {fps === "0" ? "Mix" : fps}
              </option>
            ))}
          </Select>

          <Input
            type="search"
            label="Find a player or country"
            leading={<Search size={17} />}
            placeholder="Player name, country, or region"
            value={state.query}
            onChange={(event) =>
              setQueryState({ page: 1, query: event.target.value }, { replace: true })
            }
          />

          <Select
            label="Rows per page"
            value={state.limit}
            onChange={(event) => updateFilters({ limit: event.target.value as typeof state.limit })}
          >
            {PAGE_SIZES.map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </Select>
        </div>

        <div className="cjs-leaderboards__filter-actions">
          <p>
            {state.board === "rank-xp"
              ? "Rank XP is published for Jump4Life only."
              : `${boardLabel(state.board)} uses the API's official ranking.`}
          </p>
          <Button variant="ghost" size="small" onClick={resetFilters}>
            Reset view
          </Button>
        </div>
      </Panel>

      <section className="cjs-leaderboards__results" aria-labelledby="leaderboard-results-title">
        <header className="cjs-leaderboards__results-header">
          <div>
            <h2 id="leaderboard-results-title">{boardLabel(state.board)}</h2>
            <p aria-live="polite">
              {isInitialLoading
                ? "Loading ranked players…"
                : result.total
                  ? `Showing ${result.firstResult}–${result.lastResult} of ${result.total} matching players.`
                  : "No matching players to show."}
            </p>
          </div>
          <Button
            variant="secondary"
            size="small"
            isLoading={isRefreshing}
            loadingLabel="Refreshing"
            onClick={reload}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Refresh
          </Button>
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

        {data && data.length > 0 && result.total === 0 && (
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

        {data && result.total > 0 && (
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
              rows={result.rows}
              sort={state.sort}
              source={source}
              onSort={changeSort}
            />
            <Pagination
              className="cjs-leaderboards__pagination"
              page={result.page}
              pageCount={result.pageCount}
              onPageChange={(page) => setQueryState({ page })}
              ariaLabel={`${boardLabel(state.board)} pages`}
            />
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
            <th scope="col">Country</th>
            <SortableHeader
              label={valueLabel}
              sortKey="value"
              activeSort={sort}
              order={order}
              onSort={onSort}
              align="end"
            />
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId} aria-label={`${row.playerName}, official rank ${row.rank}`}>
              <td className="cjs-table__cell" data-label="Rank" data-priority="primary">
                <span className="cjs-leaderboards__rank" data-podium={row.rank <= 3 || undefined}>
                  <span className="cjs-visually-hidden">Official rank </span>
                  {numberFormatter.format(row.rank)}
                </span>
              </td>
              <td className="cjs-table__cell" data-label="Player" data-priority="primary">
                <Link href={playerDetailPath(row.playerId, source)}>{row.playerName}</Link>
              </td>
              <td className="cjs-table__cell" data-label="Country">
                <Country row={row} />
              </td>
              <td className="cjs-table__cell" data-label={valueLabel} data-align="end">
                <strong>{formatMetric(row, board)}</strong>
              </td>
              <td className="cjs-table__cell" data-label="Details">
                <RowDetails row={row} board={board} />
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

function Country({ row }: { row: LeaderboardRow }) {
  if (!row.country && !row.countryCode) return <span className="cjs-leaderboards__muted">—</span>;

  return (
    <span className="cjs-leaderboards__country">
      {row.countryCode && <Badge>{row.countryCode.toLocaleUpperCase()}</Badge>}
      <span>{row.country ?? row.region}</span>
    </span>
  );
}

function RowDetails({ row, board }: { row: LeaderboardRow; board: LeaderboardBoard }) {
  if (board === "rank-xp") {
    return (
      <span className="cjs-leaderboards__details">
        <span>{row.levelDisplay || "Level unavailable"}</span>
        {row.prestige !== undefined && (
          <small>Prestige {numberFormatter.format(row.prestige)}</small>
        )}
      </span>
    );
  }

  const topCount = row.topList
    ? Object.values(row.topList).reduce((total, value) => total + value, 0)
    : null;

  return (
    <span className="cjs-leaderboards__details">
      {board !== "howmany" && row.score !== undefined && (
        <span>{numberFormatter.format(row.score)} points</span>
      )}
      {topCount !== null && <small>{numberFormatter.format(topCount)} recorded top places</small>}
      {board === "howmany" && topCount === null && (
        <span className="cjs-leaderboards__muted">—</span>
      )}
    </span>
  );
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
