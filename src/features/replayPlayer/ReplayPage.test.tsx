import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { replayMetaFixture, replaySamplesFixture } from "../../lib/api/__fixtures__/responses";
import { ApiError, createCjsApiForBases } from "../../lib/api";
import { normalizeReplaySamples } from "../../lib/api/normalizers";
import type { MapViewerProps } from "../mapViewer";
import { replayWebViewHandlers } from "../../test/replayWebViewHandlers";
import { server } from "../../test/server";
import { ReplayPage } from "./ReplayPage";
import type { ReplaySamplesApi } from "./useReplaySamples";

const viewerProps = vi.hoisted(() => ({ current: null as MapViewerProps | null }));

vi.mock("../mapViewer", () => ({
  VIEW_FIELD_OF_VIEW: 65,
  MapViewer: (props: MapViewerProps) => {
    viewerProps.current = props;
    return (
      <>
        <div role="application" aria-label={`3D view of ${props.mapName}`}>
          {props.overlay}
        </div>
        {typeof props.children === "function" ? props.children(null) : props.children}
      </>
    );
  },
}));

const samples = normalizeReplaySamples(
  {
    ...replaySamplesFixture,
    duration_ms: 20_000,
    t: [0, 10_000, 20_000],
    markers: [
      { t: 0, kind: "checkpoint", cp_id: 3 },
      { t: 6_000, kind: "save" },
      { t: 10_000, kind: "load" },
      { t: 20_000, kind: "finish" },
    ],
  },
  "/api/v1/replay/samples",
);

const hudSamples = normalizeReplaySamples(
  {
    ...replaySamplesFixture,
    duration_ms: 20_000,
    t: [0, 10_000, 20_000],
    vel: [300, 400, 0, 600, 0, 0, 600, 0, 0],
    flags: [4, 4, 4],
    input: [288, 288, 288],
    run_fps: 250,
    skips: [{ start_t: 100, target_t: 10_000, fails: 1 }],
    markers: [
      { t: 0, kind: "fps", fps: 333 },
      { t: 10_000, kind: "load" },
    ],
  },
  "/api/v1/replay/samples",
);

const storageValues = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => void storageValues.set(key, value),
};

/** A v11 run: meta first, then the samples. */
const metaV11 = { ...replayMetaFixture, format_version: 11 };

function apiReturning(result: Promise<typeof samples>): ReplaySamplesApi {
  return {
    replayMeta: vi.fn(async () => metaV11),
    replayFrames: vi.fn(),
    replaySamples: vi.fn(() => result),
  };
}

function httpError(status: number): ApiError {
  return new ApiError({
    kind: "http",
    message: `API request failed (${status}) for /api/v2/replay/samples`,
    path: "/api/v2/replay/samples",
    status,
  });
}

describe("ReplayPage", () => {
  beforeEach(() => {
    viewerProps.current = null;
    window.history.replaceState(null, "", "/replays/7001");
    storageValues.clear();
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "https://models.example.test/maps");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("draws the HUD, auto-skips failed attempts, and remembers the toggles", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />,
    );

    const hud = await screen.findByRole("group", { name: "HUD" });
    expect(container.querySelector(".cjs-replay-hud")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".cjs-replay-hud__speed")).toHaveTextContent("500");
    expect(container.querySelector(".cjs-replay-hud__fps")).toHaveTextContent("333 fps");
    // input 288 = forward (32) + right (256): W and D bright, the rest dim.
    const keys = [...container.querySelectorAll(".cjs-replay-hud__key")];
    expect(keys.map((key) => key.textContent)).toEqual(["W", "A", "S", "D", "C", "Space", "Ctrl"]);
    expect(
      keys.filter((key) => key.hasAttribute("data-pressed")).map((key) => key.textContent),
    ).toEqual(["W", "D"]);
    expect(container.querySelectorAll(".cjs-replay-hud__line")).toHaveLength(3);
    expect(container.querySelectorAll(".cjs-replay-hud__bar")).toHaveLength(2);
    expect(container.querySelector("[data-zone]")).toHaveAttribute("data-zone", "deadzone");
    expect(within(hud).queryByText(/real-world scale/)).not.toBeInTheDocument();
    // Position and jump timer start off; on, they show the feet origin and white 0 at the start.
    expect(container.querySelector(".cjs-replay-hud__position")).not.toBeInTheDocument();
    await user.click(within(hud).getByRole("checkbox", { name: "Position" }));
    await user.click(within(hud).getByRole("checkbox", { name: "Jumptimer" }));
    expect(container.querySelector(".cjs-replay-hud__position")?.textContent).toBe(
      "0.00 0.00 0.00\n0.00 90.00 0.00",
    );
    expect(container.querySelector(".cjs-replay-hud__jump-timer")).toHaveTextContent(/^0$/);
    expect(within(hud).getByText("Auto-skip: ON")).toBeInTheDocument();
    expect(viewerProps.current?.viewmodel).toMatchObject({
      url: "https://models.example.test/maps/viewmodel/luger_mp2.glb",
      visible: false,
    });

    await user.selectOptions(screen.getByRole("combobox", { name: "Speed" }), "4");
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(await within(hud).findByText("Auto-skip: ON · Skipped 1 fails")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pause" }));

    await user.click(within(hud).getByRole("checkbox", { name: "Speed" }));
    expect(container.querySelector(".cjs-replay-hud__speed")).not.toBeInTheDocument();
    expect(JSON.parse(storageValues.get("cjs.replay-hud") ?? "{}")).toMatchObject({
      version: 1,
      speed: false,
    });

    await user.click(within(hud).getByRole("checkbox", { name: "Draw gun" }));
    expect(viewerProps.current?.viewmodel?.visible).toBe(true);
    act(() => viewerProps.current?.viewmodel?.onUnavailable());
    expect(within(hud).getByRole("checkbox", { name: /Draw gun/ })).toBeDisabled();
    expect(within(hud).getByText("(weapon model unavailable)")).toBeInTheDocument();
  });

  it("opens the shortcuts dialog from a button or ?, listing the view mode keys", async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.showModal = showModal;
    const user = userEvent.setup();
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    await user.click(await screen.findByRole("button", { name: "Keyboard shortcuts" }));
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveTextContent(
      /CFree camera on or off.*FFull screen on or off.*TCinema mode on or off/,
    );
    act(() => screen.getByRole("dialog", { name: "Keyboard shortcuts" }).removeAttribute("open"));
    await user.keyboard("?");
    expect(showModal).toHaveBeenCalledTimes(2);
    act(() => screen.getByRole("dialog", { name: "Keyboard shortcuts" }).removeAttribute("open"));
  });

  it("switches between cinema and full screen, auto-hides full-screen controls, and leaves with Esc", async () => {
    // jsdom has no Fullscreen API, so both modes use the in-page overlay.
    vi.useFakeTimers();
    try {
      render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);
      await act(() => vi.advanceTimersByTimeAsync(0));
      const player = screen.getByRole("region", { name: "Replay player" });
      const cinema = screen.getByRole("button", { name: "Cinema" });

      fireEvent.click(cinema);
      expect(player).toHaveAttribute("data-view", "cinema");
      expect(player).not.toHaveAttribute("data-controls");
      expect(cinema).toHaveAttribute("aria-pressed", "true");
      expect(window.location.search).toBe("");

      // Straight from cinema into full screen, whose controls start hidden.
      fireEvent.keyDown(document.body, { key: "f" });
      expect(player).toHaveAttribute("data-view", "fullscreen");
      expect(player).toHaveAttribute("data-controls", "hidden");
      expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();

      fireEvent.pointerMove(player);
      expect(player).not.toHaveAttribute("data-controls");
      act(() => vi.advanceTimersByTime(2_400));
      expect(player).not.toHaveAttribute("data-controls");
      act(() => vi.advanceTimersByTime(100));
      expect(player).toHaveAttribute("data-controls", "hidden");

      // An open dialog keeps them up.
      const dialog = player.querySelector("dialog") as HTMLDialogElement;
      fireEvent.focusIn(player);
      act(() => dialog.setAttribute("open", ""));
      act(() => vi.advanceTimersByTime(5_000));
      expect(player).not.toHaveAttribute("data-controls");
      act(() => dialog.removeAttribute("open"));
      act(() => vi.advanceTimersByTime(2_500));
      expect(player).toHaveAttribute("data-controls", "hidden");

      fireEvent.keyDown(document.body, { key: "t" });
      expect(player).toHaveAttribute("data-view", "cinema");
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(player).not.toHaveAttribute("data-view");
      expect(cinema).toHaveAttribute("aria-pressed", "false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("mutes with the volume icon or M, restores the last volume, and remembers it", async () => {
    server.use(
      http.get("*/sounds/sounds.json", () =>
        HttpResponse.json({ surfaceTypes: ["none"], rules: { footsteps: {} } }),
      ),
    );
    const user = userEvent.setup();
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    const volume = await screen.findByRole("slider", { name: "Volume" });
    expect(volume).toHaveAttribute("aria-valuetext", "50%");
    expect(screen.queryByRole("checkbox", { name: /Sound/ })).not.toBeInTheDocument();
    fireEvent.change(volume, { target: { value: "0.8" } });
    act(() => document.body.focus());
    await user.keyboard("m");
    expect(volume).toHaveAttribute("aria-valuetext", "0%");
    expect(JSON.parse(storageValues.get("cjs.replay-hud") ?? "{}")).toMatchObject({ volume: 0 });

    await user.click(screen.getByRole("button", { name: "Unmute" }));
    expect(volume).toHaveAttribute("aria-valuetext", "80%");
    await user.click(screen.getByRole("button", { name: "Mute" }));
    expect(volume).toHaveAttribute("aria-valuetext", "0%");
  });

  it("starts audio when the volume is raised from 0 during playback", async () => {
    server.use(
      http.get("*/sounds/sounds.json", () =>
        HttpResponse.json({ surfaceTypes: ["none"], rules: { footsteps: {} } }),
      ),
    );
    const contexts: unknown[] = [];
    vi.stubGlobal(
      "AudioContext",
      class {
        destination = {};
        constructor() {
          contexts.push(this);
        }
        createGain() {
          return { gain: { value: 0 }, connect: vi.fn() };
        }
        resume() {
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
      },
    );
    const user = userEvent.setup();
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    const volume = await screen.findByRole("slider", { name: "Volume" });
    fireEvent.change(volume, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(contexts).toHaveLength(0);

    fireEvent.change(volume, { target: { value: "0.3" } });
    expect(contexts).toHaveLength(1);
  });

  it("keeps a replay muted by the retired sound toggle silent", async () => {
    storageValues.set("cjs.replay-hud", JSON.stringify({ version: 1, sound: false, volume: 0.5 }));
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    expect(await screen.findByRole("slider", { name: "Volume" })).toHaveAttribute(
      "aria-valuetext",
      "0%",
    );
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
  });

  it("turns the crosshair off and remembers it", async () => {
    const user = userEvent.setup();
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    const hud = await screen.findByRole("group", { name: "HUD" });
    const crosshair = within(hud).getByRole("checkbox", { name: "Crosshair" });
    expect(crosshair).toBeChecked();
    expect(viewerProps.current?.crosshair).toBe(true);
    await user.click(crosshair);
    expect(viewerProps.current?.crosshair).toBe(false);
    expect(JSON.parse(storageValues.get("cjs.replay-hud") ?? "{}")).toMatchObject({
      crosshair: false,
    });
  });

  it("sets the map brightness from a remembered percentage slider", async () => {
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    const brightness = await screen.findByRole("slider", { name: "Brightness" });
    expect(brightness).toHaveAttribute("aria-valuetext", "130%");
    expect(viewerProps.current?.brightness).toBe(1.3);

    fireEvent.change(brightness, { target: { value: "1.75" } });
    expect(brightness).toHaveAttribute("aria-valuetext", "175%");
    expect(viewerProps.current?.brightness).toBe(1.75);
    expect(JSON.parse(storageValues.get("cjs.replay-hud") ?? "{}")).toMatchObject({
      brightness: 1.75,
    });
  });

  it("marks sound unavailable when the manifest is missing", async () => {
    server.use(http.get("*/sounds/sounds.json", () => new HttpResponse(null, { status: 404 })));
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(hudSamples))} runId="7001" />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sound unavailable" })).toBeDisabled(),
    );
    expect(screen.getByRole("slider", { name: "Volume" })).toBeDisabled();
  });

  it("disables HUD toggles an older replay cannot drive", async () => {
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(samples))} runId="7001" />);

    const hud = await screen.findByRole("group", { name: "HUD" });
    expect(
      within(hud).getByRole("checkbox", { name: /^Anglehelper\s*\(not recorded/ }),
    ).toBeDisabled();
    expect(within(hud).getByRole("checkbox", { name: /FPS/ })).toBeDisabled();
    expect(within(hud).getByRole("checkbox", { name: /Keys/ })).toBeDisabled();
    expect(within(hud).getByRole("checkbox", { name: /Auto-skip fails/ })).toBeDisabled();
    expect(within(hud).getByRole("checkbox", { name: "Speed" })).toBeChecked();
    expect(within(hud).queryByText(/Auto-skip:/)).not.toBeInTheDocument();
  });

  it("plays a replay on its map with accessible, keyboard-operable controls", async () => {
    const user = userEvent.setup();
    const apiClient = apiReturning(Promise.resolve(samples));
    const { container } = render(<ReplayPage apiClient={apiClient} runId="7001" />);

    expect(
      await screen.findByRole("application", { name: "3D view of mp_cjs_training" }),
    ).toBeVisible();
    expect(apiClient.replaySamples).toHaveBeenCalledWith({
      runId: 7001,
      signal: expect.any(AbortSignal),
      source: "j4l",
    });
    expect(viewerProps.current?.modelUrl).toBe(
      "https://models.example.test/maps/mp_cjs_training.glb",
    );
    expect(screen.getByRole("link", { name: "Runner" })).toHaveAttribute(
      "href",
      "/players/501?source=j4l",
    );
    expect(screen.getByRole("list", { name: "Timeline markers" })).toHaveTextContent(
      "Saves: 1Loads: 1Checkpoints: 1Finish: 1",
    );
    const slider = screen.getByRole("slider", { name: "Replay position" });
    expect(slider).toHaveAttribute("aria-valuetext", "00:00.00 of 00:20.00");

    // The camera follows the eye: feet origin plus the standing view height.
    expect(viewerProps.current?.getFrame?.()).toEqual({
      follow: true,
      pose: { x: 0, y: 0, z: 60, pitch: 0, yaw: 90 },
      weapon: expect.objectContaining({ lean: 0, meleeMs: null, raiseMs: null }),
    });

    await user.keyboard("n");
    expect(slider).toHaveAttribute("aria-valuetext", "00:06.00 of 00:20.00");
    expect(screen.getByText("Save at 00:06.00")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuetext", "00:11.00 of 00:20.00");
    await user.click(screen.getByRole("button", { name: "Previous save or load" }));
    expect(slider).toHaveAttribute("aria-valuetext", "00:10.00 of 00:20.00");

    await user.keyboard("]");
    expect(screen.getByRole("combobox", { name: "Speed" })).toHaveValue("2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Speed" }), "0.25");
    expect(screen.getByRole("combobox", { name: "Speed" })).toHaveValue("0.25");

    const freeCamera = screen.getByRole("button", { name: "Free camera" });
    // Shortcuts never steal keys from a focused select.
    await user.keyboard("c");
    expect(freeCamera).toHaveAttribute("aria-pressed", "false");
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await user.keyboard("c");
    expect(freeCamera).toHaveAttribute("aria-pressed", "true");
    expect(viewerProps.current?.getFrame?.()?.follow).toBe(false);

    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    await user.keyboard("k");
    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();

    const results = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it("shows view counts and a toggleable watch heat strip when view analytics are on", async () => {
    vi.stubEnv("VITE_REPLAY_VIEW_ANALYTICS", "1");
    server.use(...replayWebViewHandlers);
    const user = userEvent.setup();
    const { container } = render(
      <ReplayPage apiClient={apiReturning(Promise.resolve(samples))} runId="7001" />,
    );

    expect(await screen.findByText("1.2K web views · 340 in-game")).toBeVisible();
    const hud = screen.getByRole("group", { name: "HUD" });
    const toggle = await within(hud).findByRole("checkbox", { name: "Watch heat" });
    await waitFor(() => expect(toggle).toBeChecked());
    expect(container.querySelector(".cjs-replay-player__heat")).toBeInTheDocument();
    expect(screen.getByText("Most watched: 0:05–0:15")).toBeInTheDocument();

    await user.click(toggle);
    expect(container.querySelector(".cjs-replay-player__heat")).not.toBeInTheDocument();
    expect(JSON.parse(storageValues.get("cjs.replay-hud") ?? "{}")).toMatchObject({
      heatmap: false,
    });
    const results = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it("explains a missing watch heat in the HUD", async () => {
    vi.stubEnv("VITE_REPLAY_VIEW_ANALYTICS", "1");
    server.use(
      http.get("*/api/v1/replay/web-view-summary", () => new HttpResponse(null, { status: 503 })),
      ...replayWebViewHandlers,
    );
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(samples))} runId="7001" />);

    const hud = await screen.findByRole("group", { name: "HUD" });
    expect(within(hud).getByText("(loading)")).toBeInTheDocument();
    expect(await within(hud).findByText("(could not load)")).toBeInTheDocument();
    expect(within(hud).getByRole("checkbox", { name: /Watch heat/ })).toBeDisabled();
  });

  it("steps one frame with the buttons or , and ., pausing playback", async () => {
    const user = userEvent.setup();
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(samples))} runId="7001" />);
    const slider = await screen.findByRole("slider", { name: "Replay position" });
    const play = () => user.click(screen.getByRole("button", { name: "Play" }));
    const expectPausedAt = (clock: string, x: number) => {
      expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
      expect(slider).toHaveAttribute("aria-valuetext", `${clock} of 00:20.00`);
      expect(viewerProps.current?.getFrame?.()?.pose.x).toBe(x);
    };

    await play();
    await user.click(screen.getByRole("button", { name: "Next frame" }));
    expectPausedAt("00:10.00", 5);
    await user.keyboard(".");
    expectPausedAt("00:20.00", 10);
    await user.keyboard(",");
    expectPausedAt("00:10.00", 5);
    // A few ms into playback, the previous frame is the sample playback started from.
    await play();
    await user.keyboard(",");
    expectPausedAt("00:10.00", 5);
    await user.click(screen.getByRole("button", { name: "Previous frame" }));
    expectPausedAt("00:00.00", 0);
    await play();
    await user.keyboard(".");
    expectPausedAt("00:10.00", 5);
  });

  it("plays to the end and stops", async () => {
    const short = { ...samples, t: [0, 50, 100] };
    render(<ReplayPage apiClient={apiReturning(Promise.resolve(short))} runId="7001" />);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Play" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Play" })).toBeVisible());
    expect(screen.getByRole("slider", { name: "Replay position" })).toHaveAttribute(
      "aria-valuetext",
      "00:00.10 of 00:00.10",
    );
  });

  it.each([
    [404, "Replay not available"],
    [400, "Replay not available"],
    [422, "Replay format not supported"],
  ])("shows a clear state for HTTP %i", async (status, title) => {
    render(<ReplayPage apiClient={apiReturning(Promise.reject(httpError(status)))} runId="9" />);

    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("plays a v12 replay decoded from its raw frames", async () => {
    // Copy: a Buffer from readFileSync may sit inside a larger pooled ArrayBuffer.
    const golden = new Uint8Array(
      readFileSync(resolve("src/features/replayPlayer/__fixtures__/replay_v12_golden.rpl")),
    );
    const requests: string[] = [];
    server.use(
      http.get("https://replay.example.test/api/v2/replay/meta", ({ request }) => {
        requests.push(request.url);
        return HttpResponse.json(replayMetaFixture);
      }),
      http.get("https://replay.example.test/api/v2/replay/frames", ({ request }) => {
        requests.push(request.url);
        return HttpResponse.arrayBuffer(golden.buffer, {
          headers: { "Content-Type": "application/octet-stream" },
        });
      }),
    );
    const apiClient = createCjsApiForBases({
      apiBase: "https://api.example.test",
      replayApiBase: "https://replay.example.test",
    });
    render(<ReplayPage apiClient={apiClient} runId="7001" />);

    expect(await screen.findByRole("application")).toBeVisible();
    expect(requests).toEqual([
      "https://replay.example.test/api/v2/replay/meta?run_id=7001&source=j4l",
      "https://replay.example.test/api/v2/replay/frames?run_id=7001&source=j4l",
    ]);
    expect(screen.getByText("Finished run")).toBeVisible();
    expect(screen.getByRole("slider", { name: "Replay position" })).toHaveAttribute(
      "aria-valuetext",
      "00:00.00 of 00:03.54",
    );
  });

  it("falls back to samples when meta answers 404", async () => {
    const replaySamples = vi.fn(async () => samples);
    render(
      <ReplayPage
        apiClient={{
          replayMeta: vi.fn(() => Promise.reject(httpError(404))),
          replayFrames: vi.fn(),
          replaySamples,
        }}
        runId="7001"
      />,
    );
    expect(await screen.findByRole("application")).toBeVisible();
    expect(replaySamples).toHaveBeenCalledTimes(1);
  });

  it("maps meta and frames failures like the samples ones", async () => {
    const { unmount } = render(
      <ReplayPage
        apiClient={{
          replayMeta: vi.fn(() => Promise.reject(httpError(400))),
          replayFrames: vi.fn(),
          replaySamples: vi.fn(),
        }}
        runId="9"
      />,
    );
    expect(await screen.findByRole("heading", { name: "Replay not available" })).toBeVisible();
    unmount();

    render(
      <ReplayPage
        apiClient={{
          replayMeta: vi.fn(async () => replayMetaFixture),
          replayFrames: vi.fn(() => Promise.reject(httpError(422))),
          replaySamples: vi.fn(),
        }}
        runId="7001"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Replay format not supported" }),
    ).toBeVisible();
  });

  it("shows a file in another replay version as unsupported", async () => {
    const v11 = new Uint8Array([0x4a, 0x34, 0x4c, 0x42, 11, 0, 50, 0]);
    render(
      <ReplayPage
        apiClient={{
          replayMeta: vi.fn(async () => replayMetaFixture),
          replayFrames: vi.fn(async () => v11.buffer),
          replaySamples: vi.fn(),
        }}
        runId="7001"
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Replay format not supported" }),
    ).toBeVisible();
  });

  it("shows a decode failure as an error", async () => {
    const apiClient: ReplaySamplesApi = {
      replayMeta: vi.fn(async () => replayMetaFixture),
      replayFrames: vi.fn(async () => new ArrayBuffer(4)),
      replaySamples: vi.fn(),
    };
    render(<ReplayPage apiClient={apiClient} runId="7001" />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("The replay file could not be decoded.")).toBeVisible();
    expect(apiClient.replaySamples).not.toHaveBeenCalled();
  });

  it("offers a retry for other failures", async () => {
    const replaySamples = vi
      .fn<ReplaySamplesApi["replaySamples"]>()
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce(samples);
    render(
      <ReplayPage
        apiClient={{ replayMeta: vi.fn(async () => metaV11), replayFrames: vi.fn(), replaySamples }}
        runId="7001"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/502/)).toBeVisible();
    await act(async () => {
      within(alert).getByRole("button", { name: "Retry loading the replay" }).click();
    });

    expect(await screen.findByRole("application")).toBeVisible();
    expect(replaySamples).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid links and stays hidden without map models, without requesting data", () => {
    const apiClient = apiReturning(Promise.resolve(samples));
    const { unmount } = render(<ReplayPage apiClient={apiClient} runId="abc" />);
    expect(screen.getByRole("heading", { name: "Replay not found" })).toBeVisible();
    unmount();

    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "");
    render(<ReplayPage apiClient={apiClient} runId="7001" />);
    expect(screen.getByRole("heading", { name: "3D replays are not available" })).toBeVisible();
    expect(apiClient.replaySamples).not.toHaveBeenCalled();
  });
});
