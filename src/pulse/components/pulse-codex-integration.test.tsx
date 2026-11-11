// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { PulseCodexIntegration } from "./pulse-codex-integration";
import { integrationSettingsCopy } from "@/lib/integration-settings-copy";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(async () => { vi.mocked(invoke).mockReset(); history.replaceState(null,"","/"); await i18n.changeLanguage("en"); });
afterEach(() => { Reflect.deleteProperty(window, "__TAURI_INTERNALS__"); });
const desktop = () => Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });

describe("adding the Codex desktop entry", () => {
  it.each(["zh","zh-Hant","en","ja","ko","de"])("explains the actual local capabilities, following rule and host limits in %s",async language=>{
    await i18n.changeLanguage(language);render(<PulseCodexIntegration/>);
    for(const key of ["description","following","refresh","host"] as const)expect(screen.getByText(integrationSettingsCopy(language,key))).toBeVisible();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("does not request a real installation page from a synthetic demo even when its bridge is present",()=>{
    desktop();history.replaceState(null,"","/?demo=1");render(<PulseCodexIntegration/>);fireEvent.click(screen.getByRole("button",{name:"Add to Codex"}));
    expect(invoke).not.toHaveBeenCalled();expect(screen.getByRole("status")).toHaveTextContent("from the Pulse desktop app");
  });
  it("explains the desktop requirement without invoking a native command in a browser", () => {
    render(<PulseCodexIntegration />);
    fireEvent.click(screen.getByRole("button", { name: "Add to Codex" }));
    expect(screen.getByRole("status")).toHaveTextContent("from the Pulse desktop app");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("disables the pending action and explains that the user must complete the client's installation", async () => {
    desktop(); let resolve!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<PulseCodexIntegration />);
    fireEvent.click(screen.getByRole("button", { name: "Add to Codex" }));
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("prepare_codex_integration");
    await act(async () => { resolve(undefined); });
    expect(screen.getByRole("status")).toHaveTextContent("Complete installation and pin the sidebar entry");
    expect(screen.getByRole("button", { name: "Add to Codex" })).toBeEnabled();
  });

  it("keeps a failed native request recoverable with a retry", async () => {
    desktop(); vi.mocked(invoke).mockRejectedValueOnce(new Error("synthetic failure")).mockResolvedValueOnce(undefined);
    render(<PulseCodexIntegration />);
    fireEvent.click(screen.getByRole("button", { name: "Add to Codex" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not open"));
    fireEvent.click(screen.getByRole("button", { name: "Add to Codex" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Requested the Codex plugin page"));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("renders Traditional Chinese using the application's actual language code", async () => {
    await i18n.changeLanguage("zh-Hant");
    render(<PulseCodexIntegration />);
    expect(screen.getByRole("button", { name: "新增至 Codex" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "新增至 Codex" }));
    expect(screen.getByRole("status")).toHaveTextContent("Pulse 桌面版");
  });
});
