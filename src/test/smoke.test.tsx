import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { server } from "./server";

const harnessEndpoint = "https://api.jump4life.org/__cjs-test__/status";

function HarnessProbe() {
  const [status, setStatus] = useState("idle");

  async function checkHarness() {
    const response = await fetch(harnessEndpoint);
    const body = (await response.json()) as { status: string };

    setStatus(body.status);
  }

  return (
    <div>
      <button type="button" onClick={() => void checkHarness()}>
        Check harness
      </button>
      <p role="status">{status}</p>
    </div>
  );
}

describe("test harness", () => {
  it("renders, handles user input, and intercepts requests", async () => {
    server.use(
      http.get(harnessEndpoint, () => {
        return HttpResponse.json({ status: "ready" });
      }),
    );

    const user = userEvent.setup();

    render(<HarnessProbe />);
    await user.click(screen.getByRole("button", { name: "Check harness" }));

    expect(await screen.findByRole("status")).toHaveTextContent("ready");
  });
});
