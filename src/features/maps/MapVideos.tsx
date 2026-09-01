import { ExternalLink, Play, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Link, VisuallyHidden } from "../../components/ui";
import type { MapVideo } from "./mapVideos";

const youtubeIframeApiUrl = "https://www.youtube.com/iframe_api";
const youtubePausedState = 2;

interface YouTubePlayer {
  destroy(): void;
}

interface YouTubePlayerApi {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onStateChange(event: { data: number }): void;
      };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubePlayerApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeIframeApiPromise: Promise<YouTubePlayerApi> | null = null;

export interface MapVideosProps {
  mapName: string;
  videos: readonly MapVideo[];
}

export function MapVideos({ mapName, videos }: MapVideosProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const wasPlayingRef = useRef(false);
  const activeVideo = videos[activeIndex] ?? videos[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isPlaying && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }

    if (!isPlaying && wasPlayingRef.current) {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
      previewRef.current?.focus();
    }

    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || !activeVideo) return;

    let player: YouTubePlayer | null = null;
    let cancelled = false;

    void loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !iframeRef.current) return;
        player = new youtube.Player(iframeRef.current, {
          events: {
            onStateChange(event) {
              if (event.data === youtubePausedState) setIsPlaying(false);
            },
          },
        });
      })
      .catch(() => {
        // The video remains usable when player-state enhancement is unavailable.
      });

    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [activeVideo, isPlaying]);

  if (!activeVideo) return null;

  const activeLabel = getVideoDisplayLabel(activeVideo);

  return (
    <section className="cjs-map-videos" id="map-videos" aria-labelledby="map-videos-heading">
      <div className="cjs-map-videos__header">
        <h2 id="map-videos-heading" className="cjs-map-detail__eyebrow">
          <Video aria-hidden="true" size={15} />
          Map videos
        </h2>
      </div>

      <div className="cjs-map-videos__content" data-has-playlist={videos.length > 1 || undefined}>
        <div className="cjs-map-videos__featured">
          <div className="cjs-map-videos__player">
            <button
              ref={previewRef}
              className="cjs-map-videos__preview"
              type="button"
              aria-haspopup="dialog"
              aria-label={`Play ${activeLabel} for ${mapName}`}
              onClick={() => setIsPlaying(true)}
            >
              <img
                src={activeVideo.thumbnailUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span className="cjs-map-videos__play">
                <Play aria-hidden="true" fill="currentColor" size={22} />
                Play video
              </span>
            </button>
          </div>
          <div className="cjs-map-videos__caption">
            <strong>{activeLabel}</strong>
            <Link
              className="cjs-map-videos__external-link"
              href={activeVideo.watchUrl}
              target="_blank"
              rel="noreferrer noopener"
              variant="muted"
            >
              Watch on YouTube
              <ExternalLink aria-hidden="true" size={14} />
              <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
            </Link>
          </div>
        </div>

        {videos.length > 1 && (
          <div className="cjs-map-videos__playlist" aria-label="Choose a map video">
            <p>Choose a video</p>
            <div>
              {videos.map((video, index) => (
                <Button
                  key={video.key}
                  size="small"
                  variant="secondary"
                  aria-pressed={index === activeIndex}
                  onClick={() => {
                    setActiveIndex(index);
                    setIsPlaying(false);
                  }}
                >
                  <span>{index + 1}</span>
                  {getVideoDisplayLabel(video)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Native dialogs receive backdrop clicks and Escape before focus returns to the preview. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialogRef}
        className="cjs-map-videos__dialog"
        aria-modal="true"
        aria-labelledby="map-video-dialog-heading"
        onCancel={(event) => {
          event.preventDefault();
          setIsPlaying(false);
        }}
        onClose={() => setIsPlaying(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setIsPlaying(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setIsPlaying(false);
          }
        }}
      >
        <div className="cjs-map-videos__dialog-content">
          <div className="cjs-map-videos__dialog-header">
            <div>
              <p className="cjs-map-detail__eyebrow">Map video</p>
              <h2 id="map-video-dialog-heading">{activeLabel}</h2>
            </div>
            <IconButton
              label="Close large video"
              variant="ghost"
              onClick={() => setIsPlaying(false)}
            >
              <X aria-hidden="true" size={20} />
            </IconButton>
          </div>
          <div className="cjs-map-videos__dialog-player">
            {isPlaying && (
              <iframe
                ref={iframeRef}
                key={activeVideo.key}
                src={getYouTubePlayerUrl(activeVideo.embedUrl)}
                title={`${mapName}: ${activeLabel}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
        </div>
      </dialog>
    </section>
  );
}

function getYouTubePlayerUrl(embedUrl: string): string {
  const url = new URL(embedUrl);
  const origin = window.location.origin === "null" ? "http://localhost" : window.location.origin;
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("origin", origin);
  return url.toString();
}

function loadYouTubeIframeApi(): Promise<YouTubePlayerApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise<YouTubePlayerApi>((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube iframe API loaded without a Player constructor."));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${youtubeIframeApiUrl}"]`,
    );
    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => reject(new Error("YouTube iframe API failed.")),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = youtubeIframeApiUrl;
    script.async = true;
    script.addEventListener(
      "error",
      () => {
        youtubeIframeApiPromise = null;
        reject(new Error("YouTube iframe API failed."));
      },
      { once: true },
    );
    document.head.append(script);
  });

  return youtubeIframeApiPromise;
}

function getVideoDisplayLabel(video: MapVideo): string {
  const label = video.label
    .replace(/\bfps\b/gi, "FPS")
    .replace(/^./, (value) => value.toUpperCase());
  return video.route ? `${video.route} route · ${label}` : label;
}
