// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RangeSwitcher } from "./range-switcher";
import i18n from "@/i18n";

beforeAll(async () => { await i18n.changeLanguage("en"); });

describe("range selection", () => {
  it("exposes every retained date through an explicit all-history option", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RangeSwitcher value="30d" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Select time range" }));
    await user.click(screen.getByRole("menuitemradio", { name: "All retained history" }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("keeps the first and last presets reachable by keyboard with the timezone explanation present", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RangeSwitcher value="30d" onChange={onChange} timezone="America/New_York" />);
    const trigger = screen.getByRole("button", { name: "Select time range" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{Home}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("1d");
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.keyboard("{ArrowDown}{End}{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("all");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("closes the custom range with Escape and returns focus without changing the range", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RangeSwitcher value="custom:2026-10-01_2026-10-02" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Select time range" });
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Select Custom Range..." }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the statistics zone and rejects a date later than that zone's today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T00:15:00Z"));
    const onChange = vi.fn();
    const user = userEvent.setup();
    const rendered = render(<RangeSwitcher value="custom:2026-11-05_2026-11-07" onChange={onChange} timezone="America/Los_Angeles" />);
    try {
      await user.click(screen.getByRole("button", { name: "Select time range" }));
      expect(screen.getByText(/Usage time zone: America\/Los_Angeles/)).toBeInTheDocument();
      await user.click(screen.getByRole("menuitem", { name: "Select Custom Range..." }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("America/Los_Angeles");
      expect(dialog.querySelector('[role="gridcell"][data-day="2026-11-07"]')).toHaveAttribute("data-disabled", "true");
      await user.click(within(dialog).getByRole("button", { name: i18n.t("range_switcher.btn_apply") }));
      expect(onChange).not.toHaveBeenCalled();
      expect(dialog).toHaveTextContent(i18n.t("range_switcher.err_future"));
    } finally { rendered.unmount(); vi.useRealTimers(); }
  });

  it("initializes the custom range from the source date and allows its current day ahead of the host", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T12:15:00Z"));
    const onChange = vi.fn();
    const user = userEvent.setup();
    const rendered = render(<RangeSwitcher value="30d" onChange={onChange} timezone="Pacific/Kiritimati" />);
    try {
      await user.click(screen.getByRole("button", { name: "Select time range" }));
      await user.click(screen.getByRole("menuitem", { name: "Select Custom Range..." }));
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("2026-11-07");
      expect(dialog.querySelector('[role="gridcell"][data-day="2026-11-07"]')).not.toHaveAttribute("data-disabled");
      await user.click(within(dialog).getByRole("button", { name: i18n.t("range_switcher.btn_apply") }));
      expect(onChange).toHaveBeenCalledWith("custom:2026-10-09_2026-11-07");
    } finally { rendered.unmount(); vi.useRealTimers(); }
  });
});
