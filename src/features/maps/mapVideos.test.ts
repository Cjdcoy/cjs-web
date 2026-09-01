import { describe, expect, it } from "vitest";
import { getMapVideos, parseYouTubeVideoUrl } from "./mapVideos";

describe("map videos", () => {
  it("resolves a source-neutral multi-video catalog by normalized map name", () => {
    const videos = getMapVideos(" MP_CHILLI ");

    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.label)).toEqual(["125 fps showcase", "250 fps speedrun"]);
    expect(videos[0]?.watchUrl).toBe("https://www.youtube.com/watch?v=_EOjiEGgqGE");
    expect(videos[0]?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/_EOjiEGgqGE");
  });

  it("preserves route chapters that share one YouTube video", () => {
    const videos = getMapVideos("jm_warmup");

    expect(videos).toHaveLength(5);
    expect(videos.map((video) => video.route)).toEqual(["Easy", "Inter", "Hard", "Extreme", "250"]);
    expect(videos.map((video) => video.startSeconds)).toEqual([undefined, 45, 105, 214, 351]);
    expect(videos[1]?.watchUrl).toContain("&t=45s");
    expect(videos[1]?.embedUrl).toContain("?start=45");
  });

  it("adds a valid API YouTube link when the catalog has no matching video", () => {
    const videos = getMapVideos("map_without_catalog_entry", "https://youtu.be/dQw4w9WgXcQ?t=1m5s");

    expect(videos).toEqual([
      expect.objectContaining({
        label: "Map video",
        startSeconds: 65,
        videoId: "dQw4w9WgXcQ",
      }),
    ]);
  });

  it("does not duplicate a catalog video supplied by the API", () => {
    expect(getMapVideos("mp_chilli", "https://www.youtube.com/watch?v=_EOjiEGgqGE")).toHaveLength(
      2,
    );
  });

  it("accepts known YouTube URL forms and rejects untrusted media URLs", () => {
    expect(parseYouTubeVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ?t=75")).toEqual({
      startSeconds: 75,
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeVideoUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseYouTubeVideoUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseYouTubeVideoUrl("https://example.invalid/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
