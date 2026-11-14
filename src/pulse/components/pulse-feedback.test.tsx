// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { feedbackCopy } from "@/lib/feedback-copy";
import { feedbackUrl } from "@/lib/feedback";
import { defaultPulsePreferences } from "@/lib/pulse-appearance";
import { openUrl } from "@/lib/api";
import { version } from "../../../package.json";
import { PulseFeedback } from "./pulse-feedback";

vi.mock("@/lib/api", () => ({ openUrl: vi.fn() }));
vi.mock("@/lib/pulse-appearance", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/pulse-appearance")>();
  return { ...actual, usePulsePreferences: () => actual.defaultPulsePreferences };
});

beforeEach(async () => {
  vi.mocked(openUrl).mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  await i18n.changeLanguage("en");
});

describe("help and voluntary feedback", () => {
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("has translated actions and no requests or clipboard writes on mount in %s", async language => {
    await i18n.changeLanguage(language);
    render(<PulseFeedback/>);
    const copy = feedbackCopy(language);
    expect(screen.getByRole("heading", { name: copy.title })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.share })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.bug })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.trust })).toBeVisible();
    expect(screen.getByRole("combobox", { name: copy.stage })).toBeVisible();
    expect(screen.getByRole("textbox", { name: copy.preview })).toHaveAttribute("readonly");
    expect(openUrl).not.toHaveBeenCalled();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(screen.getByTestId("usage-guide")).not.toBeVisible();
    await userEvent.click(screen.getByText(copy.guide));
    expect(screen.getByTestId("usage-guide")).toBeVisible();
  });
  it("copies exactly the preview after optional choices, without sending it to GitHub", async () => {
    render(<PulseFeedback/>);
    const copy = feedbackCopy("en");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: copy.stage }), "used");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: copy.area }), "analysis");
    const preview = screen.getByRole("textbox", { name: copy.preview }) as HTMLTextAreaElement;
    expect(preview.value).toContain("Usage stage: used");
    expect(preview.value).toContain("Area: analysis");
    expect(preview.value).toContain(`Style: ${defaultPulsePreferences.skinId}`);
    await userEvent.click(screen.getByRole("button", { name: copy.copy }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(preview.value);
    expect(screen.getByRole("status")).toHaveTextContent(copy.copied);
    expect(openUrl).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: copy.stage }), "demo");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("provides recovery without reflecting a clipboard exception into public context", async () => {
    const write = vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(Error("private filesystem details"));
    render(<PulseFeedback/>);
    const copy = feedbackCopy("en");
    await userEvent.click(screen.getByRole("button", { name: copy.copy }));
    expect(screen.getByRole("alert")).toHaveTextContent(copy.copyFailed);
    expect(screen.getByTestId("pulse-feedback")).not.toHaveTextContent("private filesystem details");
    write.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole("button", { name: copy.copy }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(copy.copied);
  });
  it("keeps the preview selectable when the clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<PulseFeedback/>);
    const copy = feedbackCopy("en");
    await userEvent.click(screen.getByRole("button", { name: copy.copy }));
    expect(screen.getByRole("alert")).toHaveTextContent(copy.copyFailed);
    expect(screen.getByRole("textbox", { name: copy.preview })).not.toBeDisabled();
  });
  it("opens only the explicit fixed destination and adds no selected context to the URL", async () => {
    render(<PulseFeedback/>);
    const copy = feedbackCopy("en");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: copy.stage }), "used");
    for (const [label, kind] of [[copy.share, "discussion"], [copy.bug, "bug"], [copy.readGuide, "guide"], [copy.trust, "trust"]] as const) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(openUrl).toHaveBeenLastCalledWith(feedbackUrl(kind, "en", version));
    }
    expect(openUrl).toHaveBeenCalledTimes(4);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it("announces open failures, disables duplicate requests while pending, and permits retry", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(openUrl).mockImplementationOnce(() => new Promise((_resolve, failed) => { reject = failed; }));
    render(<PulseFeedback/>);
    const copy = feedbackCopy("en");
    await userEvent.click(screen.getByRole("button", { name: copy.share }));
    expect(screen.getByRole("status")).toHaveTextContent(copy.opening);
    expect(screen.getByRole("button", { name: copy.bug })).toBeDisabled();
    await act(async () => reject(Error("private OS failure")));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy.openFailed));
    expect(screen.getByRole("alert")).toHaveTextContent(feedbackUrl("discussion", "en", version));
    expect(screen.getByTestId("pulse-feedback")).not.toHaveTextContent("private OS failure");
    await userEvent.click(screen.getByRole("button", { name: copy.share }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(openUrl).toHaveBeenCalledTimes(2);
  });
});
