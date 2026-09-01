import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceProvider } from "../../lib/routing";
import { ServersPage, type ServersPageProps } from "./ServersPage";
import type { ServerLoader } from "./useLiveServers";

const serverPayload: unknown = {
  servers: [
    {
      domain: "cod2.example.invalid",
      ip: "203.0.113.10",
      port: 28_960,
      map: "mp_cjs_training",
      mapid: 101,
      game_type: "jump",
      players: [{ playername: "^2Runner", playerid: 501, ping: 42, admin: 0 }],
      player_count: 1,
      online: true,
    },
    {
      domain: "empty.example.invalid",
      ip: "203.0.113.11",
      port: 28_961,
      map: "mp_cjs_empty",
      mapid: 102,
      game_type: "jump",
      players: [],
      player_count: 0,
      online: false,
    },
  ],
  total_players: 1,
  online_servers: 1,
};

const emptyServerPayload: unknown = {
  servers: [],
  total_players: 0,
  online_servers: 0,
};

function loadJ4l(payload: unknown = serverPayload) {
  return vi.fn<ServerLoader>(async (source) => (source === "j4l" ? payload : emptyServerPayload));
}

describe("ServersPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders compact controls, server data, links, and only valid connection actions", async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");
    const loader = loadJ4l();
    const { container } = renderPage({ loadServers: loader });

    const pageHeading = screen.getByRole("heading", { level: 1, name: "Live servers" });
    expect(pageHeading).toBeVisible();
    expect(pageHeading.closest(".cjs-page-heading")).not.toBeNull();
    expect(screen.getByText(/current JumpersHeaven and Jump4Life servers/i)).toBeVisible();
    expect(screen.getByText("Loading live server data.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(screen.getByRole("link", { name: "mp_cjs_training" })).toHaveAttribute(
      "href",
      "/maps/101?source=j4l&lookup=cpid",
    );
    expect(screen.getByText("Runner")).toBeVisible();
    expect(container.querySelector('[data-cod-color="2"]')).toHaveTextContent("Runner");
    expect(container.querySelector(".servers-page__hero")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Live server summary")).not.toBeInTheDocument();
    expect(screen.queryByText("COD2 live data")).not.toBeInTheDocument();
    expect(screen.queryByText(/Current server, map, and player activity/)).not.toBeInTheDocument();
    const addressControls = screen.getAllByRole("button", { name: /^Copy / });
    expect(addressControls).toHaveLength(2);
    expect(screen.getByRole("radiogroup", { name: "Game version" })).toBeVisible();
    expect(loader).toHaveBeenCalledWith("j4l", expect.any(AbortSignal));
    expect(loader).toHaveBeenCalledWith("jh", expect.any(AbortSignal));
    expect(screen.queryByText("Server address")).not.toBeInTheDocument();
    expect(screen.queryByText("Current map")).not.toBeInTheDocument();
    expect(screen.queryByText("Connected players")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Players" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Server online" })).toHaveAttribute(
      "data-tooltip",
      "Online",
    );
    expect(screen.getByRole("img", { name: "Server offline" })).toHaveAttribute(
      "data-tooltip",
      "Offline",
    );
    expect(screen.getByRole("img", { name: "Server online" })).not.toHaveAttribute("title");
    expect(screen.getByText("cod2.example.invalid:28960")).toBeVisible();
    await user.click(addressControls[0]);
    expect(clipboardSpy).toHaveBeenCalledWith("cod2.example.invalid:28960");
    expect(addressControls[0]).toHaveAccessibleName("cod2.example.invalid:28960 copied");
    expect(addressControls[0]).toHaveAttribute("title", "Copied");
    expect(addressControls[0]).toHaveTextContent("");
    expect(screen.queryByText("Mode", { selector: "dt" })).not.toBeInTheDocument();

    const mapImage = container.querySelector<HTMLImageElement>(".server-card__visual-image");
    expect(mapImage).toHaveAttribute("src", "/maps/cards/mp_cjs_training.avif");
    expect(mapImage).toHaveAttribute(
      "srcset",
      "/maps/thumbs/mp_cjs_training.avif 480w, /maps/cards/mp_cjs_training.avif 960w",
    );
    expect(mapImage).toHaveAttribute("sizes", "(max-width: 48rem) 100vw, 33vw");
    fireEvent.error(mapImage as HTMLImageElement);
    expect(
      container.querySelector('[src="/maps/cards/mp_cjs_training.avif"]'),
    ).not.toBeInTheDocument();
  });

  it("keeps partial data usable and announces omitted malformed entries", async () => {
    const loader = loadJ4l({
      servers: [
        null,
        {
          domain: "partial.example.invalid",
          ip: "203.0.113.12",
          port: 28_960,
          map: "mp_partial",
          mapid: 103,
          game_type: "classic_jump",
          players: null,
          online: true,
        },
      ],
    });
    renderPage({ loadServers: loader });

    expect(await screen.findByRole("heading", { name: "partial.example.invalid" })).toBeVisible();
    expect(screen.getByText("Server empty")).toBeVisible();
    expect(screen.getByText("One incomplete server entry could not be shown.")).toBeVisible();
    expect(screen.queryByText("Classic Jump")).not.toBeInTheDocument();
  });

  it("renders a deliberate empty state", async () => {
    renderPage({
      loadServers: vi.fn(async () => emptyServerPayload),
    });

    expect(await screen.findByRole("heading", { name: "No servers are reporting" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh server feeds" })).toBeEnabled();
  });

  it("holds the loading state for a slow response", async () => {
    const j4lDeferred = createDeferred<unknown>();
    const jhDeferred = createDeferred<unknown>();
    renderPage({
      loadServers: vi.fn((source) => (source === "j4l" ? j4lDeferred.promise : jhDeferred.promise)),
    });

    expect(screen.getByText("Loading live server data.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "cod2.example.invalid" })).not.toBeInTheDocument();

    j4lDeferred.resolve(serverPayload);
    jhDeferred.resolve(emptyServerPayload);
    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
  });

  it("aborts its pending request when the view unmounts", async () => {
    const requestSignals: AbortSignal[] = [];
    const loader: ServerLoader = (_source, signal) => {
      requestSignals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    };
    const view = renderPage({ loadServers: loader });

    await waitFor(() => expect(requestSignals).toHaveLength(2));
    view.unmount();

    expect(requestSignals[0]?.aborted).toBe(true);
    expect(requestSignals[1]?.aborted).toBe(true);
  });

  it("shows a safe error and retries a failed initial request", async () => {
    const attempts: Record<"j4l" | "jh", number> = { j4l: 0, jh: 0 };
    const loader = vi.fn<ServerLoader>(async (source) => {
      attempts[source] += 1;
      if (attempts[source] === 1) throw new Error("sensitive upstream detail");
      return source === "j4l" ? serverPayload : emptyServerPayload;
    });
    const user = userEvent.setup();
    renderPage({ loadServers: loader });

    expect(
      await screen.findByRole("heading", { name: "Live servers are unavailable" }),
    ).toBeVisible();
    expect(screen.queryByText("sensitive upstream detail")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry server feeds" }));
    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("keeps successful data visible when a refresh fails", async () => {
    const attempts: Record<"j4l" | "jh", number> = { j4l: 0, jh: 0 };
    const loader = vi.fn<ServerLoader>(async (source) => {
      attempts[source] += 1;
      if (attempts[source] > 1) throw new Error("offline");
      return source === "j4l" ? serverPayload : emptyServerPayload;
    });
    const user = userEvent.setup();
    renderPage({ loadServers: loader });

    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    expect(refreshButton).toHaveAttribute("title", "Refresh");
    expect(refreshButton).toHaveAttribute("data-variant", "ghost");
    expect(refreshButton).toHaveTextContent("");
    await user.click(refreshButton);

    expect(await screen.findByText("Jump4Life refresh failed.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(screen.getByText(/Data may be stale/)).toBeVisible();
  });

  it("round-trips filters and layout through the URL", async () => {
    const user = userEvent.setup();
    renderPage({ loadServers: loadJ4l() });

    expect(await screen.findByRole("heading", { name: "empty.example.invalid" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Populated only" }));

    expect(
      screen.queryByRole("heading", { name: "empty.example.invalid" }),
    ).not.toBeInTheDocument();
    expect(window.location.search).toContain("populated=1");

    await user.click(screen.getByRole("radio", { name: "List view" }));
    expect(window.location.search).toContain("view=list");
    expect(screen.getByLabelText("Jump4Life: 1 matching live servers")).toHaveAttribute(
      "data-view",
      "list",
    );
  });

  it("folds each server source independently from its heading", async () => {
    const user = userEvent.setup();
    const loader = vi.fn<ServerLoader>(async (source) => ({
      servers: [
        {
          domain: source === "j4l" ? "visible-j4l.invalid" : "visible-jh.invalid",
          map: source === "j4l" ? "mp_j4l" : "mp_jh",
          player_count: 0,
          online: true,
        },
      ],
    }));
    renderPage({ loadServers: loader });

    expect(await screen.findByRole("heading", { name: "visible-j4l.invalid" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "visible-jh.invalid" })).toBeVisible();

    const j4lToggle = screen.getByRole("button", { name: "Jump4Life" });
    const jhToggle = screen.getByRole("button", { name: "JumpersHeaven" });
    expect(j4lToggle).toHaveAttribute("aria-expanded", "true");
    expect(jhToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(j4lToggle);
    expect(j4lToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "visible-j4l.invalid" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "visible-jh.invalid" })).toBeVisible();

    await user.click(j4lToggle);
    expect(j4lToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "visible-j4l.invalid" })).toBeVisible();

    await user.click(jhToggle);
    expect(jhToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: "visible-jh.invalid" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "visible-j4l.invalid" })).toBeVisible();
    expect(window.location.search).toBe("");
  });

  it("shows JumpersHeaven COD4 servers through a URL-backed game control", async () => {
    const loader = vi.fn<ServerLoader>(async (source) => ({
      servers:
        source === "jh"
          ? [
              {
                domain: "cod2.jumpersheaven.invalid",
                map: "mp_jh_cod2",
                game_type: "COD2",
                player_count: 1,
              },
              {
                domain: "cod4.jumpersheaven.invalid",
                map: "mp_jh_cod4",
                mapid: 404,
                game_type: "COD4",
                player_count: 2,
              },
            ]
          : [
              {
                domain: "cod2.jump4life.invalid",
                map: "mp_j4l_cod2",
                game_type: "COD2",
                player_count: 1,
              },
              {
                domain: "cod4.jump4life.invalid",
                map: "mp_j4l_cod4",
                game_type: "COD4",
                player_count: 1,
              },
            ],
    }));
    const user = userEvent.setup();
    renderPage({ loadServers: loader });

    expect(
      await screen.findByRole("heading", { name: "cod2.jumpersheaven.invalid" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "cod2.jump4life.invalid" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "cod4.jumpersheaven.invalid" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "COD4" }));

    expect(
      await screen.findByRole("heading", { name: "cod4.jumpersheaven.invalid" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "cod2.jumpersheaven.invalid" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Jump4Life" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "cod4.jump4life.invalid" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "mp_jh_cod4" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?game=cod4");
  });

  it("falls back to COD2 for an invalid game URL", async () => {
    window.history.replaceState(null, "", "/?game=unsupported");
    renderPage({ loadServers: loadJ4l() });

    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "COD2" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "COD4" })).not.toBeChecked();
  });

  it("loads both sources, renders Jump4Life first, and keeps map links source-correct", async () => {
    const loader = vi.fn<ServerLoader>(async (source) => ({
      servers: [
        {
          domain: source === "j4l" ? "fr.jump4life.org" : "hk.jumpersheaven.com",
          ip: source === "j4l" ? "203.0.113.20" : "203.0.113.21",
          port: 28_960,
          map: source === "j4l" ? "mp_j4l" : "mp_jh",
          mapid: source === "j4l" ? 201 : 202,
          players: [],
          player_count: 0,
          online: true,
        },
      ],
      total_players: 0,
      online_servers: 1,
    }));
    renderPage({ loadServers: loader });

    expect(await screen.findByRole("heading", { name: "fr.jump4life.org" })).toBeVisible();
    expect(loader).toHaveBeenCalledWith("j4l", expect.any(AbortSignal));
    expect(loader).toHaveBeenCalledWith("jh", expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "mp_j4l" })).toHaveAttribute(
      "href",
      "/maps/201?source=j4l&lookup=cpid",
    );
    expect(screen.getByRole("link", { name: "mp_jh" })).toHaveAttribute(
      "href",
      "/maps/202?source=jh&lookup=cpid",
    );
    const sourceHeadings = screen.getAllByRole("heading", {
      name: /Jump4Life|JumpersHeaven/,
    });
    expect(sourceHeadings.map((heading) => heading.textContent)).toEqual([
      "Jump4Life",
      "JumpersHeaven",
    ]);
    expect(screen.getByLabelText("France").querySelector("img")).toHaveAttribute(
      "src",
      "/country-flags/fr.svg",
    );
    expect(screen.getByLabelText("Hong Kong").querySelector("img")).toHaveAttribute(
      "src",
      "/country-flags/hk.svg",
    );
  });

  it("does not expose a copy action when an address is invalid", async () => {
    renderPage({
      loadServers: loadJ4l({
        servers: [
          {
            domain: "invalid address",
            ip: "also invalid",
            port: 70_000,
            map: "mp_partial",
            player_count: 0,
          },
        ],
      }),
    });

    expect(await screen.findByText("Connection address unavailable")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Copy / })).not.toBeInTheDocument();
  });

  it("turns malformed transport data into an error state instead of crashing", async () => {
    renderPage({ loadServers: vi.fn(async () => ({ servers: "malformed" })) });

    expect(
      await screen.findByRole("heading", { name: "Live servers are unavailable" }),
    ).toBeVisible();
    expect(screen.getByText(/could not understand/)).toBeVisible();
  });

  it("pauses polling while hidden and refreshes after becoming visible", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const loader = vi.fn(async () => serverPayload);
    renderPage({ loadServers: loader, pollIntervalMs: 1_000 });

    await act(async () => {
      await Promise.resolve();
    });
    expect(loader).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(2_000));
    expect(loader).toHaveBeenCalledTimes(2);

    visibility = "visible";
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it("has no automated accessibility violations in the successful state", async () => {
    const { container } = renderPage({ loadServers: loadJ4l() });
    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

function renderPage(props: ServersPageProps = {}) {
  return render(
    <SourceProvider>
      <ServersPage {...props} />
    </SourceProvider>,
  );
}

function createDeferred<Value>() {
  let resolvePromise!: (value: Value) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return { promise, reject: rejectPromise, resolve: resolvePromise };
}
