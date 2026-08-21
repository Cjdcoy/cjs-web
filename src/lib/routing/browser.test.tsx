import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { markNavigationComplete, navigate, useBrowserLocation } from "./browser";

function RouterHarness() {
  const location = useBrowserLocation();
  const href = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div>
      <output aria-label="Current location">{href}</output>
      <a href="/maps?source=j4l">Maps</a>
      <a href="/players/42?source=jh">Player</a>
    </div>
  );
}

describe("browser routing", () => {
  beforeEach(() => {
    markNavigationComplete();
    window.history.replaceState(null, "", "/");
  });

  it("reads a directly loaded nested route", () => {
    window.history.replaceState(null, "", "/maps/17?source=j4l");
    render(<RouterHarness />);

    expect(screen.getByLabelText("Current location")).toHaveTextContent("/maps/17?source=j4l");
  });

  it("navigates internal links without reloading the document", async () => {
    const user = userEvent.setup();
    render(<RouterHarness />);

    await user.click(screen.getByRole("link", { name: "Maps" }));

    expect(screen.getByLabelText("Current location")).toHaveTextContent("/maps?source=j4l");
    expect(window.location.pathname).toBe("/maps");
  });

  it("reacts to browser back and forward navigation", async () => {
    render(<RouterHarness />);
    act(() => navigate("/maps"));
    act(() => navigate("/players/42"));

    act(() => window.history.back());
    await waitFor(() => {
      expect(screen.getByLabelText("Current location")).toHaveTextContent("/maps");
    });

    act(() => window.history.forward());
    await waitFor(() => {
      expect(screen.getByLabelText("Current location")).toHaveTextContent("/players/42");
    });
  });
});
