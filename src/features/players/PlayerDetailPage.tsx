import {
  Activity,
  ArrowLeft,
  BarChart3,
  Clock3,
  Footprints,
  Gauge,
  Heart,
  MapPinned,
  Medal,
  RefreshCw,
  Route,
  Trophy,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Page } from "../../components";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Link,
  Panel,
  Select,
  SkeletonGroup,
  type DataTableColumn,
} from "../../components/ui";
import {
  FPS_VALUES,
  PLAYER_LEADERBOARDS,
  type Player,
  type PlayerActivitySummary,
  type PlayerLeaderboardPosition,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
  type Source,
  type TopRun,
} from "../../lib/api";
import { mapDetailPath, sourceOptions, useQueryState, useSourceContext } from "../../lib/routing";
import { formatDate, timeAgo } from "../../lib/format";
import { CodPlayerName } from "./CodPlayerName";
import {
  createPlayerProfileIdentity,
  formatDistance,
  formatDuration,
  formatProfileDecimal,
  formatProfileNumber,
  formatProfilePercent,
  formatRunTime,
  fpsLabel,
  hasProfileIdentity,
  playerBoardLabel,
  playerProfileQuerySchema,
  playerSourceLabel,
} from "./playerProfileModel";
import { usePlayerProfile, type PlayerProfileApi, type ProfileResource } from "./usePlayerProfile";
import { useFavoritePlayers } from "./useFavoritePlayers";
import "./playerProfile.css";

export interface PlayerDetailPageProps {
  apiClient?: PlayerProfileApi;
  playerId: string;
}

export function PlayerDetailPage({ apiClient, playerId }: PlayerDetailPageProps) {
  const parsedPlayerId = parsePlayerId(playerId);

  if (parsedPlayerId === null) {
    return (
      <Page active="/players" accent="teal">
        <div className="cjs-player-profile cjs-stack">
          <BackToPlayers />
          <ErrorState
            action={
              <Link href="/players" variant="standalone">
                Search players
              </Link>
            }
            description="The player number in this link is invalid. Open a profile from player search instead."
            title="Invalid player link"
          />
        </div>
      </Page>
    );
  }

  return <PlayerProfile apiClient={apiClient} playerId={parsedPlayerId} />;
}

function PlayerProfile({
  apiClient,
  playerId,
}: {
  apiClient?: PlayerProfileApi;
  playerId: number;
}) {
  const { source, setSource } = useSourceContext();
  const [queryState, setQueryState] = useQueryState(playerProfileQuerySchema);
  const resources = usePlayerProfile({
    apiClient,
    board: queryState.board,
    fps: queryState.fps,
    playerId,
    source,
  });
  const identity = createPlayerProfileIdentity(playerId, {
    performance: resources.performance.data,
    positions: resources.positions.data,
    rank: resources.rank.data,
    routes: resources.routes.data,
    tops: resources.tops.data,
  });
  const { favoriteIds, toggleFavorite } = useFavoritePlayers(source);
  const isFavorite = favoriteIds.has(playerId);
  const supportedResources = [
    resources.performance,
    resources.positions,
    resources.tops,
    resources.routes,
    ...(source === "j4l" ? [resources.rank, resources.activity] : []),
  ];
  const isSettling = supportedResources.some(
    (resource) => resource.status === "loading" || resource.status === "refreshing",
  );
  const errorCount = supportedResources.filter((resource) => resource.status === "error").length;
  const allFailed = supportedResources.every(
    (resource) => resource.status === "error" && resource.data === null,
  );
  const unavailable =
    !isSettling && !hasProfileIdentity(identity) && resources.performance.error?.status === 404;
  const favoritePlayer = useMemo<Player>(
    () => ({
      admin: resources.performance.data?.admin_level,
      banned: resources.performance.data?.is_banned ? 1 : 0,
      country: identity.country ?? undefined,
      donated: resources.performance.data?.is_donator ? 1 : 0,
      last_seen: identity.lastSeen ?? undefined,
      player_id: playerId,
      playername: identity.name,
    }),
    [identity.country, identity.lastSeen, identity.name, playerId, resources.performance.data],
  );

  return (
    <Page active="/players" accent="teal">
      <div className="cjs-player-profile cjs-stack">
        <BackToPlayers />

        <header className="cjs-player-profile__hero">
          <div className="cjs-player-profile__identity">
            <span className="cjs-player-profile__avatar" aria-hidden="true">
              {identity.name.replace(/^\^./, "").slice(0, 1).toUpperCase() || "?"}
            </span>
            <div>
              <p className="cjs-player-profile__eyebrow">
                Player #{playerId} · {playerSourceLabel(source)}
              </p>
              <h1 id="player-profile-title">
                <CodPlayerName value={identity.name} />
              </h1>
              <p className="cjs-player-profile__meta">
                <span>{identity.country || "Country not provided"}</span>
                <span aria-hidden="true">·</span>
                <span title={identity.lastSeen ? formatDate(identity.lastSeen) : undefined}>
                  {identity.lastSeen
                    ? `Last seen ${timeAgo(identity.lastSeen)}`
                    : "Last seen unknown"}
                </span>
              </p>
            </div>
          </div>
          <IconButton
            className="cjs-player-profile__favorite"
            label={`${isFavorite ? "Remove" : "Add"} ${identity.name} ${isFavorite ? "from" : "to"} favorites`}
            aria-pressed={isFavorite}
            onClick={() => toggleFavorite(favoritePlayer)}
            variant={isFavorite ? "ghost" : "secondary"}
          >
            <Heart aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} size={19} />
          </IconButton>
        </header>

        <Panel className="cjs-player-profile__controls" variant="strong" aria-label="Profile view">
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
            label="FPS"
            helperText="Used for top runs and leaderboard position."
            onChange={(event) => {
              const fps = event.target.value;
              if (FPS_VALUES.some((value) => value === fps)) {
                setQueryState({ fps: fps as (typeof FPS_VALUES)[number] });
              }
            }}
            value={queryState.fps}
          >
            {FPS_VALUES.map((fps) => (
              <option key={fps} value={fps}>
                {fpsLabel(fps)}
              </option>
            ))}
          </Select>
          <Select
            label="Leaderboard"
            helperText="Selects the position shown below."
            onChange={(event) => {
              const board = event.target.value;
              if (PLAYER_LEADERBOARDS.some((value) => value === board)) {
                setQueryState({ board: board as (typeof PLAYER_LEADERBOARDS)[number] });
              }
            }}
            value={queryState.board}
          >
            {PLAYER_LEADERBOARDS.map((board) => (
              <option key={board} value={board}>
                {playerBoardLabel(board)}
              </option>
            ))}
          </Select>
          <Button
            className="cjs-player-profile__refresh"
            isLoading={isSettling}
            loadingLabel="Refreshing profile"
            onClick={resources.reload}
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" size={17} />
            Refresh profile
          </Button>
        </Panel>

        {errorCount > 0 && !allFailed && !unavailable && (
          <div className="cjs-player-profile__partial-error" role="alert">
            <strong>Some profile data is unavailable.</strong>
            <span>
              {errorCount} {errorCount === 1 ? "section failed" : "sections failed"}; successful
              sections remain usable.
            </span>
          </div>
        )}

        {unavailable && (
          <ErrorState
            action={
              <Link href={`/players?source=${source}`} variant="standalone">
                Search {playerSourceLabel(source)} players
              </Link>
            }
            description={`Player #${playerId} was not found in ${playerSourceLabel(source)}. The account may have been removed or may exist in the other source.`}
            title="Player unavailable"
          />
        )}

        {!unavailable && allFailed && !isSettling && (
          <ErrorState
            description="None of the profile endpoints could be reached. Retry without changing the selected source or filters."
            onRetry={resources.reload}
            title="Profile unavailable"
          />
        )}

        {!unavailable && !allFailed && (
          <div className="cjs-player-profile__sections">
            <PerformanceSection resource={resources.performance} onRetry={resources.reload} />
            <PositionSection
              board={queryState.board}
              resource={resources.positions}
              onRetry={resources.reload}
            />
            <TopRunsSection
              fps={queryState.fps}
              resource={resources.tops}
              source={source}
              onRetry={resources.reload}
            />
            <RouteCompletionSection
              resource={resources.routes}
              source={source}
              onRetry={resources.reload}
            />
            {source === "j4l" ? (
              <>
                <RankSection resource={resources.rank} onRetry={resources.reload} />
                <ActivitySection resource={resources.activity} onRetry={resources.reload} />
              </>
            ) : (
              <Panel className="cjs-player-profile__capability" role="note">
                <Badge tone="information">Jump4Life feature</Badge>
                <div>
                  <h2>Rank and lifetime activity</h2>
                  <p>
                    XP rank and cumulative play activity are published for Jump4Life only. Switch
                    the data source to view them for the matching player number.
                  </p>
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

function BackToPlayers() {
  return (
    <Link className="cjs-player-profile__back" href="/players" variant="muted">
      <ArrowLeft aria-hidden="true" size={16} />
      Back to players
    </Link>
  );
}

function PerformanceSection({
  onRetry,
  resource,
}: {
  onRetry: () => void;
  resource: ProfileResource<PlayerPerformanceStats>;
}) {
  return (
    <ProfileSection
      description="Completion, placement, and recent-record signals from the profile performance endpoint."
      icon={<BarChart3 size={19} />}
      id="player-performance"
      title="Performance"
    >
      <ResourceState resource={resource} label="performance statistics" onRetry={onRetry}>
        {(performance) => (
          <>
            <dl className="cjs-player-profile__stat-grid">
              <ProfileStat
                label="Maps completed"
                value={formatProfileNumber(performance.total_maps_completed)}
              />
              <ProfileStat
                label="Completion ratio"
                value={formatProfilePercent(performance.maps_completed_ratio)}
              />
              <ProfileStat
                label="Top 10 records"
                value={formatProfileNumber(performance.top10_count)}
              />
              <ProfileStat
                label="First places"
                value={formatProfileNumber(performance.top1_count)}
              />
              <ProfileStat
                label="Best rank"
                value={
                  performance.best_rank === null ? "Not available" : `#${performance.best_rank}`
                }
              />
              <ProfileStat
                label="Average rank"
                value={formatProfileDecimal(performance.average_rank)}
              />
            </dl>
            <div className="cjs-player-profile__badges" aria-label="Player status">
              <Badge tone="information">{performance.activity_level || "Activity unknown"}</Badge>
              {performance.best_fps && <Badge>{fpsLabel(performance.best_fps)} best FPS</Badge>}
              {performance.is_donator && <Badge tone="success">Supporter</Badge>}
              {performance.admin_level > 0 && <Badge>Admin level {performance.admin_level}</Badge>}
              {performance.is_banned && <Badge tone="danger">Banned</Badge>}
            </div>
          </>
        )}
      </ResourceState>
    </ProfileSection>
  );
}

function PositionSection({
  board,
  onRetry,
  resource,
}: {
  board: (typeof PLAYER_LEADERBOARDS)[number];
  onRetry: () => void;
  resource: ProfileResource<PlayerLeaderboardPosition[]>;
}) {
  const columns = useMemo<readonly DataTableColumn<PlayerLeaderboardPosition>[]>(
    () => [
      {
        id: "rank",
        header: "Rank",
        priority: "primary",
        cell: (position) => <strong>#{position.rank}</strong>,
      },
      {
        id: "board",
        header: "Board",
        cell: (position) => playerBoardLabel(position.leaderboard_type),
      },
      {
        id: "score",
        header: "Score",
        align: "end",
        cell: (position) => formatProfileNumber(position.score),
      },
      {
        id: "rating",
        header: "Rating",
        align: "end",
        cell: (position) => formatProfileDecimal(position.rating),
      },
      {
        id: "fps",
        header: "FPS",
        align: "end",
        cell: (position) => fpsLabel(position.fps),
      },
    ],
    [],
  );

  return (
    <ProfileSection
      description={`Official ${playerBoardLabel(board).toLowerCase()} placement for the selected FPS.`}
      icon={<Medal size={19} />}
      id="player-position"
      title="Leaderboard position"
    >
      <ResourceState resource={resource} label="leaderboard position" onRetry={onRetry}>
        {(positions) =>
          positions.length ? (
            <DataTable
              caption={`${playerBoardLabel(board)} positions`}
              columns={columns}
              getRowKey={(position) => `${position.leaderboard_type}-${position.fps}`}
              rows={positions}
            />
          ) : (
            <EmptyState
              description="No placement was returned for this leaderboard and FPS combination."
              title="No leaderboard position"
            />
          )
        }
      </ResourceState>
    </ProfileSection>
  );
}

function TopRunsSection({
  fps,
  onRetry,
  resource,
  source,
}: {
  fps: (typeof FPS_VALUES)[number];
  onRetry: () => void;
  resource: ProfileResource<TopRun[]>;
  source: Source;
}) {
  const columns = useMemo<readonly DataTableColumn<TopRun>[]>(
    () => [
      {
        id: "rank",
        header: "Rank",
        cell: (run) => <strong>#{run.rank}</strong>,
      },
      {
        id: "map",
        header: "Map",
        priority: "primary",
        cell: (run) => (
          <Link href={mapDetailPath(run.cpid, { lookup: "cpid", source })}>{run.mapname}</Link>
        ),
      },
      {
        id: "time",
        header: "Time",
        align: "end",
        cell: (run) => formatRunTime(run),
      },
      {
        id: "fps",
        header: "FPS",
        align: "end",
        cell: (run) => fpsLabel(run.fps),
      },
      {
        id: "recorded",
        header: "Recorded",
        cell: (run) => (run.time_created ? formatDate(run.time_created) : "Not provided"),
      },
    ],
    [source],
  );

  return (
    <ProfileSection
      description={`Personal records returned for ${fpsLabel(fps)}. Map names open the matching map profile.`}
      icon={<Trophy size={19} />}
      id="player-top-runs"
      title="Top runs"
    >
      <ResourceState resource={resource} label="top runs" onRetry={onRetry}>
        {(tops) =>
          tops.length ? (
            <DataTable
              caption={`Top runs at ${fpsLabel(fps)}`}
              columns={columns}
              getRowKey={(run) => run.run_id ?? `${run.cpid}-${run.fps}-${run.rank}`}
              rows={tops}
            />
          ) : (
            <EmptyState
              description={`No personal records were returned for ${fpsLabel(fps)}.`}
              title="No top runs"
            />
          )
        }
      </ResourceState>
    </ProfileSection>
  );
}

function RouteCompletionSection({
  onRetry,
  resource,
  source,
}: {
  onRetry: () => void;
  resource: ProfileResource<PlayerRouteCompletion[]>;
  source: Source;
}) {
  const columns = useMemo<readonly DataTableColumn<PlayerRouteCompletion>[]>(
    () => [
      {
        id: "map",
        header: "Map",
        priority: "primary",
        cell: (route) => (
          <Link href={mapDetailPath(route.map_id, { source })}>{route.map_name}</Link>
        ),
      },
      {
        id: "fps",
        header: "Completed at",
        cell: (route) => route.fps_list.map(fpsLabel).join(", "),
      },
      {
        id: "finishes",
        header: "Finishes",
        align: "end",
        cell: (route) => formatProfileNumber(route.total_finishes),
      },
      {
        id: "ender",
        header: "Ender",
        cell: (route) => route.ender || "Not provided",
      },
    ],
    [source],
  );

  return (
    <ProfileSection
      description="Completed map routes across all published FPS values."
      icon={<Route size={19} />}
      id="player-routes"
      title="Route completion"
    >
      <ResourceState resource={resource} label="route completion" onRetry={onRetry}>
        {(routes) =>
          routes.length ? (
            <DataTable
              caption="Completed routes"
              columns={columns}
              getRowKey={(route) => route.map_id}
              rows={routes}
            />
          ) : (
            <EmptyState
              description="The API returned no completed routes for this player."
              title="No routes completed"
            />
          )
        }
      </ResourceState>
    </ProfileSection>
  );
}

function RankSection({
  onRetry,
  resource,
}: {
  onRetry: () => void;
  resource: ProfileResource<PlayerRankInfo>;
}) {
  return (
    <ProfileSection
      description="Jump4Life level, prestige, title, and cumulative XP."
      icon={<Gauge size={19} />}
      id="player-rank"
      title="Jump4Life rank"
    >
      <ResourceState resource={resource} label="Jump4Life rank" onRetry={onRetry}>
        {(rank) => {
          const progress =
            rank.maxed || rank.xp_for_level <= 0
              ? 100
              : Math.min(100, Math.max(0, (rank.xp_into_level / rank.xp_for_level) * 100));
          return (
            <>
              <dl className="cjs-player-profile__stat-grid">
                <ProfileStat label="Level" value={rank.level_display || String(rank.level)} />
                <ProfileStat label="Prestige" value={formatProfileNumber(rank.prestige)} />
                <ProfileStat label="Title" value={rank.title || "Not provided"} />
                <ProfileStat label="Total XP" value={formatProfileNumber(rank.total_xp)} />
              </dl>
              <div className="cjs-player-profile__progress">
                <div>
                  <span>Level progress</span>
                  <strong>
                    {rank.maxed
                      ? "Maximum level"
                      : `${formatProfileNumber(rank.xp_to_next)} XP to next`}
                  </strong>
                </div>
                <progress aria-label="Level progress" max="100" value={progress}>
                  {Math.round(progress)}%
                </progress>
              </div>
            </>
          );
        }}
      </ResourceState>
    </ProfileSection>
  );
}

function ActivitySection({
  onRetry,
  resource,
}: {
  onRetry: () => void;
  resource: ProfileResource<PlayerActivitySummary>;
}) {
  return (
    <ProfileSection
      description="All-time cumulative Jump4Life activity. Durations include the API's separate active, spectating, and AFK totals."
      icon={<Activity size={19} />}
      id="player-activity"
      title="Lifetime activity"
    >
      <ResourceState resource={resource} label="lifetime activity" onRetry={onRetry}>
        {(activity) => (
          <dl className="cjs-player-profile__activity-grid">
            <ActivityStat
              icon={<Clock3 />}
              label="Playing"
              value={formatDuration(activity.playing_ms)}
            />
            <ActivityStat
              icon={<Gauge />}
              label="Run time"
              value={formatDuration(activity.runtime_ms)}
            />
            <ActivityStat
              icon={<Activity />}
              label="Spectating"
              value={formatDuration(activity.spectating_ms)}
            />
            <ActivityStat icon={<Clock3 />} label="AFK" value={formatDuration(activity.afk_ms)} />
            <ActivityStat
              icon={<Footprints />}
              label="Jumps"
              value={formatProfileNumber(activity.jump_count)}
            />
            <ActivityStat
              icon={<Route />}
              label="Distance"
              value={formatDistance(activity.distance_travelled)}
            />
            <ActivityStat
              icon={<MapPinned />}
              label="Loads"
              value={formatProfileNumber(activity.load_count)}
            />
            <ActivityStat
              icon={<Trophy />}
              label="Saves"
              value={formatProfileNumber(activity.save_count)}
            />
          </dl>
        )}
      </ResourceState>
    </ProfileSection>
  );
}

function ProfileSection({
  children,
  description,
  icon,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section className="cjs-player-profile__section" aria-labelledby={`${id}-title`}>
      <header className="cjs-player-profile__section-header">
        <span aria-hidden="true">{icon}</span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <Panel padding="none">{children}</Panel>
    </section>
  );
}

function ResourceState<Data>({
  children,
  label,
  onRetry,
  resource,
}: {
  children: (data: Data) => ReactNode;
  label: string;
  onRetry: () => void;
  resource: ProfileResource<Data>;
}) {
  if (resource.status === "loading" && resource.data === null) {
    return (
      <div className="cjs-player-profile__resource-state">
        <SkeletonGroup count={4} label={`Loading ${label}`} />
      </div>
    );
  }

  if (resource.error && resource.data === null) {
    return (
      <div className="cjs-player-profile__resource-state">
        <ErrorState
          description={resource.error.message}
          onRetry={onRetry}
          title={`${sentenceCase(label)} unavailable`}
        />
      </div>
    );
  }

  return (
    <div className="cjs-player-profile__resource-content">
      {resource.status === "refreshing" && (
        <p className="cjs-player-profile__resource-status" role="status" aria-live="polite">
          Refreshing {label}…
        </p>
      )}
      {resource.error && (
        <div className="cjs-player-profile__resource-error" role="alert">
          <span>Refresh failed: {resource.error.message} Previous data is still shown.</span>
          <Button onClick={onRetry} size="small" variant="ghost">
            Try again
          </Button>
        </div>
      )}
      {resource.data !== null && children(resource.data)}
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ActivityStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt>
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function parsePlayerId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const playerId = Number(value);
  return Number.isSafeInteger(playerId) && playerId > 0 ? playerId : null;
}

function sentenceCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
