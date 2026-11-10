// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { UpdateRecoveryResult } from "@/lib/api";
import { UpdateRecoveryNotice } from "./update-recovery-notice";

const result: UpdateRecoveryResult = { id: "synthetic-result", status: "restored", reason: "Updated app did not confirm startup", attemptedVersion: "0.7.2", recordedAt: "2026-11-10T00:00:00Z" };
describe("update recovery notice", () => {
  it("keeps unconfirmed recovery distinct from a verified restore and never renders raw reasons as markup", async () => {
    await act(async () => { await i18n.changeLanguage("en"); });
    const actions = { onDismiss: vi.fn(async () => {}), onOpenRecords: vi.fn(async () => {}) };
    const { rerender } = render(<UpdateRecoveryNotice result={{ ...result, status: "incomplete", reason: "<script>synthetic</script>" }} error={null} {...actions}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Recovery could not be confirmed");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByText(/restored and verified/)).not.toBeInTheDocument();
    rerender(<UpdateRecoveryNotice result={result} error={null} {...actions}/>);
    expect(screen.getByRole("status")).toHaveTextContent("restored and verified");
    expect(screen.getByText("0.7.2", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open update records" }));
    await waitFor(() => expect(actions.onOpenRecords).toHaveBeenCalledOnce());
  });
  it("keeps the result available when marking it read fails", async () => {
    await act(async () => { await i18n.changeLanguage("en"); });
    render(<UpdateRecoveryNotice result={result} error={null} onDismiss={vi.fn(async () => { throw new Error("synthetic write failure"); })} onOpenRecords={vi.fn(async () => {})}/>);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again");
    expect(screen.getByText("The previous update did not finish")).toBeVisible();
    expect(screen.getByRole("button", { name: "Got it" })).toBeEnabled();
  });
});
