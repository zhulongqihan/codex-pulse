# Codex Pulse product

Status: shipping Windows x64 desktop application, v0.2.0. [README](README.md) / [简体中文](README.zh-CN.md) describes startup and usage; [DESIGN.md](DESIGN.md) describes the Clear/Meter system; [the roadmap](docs/ROADMAP.md) separates delivered features from future work.

## Users and purpose

Codex Pulse serves Windows Codex users who want to see today's local activity and remaining account capacity while they work, then inspect where usage came from. The interface is Chinese-first and also supports English-speaking users.

The product combines an optional always-on-top widget with a larger local usage workspace. It reuses an existing official Codex sign-in for account limits and independently reconstructs token statistics from retained local logs. The two measurements remain visibly distinct.

## Current product contract

| Area | Delivered behavior |
|---|---|
| Workspace | Dashboard, Sessions, Models, Daily, Monthly, and Projects, plus Settings |
| Date ranges | 1, 2, 7, 14, 30, 60, 90, 180, and 365 days; all retained history; custom inclusive start/end dates |
| Monthly view | Calendar-month aggregation of retained local activity |
| Usage detail | Input, cached input, output, total tokens, and available model/project/session metadata |
| Export | Daily statistics within the selected range, as CSV or Markdown; desktop save dialog starts in the app data directory's `exports` subfolder |
| Account capacity | Remaining percentages, usage windows, and reset times actually returned by the official Codex app-server |
| Widget | Existing compact and expanded forms, optional always-on-top display, open-dashboard and hide actions |
| Appearance | Clear/Meter styles, Light/Dark/System color mode, Off/Gentle/Full motion, system reduced-motion support, and compact row spacing |
| Settings | Chinese/English, widget visibility, launch at sign-in, refresh interval, data-folder access, Codex executable selection, and explicit local-log rescan |

Clear provides horizontal date comparisons and continuous lists. Meter provides a single dark comparison field in its light layout, with up to seven recent activity days and a dynamic common scale. Both styles are part of the production desktop app.

Changing style preserves the current page, range, selected date, filters, search, sorting, and selected session. Style, color mode, and motion are independent preferences. A style change does not refresh account limits or rescan logs.

## Reading the data correctly

| Source | Meaning and limits |
|---|---|
| Local Codex session logs | Activity recoverable from files retained on this computer, grouped in the local time zone; missing or deleted records cannot be recreated |
| Official Codex account service | Account-wide limits returned for the current sign-in, which may include activity from other devices |
| Compatible local reference-price cache | Optional API token-price estimates; not a Pro subscription bill, Credits balance, or additional charge |

Cached input is part of input tokens and is not added twice. Local token totals cannot be converted directly into an official remaining quota percentage. Unknown quota, missing prices, and unavailable token breakdowns stay visibly unknown; they are not filled with invented zeroes or sample values.

Local scanning and account refresh are separate operations. Failed refreshes retain usable previous data and expose their status. An explicit log rescan rereads local records without requesting account limits.

## Storage and privacy

Pulse can run from any writable drive. The portable app stores its preferences, caches, temporary files, and app logs in `data` beside the executable; a source checkout defaults to `.local/data`. `PULSE_DATA_DIR` can select another absolute writable app-data directory. Installation and build caches can remain on the checkout drive.

This does not relocate Codex's own logs or authentication. Original session logs remain read-only, and the official Codex client manages sign-in and authentication refresh. Pulse does not ask for copied authentication files, passwords, or a separate API key to read subscription capacity.

Pulse adds no analytics or telemetry. Account queries contact OpenAI through the existing Codex client; local usage statistics are not uploaded by Pulse. Public screenshots, previews, and fixtures use labeled synthetic data.

## Scope boundaries

The session view currently exposes usage and metadata. Full conversation and tool replay, conversation-title/body search, complete agent navigation, Credits and reset-credit details, reset forecasts, a complete model-price catalog, XLSX export, automatic WSL discovery, and in-app automatic updates remain future work.

v0.2.0 does not claim complete feature parity with reference applications. It also does not promise complete cross-device history, every cloud task, or every historical log format. Future capabilities depend on retained records and the fields the official client and account service make available. See [the roadmap](docs/ROADMAP.md).

## Product and quality principles

- A glance answers what remains; the workspace explains recorded activity by date, model, project, and session.
- Keep capacity, local tokens, and API estimates clearly labeled and independently refreshable.
- Preserve the user's working state when changing appearance, density, or motion.
- Keep Chinese and English labels useful, source timestamps visible, and unavailable data understandable.
- Use semantic controls, visible keyboard focus, readable contrast, reduced-motion alternatives, and non-color status cues.
- Validate the actual Electron views and widget as well as source tests, build output, and renderer failure recovery. Passing those checks does not imply that every historical log or upstream feature is covered.

Codex Pulse is an independent open-source project with its own identity. It is not affiliated with or endorsed by OpenAI.
