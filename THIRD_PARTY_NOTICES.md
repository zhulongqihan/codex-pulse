# Third-party notices

## Reused source

Codex Pulse has its own visual identity and portable distribution. Its Rust domain engine, orchestration, typed contracts, replay components, translations and regression tests are adapted from **Codex Usage Desktop 5.6.0**, MIT, Copyright (c) 2026 vincent. The imported commit is `1e8d2a2bae8ed466b0a48a37eb16f936629aa9c0`. The original license is preserved in [vendor/codex-usage-desktop/LICENSE](vendor/codex-usage-desktop/LICENSE); adapted source resides in `src-tauri/`, `src/pulse/`, and `e2e/`.

The compact desktop companion was also informed by the following project:

| Project | License and copyright | Reference reviewed |
|---|---|---|
| [asetho/ChatGPT-Usage](https://github.com/asetho/ChatGPT-Usage) | MIT; Copyright (c) 2026 asetho™ | [v1.0.33 LICENSE](https://github.com/asetho/ChatGPT-Usage/blob/v1.0.33/LICENSE) |

Additional source reuse must retain the applicable original copyright and license text. Acknowledgment alone does not satisfy copied code's license conditions.

## Dependencies

Tauri, React, Rust crates, JavaScript packages and bundled KaTeX fonts are distributed under their respective licenses. The root MIT license covers Codex Pulse's own code; it does not relicense third-party software. Microsoft WebView2 is supplied separately under Microsoft's terms.

Available original dependency license texts are collected in [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt), which accompanies the portable distribution. Regenerate it when dependencies change. [Source attribution](vendor/codex-usage-desktop/NOTICE.md) records the imported baseline.

The MIT-licensed [`auto-launch` 0.6.0 source](src-tauri/vendor/auto-launch) is included with a small Windows executable-path quoting fix. Its original license and [patch description](src-tauri/vendor/auto-launch/PATCHES.md) accompany the source.

The [`tauri-plugin-single-instance` 2.5.5 source](src-tauri/vendor/tauri-plugin-single-instance), under Apache-2.0 OR MIT, includes a small Windows instance-key extension so separate portable profiles remain isolated. Its original licenses and [patch description](src-tauri/vendor/tauri-plugin-single-instance/PATCHES.md) are preserved.

## Names and artwork

OpenAI, ChatGPT, and Codex are names belonging to their respective owners. Codex Pulse is not affiliated with or endorsed by OpenAI.

The `asetho` brand and upstream artwork are not reused. In particular, the MIT license of ChatGPT-Usage does not grant a license to the OpenAI knot. See that project's [trademark statement](https://github.com/asetho/ChatGPT-Usage/blob/main/TRADEMARKS.md).

Project screenshots and demonstrations must contain synthetic data only. They must not reuse an actual user's account details, sessions, or private project names.
