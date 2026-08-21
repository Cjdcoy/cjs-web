import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutPage } from "./AboutPage";

describe("AboutPage", () => {
  it("explains provenance, limitations, and browser-local favorites", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { name: "Jump statistics, clearly sourced." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/independent public frontend/i)).toBeInTheDocument();
    expect(screen.getByText(/stored in this browser's local storage/i)).toBeInTheDocument();
    expect(screen.getByText(/does not write them to the stats API/i)).toBeInTheDocument();
    expect(screen.getByText(/Call of Duty 4 is future work/i)).toBeInTheDocument();
  });

  it("links safely to the public project, API, and source communities", () => {
    render(<AboutPage />);

    const expectedLinks = new Map([
      ["Public source code", "https://github.com/Cjdcoy/cjs-web"],
      ["CJ Stats API documentation", "https://api.jump4life.org/docs"],
      ["Jump4Life community", "https://jump4life.org/"],
      ["JumpersHeaven community", "https://www.jumpersheaven.com/"],
    ]);

    for (const [name, href] of expectedLinks) {
      const link = screen.getByRole("link", { name: new RegExp(name, "i") });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(<AboutPage />);
    const results = await axe.run(container);

    expect(results.violations).toEqual([]);
  });
});
