import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  DataTable,
  ErrorState,
  Input,
  Pagination,
  SegmentedControl,
  type DataTableColumn,
} from ".";

describe("design-system controls", () => {
  it("exposes and locks a loading button state", () => {
    render(
      <Button isLoading loadingLabel="Saving changes">
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Saving changes" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("associates input labels, help, and errors", () => {
    render(
      <Input
        label="Map name"
        helperText="Use the API map name."
        error="That map is unavailable."
      />,
    );

    const input = screen.getByLabelText("Map name");
    const error = screen.getByRole("alert");
    const describedBy = input.getAttribute("aria-describedby") ?? "";

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toContain(error.id);
    expect(describedBy.split(" ")).toHaveLength(2);
  });

  it("supports roving focus and arrow-key selection", async () => {
    const user = userEvent.setup();

    function Example() {
      const [value, setValue] = useState("records");
      return (
        <SegmentedControl
          ariaLabel="Leaderboard view"
          value={value}
          onChange={setValue}
          options={[
            { value: "records", label: "Records" },
            { value: "activity", label: "Activity" },
            { value: "disabled", label: "Disabled", disabled: true },
          ]}
        />
      );
    }

    render(<Example />);
    const records = screen.getByRole("radio", { name: "Records" });
    const activity = screen.getByRole("radio", { name: "Activity" });
    records.focus();
    await user.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(activity);
    expect(activity.getAttribute("aria-checked")).toBe("true");
  });
});

describe("design-system data and feedback", () => {
  interface Row {
    id: number;
    player: string;
    time: string;
  }

  const columns: readonly DataTableColumn<Row>[] = [
    { id: "player", header: "Player", cell: (row) => row.player },
    { id: "time", header: "Completion time", cardLabel: "Time", cell: (row) => row.time },
  ];

  it("keeps mobile card labels in semantic table cells", () => {
    render(
      <DataTable
        caption="Top runs"
        columns={columns}
        rows={[{ id: 1, player: "jumper", time: "00:42.381" }]}
        getRowKey={(row) => row.id}
      />,
    );

    const row = screen.getAllByRole("row")[1];
    const cells = within(row).getAllByRole("cell");
    expect(cells[0].getAttribute("data-label")).toBe("Player");
    expect(cells[1].getAttribute("data-label")).toBe("Time");
  });

  it("labels the current page and prevents out-of-range navigation", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={10} onPageChange={onPageChange} />);

    expect(
      (screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe(
      "page",
    );

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("announces recoverable errors and exposes the retry action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Unable to load records"
        description="The API did not respond."
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Unable to load records");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
