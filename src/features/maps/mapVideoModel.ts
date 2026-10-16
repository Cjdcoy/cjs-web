import { mapVideoCatalog, type MapVideoCatalogEntry } from "./mapVideoCatalog";

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const youtubeHosts = new Set([
  "m.youtube.com",
  "music.youtube.com",
  "www.youtube.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "youtube.com",
  "youtube-nocookie.com",
]);

export interface MapVideo {
  embedUrl: string;
  key: string;
  label: string;
  route?: string;
  startSeconds?: number;
  thumbnailUrl: string;
  videoId: string;
  watchUrl: string;
}

interface ParsedYouTubeVideo {
  startSeconds?: number;
  videoId: string;
}

export function getMapVideos(mapName: string, apiMediaUrl?: string | null): readonly MapVideo[] {
  const catalogEntries = mapVideoCatalog[normalizeMapName(mapName)] ?? [];
  const videos = catalogEntries.map(createMapVideo);
  const apiVideo = parseYouTubeVideoUrl(apiMediaUrl);

  if (apiVideo && !videos.some((video) => video.videoId === apiVideo.videoId)) {
    videos.push(createMapVideo({ ...apiVideo, label: "Map video" }));
  }

  return videos;
}

export function hasMapVideos(mapName: string, apiMediaUrl?: string | null): boolean {
  return Boolean(
    mapVideoCatalog[normalizeMapName(mapName)]?.length || parseYouTubeVideoUrl(apiMediaUrl),
  );
}

export function parseYouTubeVideoUrl(value: string | null | undefined): ParsedYouTubeVideo | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !youtubeHosts.has(host)) return null;

    const pathParts = url.pathname.split("/").filter(Boolean);
    const videoId =
      host === "youtu.be"
        ? pathParts[0]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["embed", "live", "shorts"].includes(pathParts[0] ?? "")
            ? pathParts[1]
            : null;

    if (!videoId || !youtubeVideoIdPattern.test(videoId)) return null;

    const startSeconds = parseYouTubeStartTime(
      url.searchParams.get("start") ?? url.searchParams.get("t"),
    );
    return { videoId, ...(startSeconds ? { startSeconds } : {}) };
  } catch {
    return null;
  }
}

function createMapVideo(entry: MapVideoCatalogEntry): MapVideo {
  const startQuery = entry.startSeconds ? `&t=${entry.startSeconds}s` : "";
  const embedQuery = entry.startSeconds ? `?start=${entry.startSeconds}` : "";

  return {
    embedUrl: `https://www.youtube-nocookie.com/embed/${entry.videoId}${embedQuery}`,
    key: `${entry.videoId}:${entry.startSeconds ?? 0}:${entry.route ?? ""}`,
    label: entry.label,
    ...(entry.route ? { route: entry.route } : {}),
    ...(entry.startSeconds ? { startSeconds: entry.startSeconds } : {}),
    thumbnailUrl: `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
    videoId: entry.videoId,
    watchUrl: `https://www.youtube.com/watch?v=${entry.videoId}${startQuery}`,
  };
}

function normalizeMapName(value: string): string {
  return value.trim().toLowerCase();
}

function parseYouTubeStartTime(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return seconds > 0 ? seconds : undefined;
  }

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return undefined;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return seconds > 0 ? seconds : undefined;
}
