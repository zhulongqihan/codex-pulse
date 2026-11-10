// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(process.cwd(), "src/pulse/integration/panel.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: Record<string, unknown>) => { window: Window & typeof globalThis } };
type Message = { jsonrpc: string; id?: number; method?: string; params?: Record<string, unknown> };
const frames: HTMLIFrameElement[] = [];
const children: Window[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.close();
  for (const frame of frames.splice(0)) { frame.contentWindow?.close(); frame.remove(); }
  vi.restoreAllMocks();
});

function panel() {
  const messages: Message[] = [];
  vi.spyOn(window, "postMessage").mockImplementation(message => { messages.push(message as Message); });
  const child = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ""), { url: "https://pulse.invalid/", runScripts: "outside-only" }).window;
  children.push(child);
  Object.defineProperty(child, "parent", { value: window });
  const doc = child.document;
  const timers = new Map<number, () => void>(); let timerId = 0;
  vi.spyOn(child, "setTimeout").mockImplementation(((callback: () => void) => {
    timers.set(++timerId, callback); return timerId;
  }) as typeof child.setTimeout);
  vi.spyOn(child, "clearTimeout").mockImplementation(id => { timers.delete(Number(id)); });
  vi.spyOn(child, "setInterval").mockImplementation((() => 1000) as unknown as typeof child.setInterval);
  const receive = (data: unknown, source: Window = window) => child.dispatchEvent(new child.MessageEvent("message", { data, source }));
  const respond = async (message: Message, result: unknown, error?: unknown) => {
    receive({ jsonrpc: "2.0", id: message.id, ...(error ? { error } : { result }) });
    await Promise.resolve(); await Promise.resolve();
  };
  const get = (id: string) => doc.getElementById(id)!;
  const button = (id: string) => get(id) as HTMLButtonElement;
  child.eval(script);
  const connect = async () => {
    const init = messages[0];
    expect(init.method).toBe("ui/initialize");
    await respond(init, { hostContext: { locale: "en-US", theme: "light" } });
    return messages.find(message => message.method === "tools/call")!;
  };
  return { child, doc, messages, timers, receive, respond, get, button, connect };
}

function snapshot() {
  return { schemaVersion: 1, capturedAt: "2026-11-08T05:00:00Z",
    today: { date: "2026-11-08", timezone: "UTC", totalTokens: 13600, costUSD: 0.045,
      updatedAt: "2026-11-08T04:51:00Z", stale: false },
    quotas: [{ kind: "session", windowMinutes: 300, remainingPercent: 72.25, resetsAt: "2099-11-08T06:00:00Z" },
      { kind: "weekly", windowMinutes: 10080, remainingPercent: 0, resetsAt: null }],
    quotaUpdatedAt: "2026-11-08T04:59:00Z", quotaStale: false };
}

describe("the shipped MCP panel script", () => {
  it("keeps fresh pace independent of stale legacy quotas and a stale local summary", async () => {
    const p = panel(), usage = await p.connect();
    const now = new Date().toISOString();
    await p.respond(usage, { structuredContent: { ...snapshot(), quotaStale: true,
      pace: { schemaVersion: 1, status: "sampling", updatedAt: now, windows: [{ kind: "session", state: "sampling", windowMinutes: 300, remainingPercent: 70, resetsAt: new Date(Date.now() + 120 * 60_000).toISOString() }] } } });
    expect(p.doc.querySelector<HTMLElement>(".pace")!.dataset.state).toBe("ready");
    expect(p.get("pace-reading").textContent).toBe("70%");
    expect(p.get("session").classList.contains("outdated")).toBe(true);
  });

  it("does not use a fresh legacy quota timestamp to freshen stale or failed pace", async () => {
    const p = panel(), usage = await p.connect(), now = Date.now();
    const data = { ...snapshot(), quotaUpdatedAt: new Date(now).toISOString(), quotaStale: false,
      pace: { schemaVersion: 1, status: "sampling", updatedAt: new Date(now - 10 * 60_000).toISOString(), windows: [{ kind: "session", state: "sampling", windowMinutes: 300, remainingPercent: 0, resetsAt: new Date(now + 120 * 60_000).toISOString() }] } };
    await p.respond(usage, { structuredContent: data });
    expect(p.doc.querySelector<HTMLElement>(".pace")!.dataset.state).toBe("stale");
    expect(p.get("pace-reading").textContent).toBe("0%");
    p.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { ...data, pace: { ...data.pace, updatedAt: new Date(now).toISOString(), refreshFailed: true } } } });
    expect(p.doc.querySelector<HTMLElement>(".pace")!.dataset.state).toBe("failed");
  });

  it("retains the legacy quota freshness fallback when an older snapshot has no pace", async () => {
    const p = panel(), usage = await p.connect(), now = Date.now();
    await p.respond(usage, { structuredContent: { ...snapshot(), quotaUpdatedAt: new Date(now).toISOString(),
      quotas: [{ kind: "session", windowMinutes: 300, remainingPercent: 0, resetsAt: new Date(now + 120 * 60_000).toISOString() }] } });
    expect(p.doc.querySelector<HTMLElement>(".pace")!.dataset.state).toBe("exhausted");
    expect(p.get("pace-reading").textContent).toBe("0%");
  });
  it("negotiates the UI bridge then reads usage with empty arguments, retaining independent timestamps and fractional quota", async () => {
    const p = panel(), usage = await p.connect();
    expect(p.messages[0].params).toMatchObject({ protocolVersion: "2026-01-26", appInfo: { name: "Codex Pulse" } });
    expect(p.messages[1].method).toBe("ui/notifications/initialized");
    expect(usage.params).toEqual({ name: "pulse_usage", arguments: {} });
    await p.respond(usage, { structuredContent: snapshot() });
    expect(p.get("session").querySelector(".percent")!.textContent).toBe("72.25");
    expect(p.get("session").querySelector(".track")!.getAttribute("aria-valuenow")).toBe("72.25");
    expect(p.get("tokens").textContent).toBe("13,600");
    expect(p.get("cost").textContent).toBe("$0.045");
    const format = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    expect(p.get("updated").textContent).toBe(`Quota updated ${format(snapshot().quotaUpdatedAt)} · Today updated ${format(snapshot().today.updatedAt)}`);
    expect(p.get("status").textContent).toContain("Connected");
  });

  it("keeps unknown distinct from zero and never presents an expired window as available capacity", async () => {
    const p = panel(), usage = await p.connect(), data = snapshot();
    data.quotas[0].resetsAt = "2020-11-08T06:00:00Z";
    await p.respond(usage, { structuredContent: data });
    expect(p.get("session").querySelector(".percent")!.textContent).toBe("—");
    expect(p.get("session").querySelector(".reset")!.textContent).toContain("Window ended");
    expect(p.get("session").querySelector(".track")!.hasAttribute("aria-valuenow")).toBe(false);
    expect(p.get("weekly").querySelector(".percent")!.textContent).toBe("0");
    expect(p.get("weekly").querySelector(".track")!.getAttribute("aria-valuenow")).toBe("0");
    p.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: {
      schemaVersion: 1, capturedAt: null, quotas: [], today: { totalTokens: null, costUSD: null, stale: true }, quotaStale: true,
    } } });
    expect(p.get("tokens").textContent).toBe("—");
    expect(p.get("cost").textContent).toBe("—");
    expect(p.get("weekly").querySelector(".percent")!.textContent).toBe("—");
    expect(p.get("status").textContent).toContain("No local snapshot");
  });

  it("switches both appearances and follows host theme and language without accepting another window's messages", async () => {
    const p = panel(), usage = await p.connect();
    await p.respond(usage, { structuredContent: snapshot() });
    const stranger = document.createElement("iframe"); document.body.append(stranger); frames.push(stranger);
    p.receive({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "dark", locale: "zh-CN" } }, stranger.contentWindow!);
    expect(p.doc.documentElement.dataset.theme).toBe("light");
    expect(p.doc.documentElement.lang).toBe("en");
    p.receive({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "dark", locale: "zh-CN" } });
    expect(p.doc.documentElement.dataset.theme).toBe("dark"); expect(p.doc.documentElement.lang).toBe("zh-CN");
    const meter = p.doc.querySelector<HTMLButtonElement>('[data-style-choice="meter"]')!;
    meter.click(); expect(p.doc.querySelector("main")!.dataset.style).toBe("meter");
    expect(meter.getAttribute("aria-pressed")).toBe("true");
    p.doc.querySelector<HTMLButtonElement>('[data-style-choice="clear"]')!.click();
    expect(p.doc.querySelector("main")!.dataset.style).toBe("clear");
  });

  it("opens only the two desktop targets and recovers from RPC and tool errors", async () => {
    const p = panel(), usage = await p.connect();
    await p.respond(usage, { isError: true });
    expect(p.get("status").dataset.error).toBe("true"); expect(p.button("refresh").disabled).toBe(false);
    p.button("refresh").click(); const retry = p.messages.at(-1)!;
    await p.respond(retry, { structuredContent: snapshot() });
    expect(p.get("status").dataset.error).toBe("false");
    p.button("open").click(); const open = p.messages.at(-1)!;
    expect(open.params).toEqual({ name: "pulse_open", arguments: { target: "main" } });
    expect(p.button("open").disabled).toBe(true);
    await p.respond(open, null, { code: -32000, message: "synthetic failure" });
    expect(p.button("open").disabled).toBe(false); expect(p.get("status").dataset.error).toBe("true");
    p.button("widget").click(); const widget = p.messages.at(-1)!;
    expect(widget.params).toEqual({ name: "pulse_open", arguments: { target: "widget" } });
    await p.respond(widget, { structuredContent: { opened: true } });
    expect(p.get("status").textContent).toContain("Requested to show the widget");
  });

  it("keeps controls disabled when initialization never arrives and allows refresh after a usage timeout", async () => {
    const p = panel();
    expect(p.button("open").disabled).toBe(true);
    const initialize = p.messages[0];
    p.receive({ jsonrpc: "2.0", id: initialize.id, result: {} }, p.child);
    expect(p.messages).toHaveLength(1);
    const usage = await p.connect();
    expect(usage.method).toBe("tools/call");
    for (const callback of p.timers.values()) callback();
    await Promise.resolve(); await Promise.resolve();
    expect(p.get("status").textContent).toContain("did not respond");
    expect(p.button("refresh").disabled).toBe(false);
    p.button("refresh").click(); await p.respond(p.messages.at(-1)!, { structuredContent: snapshot() });
    expect(p.get("status").textContent).toContain("Connected");
  });

  it("answers a host ping without confusing the host's request ID with a pending app response", async () => {
    const p = panel(), initialize = p.messages[0];
    p.receive({ jsonrpc: "2.0", id: initialize.id, method: "ping" });
    await Promise.resolve();
    expect(p.messages.at(-1)).toEqual({ jsonrpc: "2.0", id: initialize.id, result: {} });
    expect(p.button("open").disabled).toBe(true); expect(p.timers.size).toBe(1);
    const usage = await p.connect();
    expect(usage.params).toEqual({ name: "pulse_usage", arguments: {} });
    await p.respond(usage, { structuredContent: snapshot() });
    expect(p.get("status").textContent).toContain("Connected");
  });

  it("preserves readings when a host pushes another tool's acknowledgement and rejects a malformed usage response", async () => {
    const p = panel(), usage = await p.connect();
    await p.respond(usage, { structuredContent: snapshot() });
    p.receive({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: { opened: true } } });
    expect(p.get("tokens").textContent).toBe("13,600");
    expect(p.get("session").querySelector(".percent")!.textContent).toBe("72.25");
    expect(p.get("status").textContent).toContain("Connected");
    p.button("refresh").click();
    await p.respond(p.messages.at(-1)!, { structuredContent: { schemaVersion: 1, quotas: "invalid", today: {} } });
    expect(p.get("tokens").textContent).toBe("13,600");
    expect(p.get("status").dataset.error).toBe("true");
    expect(p.button("refresh").disabled).toBe(false);
    p.button("refresh").click(); await p.respond(p.messages.at(-1)!, { structuredContent: snapshot() });
    expect(p.get("status").dataset.error).toBe("false");
  });
});
