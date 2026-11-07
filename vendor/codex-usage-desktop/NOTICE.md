# Codex Usage Desktop attribution

Codex Pulse reuses the MIT-licensed Rust engine, typed service contracts,
orchestration, accessible UI components, translations, and regression tests from
[Codex Usage Desktop](https://github.com/itvincent-git/codex-usage-desktop), by Vincent and contributors.

The imported baseline is tag `app-v5.6.0`, commit
`1e8d2a2bae8ed466b0a48a37eb16f936629aa9c0`.
The preserved license is [LICENSE](LICENSE).

Adapted sources are in `src-tauri/`, `src/pulse/`, and `e2e/`.
Codex Pulse adds its own identity, portable storage, Clear/Meter presentation,
independent floating widget, packaging, and distribution configuration.
This repository builds those tracked sources directly; no private checkout is required.
