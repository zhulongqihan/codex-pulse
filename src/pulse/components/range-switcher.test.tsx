// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
