import { CheckCircle2, ExternalLink, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Link,
  Pagination,
  Panel,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonGroup,
  type DataTableColumn,
} from ".";

interface ExampleRun {
  id: number;
  player: string;
  map: string;
  time: string;
  source: "J4L" | "JH";
}

const exampleRuns: ExampleRun[] = [
  { id: 1, player: "strafe_runner", map: "mp_dark", time: "00:42.381", source: "J4L" },
  { id: 2, player: "jump_unit", map: "mp_mystic", time: "00:45.912", source: "JH" },
  { id: 3, player: "velocity", map: "mp_portal", time: "00:48.047", source: "J4L" },
];

const runColumns: readonly DataTableColumn<ExampleRun>[] = [
  {
    id: "player",
    header: "Player",
    priority: "primary",
    cell: (run) => <Link href={`#player-${run.id}`}>{run.player}</Link>,
  },
  {
    id: "map",
    header: "Map",
    priority: "primary",
    cell: (run) => run.map,
  },
  {
    id: "time",
    header: "Time",
    align: "end",
    cell: (run) => <strong>{run.time}</strong>,
  },
  {
    id: "source",
    header: "Source",
    align: "center",
    cell: (run) => (
      <Badge tone={run.source === "J4L" ? "success" : "information"}>{run.source}</Badge>
    ),
  },
];

const sourceOptions = [
  { value: "all", label: "All sources" },
  { value: "j4l", label: "Jump4Life" },
  { value: "jh", label: "JumpersHeaven" },
] as const;

export function DesignSystemGallery() {
  const [source, setSource] = useState<(typeof sourceOptions)[number]["value"]>("all");
  const [page, setPage] = useState(4);

  return (
    <main className="cjs-gallery cjs-page">
      <header className="cjs-gallery__header">
        <p className="cjs-gallery__eyebrow">CJS design system</p>
        <h1>Quiet surfaces, precise states, dense data</h1>
        <p className="cjs-gallery__intro">
          A keyboard-first visual fixture for the shared primitives. Resize this page to 360px,
          768px, and 1440px to verify wrapping and table-to-card behavior.
        </p>
      </header>

      <div className="cjs-gallery__sections">
        <Panel className="cjs-gallery__section" padding="large">
          <header>
            <h2>Actions and links</h2>
            <p>Normal, loading, disabled, icon-only, and destructive states.</p>
          </header>
          <div className="cjs-gallery__controls">
            <Button>Primary action</Button>
            <Button variant="secondary">
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </Button>
            <Button variant="ghost">Quiet action</Button>
            <Button variant="danger">
              <Trash2 size={16} aria-hidden="true" />
              Delete favorite
            </Button>
            <Button isLoading loadingLabel="Refreshing">
              Refresh
            </Button>
            <Button disabled>Unavailable</Button>
            <IconButton label="Refresh results">
              <RefreshCw size={18} aria-hidden="true" />
            </IconButton>
            <IconButton label="Delete result" variant="danger">
              <Trash2 size={18} aria-hidden="true" />
            </IconButton>
            <Link href="#tables">
              View records <ExternalLink size={14} aria-hidden="true" />
            </Link>
            <Link href="#disabled" isDisabled>
              Disabled link
            </Link>
          </div>
        </Panel>

        <Panel className="cjs-gallery__section" padding="large">
          <header>
            <h2>Filters and form controls</h2>
            <p>Labels and error relationships are owned by each control.</p>
          </header>
          <SegmentedControl
            ariaLabel="Data source"
            options={sourceOptions}
            value={source}
            onChange={setSource}
          />
          <div className="cjs-gallery__form-grid">
            <Input
              label="Find a player"
              placeholder="Player name"
              helperText="Searches the selected source."
              leading={<Search size={17} />}
            />
            <Select label="Frames per second" defaultValue="125">
              <option value="43">43 FPS</option>
              <option value="76">76 FPS</option>
              <option value="125">125 FPS</option>
              <option value="250">250 FPS</option>
              <option value="333">333 FPS</option>
            </Select>
            <Input
              label="Required map"
              defaultValue="unknown_map"
              error="Choose a map returned by the API."
              required
            />
            <Input label="Disabled field" value="Read only" disabled readOnly />
          </div>
        </Panel>

        <Panel className="cjs-gallery__section" padding="large">
          <header>
            <h2>Badges and surfaces</h2>
            <p>Every tone includes readable text; color is supplementary.</p>
          </header>
          <div className="cjs-gallery__controls">
            <Badge>Unranked</Badge>
            <Badge tone="success" icon={<CheckCircle2 size={14} />}>
              Live
            </Badge>
            <Badge tone="warning">Rank 1</Badge>
            <Badge tone="danger">Offline</Badge>
            <Badge tone="information">JumpersHeaven</Badge>
          </div>
          <div className="cjs-gallery__panel-grid">
            <Card className="cjs-gallery__card-copy">
              <h3>Default card</h3>
              <p>Reusable content surface with quiet elevation.</p>
            </Card>
            <Card className="cjs-gallery__card-copy" variant="strong">
              <h3>Strong card</h3>
              <p>Use for selected or locally important content.</p>
            </Card>
            <Card className="cjs-gallery__card-copy" variant="warm">
              <h3>Warm card</h3>
              <p>Reserved for ranking and amber emphasis.</p>
            </Card>
          </div>
        </Panel>

        <Panel id="tables" className="cjs-gallery__section" padding="large">
          <header>
            <h2>Responsive data table</h2>
            <p>Semantic rows become labeled cards below 768px.</p>
          </header>
          <DataTable
            caption="Recent top runs"
            captionVisible
            columns={runColumns}
            rows={exampleRuns}
            getRowKey={(run) => run.id}
            getRowLabel={(run) => `${run.player} on ${run.map}`}
          />
          <Pagination page={page} pageCount={12} onPageChange={setPage} />
        </Panel>

        <Panel className="cjs-gallery__section" padding="large">
          <header>
            <h2>Async feedback</h2>
            <p>Consistent loading, empty, and recoverable error treatments.</p>
          </header>
          <div className="cjs-gallery__panel-grid">
            <Card className="cjs-stack" aria-label="Loading examples">
              <Skeleton height="2.75rem" />
              <SkeletonGroup count={3} />
              <Skeleton variant="card" />
            </Card>
            <EmptyState
              title="No favorites yet"
              description="Save a map or player and it will appear here."
              action={<Button variant="secondary">Browse maps</Button>}
            />
            <ErrorState
              title="Records unavailable"
              description="The request failed. Existing content can remain visible while you retry."
              onRetry={() => undefined}
            />
          </div>
        </Panel>
      </div>
    </main>
  );
}
