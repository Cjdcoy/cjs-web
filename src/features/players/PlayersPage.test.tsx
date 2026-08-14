import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { FAVORITES_STORAGE_KEY } from "../../lib/storage";
import { PlayersPage } from "./PlayersPage";

describe("PlayersPage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    window.history.replaceState(null, "", "/players");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("waits for a search term instead of downloading the full directory", () => {
    const searchPlayers = vi.fn<typeof api.searchPlayers>().mockResolvedValue([]);

    renderPlayersPage(searchPlayers);

    expect(screen.getByRole("heading", { name: "Search by player name" })).toBeInTheDocument();
    expect(searchPlayers).not.toHaveBeenCalled();
  });

  it("uses URL-backed source and filters, renders game colors safely, and links profiles", async () => {
    const user = userEvent.setup();
    const searchPlayers = vi.fn<typeof api.searchPlayers>().mockResolvedValue([
      {
        player_id: 502,
        playername: "^1<script>alert(1)</script>",
        last_seen: "2026-01-01T00:00:00Z",
        visits: 12,
        country: "Exampleland",
        admin: 100,
        donated: 500,
        banned: 1,
      },
      {
        player_id: 501,
        playername: "^2Runner^7One",
        last_seen: "2026-02-01T00:00:00Z",
        visits: 24,
        country: "Testland",
      },
    ]);
    window.history.replaceState(
      null,
      "",
      "/players?source=j4l&q=runner&sort=visits&campaign=summer",
    );

    const { container } = renderPlayersPage(searchPlayers);
    const runnerLink = await screen.findByRole(
      "link",
      { name: /RunnerOne.*501/i },
      { timeout: 2000 },
    );

    expect(searchPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, name: "runner", source: "j4l" }),
    );
    expect(runnerLink).toHaveAttribute("href", "/players/501?source=j4l");
    expect(container.querySelector('[data-cod-color="2"]')).toHaveTextContent("Runner");
    expect(container.querySelector('[data-cod-color="1"]')).toHaveTextContent(
      "<script>alert(1)</script>",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Donator")).not.toBeInTheDocument();
    expect(screen.queryByText("Banned")).not.toBeInTheDocument();

    const favorite = screen.getByRole("button", { name: "Add RunnerOne to favorites" });
    await user.click(favorite);
    expect(favorite).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toContain('"player:j4l:501"');

    await user.selectOptions(screen.getByLabelText("Sort results"), "name");
    await waitFor(() => {
      const parameters = new URLSearchParams(window.location.search);
      expect(parameters.get("source")).toBe("j4l");
      expect(parameters.get("q")).toBe("runner");
      expect(parameters.get("sort")).toBe("name");
      expect(parameters.get("campaign")).toBe("summer");
    });
  });

  it("reports an empty search without presenting inferred player statuses", async () => {
    const searchPlayers = vi.fn<typeof api.searchPlayers>().mockResolvedValue([]);
    window.history.replaceState(null, "", "/players?q=missing");

    renderPlayersPage(searchPlayers);

    expect(
      await screen.findByRole("heading", { name: "No players found" }, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/0 matches for “missing”/)).toBeInTheDocument();
  });
});

function renderPlayersPage(searchPlayers: typeof api.searchPlayers) {
  return render(
    <SourceProvider>
      <PlayersPage searchPlayers={searchPlayers} />
    </SourceProvider>,
  );
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}
