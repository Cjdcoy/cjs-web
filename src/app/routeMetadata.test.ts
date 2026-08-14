import { afterEach, describe, expect, it } from "vitest";
import type { RouteMatch } from "../lib/routing";
import { applyRouteMetadata, getRouteMetadata } from "./routeMetadata";

const routeMatches: readonly RouteMatch[] = [
  { id: "servers", params: {} },
  { id: "leaderboards", params: {} },
  { id: "maps", params: {} },
  { id: "map-detail", params: { mapId: "jm_example" } },
  { id: "players", params: {} },
  { id: "player-detail", params: { playerId: "501" } },
  { id: "favorites", params: {} },
  { id: "about", params: {} },
  { id: "not-found", params: {} },
];

describe("route metadata", () => {
  afterEach(() => {
    document.head.querySelectorAll("meta, link").forEach((element) => element.remove());
    document.title = "";
  });

  it.each(routeMatches)("provides a useful title and description for $id", (match) => {
    const metadata = getRouteMetadata(match);

    expect(metadata.title).toMatch(/\| CJS$/);
    expect(metadata.title.length).toBeGreaterThan(12);
    expect(metadata.description.length).toBeGreaterThan(60);
  });

  it("includes detail identifiers without requiring loaded API data", () => {
    expect(getRouteMetadata({ id: "map-detail", params: { mapId: "jm_castle" } }).title).toBe(
      "jm_castle map records | CJS",
    );
    expect(getRouteMetadata({ id: "player-detail", params: { playerId: "42" } }).title).toBe(
      "Player 42 | CJS",
    );
  });

  it("updates standard, social, and canonical document metadata", () => {
    applyRouteMetadata({ id: "about", params: {} }, "/about");

    expect(document.title).toBe("About the project | CJS");
    expect(metaContent('meta[name="description"]')).toMatch(/browser/);
    expect(metaContent('meta[property="og:title"]')).toBe("About the project | CJS");
    expect(metaContent('meta[property="og:url"]')).toBe(`${window.location.origin}/about`);
    expect(metaContent('meta[name="twitter:image"]')).toBe(
      `${window.location.origin}/social-card.svg`,
    );
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      `${window.location.origin}/about`,
    );
  });
});

function metaContent(selector: string): string | undefined {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content;
}
