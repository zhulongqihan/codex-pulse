# Codex corner pace indicator and sidebar entry

[简体中文](CODEX_INTEGRATION.md) · [Back to README](../README.en.md)

Codex Pulse offers two entrypoints: a Windows corner companion and a local MCP sidebar plugin. Pulse provides the corner indicator through its own Windows surface; Codex controls the plugin's location, pinning, and display mode. Keep Pulse running for both.

## Corner pace indicator

1. Start Pulse and enable the **Codex corner pace indicator** in settings.
2. Open the Microsoft Store edition of Codex for Windows and bring it to the foreground. The top right shows the app icon and current pace state, without an extra Pulse brand word.
3. Click the status to open a card without an input box. See remaining quota, time until personal reset, consumption compared with time progress, and a daily/hourly reference allocation. New reset notices include their source.
4. Press Esc, click outside, or use the close button to dismiss the card. View consumption details opens the Pulse workspace with current-cycle pacing and observations expanded. Check account and connection opens the account panel directly when account information is missing.

Enable **Settings → General → Start Pulse at sign-in** to keep automatic following after a restart. The corner switch controls the companion display; it does not launch Pulse on its own. Sign-in startup keeps Pulse running in the tray. Captionless normal Codex windows are supported; minimization and switching to another app still hide the companion.

The companion does not modify Codex installation files. It follows the client when moved or resized, and hides when another application is active, Codex is minimized, no supported client is found, or the window is too small. Settings explain why it is hidden. Corner following currently supports only the Microsoft Store edition of Codex for Windows, not Codex Web, macOS, or a regular CLI.

### What the pace means

- The primary view shows remaining quota, personal reset time and consumption versus time-progress advice. It does not need a depletion forecast to remain useful. The workspace and desktop widget use the same calculation.
- Daily/hourly references spread the current remainder until personal reset; they are not new daily quota. Accounts returning only a weekly window are assessed within that window without invented short-window values.
- Daily records show only observed changes and coverage; upgrading does not manufacture history. New global reset notices show a third-party source, expected window and unconfirmed state, without repeatedly presenting old messages as new.

- Estimates use consecutive read-only observations of official personal quota. Tokens, API costs, and Credits are never converted into quota percentages.
- Account, workspace, selected log source, and actual quota window are isolated. A conservative time range requires at least 4 valid points over at least 15 minutes and significant positive consumption.
- A range describes the trend if recent consumption continues. It does not guarantee working time, request counts, or whether the limit will actually be reached before or after reset.
- Sampling, idle, slow, missing, stale, and expired states are explicit. Account changes, resets, decreasing consumption, or gaps over 10 minutes start new segments; readings older than about 6 minutes stop the forecast.
- The sampler reads existing quota about every 60 seconds by default, with cooldowns for errors and rate limits. It sends no model requests. Activate window in the main workspace remains a separate, confirmed operation that may consume quota.
- Slow weekly changes accumulate a longer continuous observation span, avoiding lost trends caused by unchanged rounded percentages over a short slice. Flat observations produce no forecast; known quota and reset time remain useful. A short window omitted by the service is not a zero balance.
- Project/model shares in the workspace describe local tokens, not their share of personal quota. Official account readings may include consumption on other devices.

Try the [pace card with synthetic data](https://zhulongqihan.github.io/codex-pulse/?demo=1&coachScenario=roomy#pulse-pace), or switch high pace, reset notice and stale states on the [product homepage](https://zhulongqihan.github.io/codex-pulse/). The website does not connect to local Codex.

## Add the MCP sidebar entry

The local MCP plugin works with a Codex desktop client supporting MCP Apps; see the [official OpenAI documentation](https://developers.openai.com/plugins/build/extensions). Its bottom composer belongs to the Codex host and cannot be reliably hidden by Pulse. Use the corner card above for a view without an input box.

1. Extract the complete portable package to a location you intend to keep. Start Codex Pulse and refresh its data once.
2. In Pulse, go to **Settings → Desktop & Codex → Codex desktop shortcut** and select **Add to Codex**.
3. Review the plugin details opened in Codex and choose **Install**. Complete any additional confirmation shown by the client.
4. Open **Codex Pulse** from the Codex sidebar. A supported client also exposes a chat panel entry. If the client offers pinning, pin the entry to the sidebar.

Starting with 0.7.1, normal startup and the Add action idempotently prepare `integrations/codex` from embedded templates. The portable archive no longer carries placeholder templates that could overwrite prepared files. Add also opens the client plugin details, where Codex performs installation. No Node.js, API key, or extra background web service is needed. Normal startup retains a valid existing data binding; explicitly adding again can change it.

The panel shows today's tokens, estimated cost, and the remaining quota and reset time for each available quota window. Window durations are labeled using the data obtained by Pulse. It also shows the current cycle’s daily observations and sourced, time-qualified public reset notices. Actions reread the snapshot or open the Pulse dashboard, desktop widget and consumption details. Unavailable data is shown as missing or stale.

## Language and appearance

The panel supports Simplified Chinese, Traditional Chinese, English, Japanese, Korean and German. It follows Pulse’s language and appearance by default; rereading the snapshot picks up the latest local preferences. Choose Clear or Meter for this panel only, or Follow Pulse to resume following. This does not change global Pulse or Codex preferences. The host locale is only a fallback when Pulse provides no language; Codex still controls its container and composer.

## Data and refresh

The plugin reads the latest local summary snapshot saved by Pulse. Refreshing Pulse updates that snapshot; Reread snapshot in the panel reads it again. The plugin does not sign in independently, read authentication files, or send requests to the quota service.

- Today's cost uses Pulse's local estimate and is not a billing amount.
- Quota comes from personal usage information already obtained by Pulse and includes remaining percentages and reset times.
- If Pulse is not running, has not saved a snapshot, or its data is stale, the panel says so. Open Pulse and refresh its data before refreshing the panel.
- MCP mode exposes summary reads and actions that open local Pulse windows. It does not expose chat content, account credentials, or raw session logs to the plugin.

## Manual preparation and registration

You can also open PowerShell in the complete portable package folder and run:

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path
```

The script creates the plugin, registers the `codex-pulse-local` marketplace through an installed Codex CLI, and opens the official plugin details. Complete installation in that page. Use `-CodexExecutable` to specify a CLI outside PATH, or use the action in Pulse Settings.

The script binds the data folder in the plugin configuration: `-DataDirectory` takes precedence over this PowerShell process's `PULSE_DATA_DIR`, otherwise it uses the adjacent `data` folder. A custom folder must be an absolute path. Preparation does not create or modify it. An already running Codex client does not inherit this shell's environment, so add the plugin again after changing the Pulse data folder.

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path -DataDirectory 'F:\PulseData'
```

To generate reviewable files and an install link without changing Codex configuration or opening the client:

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path -PrepareOnly -Json
```

This mode still writes `integrations/codex` inside the application folder. Its result includes the executable path, plugin folder, marketplace file, and `deepLink`. You can open that link with PowerShell's `Start-Process` when ready to continue installation.

To test marketplace registration against a separate Codex configuration folder without opening the client UI:

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path -CodexHome 'F:\CodexProfiles\PulseTest' -NoOpen -Json
```

`-CodexHome` only chooses the Codex configuration folder used by this CLI registration; it does not isolate Pulse usage data. Include `-NoOpen` for isolated registration checks so the link is not sent to the currently running desktop client. The script registers only its own marketplace and does not replace other plugin settings.

## Compatibility and maintenance

- This is a desktop local stdio plugin. Codex Web, mobile clients, and a regular CLI cannot provide the same desktop sidebar interface.
- The client must support MCP Apps and global/thread entrypoints. Organization policies may restrict local plugin installation. Check client support and permissions if the entries are unavailable.
- Installation through the client plugin page can load tools immediately on clients that support it. If the entry is still missing, check that the plugin is enabled, then try a new chat. Close and reopen the client normally if needed.
- The plugin starts Pulse by executable name with a PATH bound to its installation folder. That folder must not contain a semicolon. After moving the portable folder, check local entry bindings in Pulse Settings → Desktop & Codex and repair them as needed. If Codex still retains an old plugin cache, remove the old Pulse plugin and add it again from the new location. Reinstall from the plugin page if the client retains an old plugin cache after an update.
- Uninstall **Codex Pulse** in the Codex plugin page to remove its client entry. Pulse itself and existing usage data remain available.

See [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and [desktop local MCP configuration](https://developers.openai.com/plugins/deploy/desktop-only) for stdio configuration, `${PLUGIN_ROOT}` paths, and local installation.
