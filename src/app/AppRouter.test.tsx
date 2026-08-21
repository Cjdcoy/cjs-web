import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "../test/server";
import { AppRouter } from "./AppRouter";

describe("AppRouter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("renders a useful not-found page for an unknown path", () => {
    window.history.replaceState(null, "", "/unknown-page");
    render(<AppRouter />);

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to live servers" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(document.title).toBe("Page not found | CJS");
  });

  it("applies route-specific title and description metadata", async () => {
    window.history.replaceState(null, "", "/about");
    render(<AppRouter />);

    await waitFor(() => {
      expect(document.title).toBe("About the project | CJS");
    });
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      "content",
      expect.stringMatching(/what stays in your browser/i),
    );
  });

  it("replaces a legacy URL with its nested route", async () => {
    server.use(
      http.get("*/api/v1/map/all", () => {
        return HttpResponse.json([]);
      }),
    );
    window.history.replaceState(null, "", "/map?mapid=73&source=j4l");
    render(<AppRouter />);

    await waitFor(() => {
      expect(`${window.location.pathname}${window.location.search}`).toBe("/maps/73?source=j4l");
    });
  });

  it("focuses and announces a completed pathname navigation", async () => {
    server.use(
      http.get("*/api/v1/map/all", () => {
        return HttpResponse.json([]);
      }),
    );
    window.history.replaceState(null, "", "/about");
    const user = userEvent.setup();
    render(<AppRouter />);

    await screen.findByRole("heading", { name: "Jump statistics, clearly sourced." });
    await user.click(screen.getByRole("link", { name: "Maps" }));

    await screen.findByRole("heading", { name: "Find your next route" });
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    expect(screen.getByText("Maps page loaded.")).toBeInTheDocument();
  });
});
