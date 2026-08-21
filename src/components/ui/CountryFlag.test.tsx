import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountryFlag } from ".";

describe("CountryFlag", () => {
  it("renders local Circle Flags artwork and normalizes the UK alias", () => {
    render(<CountryFlag code="UK" label="United Kingdom" size="large" />);

    const flag = screen.getByRole("img", { name: "United Kingdom" });
    expect(flag).toHaveAttribute("data-size", "large");
    expect(flag.querySelector("img")).toHaveAttribute("src", "/country-flags/gb.svg");
  });

  it("falls back to a globe for invalid or unavailable artwork", () => {
    const { rerender } = render(<CountryFlag code="GB" label="United Kingdom" />);
    const flag = screen.getByRole("img", { name: "United Kingdom" });
    fireEvent.error(flag.querySelector("img") as HTMLImageElement);
    expect(flag.querySelector("img")).toBeNull();
    expect(flag).toHaveAttribute("data-fallback", "true");

    rerender(<CountryFlag code="Unknown" label="Country unavailable" />);
    expect(
      screen.getByRole("img", { name: "Country unavailable" }).querySelector("img"),
    ).toBeNull();
  });
});
