import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n";
import "./styles.css";
import "./components/pulse-pace.css";
import { isTauri } from "@tauri-apps/api/core";
import { migrateLegacyPreferences } from "./lib/legacy-preferences";
import { initializePulseAppearance } from "./lib/pulse-appearance";

if (isTauri() && navigator.platform.startsWith("Mac")) {
  document.documentElement.dataset.platform = "macos";
}

async function renderApp() {
  const paceSurface = window.location.hash === "#pulse-badge" ? "badge" : window.location.hash === "#pulse-pace" ? "panel" : null;
  if (paceSurface) document.documentElement.dataset.paceSurface = paceSurface;
  await migrateLegacyPreferences();
  if (!isTauri() && new URLSearchParams(location.search).get("demo") === "1") {
    await (await import("../demo/bridge")).installDemoBridge();
  }
  if (import.meta.env.MODE === "e2e" || new URLSearchParams(location.search).get("demo") === "1") document.documentElement.dataset.demo = "true";
  await initializePulseAppearance();
  if (!isTauri() && new URLSearchParams(location.search).get("demo") !== "1") {
    const {PulseBrowserWelcome} = await import("./components/pulse-browser-welcome");
    ReactDOM.createRoot(document.getElementById("root")!).render(<PulseBrowserWelcome/>);
    return;
  }
  if (import.meta.env.MODE === "e2e") {
    await import("@wdio/tauri-plugin");
  }

  const App = paceSurface === "badge"
    ? (await import("./components/pulse-pace")).PulsePaceBadge
    : paceSurface === "panel"
    ? (await import("./components/pulse-pace")).PulsePacePanel
    : window.location.hash === "#widget"
    ? (await import("./components/pulse-widget")).PulseWidget
    : window.location.hash === "#tray"
    ? (await import("./components/tray-popover")).TrayPopover
    : (await import("./App")).default;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void renderApp();
