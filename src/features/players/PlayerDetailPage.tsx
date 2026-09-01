import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock3,
  Footprints,
  Gauge,
  Heart,
  MapPinned,
  Medal,
  RefreshCw,
  Route,
  Search,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Page } from "../../components";
import {
  Badge,
  Button,
  CodPlayerName,
  CountryFlag,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Link,
  Panel,
  SegmentedControl,
  SkeletonGroup,
  type DataTableColumn,
} from "../../components/ui";
import {
  FPS_VALUES,
  type Fps,
  type GameMap,
  type Player,
  type PlayerActivitySummary,
  type PlayerJumpScores,
  type PlayerLeaderboardPosition,
  type PlayerMapScore,
  type PlayerPerformanceStats,
  type PlayerRankInfo,
  type PlayerRouteCompletion,
  type Source,
  type SimpleTop,
} from "../../lib/api";
import { mapDetailPath, useQueryState, useSourceContext } from "../../lib/routing";
import { formatDate, timeAgo } from "../../lib/format";
import {
  createPlayerProfileIdentity,
  createPlayerRouteInventory,
  filterPlayerRouteInventory,
  formatDistance,
  formatDuration,
  formatFpsList,
  formatProfileDecimal,
  formatProfileNumber,
  formatProfilePercent,
  fpsLabel,
  getRunAchievement,
  hasProfileIdentity,
  playerBoardLabel,
  playerProfileQuerySchema,
  playerSourceLabel,
  summarizePlayerRouteInventory,
  type PlayerRouteInventoryItem,
  type PlayerProfileView,
  type RouteCompletionStatus,
} from "./playerProfileModel";
import { usePlayerProfile, type PlayerProfileApi, type ProfileResource } from "./usePlayerProfile";
import { useFavoritePlayers } from "./useFavoritePlayers";
import { PlayerRunProgression } from "./PlayerRunProgression";
import { ReplayAnalyticsPanel } from "../replay";
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
  const { source } = useSourceContext();
  const [queryState, setQueryState] = useQueryState(playerProfileQuerySchema);
  const resources = usePlayerProfile({
    apiClient,
    fps: queryState.fps,
    mapId: queryState.map,
    playerId,
    source,
    view: queryState.view,
  });
  const identity = createPlayerProfileIdentity(playerId, {
    directory: resources.directory.data,
    performance: resources.performance.data,
    positions: resources.positions.data,
    rank: resources.rank.data,
    routes: resources.routes.data,
    scores: resources.scores.data,
  });
  const { favoriteIds, toggleFavorite } = useFavoritePlayers(source);
  const isFavorite = favoriteIds.has(playerId);
  const supportedResources =
    queryState.view === "runs"
      ? [resources.scores]
      : queryState.view === "progress"
        ? [resources.scores, ...(queryState.map > 0 ? [resources.mapRuns] : [])]
        : queryState.view === "routes"
          ? [resources.routes, resources.maps]
          : [
              resources.performance,
              resources.positions,
              ...(source === "j4l" ? [resources.rank, resources.activity] : []),
            ];
  const isSettling = [resources.directory, ...supportedResources].some(
    (resource) => resource.status === "loading" || resource.status === "refreshing",
  );
  const errorCount = supportedResources.filter((resource) => resource.status === "error").length;
  const allFailed = supportedResources.every(
    (resource) => resource.status === "error" && resource.data === null,
  );
  const viewHandlesAllFailures = queryState.view === "progress";
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
            <CountryFlag
              className="cjs-player-profile__avatar"
              code={identity.countryCode}
              label={identity.country || identity.region || "Country not provided"}
              size="large"
            />
            <div>
              <p className="cjs-player-profile__eyebrow">
                Player #{playerId} · {playerSourceLabel(source)}
              </p>
              <h1 id="player-profile-title">
                <CodPlayerName value={identity.name} />
              </h1>
              <p className="cjs-player-profile__meta">
                <span className="cjs-player-profile__country">
                  {identity.country || identity.region || "Country not provided"}
                </span>
                <span className="cjs-player-profile__meta-separator" aria-hidden="true">
                  ·
                </span>
                <span title={identity.lastSeen ? formatDate(identity.lastSeen) : undefined}>
                  {identity.lastSeen
                    ? `Last seen ${timeAgo(identity.lastSeen)}`
                    : "Last seen unknown"}
                </span>
              </p>
              <ProfileAccountDetails performance={resources.performance.data} />
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

        <ProfileNavigation
          fps={queryState.fps}
          mapId={queryState.map}
          playerId={playerId}
          source={source}
          view={queryState.view}
        />

        <div className="cjs-player-profile__source-note">
          <span>
            <strong>{playerSourceLabel(source)} profile.</strong> Player #{playerId} belongs to this
            source only.
          </span>
          <div className="cjs-player-profile__source-actions">
            <Link href={`/players?source=${source === "jh" ? "j4l" : "jh"}`} variant="muted">
              Find this player in {playerSourceLabel(source === "jh" ? "j4l" : "jh")}
            </Link>
            <IconButton
              label={isSettling ? "Refreshing profile" : "Refresh profile"}
              isLoading={isSettling}
              onClick={resources.reload}
              variant="ghost"
            >
              <RefreshCw aria-hidden="true" size={17} />
            </IconButton>
          </div>
        </div>

        {queryState.view === "runs" && (
          <Panel
            className="cjs-player-profile__controls"
            padding="small"
            variant="strong"
            aria-label="Best run filters"
          >
            <PlayerFpsFilter
              ariaLabel="Best runs FPS"
              fps={queryState.fps}
              onChange={(fps) => setQueryState({ fps })}
            />
          </Panel>
        )}

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

        {!unavailable && allFailed && !isSettling && !viewHandlesAllFailures && (
          <ErrorState
            description="None of the profile endpoints could be reached. Retry without changing the selected source or filters."
            onRetry={resources.reload}
            title="Profile unavailable"
          />
        )}

        {!unavailable && (!allFailed || viewHandlesAllFailures) && (
          <div className="cjs-player-profile__sections" data-view={queryState.view}>
            {queryState.view === "overview" && (
              <>
                <div className="cjs-player-profile__overview-grid">
                  {source === "j4l" && (
                    <ActivitySection resource={resources.activity} onRetry={resources.reload} />
                  )}
                  <div className="cjs-player-profile__overview-column cjs-player-profile__overview-column--summary">
                    <PerformanceSection
                      resource={resources.performance}
                      onRetry={resources.reload}
                    />
                    {source === "j4l" ? (
                      <RankSection resource={resources.rank} onRetry={resources.reload} />
                    ) : (
                      <aside className="cjs-player-profile__capability" role="note">
                        <Badge tone="information">Source-specific data</Badge>
                        <div>
                          <h2>JumpersHeaven profile</h2>
                          <p>
                            JumpersHeaven publishes performance, placements, and recent records. XP
                            rank, cumulative activity, and replay reach are Jump4Life-only and are
                            not requested for this profile.
                          </p>
                        </div>
                      </aside>
                    )}
                  </div>
                  <div className="cjs-player-profile__overview-column cjs-player-profile__overview-column--recent">
                    <RecentActivitySection
                      performance={resources.performance}
                      source={source}
                      onRetry={resources.reload}
                    />
                  </div>
                  <PositionSection
                    fps={queryState.fps}
                    resource={resources.positions}
                    onRetry={resources.reload}
                  />
                </div>
                <ReplayAnalyticsPanel
                  apiClient={apiClient}
                  scope={{ ownerPlayerId: playerId }}
                  source={source}
                />
              </>
            )}
            {queryState.view === "runs" && (
              <BestRunsSection
                fps={queryState.fps}
                resource={resources.scores}
                source={source}
                onRetry={resources.reload}
              />
            )}
            {queryState.view === "progress" && (
              <PlayerRunProgression
                fps={queryState.fps}
                fpsFilter={
                  <PlayerFpsFilter
                    ariaLabel="Run analytics FPS"
                    fps={queryState.fps}
                    onChange={(fps) => setQueryState({ fps })}
                  />
                }
                mapId={queryState.map}
                onMapChange={(map) => setQueryState({ map })}
                onRetry={resources.reload}
                runs={resources.mapRuns}
                scores={resources.scores}
              />
            )}
            {queryState.view === "routes" && (
              <RouteCompletionSection
                maps={resources.maps}
                onQueryChange={(query) => setQueryState({ q: query })}
                resource={resources.routes}
                source={source}
                query={queryState.q}
                status={queryState.status}
                onStatusChange={(status) => setQueryState({ status })}
                onRetry={resources.reload}
              />
            )}
          </div>
        )}
      </div>
    </Page>
  );
}

function PlayerFpsFilter({
  ariaLabel,
  fps,
  onChange,
}: {
  ariaLabel: string;
  fps: Fps;
  onChange: (fps: Fps) => void;
}) {
  return (
    <fieldset className="cjs-player-profile__fps-filter">
      <legend>FPS</legend>
      <SegmentedControl
        ariaLabel={ariaLabel}
        className="cjs-player-profile__fps-options"
        onChange={onChange}
        options={FPS_VALUES.map((value) => ({
          accessibleLabel: fpsLabel(value),
          label: value === "0" ? "Mix" : value,
          value,
        }))}
        value={fps}
      />
    </fieldset>
  );
}

function ProfileAccountDetails({ performance }: { performance: PlayerPerformanceStats | null }) {
  if (
    !performance ||
    (!performance.is_donator && performance.admin_level <= 0 && !performance.is_banned)
  ) {
    return null;
  }

  return (
    <ul className="cjs-player-profile__account-details" aria-label="Account details">
      {performance.is_donator && <li data-tone="success">Supporter</li>}
      {performance.admin_level > 0 && (
        <li>Administrator · Level {formatProfileNumber(performance.admin_level)}</li>
      )}
      {performance.is_banned && <li data-tone="danger">Banned</li>}
    </ul>
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

function ProfileNavigation({
  fps,
  mapId,
  playerId,
  source,
  view,
}: {
  fps: (typeof FPS_VALUES)[number];
  mapId: number;
  playerId: number;
  source: Source;
  view: PlayerProfileView;
}) {
  const views: ReadonlyArray<{ label: string; value: PlayerProfileView }> = [
    { label: "Overview", value: "overview" },
    { label: "Best runs", value: "runs" },
    { label: "Run analytics", value: "progress" },
    { label: "Route completion", value: "routes" },
  ];

  return (
    <nav className="cjs-player-profile__tabs" aria-label="Player profile sections">
      {views.map((option) => (
        <a
          key={option.value}
          className="cjs-player-profile__tab"
          data-active={view === option.value || undefined}
          href={profileViewHref(playerId, source, option.value, fps, mapId)}
          aria-current={view === option.value ? "page" : undefined}
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}

function RecentActivitySection({
  onRetry,
  performance,
  source,
}: {
  onRetry: () => void;
  performance: ProfileResource<PlayerPerformanceStats>;
  source: Source;
}) {
  return (
    <ProfileSection
      className="cjs-player-profile__section--recent"
      description={
        source === "j4l"
          ? "Recent records and last-seen signals; full tracking totals appear below."
          : "Recent records and last-seen signals published by JumpersHeaven."
      }
      icon={<CalendarClock size={19} />}
      id="player-recent-activity"
      title="Recent activity"
    >
      <ResourceState resource={performance} label="recent activity" onRetry={onRetry}>
        {(data) => (
          <div className="cjs-player-profile__recent">
            <dl className="cjs-player-profile__stat-grid">
              <ProfileStat
                label="Last seen"
                value={
                  data.days_since_last_seen === null
                    ? "Not available"
                    : data.days_since_last_seen === 0
                      ? "Today"
                      : `${data.days_since_last_seen}d ago`
                }
              />
              <ProfileStat
                label="Recent records"
                value={formatProfileNumber(data.recent_tops.length)}
              />
            </dl>
            <div
              aria-label={`${formatProfileNumber(data.recent_tops.length)} recent records`}
              className="cjs-player-profile__recent-scroll"
              role="region"
            >
              <RecentRuns runs={data.recent_tops} source={source} />
            </div>
            {data.oldest_top && <OldestRecord run={data.oldest_top} source={source} />}
          </div>
        )}
      </ResourceState>
    </ProfileSection>
  );
}

function OldestRecord({ run, source }: { run: SimpleTop; source: Source }) {
  return (
    <div className="cjs-player-profile__oldest-record">
      <div>
        <span>Oldest standing record</span>
        <Link href={mapDetailPath(run.cpid, { lookup: "cpid", source })}>{run.map_name}</Link>
      </div>
      <div>
        <RunRank rank={run.rank} />
        <Badge>{fpsLabel(run.fps)}</Badge>
        <span>{run.finish_date ? formatDate(run.finish_date) : "Date not provided"}</span>
      </div>
    </div>
  );
}

function RecentRuns({ runs, source }: { runs: readonly SimpleTop[]; source: Source }) {
  if (runs.length === 0) {
    return (
      <p className="cjs-player-profile__recent-empty">
        No recent leaderboard records yet. This is expected for new players and players without a
        ranked run.
      </p>
    );
  }

  return (
    <ul className="cjs-player-profile__recent-list" aria-label="Recent personal records">
      {runs.map((run) => (
        <li key={run.runid}>
          <div>
            <Link href={mapDetailPath(run.cpid, { lookup: "cpid", source })}>{run.map_name}</Link>
            <span>{run.finish_date ? formatDate(run.finish_date) : "Date not provided"}</span>
          </div>
          <div>
            <RunRank rank={run.rank} />
            <Badge>{fpsLabel(run.fps)}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RunRank({ rank }: { rank: number }) {
  const achievement = getRunAchievement(rank);

  if (!achievement) return <strong>#{rank}</strong>;

  return (
    <span
      className="cjs-player-profile__rank-achievement"
      data-achievement={achievement.tier}
      title={`${achievement.label} achievement`}
      aria-label={`Rank ${rank}, ${achievement.label}`}
    >
      <strong>#{rank}</strong>
    </span>
  );
}

function profileViewHref(
  playerId: number,
  source: Source,
  view: PlayerProfileView,
  fps: (typeof FPS_VALUES)[number],
  mapId: number,
): string {
  const search = new URLSearchParams({ fps, source, view });
  if (mapId > 0) search.set("map", String(mapId));
  return `/players/${playerId}?${search.toString()}`;
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
      className="cjs-player-profile__section--performance"
      description="Route completion, record FPS distribution, and placements across published leaderboard and FPS combinations."
      icon={<BarChart3 size={19} />}
      id="player-performance"
      title="Performance"
    >
      <ResourceState resource={resource} label="performance statistics" onRetry={onRetry}>
        {(performance) => (
          <>
            <dl className="cjs-player-profile__stat-grid" aria-label="Performance summary">
              <ProfileStat
                label="Route completion"
                value={`${formatProfileNumber(performance.total_maps_completed)} completed · ${formatProfilePercent(performance.maps_completed_ratio)}`}
              />
              <ProfileStat
                label="Best leaderboard placement"
                value={
                  performance.best_rank === null
                    ? "Not ranked yet"
                    : `#${formatProfileNumber(performance.best_rank)}`
                }
              />
              <ProfileStat
                label="Top-10 leaderboard placements"
                value={formatProfileNumber(performance.top10_count)}
              />
              <ProfileStat
                label="#1 leaderboard placements"
                value={formatProfileNumber(performance.top1_count)}
              />
              <ProfileStat
                label="Average leaderboard placement"
                value={
                  performance.average_rank === null
                    ? "Not ranked yet"
                    : formatProfileDecimal(performance.average_rank)
                }
              />
              <ProfileStat
                label="Best record FPS"
                value={performance.best_fps ? fpsLabel(performance.best_fps) : "Not ranked yet"}
              />
            </dl>
            <FpsRecordDistribution counts={performance.nb_tops_per_fps} />
          </>
        )}
      </ResourceState>
    </ProfileSection>
  );
}

function FpsRecordDistribution({ counts }: { counts: PlayerPerformanceStats["nb_tops_per_fps"] }) {
  return (
    <div className="cjs-player-profile__fps-breakdown">
      <h3>Records by FPS</h3>
      <dl aria-label="Records by FPS">
        {FPS_VALUES.map((fps) => (
          <ProfileStat
            key={fps}
            label={fps === "0" ? "Mix" : fps}
            value={formatProfileNumber(counts[fps] ?? 0)}
          />
        ))}
      </dl>
    </div>
  );
}

function PositionSection({
  fps,
  onRetry,
  resource,
}: {
  fps: (typeof FPS_VALUES)[number];
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
      className="cjs-player-profile__section--position"
      description={`Official placements across every published leaderboard at ${fpsLabel(fps)}.`}
      icon={<Medal size={19} />}
      id="player-position"
      title="Leaderboard positions"
    >
      <ResourceState resource={resource} label="leaderboard position" onRetry={onRetry}>
        {(positions) =>
          positions.length ? (
            <DataTable
              caption={`All leaderboard positions at ${fpsLabel(fps)}`}
              columns={columns}
              getRowKey={(position) => `${position.leaderboard_type}-${position.fps}`}
              rows={positions}
            />
          ) : (
            <EmptyState
              description="The leaderboard hasn't learned this player's name yet. A few more runs should get its attention."
              title="Not on the board… yet"
            />
          )
        }
      </ResourceState>
    </ProfileSection>
  );
}

function BestRunsSection({
  fps,
  onRetry,
  resource,
  source,
}: {
  fps: (typeof FPS_VALUES)[number];
  onRetry: () => void;
  resource: ProfileResource<PlayerJumpScores>;
  source: Source;
}) {
  const columns = useMemo<readonly DataTableColumn<PlayerMapScore>[]>(
    () => [
      {
        id: "rank",
        header: "Rank",
        cell: (run) => <RunRank rank={run.rank} />,
      },
      {
        id: "map",
        header: "Map",
        priority: "primary",
        cell: (run) => <Link href={mapDetailPath(run.map_id, { source })}>{run.map_name}</Link>,
      },
      {
        id: "skill-points",
        header: "Skill points",
        align: "end",
        cell: (run) => <strong>{formatProfileNumber(run.score)}</strong>,
      },
      {
        id: "difficulty",
        header: "Difficulty",
        align: "end",
        cell: (run) => formatProfileDecimal(run.difficulty),
      },
    ],
    [source],
  );

  return (
    <ProfileSection
      className="cjs-player-profile__section--wide"
      description={`The player's highest-value ${fpsLabel(fps)} maps from the jump-skill leaderboard, ordered by contributed skill points.`}
      icon={<Trophy size={19} />}
      id="player-top-runs"
      title="Best runs"
    >
      <ResourceState resource={resource} label="best runs" onRetry={onRetry}>
        {(scores) =>
          scores.map_scores.length ? (
            <div className="cjs-player-profile__best-runs">
              <dl className="cjs-player-profile__stat-grid cjs-player-profile__skill-summary">
                <ProfileStat label="Jump-skill rank" value={`#${scores.rank}`} />
                <ProfileStat label="Total skill points" value={formatProfileNumber(scores.score)} />
                <ProfileStat
                  label="Scoring maps"
                  value={formatProfileNumber(scores.map_scores.length)}
                />
              </dl>
              <DataTable
                caption={`Best jump-skill runs at ${fpsLabel(fps)}`}
                columns={columns}
                getRowKey={(run) => run.map_id}
                rows={scores.map_scores}
              />
            </div>
          ) : (
            <EmptyState
              description={`This player has not earned jump-skill points at ${fpsLabel(fps)} yet. New ranked runs will appear here.`}
              title="No ranked runs yet"
            />
          )
        }
      </ResourceState>
    </ProfileSection>
  );
}

function RouteCompletionSection({
  maps,
  onQueryChange,
  onRetry,
  onStatusChange,
  query,
  resource,
  source,
  status,
}: {
  maps: ProfileResource<GameMap[]>;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
  onStatusChange: (status: RouteCompletionStatus) => void;
  query: string;
  resource: ProfileResource<PlayerRouteCompletion[]>;
  source: Source;
  status: RouteCompletionStatus;
}) {
  const [visibleLimit, setVisibleLimit] = useState(100);
  const inventory = useMemo(
    () => createPlayerRouteInventory(maps.data ?? [], resource.data ?? []),
    [maps.data, resource.data],
  );
  const summary = useMemo(() => summarizePlayerRouteInventory(inventory), [inventory]);
  const catalogAvailable = maps.data !== null;
  const effectiveStatus = !catalogAvailable && status === "remaining" ? "all" : status;
  const filteredRoutes = useMemo(
    () => filterPlayerRouteInventory(inventory, { query, status: effectiveStatus }),
    [effectiveStatus, inventory, query],
  );
  const visibleRoutes = filteredRoutes.slice(0, visibleLimit);
  const completionPercent = summary.completionRate * 100;
  const completedWithHistory = summary.completed + summary.archivedCompleted;

  useEffect(() => {
    setVisibleLimit(100);
  }, [effectiveStatus, inventory, query, source]);

  const columns = useMemo<readonly DataTableColumn<PlayerRouteInventoryItem>[]>(
    () => [
      {
        id: "map",
        header: "Map",
        priority: "primary",
        cell: (route) => <Link href={mapDetailPath(route.mapId, { source })}>{route.mapName}</Link>,
      },
      {
        id: "status",
        header: "Status",
        cell: (route) => (
          <span className="cjs-player-profile__route-status">
            <Badge
              icon={
                route.completed ? (
                  <CheckCircle2 aria-hidden="true" size={13} />
                ) : (
                  <Circle aria-hidden="true" size={13} />
                )
              }
              tone={route.completed ? "success" : undefined}
            >
              {route.completed ? "Completed" : "Remaining"}
            </Badge>
            {catalogAvailable && !route.published && <Badge>Historical</Badge>}
          </span>
        ),
      },
      {
        id: "fps",
        header: "Completed FPS",
        cell: (route) => (route.completed ? formatFpsList(route.fpsList) : "Not completed"),
      },
      {
        id: "finishes",
        header: "Finishes",
        align: "end",
        cell: (route) => formatProfileNumber(route.totalFinishes),
      },
      {
        id: "type",
        header: "Route type",
        cell: (route) => (route.routeType ? sentenceCase(route.routeType) : "Not provided"),
      },
      {
        id: "ender",
        header: "Ender",
        cell: (route) => route.ender || "Not provided",
      },
    ],
    [catalogAvailable, source],
  );

  return (
    <ProfileSection
      className="cjs-player-profile__section--wide"
      description="Completed and remaining maps across this source's published route catalog."
      icon={<Route size={19} />}
      id="player-routes"
      title="Route completion"
    >
      {resource.status === "loading" && resource.data === null ? (
        <div className="cjs-player-profile__resource-state">
          <SkeletonGroup count={4} label="Loading route completion" />
        </div>
      ) : resource.error && resource.data === null ? (
        <div className="cjs-player-profile__resource-state">
          <ErrorState
            description={resource.error.message}
            onRetry={onRetry}
            title="Route completion unavailable"
          />
        </div>
      ) : maps.status === "loading" && maps.data === null ? (
        <div className="cjs-player-profile__resource-state">
          <SkeletonGroup count={4} label="Loading route inventory" />
        </div>
      ) : (
        <div className="cjs-player-profile__resource-content">
          {(resource.status === "refreshing" || maps.status === "refreshing") && (
            <p className="cjs-player-profile__resource-status" role="status" aria-live="polite">
              Refreshing route inventory…
            </p>
          )}
          {resource.error && (
            <div className="cjs-player-profile__resource-error" role="alert">
              <span>
                Completion refresh failed: {resource.error.message} Previous completion data is
                still shown.
              </span>
              <Button onClick={onRetry} size="small" variant="ghost">
                Try again
              </Button>
            </div>
          )}
          {maps.error && (
            <div className="cjs-player-profile__resource-error" role="alert">
              <span>
                Map catalog {maps.data === null ? "could not be loaded" : "refresh failed"}:{" "}
                {maps.error.message}
                {maps.data === null
                  ? " Completed routes remain available, but remaining and total counts are unavailable."
                  : " The previous catalog is still shown."}
              </span>
              <Button onClick={onRetry} size="small" variant="ghost">
                Try again
              </Button>
            </div>
          )}

          <div className="cjs-player-profile__route-dashboard">
            <dl
              className="cjs-player-profile__stat-grid cjs-player-profile__route-summary"
              aria-label="Route completion summary"
            >
              <ProfileStat label="Completed" value={formatProfileNumber(completedWithHistory)} />
              <ProfileStat
                label="Remaining"
                value={catalogAvailable ? formatProfileNumber(summary.remaining) : "Unavailable"}
              />
              <ProfileStat
                label="Published routes"
                value={catalogAvailable ? formatProfileNumber(summary.total) : "Unavailable"}
              />
              <ProfileStat
                label="Total finishes"
                value={formatProfileNumber(summary.totalFinishes)}
              />
            </dl>
            {catalogAvailable && summary.total > 0 && (
              <div className="cjs-player-profile__progress cjs-player-profile__route-progress">
                <div>
                  <span>Published completion</span>
                  <strong>{formatProfilePercent(summary.completionRate)}</strong>
                </div>
                <progress
                  aria-label={`${formatProfilePercent(summary.completionRate)} of published routes completed`}
                  max="100"
                  value={completionPercent}
                >
                  {formatProfilePercent(summary.completionRate)}
                </progress>
              </div>
            )}
            {catalogAvailable && summary.archivedCompleted > 0 && (
              <p
                className="cjs-player-profile__resource-status cjs-player-profile__route-history-note"
                role="note"
              >
                {formatProfileNumber(summary.archivedCompleted)} historical{" "}
                {summary.archivedCompleted === 1 ? "completion is" : "completions are"} included in
                the completed count and results, but excluded from the current published-route
                progress.
              </p>
            )}
          </div>

          <div className="cjs-player-profile__route-filters">
            <Input
              containerClassName="cjs-player-profile__route-search"
              label="Search routes"
              leading={<Search size={16} />}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Map name"
              type="search"
              value={query}
            />
            <fieldset className="cjs-player-profile__fps-filter cjs-player-profile__route-status-filter">
              <legend>Completion status</legend>
              <SegmentedControl<RouteCompletionStatus>
                ariaLabel="Route completion status"
                className="cjs-player-profile__fps-options"
                onChange={onStatusChange}
                options={[
                  {
                    accessibleLabel: `All ${inventory.length} available routes`,
                    label: `All ${inventory.length}`,
                    value: "all",
                  },
                  {
                    accessibleLabel: `${completedWithHistory} completed routes`,
                    label: `Completed ${completedWithHistory}`,
                    value: "completed",
                  },
                  {
                    accessibleLabel: catalogAvailable
                      ? `${summary.remaining} remaining routes`
                      : "Remaining routes unavailable",
                    disabled: !catalogAvailable,
                    label: `Remaining ${catalogAvailable ? summary.remaining : "—"}`,
                    value: "remaining",
                  },
                ]}
                value={effectiveStatus}
              />
            </fieldset>
          </div>

          <div className="cjs-player-profile__route-results-header">
            <p aria-live="polite" role="status">
              Showing <strong>{formatProfileNumber(visibleRoutes.length)}</strong> of{" "}
              <strong>{formatProfileNumber(filteredRoutes.length)}</strong> matching routes
            </p>
            {(query || effectiveStatus !== "all") && (
              <Button
                onClick={() => {
                  onQueryChange("");
                  onStatusChange("all");
                }}
                size="small"
                variant="ghost"
              >
                Clear filters
              </Button>
            )}
          </div>

          {visibleRoutes.length > 0 ? (
            <DataTable
              caption="Route completion inventory"
              columns={columns}
              getRowKey={(route) => route.routeId}
              rows={visibleRoutes}
            />
          ) : (
            <EmptyState
              action={
                query || effectiveStatus !== "all" ? (
                  <Button
                    onClick={() => {
                      onQueryChange("");
                      onStatusChange("all");
                    }}
                    variant="secondary"
                  >
                    Clear route filters
                  </Button>
                ) : undefined
              }
              description={
                query || effectiveStatus !== "all"
                  ? "Try another map name or completion status."
                  : "This source returned no maps for the route inventory."
              }
              title={
                query || effectiveStatus !== "all"
                  ? "No routes match these filters"
                  : "No routes available"
              }
            />
          )}
          {visibleRoutes.length < filteredRoutes.length && (
            <div className="cjs-player-profile__route-load-more">
              <Button onClick={() => setVisibleLimit((limit) => limit + 100)} variant="secondary">
                Show more routes
              </Button>
              <p>
                {formatProfileNumber(visibleRoutes.length)} of{" "}
                {formatProfileNumber(filteredRoutes.length)} matching routes shown
              </p>
            </div>
          )}
        </div>
      )}
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
      className="cjs-player-profile__section--rank"
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
                <ProfileStat label="Title" value={rank.title || "Not provided"} />
                <ProfileStat label="Prestige" value={formatProfileNumber(rank.prestige)} />
                <ProfileStat label="Total XP" value={formatProfileNumber(rank.total_xp)} />
              </dl>
              <div className="cjs-player-profile__progress">
                <div>
                  <span>Level {rank.level_display || rank.level} progress</span>
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
      className="cjs-player-profile__section--activity"
      description="All-time Jump4Life movement, session, run, and checkpoint totals."
      icon={<Activity size={19} />}
      id="player-activity"
      title="Lifetime activity"
    >
      <ResourceState resource={resource} label="lifetime activity" onRetry={onRetry}>
        {(activity) => (
          <div className="cjs-player-profile__activity">
            <dl className="cjs-player-profile__tracking-grid" aria-label="Activity tracking range">
              <ProfileStat
                label="First tracked"
                value={activity.first_activity_at ? formatDate(activity.first_activity_at) : "—"}
              />
              <ProfileStat
                label="Last tracked"
                value={activity.last_activity_at ? formatDate(activity.last_activity_at) : "—"}
              />
              <ProfileStat label="Updated" value={formatDate(activity.updated_at)} />
            </dl>
            <dl className="cjs-player-profile__activity-grid">
              <ActivityStat
                icon={<Clock3 />}
                label="Playing"
                value={formatDuration(activity.playing_ms)}
              />
              <ActivityStat
                icon={<Gauge />}
                label="Run attempts"
                value={formatDuration(activity.run_attempt_ms)}
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
                icon={<Clock3 />}
                label="Playing AFK"
                value={formatDuration(activity.playing_afk_ms)}
              />
              <ActivityStat
                icon={<Clock3 />}
                label="Spectating AFK"
                value={formatDuration(activity.spectating_afk_ms)}
              />
              <ActivityStat
                icon={<Footprints />}
                label="Jumps"
                value={formatProfileNumber(activity.jump_count)}
              />
              <ActivityStat
                icon={<Route />}
                label="Nade throws"
                value={formatProfileNumber(activity.nadethrows)}
              />
              <ActivityStat
                icon={<Route />}
                label="Nade jumps"
                value={formatProfileNumber(activity.nadejumps)}
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
          </div>
        )}
      </ResourceState>
    </ProfileSection>
  );
}

function ProfileSection({
  children,
  className,
  description,
  icon,
  id,
  title,
}: {
  children: ReactNode;
  className?: string;
  description: string;
  icon: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section
      className={["cjs-player-profile__section", className].filter(Boolean).join(" ")}
      aria-labelledby={`${id}-title`}
    >
      <Panel className="cjs-player-profile__section-panel" padding="none">
        <header className="cjs-player-profile__section-header">
          <span aria-hidden="true">{icon}</span>
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>{description}</p>
          </div>
        </header>
        {children}
      </Panel>
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
