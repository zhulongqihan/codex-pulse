# Codex Pulse roadmap

[English README](../README.md) · [简体中文说明](../README.zh-CN.md) · [Releases](https://github.com/zhulongqihan/codex-pulse/releases) · [Feature requests](https://github.com/zhulongqihan/codex-pulse/issues)

This page distinguishes the v0.2.0 desktop app from future work. New themes and navigation do not imply full feature parity with other Codex usage applications. Planned items have no promised release date.

The [46-group audit](FEATURE_PARITY.zh-CN.md) records the exact v0.2.0 gaps. The [implementation and UI plan](PARITY_IMPLEMENTATION.zh-CN.md) and [acceptance ledger](parity/acceptance-matrix.json) define the full-parity work; planned groups are not marked delivered.

## Delivered in v0.2.0

- **Clear and Meter themes in the desktop app.** Switching themes preserves the current page, date selection, filters, search, sorting, and selected items.
- **Separate appearance controls.** Theme, Light / Dark / System color mode, and Off / Gentle / Full motion are independent preferences, with an option to respect system reduced motion.
- **Six usage views and Settings.** Dashboard, Sessions, Models, Daily, Monthly, and Projects. Monthly groups retained local activity by calendar month.
- **Date ranges.** Presets for 1, 2, 7, 14, 30, 60, 90, 180, and 365 days, plus all history and a custom inclusive date range.
- **Exports for the selected range.** CSV and Markdown exports of daily statistics.
- **Local usage statistics.** Input, cached input, output, and total tokens, with model, project, and session metadata reconstructed from retained local Codex logs.
- **Official account limits when available.** Read the remaining percentages and reset times exposed through the existing official Codex app-server sign-in. Unknown data stays unavailable; a failed refresh does not erase the last successful local statistics.
- **A floating widget and local app data.** Keep the widget beside your work and run the portable app from a writable drive of your choice. App preferences and caches stay local.

API-price references are optional estimates based on an available compatible local price cache. They are not subscription bills or Credits balances. The web demo and screenshots use synthetic data.

## Not yet implemented

### Conversation and session detail

- Complete user and assistant message replay, recorded reasoning summaries, tool activity, command output, patches, images, and related raw records.
- Search across recorded conversation titles and message bodies, with matching text, result navigation, and source context.
- Complete parent/child agent navigation, richer session details, and targeted session refresh.

The current session view provides usage metadata. It is not a full conversation viewer. Future replay must remain read-only and must not execute recorded commands.

### Account and pricing features

- Credits balances, per-session Credits deductions, reset-credit counts, and associated expiry details.
- Historical reset announcements, forecast signals, and related feeds, with explicit sources and freshness information.
- A complete searchable model-price catalog and direct price refresh.
- Model and session quota-consumption estimates with sufficient source evidence and uncertainty information.

Availability depends on the account service and retained records. Local token counts must not be presented as official quota consumption, and predictions must not be presented as guaranteed resets.

### Compatibility, export, and maintenance

- XLSX export and broader export content beyond daily usage statistics.
- Automatic WSL environment discovery and wider historical log-format coverage.
- Broader cache recovery, diagnostics, and source-selection tools.
- In-app update checks, download progress, and installation. Current releases are downloaded from GitHub.

## Contribute to the roadmap

Describe the problem, the data available, and the behavior you expect in a [GitHub issue](https://github.com/zhulongqihan/codex-pulse/issues). Use synthetic examples and avoid posting real conversations, account details, credentials, or private paths. See [CONTRIBUTING.md](../CONTRIBUTING.md) and [SECURITY.md](../SECURITY.md).
