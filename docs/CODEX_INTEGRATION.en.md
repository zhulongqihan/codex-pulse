# Open Pulse inside Codex

[简体中文](CODEX_INTEGRATION.md) · [Back to README](../README.en.md)

Codex Pulse can connect to a Codex desktop client that supports MCP Apps as a local MCP plugin. Once installed, open Pulse from the client sidebar or a chat panel to see usage and quota without switching to a separate window. Codex controls the entry location, pinning behavior, and display mode. Pulse cannot place a button at arbitrary coordinates in the Windows title bar. These entrypoints are described in the [official OpenAI documentation](https://developers.openai.com/plugins/build/extensions).

## Add the shortcut

1. Extract the complete portable package to a location you intend to keep. Start Codex Pulse and refresh its data once.
2. In Pulse, go to **Settings → General → Codex desktop shortcut** and select **Add to Codex**.
3. Review the plugin details opened in Codex and choose **Install**. Complete any additional confirmation shown by the client.
4. Open **Codex Pulse** from the Codex sidebar. A supported client also exposes a chat panel entry. If the client offers pinning, pin the entry to the sidebar.

The add action creates a local plugin under `integrations/codex` in the Pulse application folder and opens the client plugin details. Codex performs the installation. No Node.js, API key, or additional background web service is required. The Settings action uses templates embedded in the executable, so it can prepare the plugin after an executable-only Pulse update as well.

The panel shows today's tokens, estimated cost, and the remaining quota and reset time for each available quota window. Window durations are labeled using the data obtained by Pulse. It includes refresh, open Pulse dashboard, and open desktop widget buttons. Unavailable data is shown as missing or stale.

## Data and refresh

The plugin reads the latest local summary snapshot saved by Pulse. Refreshing Pulse updates that snapshot; refreshing the panel reads it again. The plugin does not sign in independently, read authentication files, or send requests to the quota service.

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
- The plugin starts Pulse by executable name with a PATH bound to its installation folder. That folder must not contain a semicolon. After moving the portable folder, remove the old Pulse plugin in Codex and add it again from the new location. Reinstall from the plugin page if the client retains an old plugin cache after an update.
- Uninstall **Codex Pulse** in the Codex plugin page to remove its client entry. Pulse itself and existing usage data remain available.

See [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) and [desktop local MCP configuration](https://developers.openai.com/plugins/deploy/desktop-only) for stdio configuration, `${PLUGIN_ROOT}` paths, and local installation.
