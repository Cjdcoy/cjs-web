import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      online: true,
    },
  ],
  total_players: 1,
  online_servers: 2,
};

describe("ServersPage", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders successful server data, totals, links, and only valid connection actions", async () => {
    const loader = vi.fn(async () => serverPayload);
    renderPage({ loadServers: loader });

    expect(screen.getByText("Loading live server data.")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(screen.getByRole("link", { name: "mp_cjs_training" })).toHaveAttribute(
      "href",
      "/maps/101?source=jh",
    );
    expect(screen.getByText("Runner")).toBeVisible();
    expect(
      within(screen.getByLabelText("Live server summary")).getAllByText("2", {
        selector: "dd",
      }),
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy address" })).toHaveLength(2);
    expect(screen.queryByText("COD4")).not.toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith("jh", expect.any(AbortSignal));
  });

  it("keeps partial data usable and announces omitted malformed entries", async () => {
    const loader = vi.fn(async () => ({
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
    }));
    renderPage({ loadServers: loader });

    expect(await screen.findByRole("heading", { name: "partial.example.invalid" })).toBeVisible();
    expect(screen.getByText("Player list unavailable")).toBeVisible();
    expect(screen.getByText("One incomplete server entry could not be shown.")).toBeVisible();
    expect(screen.getByText("Classic Jump")).toBeVisible();
  });

  it("renders a deliberate empty state", async () => {
    renderPage({
      loadServers: vi.fn(async () => ({ servers: [], total_players: 0, online_servers: 0 })),
    });

    expect(await screen.findByRole("heading", { name: "No servers are reporting" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh server feed" })).toBeEnabled();
  });

  it("holds the loading state for a slow response", async () => {
    const deferred = createDeferred<unknown>();
    renderPage({ loadServers: vi.fn(() => deferred.promise) });

    expect(screen.getByText("Loading live server data.")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "cod2.example.invalid" })).not.toBeInTheDocument();

    deferred.resolve(serverPayload);
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

    await waitFor(() => expect(requestSignals).toHaveLength(1));
    view.unmount();

    expect(requestSignals[0]?.aborted).toBe(true);
  });

  it("shows a safe error and retries a failed initial request", async () => {
    const loader = vi
      .fn<ServerLoader>()
      .mockRejectedValueOnce(new Error("sensitive upstream detail"))
      .mockResolvedValueOnce(serverPayload);
    const user = userEvent.setup();
    renderPage({ loadServers: loader });

    expect(
      await screen.findByRole("heading", { name: "Live servers are unavailable" }),
    ).toBeVisible();
    expect(screen.queryByText("sensitive upstream detail")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry server feed" }));
    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keeps successful data visible when a refresh fails", async () => {
    const loader = vi
      .fn<ServerLoader>()
      .mockResolvedValueOnce(serverPayload)
      .mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    renderPage({ loadServers: loader });

    expect(await screen.findByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("Refresh failed.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "cod2.example.invalid" })).toBeVisible();
    expect(screen.getByText(/Data may be stale/)).toBeVisible();
  });

  it("round-trips filters and layout through the URL", async () => {
    const user = userEvent.setup();
    renderPage({ loadServers: vi.fn(async () => serverPayload) });

    expect(await screen.findByRole("heading", { name: "empty.example.invalid" })).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Populated only" }));

    expect(
      screen.queryByRole("heading", { name: "empty.example.invalid" }),
    ).not.toBeInTheDocument();
    expect(window.location.search).toContain("populated=1");

    await user.click(screen.getByRole("radio", { name: "List view" }));
    expect(window.location.search).toContain("view=list");
    expect(screen.getByRole("region", { name: "1 matching live servers" })).toHaveAttribute(
      "data-view",
      "list",
    );
  });

  it("uses the URL-backed source and preserves it in map links", async () => {
    window.history.replaceState(null, "", "/?source=j4l");
    const loader = vi.fn(async () => serverPayload);
    renderPage({ loadServers: loader });

    expect(await screen.findByText(/Jump4Life tracker/)).toBeVisible();
    expect(loader).toHaveBeenCalledWith("j4l", expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "mp_cjs_training" })).toHaveAttribute(
      "href",
      "/maps/101?source=j4l",
    );
  });

  it("does not expose a copy action when an address is invalid", async () => {
    renderPage({
      loadServers: vi.fn(async () => ({
        servers: [
          {
            domain: "invalid address",
            ip: "also invalid",
            port: 70_000,
            map: "mp_partial",
            player_count: 0,
          },
        ],
      })),
    });

    expect(await screen.findByText("Connection address unavailable")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy address" })).not.toBeInTheDocument();
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
    expect(loader).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(2_000));
    expect(loader).toHaveBeenCalledTimes(1);

    visibility = "visible";
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("has no automated accessibility violations in the successful state", async () => {
    const { container } = renderPage({ loadServers: vi.fn(async () => serverPayload) });
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
