import {
  Check,
  Clipboard,
  Clock3,
  Grid2X2,
  List,
  MapPin,
  Radio,
  RefreshCw,
  Server as ServerIcon,
  Users,
} from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, SegmentedControl } from "../../components/ui";
import {
  booleanQueryParam,
  defineQuerySchema,
  enumQueryParam,
  mapDetailPath,
  useQueryState,
  useSourceContext,
  type SourceId,
} from "../../lib/routing";
import {
  filterServers,
  formatUpdatedTime,
  type ServerPlayerViewModel,
  type ServerViewModel,
} from "./serverModel";
import { useLiveServers, type ServerLoader } from "./useLiveServers";
import "./servers.css";

type ServerView = "grid" | "list";

const serverQuerySchema = defineQuerySchema({
  populated: booleanQueryParam(false),
  view: enumQueryParam(["grid", "list"] as const, "grid"),
});

const sourceNames: Readonly<Record<SourceId, string>> = {
  j4l: "Jump4Life",
  jh: "JumpersHeaven",
};

export interface ServersPageProps {
  readonly loadServers?: ServerLoader;
  readonly pollIntervalMs?: number;
  readonly staleAfterMs?: number;
}

export function ServersPage({ loadServers, pollIntervalMs, staleAfterMs }: ServersPageProps = {}) {
  const { source } = useSourceContext();
  const [filters, setFilters] = useQueryState(serverQuerySchema);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { data, error, initialLoading, lastUpdatedAt, refresh, refreshing, stale } = useLiveServers(
    source,
    {
      autoRefresh,
      loadServers,
      pollIntervalMs,
      staleAfterMs,
    },
  );
  const servers = useMemo(
    () => filterServers(data?.servers ?? [], filters.populated),
    [data?.servers, filters.populated],
  );

  return (
    <div className="servers-page">
      <header className="servers-page__hero">
        <div>
          <p className="servers-page__eyebrow">
            <Radio size={16} aria-hidden="true" /> Live tracker
          </p>
          <h1>Live servers</h1>
          <p>Current server, map, and player activity from the {sourceNames[source]} tracker.</p>
        </div>
        <Badge tone="success" icon={<span className="servers-page__live-dot" />}>
          COD2 live data
        </Badge>
      </header>

      <section className="servers-toolbar" aria-label="Server display controls">
        <div className="servers-toolbar__toggles">
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
          <Button
            variant="secondary"
            onClick={refresh}
            isLoading={refreshing}
            loadingLabel="Refreshing"
            disabled={initialLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </section>

      <ServerRequestStatus
        failed={!data && !initialLoading && error !== null}
        initialLoading={initialLoading}
        refreshing={refreshing}
        stale={stale}
        lastUpdatedAt={lastUpdatedAt}
      />

      {initialLoading && !data && <ServerSkeleton />}

      {!data && !initialLoading && error && (
        <ErrorState
          className="servers-page__state"
          title="Live servers are unavailable"
          description={error}
          retryLabel="Retry server feed"
          onRetry={refresh}
        />
      )}

      {data && (
        <>
          <ServerSummary
            matchingServers={servers.length}
            onlineServers={data.onlineServers}
            totalPlayers={data.totalPlayers}
          />

          {error && (
            <div className="servers-page__notice" data-tone="warning" role="alert">
              <div>
                <strong>Refresh failed.</strong>
                <span>{error} Showing the last successful update.</span>
              </div>
              <Button variant="ghost" size="small" onClick={refresh}>
                Try again
              </Button>
            </div>
          )}

          {data.omittedServerCount > 0 && (
            <div className="servers-page__notice" data-tone="warning" role="status">
              <span>
                {data.omittedServerCount === 1
                  ? "One incomplete server entry could not be shown."
                  : `${data.omittedServerCount} incomplete server entries could not be shown.`}
              </span>
            </div>
          )}

          {data.servers.length === 0 ? (
            <EmptyState
              className="servers-page__state"
              title="No servers are reporting"
              description={`${sourceNames[source]} is not reporting any live COD2 servers right now.`}
              action={
                <Button variant="secondary" onClick={refresh}>
                  Refresh server feed
                </Button>
              }
            />
          ) : servers.length === 0 ? (
            <EmptyState
              className="servers-page__state"
              title="No populated servers"
              description="No players are connected to the reporting servers. Show all servers to keep browsing."
              action={
                <Button variant="secondary" onClick={() => setFilters({ populated: false })}>
                  Show all servers
                </Button>
              }
            />
          ) : (
            <section
              className="servers-grid"
              data-view={filters.view}
              aria-label={`${servers.length} matching live servers`}
            >
              {servers.map((server) => (
                <ServerCard server={server} source={source} key={server.id} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
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
      <Clock3 size={15} aria-hidden="true" />
      <span>{message}</span>
      {lastUpdatedAt !== null && (
        <time dateTime={new Date(lastUpdatedAt).toISOString()}>
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "medium",
          }).format(lastUpdatedAt)}
        </time>
      )}
    </p>
  );
}

function ServerSummary({
  matchingServers,
  onlineServers,
  totalPlayers,
}: {
  matchingServers: number;
  onlineServers: number;
  totalPlayers: number;
}) {
  return (
    <dl className="servers-summary" aria-label="Live server summary">
      <div>
        <dt>Online servers</dt>
        <dd>{onlineServers.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Connected players</dt>
        <dd>{totalPlayers.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Matching filters</dt>
        <dd>{matchingServers.toLocaleString()}</dd>
      </div>
    </dl>
  );
}

function ServerSkeleton() {
  return (
    <div className="servers-grid" data-view="grid" role="status" aria-live="polite">
      <span className="cjs-visually-hidden">Loading live servers</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div className="servers-card-skeleton cjs-skeleton" data-variant="card" key={index} />
      ))}
    </div>
  );
}

function ServerCard({ server, source }: { server: ServerViewModel; source: SourceId }) {
  const headingId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const visiblePlayers = server.players?.slice(0, 5) ?? [];

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
      variant={server.playerCount > 0 ? "strong" : "default"}
      aria-labelledby={headingId}
    >
      <header className="server-card__header">
        <span className="server-card__icon" aria-hidden="true">
          <ServerIcon size={20} />
        </span>
        <div>
          <h2 id={headingId}>{server.domain}</h2>
          {server.connectionAddress && <code>{server.connectionAddress}</code>}
        </div>
        <Badge tone={server.online ? "success" : "neutral"}>
          {server.online ? "Online" : "Offline"}
        </Badge>
      </header>

      <dl className="server-card__facts">
        <div>
          <dt>
            <MapPin size={16} aria-hidden="true" /> Map
          </dt>
          <dd>
            {server.mapId !== null ? (
              <a href={mapDetailPath(server.mapId, { source })}>{server.mapName}</a>
            ) : (
              server.mapName
            )}
          </dd>
        </div>
        <div>
          <dt>
            <Radio size={16} aria-hidden="true" /> Mode
          </dt>
          <dd>{server.mode}</dd>
        </div>
        <div>
          <dt>
            <Users size={16} aria-hidden="true" /> Players
          </dt>
          <dd>{server.playerCount.toLocaleString()}</dd>
        </div>
      </dl>

      <ServerRoster
        players={visiblePlayers}
        rosterKnown={server.players !== null}
        totalPlayers={server.playerCount}
      />

      <footer className="server-card__footer">
        {server.connectionAddress ? (
          <Button variant="secondary" size="small" onClick={copyAddress}>
            {copyState === "copied" ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Clipboard size={16} aria-hidden="true" />
            )}
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy address"}
          </Button>
        ) : (
          <span className="server-card__unavailable">Connection address unavailable</span>
        )}
        <span className="cjs-visually-hidden" role="status" aria-live="polite">
          {copyState === "copied"
            ? `${server.connectionAddress} copied to clipboard.`
            : copyState === "failed"
              ? "The server address could not be copied."
              : ""}
        </span>
      </footer>
    </Card>
  );
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
  if (!rosterKnown) {
    return <p className="server-card__roster-empty">Player list unavailable</p>;
  }
  if (players.length === 0) {
    return <p className="server-card__roster-empty">No players connected</p>;
  }

  return (
    <div className="server-card__roster">
      <h3>Connected players</h3>
      <ul>
        {players.map((player, index) => (
          <li key={`${player.id ?? player.name}:${index}`}>
            <span>{player.name}</span>
            {player.ping !== null && <small>{player.ping} ms</small>}
          </li>
        ))}
      </ul>
      {totalPlayers > players.length && <p>+{totalPlayers - players.length} more</p>}
    </div>
  );
}
