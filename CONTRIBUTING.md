# Contributing

Thanks for helping make Codex usage easier to understand. Small, well-explained changes are welcome.

## Development

Use Node.js 24.15+ (or 26+), pnpm 10.20, Rust and the Windows MSVC build tools. WebView2 is required to run the native app:

```sh
pnpm install --frozen-lockfile
pnpm dev:app
```

Before submitting a pull request:

```sh
pnpm version:check
pnpm source:check
pnpm test:tooling
pnpm typecheck
pnpm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
pnpm build
```

Use `pnpm test:e2e:build` followed by `pnpm exec wdio run ./wdio.pulse.conf.ts` for real Windows WebView checks with synthetic data. Run `./scripts/package-portable.ps1` from PowerShell to create the portable ZIP. `scripts/build-env.ps1` puts local build caches beside the checkout and loads the existing MSVC environment without changing global tools.

The lockfiles and `patches/` are part of the build. The small WDIO patch makes test reporting support workspace names containing regular-expression characters, including `codex++`.

## What makes a useful contribution

- Describe the user-visible problem and the resulting behavior.
- Keep a change focused. Discuss large interaction or architecture changes in an issue first.
- Include a screenshot or short recording for visual changes, using demonstration data only.
- Keep labels and data sources clear. Local tokens, account limits, and API-price estimates must not be presented as the same measurement.
- Make settings, keyboard focus, unavailable data, and reduced motion part of the change rather than a later cleanup.

## Parser and data changes

Use small synthetic fixtures for token-count events, cumulative counter resets, cached input, archived records, and parent/subagent history boundaries. Do not commit a copied real session, even if its obvious secret has been removed.

Do not add cached input to input twice, infer a model that was not recorded, or convert local token totals into an official remaining percentage. Preserve a visible limitation when an older format cannot be reconstructed reliably.

Never modify original `.codex` logs. New caches belong in the app's own data directory. Keep large dependency downloads, build caches, and temporary files out of Git.

## Privacy and source attribution

Read [SECURITY.md](SECURITY.md) before submitting diagnostics or a security report. Review the staged diff and screenshots for account details, paths, conversation text, and credentials.

If you incorporate another project's source, identify its origin and license and retain the required notices in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Inspiration, code reuse, and project branding are different things; describe them accurately.

## Pull requests

Explain what changed, why it helps, how it was checked, and any remaining limitations. Do not claim a test passed unless it was actually run. A passing CI build is not evidence that account-wide and local-log totals must match.

Use a focused branch such as `feat/widget-controls`, `fix/range-boundaries`, or `chore/release-tooling`. New commit messages use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `build:`, `ci:`, or `chore:`, with an optional scope. Mark incompatible changes with `!` and explain their migration. This convention applies to new contributions; existing history is not rewritten.

Follow [VERSIONING.md](VERSIONING.md) for version changes and immutable releases. Use `pnpm version:bump patch --dry-run` before a version change, then the same command without `--dry-run`. Keep the Chinese and English guides, [CHANGELOG.md](CHANGELOG.md), and affected release notes synchronized. A source-only tooling or documentation change does not require rebuilding the installed application or changing its version.

Run `pnpm source:check:staged` after staging to inspect the exact files being committed. This checks tracked paths and high-confidence secret patterns; it complements human review of screenshots, fixtures, and the final diff.

新贡献使用独立、聚焦的分支与约定式提交。发布遵守版本一致性、实际验证和标签／资产不可覆盖规则；中文与英文使用说明同步。公开仓库只包含软件源码、构建／贡献说明和面向使用者的交付内容。内部需求记录、执行计划、审计和验收台账保留本地。

Unless explicitly stated otherwise, contributions are provided under this repository's [MIT License](LICENSE).
