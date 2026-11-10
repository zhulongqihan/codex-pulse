// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { installationCopy } from "@/lib/installation-copy";
import { PulseInstallationSettings, type InstallationInspection } from "./pulse-installation-settings";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
const inspection = (snapshotId = "backend-snapshot"): InstallationInspection => ({ supported: true, snapshotId, executable: "F:\\Moved\\CodexPulse.exe", dataDirectory: "F:\\Moved\\data", codexHome: "F:\\Host", checkedAt: "2026-11-10T00:00:00Z", entries: [
  { id: "desktop", status: "stale", canRepair: true, detailCode: "missingTarget", location: "F:\\Desktop\\Codex Pulse.lnk", targetPath: "F:\\Old\\CodexPulse.exe" },
  { id: "startMenu", status: "otherInstallation", canRepair: false, detailCode: "otherInstallation", location: "F:\\Programs\\Codex Pulse.lnk", targetPath: "F:\\Other\\CodexPulse.exe" },
  { id: "startup", status: "notConfigured", canRepair: false, detailCode: "notConfigured", location: "HKCU Run", targetPath: null },
  { id: "codexPlugin", status: "unavailable", canRepair: false, detailCode: "hostConfirmation", location: "F:\\Host\\config.toml", targetPath: null },
] });
beforeEach(async () => { invoke.mockReset(); Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} }); window.history.replaceState({}, "", "/"); await i18n.changeLanguage("en"); });
afterEach(() => { delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
describe("installation entry maintenance", () => {
  it("does no native work on mount and checks only after a user action", async () => {
    invoke.mockResolvedValue(inspection()); render(<PulseInstallationSettings/>); expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("installation-check")); await screen.findByTestId("installation-desktop");
    expect(invoke).toHaveBeenCalledExactlyOnceWith("inspect_pulse_installation");
    expect(within(screen.getByTestId("installation-startup")).queryByRole("button")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("installation-startMenu")).queryByRole("button")).not.toBeInTheDocument();
  });
  it("sends only the checked snapshot and chosen id, and reports a changed entry without claiming repair", async () => {
    invoke.mockResolvedValueOnce(inspection()).mockResolvedValueOnce({ inspection: inspection("new-snapshot"), results: [{ id: "desktop", outcome: "changedSinceCheck", detailCode: "changedSinceCheck" }] });
    const changed = vi.fn(); render(<PulseInstallationSettings onBindingsChanged={changed}/>); fireEvent.click(screen.getByTestId("installation-check"));
    const row = await screen.findByTestId("installation-desktop"); fireEvent.click(within(row).getByRole("button"));
    await screen.findByText(installationCopy("en", "changedSinceCheck"));
    expect(invoke).toHaveBeenLastCalledWith("repair_pulse_installation", { snapshotId: "backend-snapshot", entryIds: ["desktop"] }); expect(changed).not.toHaveBeenCalled();
  });
  it("reloads the existing startup query only for a confirmed startup repair", async () => {
    const state = inspection(); state.entries[2] = { ...state.entries[2], status: "stale", canRepair: true };
    invoke.mockResolvedValueOnce(state).mockResolvedValueOnce({ inspection: inspection(), results: [{ id: "startup", outcome: "repaired", detailCode: "startupPathOnly" }] });
    const changed = vi.fn(); render(<PulseInstallationSettings onBindingsChanged={changed}/>); fireEvent.click(screen.getByTestId("installation-check"));
    const row = await screen.findByTestId("installation-startup"); expect(row).toHaveTextContent(installationCopy("en", "startupImpact"));
    fireEvent.click(within(row).getByRole("button")); await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  });
  it("shows plugin preparation as manual follow-up, preserves per-item failures, and uses real settings navigation", async () => {
    const state = inspection(); state.entries[3] = { ...state.entries[3], status: "stale", canRepair: true, registeredTargetPath: "F:\\Old\\integrations\\codex" };
    invoke.mockResolvedValueOnce(state).mockResolvedValueOnce({ inspection: state, results: [{ id: "codexPlugin", outcome: "prepared", detailCode: "pluginReinstall" }, { id: "desktop", outcome: "failed", detailCode: "repairFailed" }] });
    render(<PulseInstallationSettings/>); fireEvent.click(screen.getByTestId("installation-check")); const row = await screen.findByTestId("installation-codexPlugin");
    expect(row).toHaveTextContent("Settings → General"); expect(row).toHaveTextContent("F:\\Old\\integrations\\codex"); fireEvent.click(within(row).getByRole("button"));
    await screen.findByText(installationCopy("en", "prepared")); expect(screen.getByTestId("installation-result-desktop")).toHaveTextContent(installationCopy("en", "failed"));
  });
  it("prevents overlapping operations and lets a failed check be retried", async () => {
    let reject!: (value: Error) => void; invoke.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce(inspection());
    render(<PulseInstallationSettings/>); const button = screen.getByTestId("installation-check"); fireEvent.click(button); fireEvent.click(button); expect(invoke).toHaveBeenCalledOnce(); expect(button).toBeDisabled();
    await act(async () => reject(new Error("internal path must not appear"))); await screen.findByText(installationCopy("en", "checkError")); expect(screen.queryByText("internal path must not appear")).not.toBeInTheDocument();
    fireEvent.click(button); await screen.findByTestId("installation-desktop"); expect(invoke).toHaveBeenCalledTimes(2);
  });
  it.each(["browser", "demo"])("never invokes native checks from the %s", async kind => {
    if (kind === "browser") delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; else window.history.replaceState({}, "", "/?demo=1");
    render(<PulseInstallationSettings/>); fireEvent.click(screen.getByTestId("installation-check")); expect(await screen.findByText(installationCopy("en", "browser"))).toBeInTheDocument(); expect(invoke).not.toHaveBeenCalled();
  });
  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("provides real instructions and manual plugin boundaries in %s", async language => {
    await i18n.changeLanguage(language); invoke.mockResolvedValue(inspection()); render(<PulseInstallationSettings/>); fireEvent.click(screen.getByTestId("installation-check"));
    await screen.findByTestId("installation-codexPlugin"); expect(screen.getByText(installationCopy(language, "safety"))).toBeInTheDocument(); expect(screen.getByText(installationCopy(language, "hostConfirmation"))).toBeInTheDocument();
    expect(screen.getByTestId("installation-settings")).not.toHaveTextContent("undefined");
  });
});
