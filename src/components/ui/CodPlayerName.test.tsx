import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CodPlayerName } from ".";

describe("CodPlayerName", () => {
  it("renders colored segments while exposing one plain accessible name", () => {
    const { container } = render(<CodPlayerName value="^1Red^7White" />);

    expect(screen.getByLabelText("RedWhite")).toHaveClass("cjs-player-name");
    expect(container.querySelector('[data-cod-color="1"]')).toHaveTextContent("Red");
    expect(container.querySelector('[data-cod-color="7"]')).toHaveTextContent("White");
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent("RedWhite");
    expect(container).not.toHaveTextContent("^1");
  });
});
