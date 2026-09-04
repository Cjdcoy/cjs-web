import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SourceProvider,
  markNavigationComplete,
  navigate,
  type AppRouteId,
} from "../../lib/routing";
import { AppShell } from "./AppShell";

function renderShell(routeId: AppRouteId = "maps") {
  return render(
    <SourceProvider>
      <AppShell route={{ id: routeId, params: {} }}>
        <h1>Route content</h1>
      </AppShell>
    </SourceProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    markNavigationComplete();
    window.history.replaceState(null, "", "/maps");
  });

  it("provides the shared landmarks, skip link, navigation, and footer", () => {
    const { container } = renderShell();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Maps" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("An independent interface for public jump statistics.")).toBeVisible();
    expect(container.querySelectorAll('img[src="/cjs-logo.png"]')).toHaveLength(2);
    expect(screen.queryByRole("radiogroup", { name: "Data source" })).not.toBeInTheDocument();
  });

  it("treats detail routes as part of their parent navigation section", () => {
    renderShell("player-detail");

    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Maps" })).not.toHaveAttribute("aria-current");
  });

  it("moves focus to main content from the skip link", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("link", { name: "Skip to main content" }));

    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("opens and closes mobile navigation with the keyboard", async () => {
    const user = userEvent.setup();
    renderShell();

    const toggle = screen.getByRole("button", { name: "Open navigation" });
    await user.click(toggle);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("announces route transitions", async () => {
    renderShell();

    act(() => navigate("/players"));
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");

    act(() => markNavigationComplete());
    await waitFor(() => expect(screen.getByRole("status")).toBeEmptyDOMElement());
  });

  it("has no automated accessibility violations", async () => {
    const { container } = renderShell();
    const results = await axe.run(container);

    expect(results.violations).toEqual([]);
  });
});
