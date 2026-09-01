import {
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Grid2X2,
  List,
  RefreshCw,
  Server,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  Button,
  Card,
  CodPlayerName,
  CountryFlag,
  EmptyState,
  ErrorState,
  IconButton,
  SegmentedControl,
} from "../../components/ui";
import { getMapImageSources } from "../../lib/mapImages";
import {
  booleanQueryParam,
  defineQuerySchema,
  enumQueryParam,
  mapDetailPath,
  useQueryState,
  type SourceId,
} from "../../lib/routing";
import {
  SERVER_GAMES,
  filterServers,
  formatUpdatedTime,
  type ServerGame,
  type ServerPlayerViewModel,
  type ServerViewModel,
} from "./serverModel";
import { useLiveServers, type ServerLoader } from "./useLiveServers";
import "./servers.css";

type ServerView = "grid" | "list";

const serverQuerySchema = defineQuerySchema({
  game: enumQueryParam(SERVER_GAMES, "cod2"),
  populated: booleanQueryParam(false),
  view: enumQueryParam(["grid", "list"] as const, "grid"),
});

const sourceNames: Readonly<Record<SourceId, string>> = {
  j4l: "Jump4Life",
  jh: "JumpersHeaven",
};

const serverSources = ["j4l", "jh"] as const satisfies readonly SourceId[];

const serverCountries: Readonly<Record<string, { code: string; name: string }>> = {
  au: { code: "AU", name: "Australia" },
  de: { code: "DE", name: "Germany" },
  fr: { code: "FR", name: "France" },
  gb: { code: "GB", name: "United Kingdom" },
  hk: { code: "HK", name: "Hong Kong" },
  hu: { code: "HU", name: "Hungary" },
  ro: { code: "RO", name: "Romania" },
  ru: { code: "RU", name: "Russia" },
  uae: { code: "AE", name: "United Arab Emirates" },
  uk: { code: "GB", name: "United Kingdom" },
  us: { code: "US", name: "United States" },
};

export interface ServersPageProps {
  readonly loadServers?: ServerLoader;
  readonly pollIntervalMs?: number;
  readonly staleAfterMs?: number;
}

export function ServersPage({ loadServers, pollIntervalMs, staleAfterMs }: ServersPageProps = {}) {
  const [filters, setFilters] = useQueryState(serverQuerySchema);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const j4lState = useLiveServers("j4l", {
    autoRefresh,
    loadServers,
    pollIntervalMs,
    staleAfterMs,
  });
  const jhState = useLiveServers("jh", {
    autoRefresh,
    loadServers,
    pollIntervalMs,
    staleAfterMs,
  });
  const j4lServers = useMemo(
    () => filterServers(j4lState.data?.servers ?? [], filters.populated, "cod2"),
    [filters.populated, j4lState.data?.servers],
  );
  const jhServers = useMemo(
    () => filterServers(jhState.data?.servers ?? [], filters.populated, filters.game),
    [filters.game, filters.populated, jhState.data?.servers],
  );
  const sourceGroups = [
    { source: serverSources[0], state: j4lState, servers: j4lServers },
    { source: serverSources[1], state: jhState, servers: jhServers },
  ] as const;
  const visibleSourceGroups: ReadonlyArray<(typeof sourceGroups)[number]> =
    filters.game === "cod4" ? sourceGroups.filter(({ source }) => source === "jh") : sourceGroups;
  const states = sourceGroups.map(({ state }) => state);
  const dashboards = states.flatMap(({ data }) => (data ? [data] : []));
  const hasData = dashboards.length > 0;
  const initialLoading = !hasData && states.some((state) => state.initialLoading);
  const failed = !hasData && states.every((state) => !state.initialLoading && state.error !== null);
  const refreshing = states.some((state) => state.refreshing);
  const stale = states.some((state) => state.stale);
  const updatedTimes = states.flatMap(({ lastUpdatedAt }) =>
    lastUpdatedAt === null ? [] : [lastUpdatedAt],
  );
  const lastUpdatedAt = updatedTimes.length > 0 ? Math.min(...updatedTimes) : null;
  const matchingServers = visibleSourceGroups.reduce(
    (total, group) => total + group.servers.length,
    0,
  );
  const reportingServers = dashboards.reduce((total, data) => total + data.servers.length, 0);
  const omittedServerCount = dashboards.reduce((total, data) => total + data.omittedServerCount, 0);
  const failedDescription = sourceGroups
    .flatMap(({ source, state }) => (state.error ? [`${sourceNames[source]}: ${state.error}`] : []))
    .join(" ");
  const refresh = () => {
    j4lState.refresh();
    jhState.refresh();
  };

  return (
    <div className="servers-page">
      <header className="servers-page__header cjs-page-heading">
        <div className="servers-page__eyebrow cjs-page-heading__eyebrow">
          <Server aria-hidden="true" size={18} />
          <span>Live activity</span>
        </div>
        <h1>Live servers</h1>
        <p className="cjs-page-heading__description">
          See current JumpersHeaven and Jump4Life servers, maps, player counts, and connection
          details.
        </p>
      </header>

      <section className="servers-toolbar" aria-label="Server display controls">
        <div className="servers-toolbar__toggles">
          <SegmentedControl<ServerGame>
            ariaLabel="Game version"
            value={filters.game}
            onChange={(game) => setFilters({ game })}
            options={SERVER_GAMES.map((game) => ({
              label: game.toUpperCase(),
              value: game,
            }))}
          />
          <label className="servers-toggle">
            <input
              type="checkbox"
              checked={filters.populated}
              onChange={(event) => setFilters({ populated: event.currentTarget.checked })}
            />
            <span>Populated only</span>
          </label>
          <label className="servers-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.currentTarget.checked)}
            />
            <span>Auto-refresh</span>
          </label>
        </div>

        <div className="servers-toolbar__actions">
          <SegmentedControl<ServerView>
            ariaLabel="Server layout"
            className="servers-view-switch"
            value={filters.view}
            onChange={(view) => setFilters({ view })}
            options={[
              {
                accessibleLabel: "Grid view",
                label: <Grid2X2 size={17} aria-hidden="true" />,
                value: "grid",
              },
              {
                accessibleLabel: "List view",
                label: <List size={17} aria-hidden="true" />,
                value: "list",
              },
            ]}
          />
          <IconButton
            label={refreshing ? "Refreshing" : "Refresh"}
            variant="ghost"
            size="small"
            onClick={refresh}
            isLoading={refreshing}
            disabled={initialLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
          </IconButton>
        </div>
      </section>

      <ServerRequestStatus
        failed={failed}
        initialLoading={initialLoading}
        refreshing={refreshing}
        stale={stale}
        lastUpdatedAt={lastUpdatedAt}
      />

      {initialLoading && <ServerSkeleton />}

      {failed && (
        <ErrorState
          className="servers-page__state"
          title="Live servers are unavailable"
          description={failedDescription}
          retryLabel="Retry server feeds"
          onRetry={refresh}
        />
      )}

      {hasData && (
        <>
          {omittedServerCount > 0 && (
            <div className="servers-page__notice" data-tone="warning" role="status">
              <span>
                {omittedServerCount === 1
                  ? "One incomplete server entry could not be shown."
                  : `${omittedServerCount} incomplete server entries could not be shown.`}
              </span>
            </div>
          )}

          {reportingServers === 0 ? (
            <EmptyState
              className="servers-page__state"
              title="No servers are reporting"
              description="Neither tracker is reporting any live servers right now."
              action={
                <Button variant="secondary" onClick={refresh}>
                  Refresh server feeds
                </Button>
              }
            />
          ) : matchingServers === 0 ? (
            <EmptyState
              className="servers-page__state"
              title={
                filters.populated
                  ? `No populated ${filters.game.toUpperCase()} servers`
                  : `No ${filters.game.toUpperCase()} servers`
              }
              description={
                filters.populated
                  ? "No players are connected to matching servers. Show all servers to keep browsing."
                  : `No ${filters.game.toUpperCase()} servers are currently reporting.`
              }
              action={
                filters.populated ? (
                  <Button variant="secondary" onClick={() => setFilters({ populated: false })}>
                    Show all servers
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setFilters({ game: "cod2" })}>
                    Show COD2 servers
                  </Button>
                )
              }
            />
          ) : (
            <div className="server-source-groups">
              {visibleSourceGroups.map((group) => (
                <ServerSourceGroup
                  key={group.source}
                  source={group.source}
                  state={group.state}
                  servers={group.servers}
                  view={filters.view}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ServerSourceGroup({
  source,
  state,
  servers,
  view,
}: {
  source: SourceId;
  state: ReturnType<typeof useLiveServers>;
  servers: readonly ServerViewModel[];
  view: ServerView;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = `servers-${source}-content`;

  return (
    <section className="server-source-group" aria-labelledby={`servers-${source}`}>
      <header className="server-source-group__header">
        <h2 id={`servers-${source}`}>
          <button
            type="button"
            className="server-source-group__toggle"
            aria-controls={contentId}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <span className="server-source-group__marker" data-source={source} aria-hidden="true" />
            <span>{sourceNames[source]}</span>
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </h2>
        {state.data && (
          <span>
            {servers.length} {servers.length === 1 ? "server" : "servers"}
          </span>
        )}
      </header>

      <div id={contentId} className="server-source-group__content" hidden={!expanded}>
        {!state.data && state.initialLoading && <ServerSkeleton count={2} />}

        {!state.data && !state.initialLoading && state.error && (
          <ErrorState
            title={`${sourceNames[source]} is unavailable`}
            description={state.error}
            retryLabel={`Retry ${sourceNames[source]}`}
            onRetry={state.refresh}
          />
        )}

        {state.data && state.error && (
          <div className="servers-page__notice" data-tone="warning" role="alert">
            <div>
              <strong>{sourceNames[source]} refresh failed.</strong>
              <span>{state.error} Showing the last successful update.</span>
            </div>
            <Button variant="ghost" size="small" onClick={state.refresh}>
              Try again
            </Button>
          </div>
        )}

        {state.data && servers.length > 0 && (
          <div
            className="servers-grid"
            data-view={view}
            aria-label={`${sourceNames[source]}: ${servers.length} matching live servers`}
          >
            {servers.map((server) => (
              <ServerCard server={server} source={source} key={server.id} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServerRequestStatus({
  failed,
  initialLoading,
  lastUpdatedAt,
  refreshing,
  stale,
}: {
  failed: boolean;
  initialLoading: boolean;
  lastUpdatedAt: number | null;
  refreshing: boolean;
  stale: boolean;
}) {
  let message = "Waiting for live server data.";
  if (initialLoading) message = "Loading live server data.";
  else if (failed) message = "The live server request failed.";
  else if (refreshing)
    message = "Refreshing live server data while keeping the last update visible.";
  else if (lastUpdatedAt !== null) {
    message = `${stale ? "Data may be stale. Last updated" : "Updated"} ${formatUpdatedTime(lastUpdatedAt)}.`;
  }

  return (
    <p
      className="servers-page__request-status"
      data-stale={stale || undefined}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
    </p>
  );
}

function ServerSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="servers-grid" data-view="grid" role="status" aria-live="polite">
      <span className="cjs-visually-hidden">Loading live servers</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="servers-card-skeleton cjs-skeleton" data-variant="card" key={index} />
      ))}
    </div>
  );
}

function ServerCard({ server, source }: { server: ServerViewModel; source: SourceId }) {
  const headingId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [imageFailed, setImageFailed] = useState(false);
  const visiblePlayers = server.players?.slice(0, 5) ?? [];
  const country = getServerCountry(server.domain);
  const imageSources =
    server.mapName === "Map unavailable" ? null : getMapImageSources(server.mapName);
  const statusLabel = server.online ? "Online" : "Offline";
  const copyLabel = server.connectionAddress
    ? copyState === "copied"
      ? `${server.connectionAddress} copied`
      : copyState === "failed"
        ? `Retry copying ${server.connectionAddress}`
        : `Copy ${server.connectionAddress}`
    : "Copy server address";
  const copyTitle =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy address";

  const copyAddress = async () => {
    if (!server.connectionAddress) return;

    try {
      await navigator.clipboard.writeText(server.connectionAddress);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <Card
      className="server-card"
      padding="none"
      variant={server.playerCount > 0 ? "strong" : "default"}
      aria-labelledby={headingId}
    >
      <div className="server-card__visual">
        {imageSources && !imageFailed && (
          <img
            className="server-card__visual-image"
            src={imageSources.card}
            srcSet={imageSources.srcSet}
            sizes="(max-width: 48rem) 100vw, 33vw"
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
        <header className="server-card__header">
          <CountryFlag
            className="server-card__country"
            code={country.code}
            label={country.name}
            size="large"
          />
          <h3 id={headingId}>{server.domain}</h3>
          <span
            className="server-card__status"
            data-state={server.online ? "online" : "offline"}
            data-tooltip={statusLabel}
            role="img"
            aria-label={`Server ${statusLabel.toLowerCase()}`}
          />
        </header>

        <div className="server-card__map">
          {server.mapId !== null && server.game === "cod2" ? (
            <a href={mapDetailPath(server.mapId, { lookup: "cpid", source })}>
              <span>{server.mapName}</span>
            </a>
          ) : (
            <strong>{server.mapName}</strong>
          )}
        </div>
      </div>

      <div className="server-card__body">
        {server.connectionAddress ? (
          <div className="server-card__address">
            <code>{server.connectionAddress}</code>
            <IconButton
              className="server-card__copy"
              label={copyLabel}
              title={copyTitle}
              size="small"
              variant="ghost"
              data-copy-state={copyState}
              onClick={copyAddress}
            >
              {copyState === "copied" ? (
                <Check size={16} aria-hidden="true" />
              ) : copyState === "failed" ? (
                <CircleAlert size={16} aria-hidden="true" />
              ) : (
                <Clipboard size={16} aria-hidden="true" />
              )}
            </IconButton>
          </div>
        ) : (
          <span className="server-card__unavailable">Connection address unavailable</span>
        )}

        <ServerRoster
          players={visiblePlayers}
          rosterKnown={server.players !== null}
          totalPlayers={server.playerCount}
        />

        <span className="cjs-visually-hidden" role="status" aria-live="polite">
          {copyState === "copied"
            ? `${server.connectionAddress} copied to clipboard.`
            : copyState === "failed"
              ? "The server address could not be copied."
              : ""}
        </span>
      </div>
    </Card>
  );
}

function getServerCountry(domain: string) {
  const regionKey = domain.split(".")[0]?.toLowerCase() ?? "";
  const country = serverCountries[regionKey];
  if (!country) return { code: null, name: "Server region unavailable" };
  return { code: country.code, name: country.name };
}

function ServerRoster({
  players,
  rosterKnown,
  totalPlayers,
}: {
  players: readonly ServerPlayerViewModel[];
  rosterKnown: boolean;
  totalPlayers: number;
}) {
  if (!rosterKnown || players.length === 0) {
    return <p className="server-card__roster-empty">Server empty</p>;
  }

  return (
    <div className="server-card__roster">
      <h3>Players</h3>
      <ul>
        {players.map((player, index) => (
          <li key={`${player.id ?? player.name}:${index}`}>
            <CodPlayerName value={player.name} />
            {player.ping !== null && <small>{player.ping} ms</small>}
          </li>
        ))}
      </ul>
      {totalPlayers > players.length && <p>+{totalPlayers - players.length} more</p>}
    </div>
  );
}
