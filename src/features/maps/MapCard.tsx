import { CalendarDays, Film, Heart, Map as MapIcon, Route, Trophy } from "lucide-react";
import { Badge, Card, IconButton, Link } from "../../components/ui";
import type { Fps, Source } from "../../lib/api";
import { mapDetailPath } from "../../lib/routing";
import { getDifficultyLabel, getMapDifficulty, type PreparedMap } from "./mapDiscovery";

export interface MapCardProps {
  item: PreparedMap;
  source: Source;
  fps: Fps;
  favorite: boolean;
  onToggleFavorite: () => void;
}

const numberFormatter = new Intl.NumberFormat("en");
const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function MapCard({ favorite, fps, item, onToggleFavorite, source }: MapCardProps) {
  const { map } = item;
  const difficulty = getMapDifficulty(map, fps);
  const detailsPath = mapDetailPath(map.mapid, { source });

  return (
    <Card className="cjs-map-card" padding="none">
      <Link
        className="cjs-map-card__art"
        href={detailsPath}
        aria-label={`View details for ${map.mapname}`}
      >
        <span aria-hidden="true">{map.mapname.slice(0, 2).toUpperCase()}</span>
        <MapIcon aria-hidden="true" size={32} />
      </Link>

      <div className="cjs-map-card__identity">
        <div className="cjs-map-card__heading">
          <div>
            <Link href={detailsPath} variant="standalone">
              {map.mapname}
            </Link>
            <p>{map.author?.trim() ? `by ${map.author}` : "Author not available"}</p>
          </div>
          <IconButton
            className="cjs-map-card__favorite"
            label={`${favorite ? "Remove" : "Add"} ${map.mapname} ${favorite ? "from" : "to"} favorites`}
            variant="ghost"
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            <Heart aria-hidden="true" size={18} fill={favorite ? "currentColor" : "none"} />
          </IconButton>
        </div>

        <div className="cjs-map-card__badges">
          <Badge icon={<Route size={14} />}>{map.type?.trim() || "Route type unavailable"}</Badge>
          <Badge tone={item.hasMedia ? "information" : "neutral"} icon={<Film size={14} />}>
            {item.hasMedia ? "Video available" : "No video listed"}
          </Badge>
        </div>
      </div>

      <dl className="cjs-map-card__metrics">
        <div>
          <dt>
            <Trophy aria-hidden="true" size={15} />
            {fps} FPS difficulty
          </dt>
          <dd>
            <strong>{getDifficultyLabel(difficulty)}</strong>
            <span>{difficulty === null ? "No rating" : `${difficulty.toFixed(1)} / 10`}</span>
          </dd>
        </div>
        <div>
          <dt>Completions</dt>
          <dd>
            <strong>{numberFormatter.format(item.completionCount)}</strong>
            <span>{numberFormatter.format(map.difficulty?.[fps]?.nb_tops ?? 0)} recorded tops</span>
          </dd>
        </div>
        <div>
          <dt>
            <CalendarDays aria-hidden="true" size={15} />
            Released
          </dt>
          <dd>
            <strong>{formatReleaseDate(item.releaseTime)}</strong>
            <span>{item.releaseTime === null ? "Metadata unavailable" : "Published map date"}</span>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function formatReleaseDate(timestamp: number | null): string {
  return timestamp === null ? "Unknown" : dateFormatter.format(new Date(timestamp));
}
