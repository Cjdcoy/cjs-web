import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayLink } from "./ReplayLink";

describe("ReplayLink", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("links a Jump4Life run to its replay when map models are configured", () => {
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "https://models.example.test");
    render(<ReplayLink runId={28591} source="j4l" />);

    expect(screen.getByRole("link", { name: "Watch replay of run 28591" })).toHaveAttribute(
      "href",
      "/replays/28591",
    );
  });

  it.each([
    ["a JumpersHeaven run", "jh", 28591, "https://models.example.test"],
    ["a run without an id", "j4l", undefined, "https://models.example.test"],
    ["a site without map models", "j4l", 28591, ""],
  ] as const)("renders nothing for %s", (_, source, runId, base) => {
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", base);
    const { container } = render(<ReplayLink runId={runId} source={source} />);

    expect(container).toBeEmptyDOMElement();
  });
});
