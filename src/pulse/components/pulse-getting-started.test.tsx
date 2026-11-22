// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { readingGuidanceCopy } from "@/lib/reading-guidance-copy";
import { PulseGettingStarted } from "./pulse-getting-started";
import { firstUseCopy } from "@/lib/first-use";

describe("optional practical usage help", () => {
  it("offers account recovery until a quota window is returned and keeps the widget optional", async () => {
    await i18n.changeLanguage("en");
    const callbacks = { onSource: vi.fn(), onAccount: vi.fn(), onWidget: vi.fn(), onShortcuts: vi.fn(), onDismiss: vi.fn() };
    const props = { ...callbacks, accountReady: false, busy: false, notice: null, error: null };
    const { rerender } = render(<PulseGettingStarted {...props}/>);
    fireEvent.click(screen.getByTestId("first-use-next"));
    expect(callbacks.onAccount).toHaveBeenCalledOnce();
    expect(callbacks.onWidget).not.toHaveBeenCalled();
    rerender(<PulseGettingStarted {...props} accountReady/>);
    expect(screen.getByTestId("first-use-guidance")).toHaveTextContent(firstUseCopy("en", "missing"));
    rerender(<PulseGettingStarted {...props} accountReady quotaAvailable/>);
    expect(screen.getByTestId("first-use-guidance")).toHaveTextContent(firstUseCopy("en", "ready"));
    expect(screen.queryByTestId("first-use-next")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show capacity on desktop" }));
    expect(callbacks.onWidget).toHaveBeenCalledOnce();
  });
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("keeps task guidance collapsed in %s", async language => {
    await i18n.changeLanguage(language);
    const callbacks = { onSource: vi.fn(), onAccount: vi.fn(), onWidget: vi.fn(), onShortcuts: vi.fn(), onDismiss: vi.fn() };
    const props = { ...callbacks, accountReady: false, busy: false, notice: null, error: null };
    render(<PulseGettingStarted {...props}/>);
    Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled());
    const guide = screen.getByTestId("usage-guide");
    expect(guide.querySelectorAll("details")).toHaveLength(3);
    expect(guide.querySelectorAll("details[open]")).toHaveLength(0);
    for (const [testId, key] of [["help-readings", "numbers"], ["help-recovery", "recovery"], ["help-windows", "windows"]] as const) {
      const detail = screen.getByTestId(testId); fireEvent.click(within(detail).getByText(readingGuidanceCopy(language, key)));
      expect(detail).toHaveAttribute("open");
    }
    expect(guide).toHaveTextContent(readingGuidanceCopy(language, "modelMissing"));
    expect(guide).toHaveTextContent(readingGuidanceCopy(language, "failedRecovery"));
    expect(screen.getByTestId("help-windows").querySelectorAll("dt")).toHaveLength(4);
    expect(guide.querySelector("button,input,[role=dialog]")).toBeNull();
    await i18n.changeLanguage("en");
  });
});
