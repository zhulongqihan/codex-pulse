// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { readingGuidanceCopy } from "@/lib/reading-guidance-copy";
import { PulseGettingStarted } from "./pulse-getting-started";

describe("optional practical usage help", () => {
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("keeps initial help small and makes task guidance available in %s", async language => {
    await i18n.changeLanguage(language);
    const callbacks = { onExpand: vi.fn(), onSource: vi.fn(), onAccount: vi.fn(), onWidget: vi.fn(), onShortcuts: vi.fn(), onDismiss: vi.fn() };
    const props = { ...callbacks, localReady: false, accountReady: false, busy: false, notice: null, error: null };
    const { rerender } = render(<PulseGettingStarted {...props} expanded={false}/>);
    expect(screen.queryByTestId("usage-guide")).not.toBeInTheDocument();
    Object.values(callbacks).forEach(callback => expect(callback).not.toHaveBeenCalled());
    rerender(<PulseGettingStarted {...props} expanded/>);
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
