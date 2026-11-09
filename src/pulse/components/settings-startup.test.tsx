// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { paceCopy } from "@/lib/pulse-pace-copy";
import { SettingsPage } from "./settings-page";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
vi.mock("./pulse-codex-integration", () => ({ PulseCodexIntegration: () => null }));
vi.mock("./pulse-source-settings", () => ({ PulseSourceSettings: () => null }));

function props(overrides: Partial<ComponentProps<typeof SettingsPage>> = {}): ComponentProps<typeof SettingsPage> {
  return {
    initialSection: "general", isResetting: false, isDisabled: false, onReset: vi.fn(),
    updateInfo: null, isUpdateChecking: false, updateCheckError: null, updateInstallStatus: "idle",
    updateProgress: { downloaded: 0, total: null, percent: null, finished: false }, updateInstallError: null,
    onCheckUpdates: vi.fn(), onUpgrade: vi.fn(), onOpenUpdateRelease: vi.fn(),
    launchAtLogin: false, launchAtLoginKnown: true, launchAtLoginError: null, isLaunchAtLoginUpdating: false,
    onLaunchAtLoginChange: vi.fn(), showLogsTab: false, onShowLogsTabChange: vi.fn(),
    autoRefreshIntervalMinutes: 3, onAutoRefreshIntervalChange: vi.fn(),
    trayTitleShow: { limit5h: true, limitWeekly: true, tokens: true, cost: true }, onTrayTitleShowChange: vi.fn(),
    trayMenuShow: { limit5h: true, limitWeekly: true, tokens: true, cost: true }, onTrayMenuShowChange: vi.fn(),
    trayCountdownUnits: { minute: "m", hour: "h", day: "d" }, onTrayCountdownUnitChange: vi.fn(), codexLimits: null,
    ...overrides,
  };
}

beforeEach(async () => {
  history.replaceState(null, "", "/?demo=1");
  Element.prototype.scrollIntoView = vi.fn();
  document.documentElement.dataset.skin = "clear";
  await i18n.changeLanguage("en");
});

describe("login startup and the existing titlebar setting", () => {
  it.each(["en", "zh", "zh-Hant", "ja", "ko", "de"])("keeps login startup separate from opening Codex in %s", async language => {
    await i18n.changeLanguage(language);
    render(<SettingsPage {...props()}/>);
    const note = screen.getByText(paceCopy(language, "settingNote"));
    expect(note).toBeVisible(); expect(note).toHaveTextContent("Pulse"); expect(note).toHaveTextContent("Codex");
    expect(screen.getByRole("heading", { name: i18n.t("settings.launch_at_login_title") })).toBeVisible();
    expect(screen.getByTestId("login-startup-status")).toHaveTextContent(i18n.t("settings.launch_at_login_disabled"));
    expect(document.querySelectorAll("#toggle-launch-at-login")).toHaveLength(1);
    expect(screen.getByRole("button", { name: paceCopy(language, "manageStartup") })).toBeVisible();
  });

  it("does not report the initial unknown value as off or allow a write before the read completes", async () => {
    const handlers = props({ launchAtLoginKnown: false });
    const { rerender } = render(<SettingsPage {...handlers}/>);
    const toggle = screen.getByRole("button", { name: "Toggle Launch at Login" });
    expect(screen.getByTestId("login-startup-status")).toHaveTextContent("Reading the login-startup setting");
    expect(toggle).toHaveAttribute("aria-pressed", "mixed"); expect(toggle).toBeDisabled();
    await userEvent.click(toggle); expect(handlers.onLaunchAtLoginChange).not.toHaveBeenCalled();
    rerender(<SettingsPage {...handlers} launchAtLoginKnown/>);
    expect(toggle).not.toBeDisabled(); expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("login-startup-status")).toHaveTextContent("Off:");
  });

  it("keeps saving and errors ahead of on/off claims, with explicit recovery on the same control", async () => {
    const handlers = props({ launchAtLogin: true });
    const { rerender } = render(<SettingsPage {...handlers}/>);
    expect(screen.getByTestId("login-startup-status")).toHaveTextContent("Enabled:");
    rerender(<SettingsPage {...handlers} isLaunchAtLoginUpdating/>);
    const toggle = screen.getByRole("button", { name: "Toggle Launch at Login" });
    expect(toggle).toBeDisabled(); expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Manage login startup" })).toBeDisabled();
    expect(screen.getByTestId("login-startup-status")).toHaveTextContent("Saving the login-startup setting");
    rerender(<SettingsPage {...handlers} launchAtLogin={false} launchAtLoginKnown={false} launchAtLoginError="Cannot read the login item"/>);
    expect(screen.getByTestId("login-startup-status")).toHaveTextContent("could not be confirmed");
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot read the login item");
    expect(toggle).not.toBeDisabled();
    await userEvent.click(toggle); expect(handlers.onLaunchAtLoginChange).toHaveBeenCalledExactlyOnceWith(true);
    rerender(<SettingsPage {...handlers} isDisabled/>);
    expect(screen.getByRole("button", { name: "Manage login startup" })).toBeDisabled();
  });

  it.each(["clear", "meter"])("moves keyboard focus to the one existing toggle without enabling it in %s", async skin => {
    document.documentElement.dataset.skin = skin;
    const handlers = props(); render(<SettingsPage {...handlers}/>);
    const manage = screen.getByRole("button", { name: "Manage login startup" });
    manage.focus(); await userEvent.keyboard("{Enter}");
    const toggle = screen.getByRole("button", { name: "Toggle Launch at Login" });
    expect(toggle).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    expect(handlers.onLaunchAtLoginChange).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await userEvent.keyboard(" "); expect(handlers.onLaunchAtLoginChange).toHaveBeenCalledExactlyOnceWith(true);
  });
});
