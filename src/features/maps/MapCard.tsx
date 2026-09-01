import { CalendarDays, Heart, Map as MapIcon, Play, Trophy } from "lucide-react";
import { useState } from "react";
import { Card, IconButton, Link } from "../../components/ui";
import type { Fps, Source } from "../../lib/api";
import { getMapImageSources } from "../../lib/mapImages";
import { mapDetailPath } from "../../lib/routing";
import { getMapDifficulty, type PreparedMap } from "./mapDiscovery";
import { getSafeMediaUrl } from "./mapDetailModel";
import { getMapVideos } from "./mapVideos";

export interface MapCardProps {
  item: PreparedMap;
  source: Source;
  fps: Fps;
  favorite: boolean;
  onToggleFavorite: () => void;
}

const numberFormatter = new Intl.NumberFormat("en");
const DISPLAY_FPS_VALUES = ["43", "76", "125", "250", "333"] as const satisfies readonly Fps[];
const dateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function MapCard({ favorite, fps, item, onToggleFavorite, source }: MapCardProps) {
  const { map } = item;
  const imageSources = getMapImageSources(map.mapname);
  const routeName = map.ender === null || map.ender === undefined ? "" : String(map.ender).trim();
  const mediaUrl = getSafeMediaUrl(map.video);
  const mapVideos = getMapVideos(map.mapname, map.video);
  const [failedImagePath, setFailedImagePath] = useState<string | null>(null);
  const difficultyRatings = DISPLAY_FPS_VALUES.flatMap((ratingFps) => {
    const value = getMapDifficulty(map, ratingFps);
    return value === null ? [] : [{ fps: ratingFps, value }];
  });
  const detailsPath = mapDetailPath(map.mapid, { source });

  return (
    <Card className="cjs-map-card" padding="none">
      <Link
        className="cjs-map-card__art"
        href={detailsPath}
        aria-label={`View details for ${map.mapname}`}
      >
        {failedImagePath !== imageSources.card ? (
          <img
            className="cjs-map-card__image"
            src={imageSources.card}
            srcSet={imageSources.srcSet}
            sizes="(max-width: 48rem) 100vw, 18rem"
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailedImagePath(imageSources.card)}
          />
        ) : (
          <>
            <span aria-hidden="true">{map.mapname.slice(0, 2).toUpperCase()}</span>
            <MapIcon aria-hidden="true" size={32} />
          </>
        )}
      </Link>

      <div className="cjs-map-card__identity">
        <div className="cjs-map-card__heading">
          <div>
            <div className="cjs-map-card__title-line">
              <Link className="cjs-map-card__title-link" href={detailsPath} variant="standalone">
                {map.mapname}
              </Link>
              {routeName && <span className="cjs-map-card__route-name">({routeName})</span>}
              {mapVideos.length > 0 ? (
                <Link
                  className="cjs-map-card__video-link"
                  href={`${detailsPath}#map-videos`}
                  aria-label={`View ${mapVideos.length === 1 ? "one video" : `${mapVideos.length} videos`} for ${map.mapname}`}
                >
                  <span className="cjs-map-card__youtube-mark" aria-hidden="true">
                    <Play size={10} fill="currentColor" />
                  </span>
                </Link>
              ) : mediaUrl ? (
                <Link
                  className="cjs-map-card__video-link"
                  href={mediaUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Watch YouTube video for ${map.mapname} (opens in a new tab)`}
                >
                  <span className="cjs-map-card__youtube-mark" aria-hidden="true">
                    <Play size={10} fill="currentColor" />
                  </span>
                </Link>
              ) : null}
            </div>
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

        <div className="cjs-map-card__difficulty">
          <span className="cjs-map-card__difficulty-label">
            <Trophy aria-hidden="true" size={14} />
            Difficulty by FPS
          </span>
          {difficultyRatings.length > 0 ? (
            <ul className="cjs-map-card__difficulty-list" aria-label="Difficulty ratings by FPS">
              {difficultyRatings.map((rating) => (
                <li
                  key={rating.fps}
                  data-selected={rating.fps === fps || undefined}
                  aria-label={`${rating.fps} FPS difficulty ${rating.value.toFixed(2)} out of 10`}
                >
                  <span>{rating.fps}</span>
                  <strong>{rating.value.toFixed(2)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <span className="cjs-map-card__difficulty-empty">No FPS ratings</span>
          )}
        </div>
      </div>

      <dl className="cjs-map-card__metrics">
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
