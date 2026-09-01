import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMapVideos } from "./mapVideos";
import { MapVideos } from "./MapVideos";

describe("MapVideos", () => {
  let onPlayerStateChange: ((event: { data: number }) => void) | undefined;
  const destroyPlayer = vi.fn();

  beforeEach(() => {
    onPlayerStateChange = undefined;
    destroyPlayer.mockClear();
    window.YT = {
      Player: class {
        constructor(
          _element: HTMLIFrameElement,
          options: { events: { onStateChange(event: { data: number }): void } },
        ) {
          onPlayerStateChange = options.events.onStateChange;
        }

        destroy() {
          destroyPlayer();
        }
      },
    };
  });

  afterEach(() => {
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    destroyPlayer.mockClear();
  });

  it("opens the privacy-enhanced player in a large dialog only after interaction", async () => {
    const user = userEvent.setup();
    render(<MapVideos mapName="mp_chilli" videos={getMapVideos("mp_chilli")} />);

    expect(screen.getByRole("heading", { name: "Map videos" })).toBeVisible();
    expect(screen.queryByText(/available for mp_chilli/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /watch on youtube/i })).toHaveClass(
      "cjs-map-videos__external-link",
    );
    expect(screen.queryByTitle(/mp_chilli:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Play 125 FPS showcase for mp_chilli" }));

    const dialog = screen.getByRole("dialog", { name: "125 FPS showcase" });
    const iframe = screen.getByTitle("mp_chilli: 125 FPS showcase");
    const playerUrl = new URL(iframe.getAttribute("src") ?? "");
    expect(dialog).toHaveAttribute("open");
    expect(playerUrl.origin).toBe("https://www.youtube-nocookie.com");
    expect(playerUrl.searchParams.get("autoplay")).toBe("1");
    expect(playerUrl.searchParams.get("enablejsapi")).toBe("1");
    expect(playerUrl.searchParams.get("origin")).toBe(window.location.origin);
  });

  it("returns to the focused preview when YouTube reports that playback paused", async () => {
    const user = userEvent.setup();
    render(<MapVideos mapName="mp_chilli" videos={getMapVideos("mp_chilli")} />);
    const preview = screen.getByRole("button", {
      name: "Play 125 FPS showcase for mp_chilli",
    });

    await user.click(preview);
    await waitFor(() => expect(onPlayerStateChange).toBeDefined());
    act(() => onPlayerStateChange?.({ data: 2 }));

    await waitFor(() => expect(screen.queryByTitle(/mp_chilli:/)).not.toBeInTheDocument());
    expect(preview).toHaveFocus();
    expect(destroyPlayer).toHaveBeenCalledOnce();
  });

  it("closes the large player from its close control or backdrop", async () => {
    const user = userEvent.setup();
    render(<MapVideos mapName="mp_chilli" videos={getMapVideos("mp_chilli")} />);
    const preview = screen.getByRole("button", {
      name: "Play 125 FPS showcase for mp_chilli",
    });

    await user.click(preview);
    await user.click(screen.getByRole("button", { name: "Close large video" }));
    expect(screen.queryByTitle(/mp_chilli:/)).not.toBeInTheDocument();
    expect(preview).toHaveFocus();

    await user.click(preview);
    fireEvent.click(screen.getByRole("dialog", { name: "125 FPS showcase" }));
    expect(screen.queryByTitle(/mp_chilli:/)).not.toBeInTheDocument();
    expect(preview).toHaveFocus();
  });

  it("switches among multiple previews before opening the selected video", async () => {
    const user = userEvent.setup();
    render(<MapVideos mapName="mp_chilli" videos={getMapVideos("mp_chilli")} />);

    await user.click(screen.getByRole("button", { name: /250 FPS speedrun/ }));

    expect(screen.queryByTitle(/mp_chilli:/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play 250 FPS speedrun for mp_chilli" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=_cH-JyqFdRM",
    );

    await user.click(screen.getByRole("button", { name: "Play 250 FPS speedrun for mp_chilli" }));
    expect(screen.getByRole("dialog", { name: "250 FPS speedrun" })).toBeVisible();
    expect(screen.getByTitle("mp_chilli: 250 FPS speedrun")).toBeVisible();
  });
});
