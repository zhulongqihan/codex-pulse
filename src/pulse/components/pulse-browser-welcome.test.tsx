// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { PulseBrowserWelcome } from "./pulse-browser-welcome";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => false }));

beforeEach(async () => {
  history.replaceState(null, "", "/");
  vi.mocked(invoke).mockReset();
  await i18n.changeLanguage("en");
});

describe("public download and work-scenario path", () => {
  it.each([
    { language: "en", download: "Download for Windows", trust: "How to verify SHA256", support: /The corner indicator follows only Microsoft Store Codex/, success: /A valid quota reading and reset time are enough/, signature: /no Authenticode publisher signature/, data: /The Rust process uses the existing sign-in/ },
    { language: "zh", download: "下载 Windows 版", trust: "如何核对 SHA256", support: /右上角跟随仅支持 Windows 商店版 Codex/, success: /首次看到有效余量和重置时间/, signature: /尚无 Authenticode 发布者代码签名/, data: /Rust 进程使用既有登录/ },
  ])("lets a $language reader judge eligibility and trust before installing", async copy => {
    await i18n.changeLanguage(copy.language);
    render(<PulseBrowserWelcome/>);
    const download = screen.getByRole("link", { name: copy.download });
    const support = screen.getByText(copy.support);
    expect(support.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(support).toHaveTextContent(copy.language === "en" ? "API-key" : "API Key");
    expect(screen.getByText(copy.success)).toBeVisible();
    expect(screen.getByText(copy.signature)).toBeVisible();
    expect(screen.getByText(copy.data)).toBeVisible();
    expect(download).toHaveAttribute("href", "https://github.com/zhulongqihan/codex-pulse/releases/latest");
    expect(screen.getByRole("link", { name: copy.trust })).toHaveAttribute("href", expect.stringContaining("/docs/TRUST.md#"));
    expect(document.querySelector("iframe")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps focus on the host page until the visitor interacts, then restores the badge on Escape", () => {
    render(<PulseBrowserWelcome/>);
    expect(document.activeElement).toBe(document.body);
    const scene = screen.getByTestId("site-work-scene");
    expect(within(scene).getByTestId("coach-remaining")).toHaveTextContent("80%");
    expect(screen.getByTestId("pace-badge")).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(screen.getByTestId("pace-badge").getAttribute("aria-controls")!)).toBeInTheDocument();
    const collapse = screen.getByRole("button", { name: "Collapse indicator" });
    collapse.focus();
    fireEvent.keyDown(collapse, { key: "Escape" });
    expect(screen.queryByTestId("site-live-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("pace-badge")).toHaveFocus();
    expect(screen.getByTestId("pace-badge")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByTestId("pace-badge"));
    expect(screen.getByTestId("site-live-card")).toBeVisible();
  });

  it("shows the actual follow-window behavior without account access or losing the selected data state", () => {
    render(<PulseBrowserWelcome/>);
    fireEvent.click(screen.getByRole("button", { name: "High pace" }));
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("20%");
    fireEvent.click(screen.getByRole("button", { name: "Switch to another app" }));
    expect(screen.queryByTestId("pace-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("site-live-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Codex in foreground" }));
    expect(screen.getByTestId("pace-badge")).toBeVisible();
    expect(screen.queryByTestId("site-live-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pace-badge"));
    expect(screen.getByTestId("coach-remaining")).toHaveTextContent("20%");
    fireEvent.click(screen.getByRole("button", { name: "Simulate continuing work; collapse indicator" }));
    expect(screen.queryByTestId("site-live-card")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("labels the synthetic context and preserves supported scenario links without invented language parameters", async () => {
    render(<PulseBrowserWelcome/>);
    expect(screen.getByText(/Synthetic work scenario, not an official client screenshot/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stale data" }));
    expect(screen.getByTestId("site-live-card")).toBeVisible();
    const destination = new URL(screen.getByRole("link", { name: "Explore local usage in the workspace" }).getAttribute("href")!);
    expect(destination.searchParams.get("demo")).toBe("1");
    expect(destination.searchParams.get("coachScenario")).toBe("stale");
    expect(destination.searchParams.has("lang")).toBe(false);
    expect(screen.getByText(/Local tokens do not represent their share of account quota/)).toBeVisible();
    expect(invoke).not.toHaveBeenCalled();
  });
});
