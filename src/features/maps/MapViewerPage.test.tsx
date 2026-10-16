import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type GameMap } from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import type { MapViewerProps } from "../mapViewer";
import { MapViewerPage } from "./MapViewerPage";

const viewerProps = vi.hoisted(() => ({ current: null as MapViewerProps | null }));

vi.mock("../mapViewer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mapViewer")>()),
  MapViewer: (props: MapViewerProps) => {
    viewerProps.current = props;
    return <div role="application" aria-label={`3D view of ${props.mapName}`} />;
  },
}));

const pier: GameMap = {
  mapid: 9,
  mapname: "jm_pier_250",
  cp_id: 90,
  author: null,
  released: null,
  type: "jump",
  difficulty: null,
  individual_finish_count: 0,
  video: null,
};

function renderPage(mapId = "9") {
  return render(
    <SourceProvider>
      <MapViewerPage mapId={mapId} />
    </SourceProvider>,
  );
}

describe("MapViewerPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    viewerProps.current = null;
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "https://models.example.test/maps");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads the map name and opens its model at the shared camera position", async () => {
    vi.spyOn(api, "maps").mockResolvedValue([pier]);
    window.history.replaceState(null, "", "/maps/9/3d?source=j4l#100,200,300,90,10");

    renderPage();

    expect(await screen.findByRole("heading", { name: "jm_pier_250", level: 1 })).toBeVisible();
    expect(screen.getByRole("application", { name: "3D view of jm_pier_250" })).toBeVisible();
    expect(viewerProps.current).toMatchObject({
      modelUrl: "https://models.example.test/maps/jm_pier_250.glb",
      initialPose: { x: 100, y: 200, z: 300, yaw: 90, pitch: 10 },
    });
    expect(screen.getByRole("link", { name: "Back to map" })).toHaveAttribute(
      "href",
      "/maps/9?source=j4l",
    );
  });

  it("explains an unknown map and a failed map request", async () => {
    const maps = vi.spyOn(api, "maps").mockResolvedValue([]);
    window.history.replaceState(null, "", "/maps/404/3d");
    const { unmount } = renderPage("404");
    expect(await screen.findByRole("heading", { name: "Map unavailable" })).toBeVisible();
    unmount();

    maps.mockRejectedValue(new Error("API request failed (503) for /api/v1/map/all"));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Map details could not be loaded" }),
    ).toBeVisible();
    expect(viewerProps.current).toBeNull();
  });

  it("stays hidden without a model host and never requests map data", () => {
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "");
    const maps = vi.spyOn(api, "maps");

    renderPage();

    expect(screen.getByRole("heading", { name: "3D map views are not available" })).toBeVisible();
    expect(maps).not.toHaveBeenCalled();
  });
});
