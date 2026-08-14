import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function BrokenRoute(): never {
  throw new Error("synthetic route failure");
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("keeps the application recoverable when route code fails", () => {
    render(
      <main id="main-content" tabIndex={-1}>
        <RouteErrorBoundary resetKey="/broken">
          <BrokenRoute />
        </RouteErrorBoundary>
      </main>,
    );

    expect(screen.getByRole("heading", { name: "Page failed to load" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeEnabled();
  });
});
