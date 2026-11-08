# Changelog / 版本记录

User-facing changes are grouped by release, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). See [VERSIONING.md](VERSIONING.md) for version and compatibility rules.

## [Unreleased]

## [0.5.0] - 2026-11-08

### Added / 新增

- Local Codex desktop plugin with Clear/Meter quota and today panels, local snapshot refresh, and dashboard/widget actions.
- Codex 桌面本地插件，提供清爽／刻度额度与今日面板、本地快照刷新及主窗／浮窗操作。
- Add-to-Codex action in General settings, with plugin templates embedded in the executable for portable and executable-only updates.
- 常规设置内的“添加到 Codex”，程序内置插件模板，支持便携包和仅可执行文件更新。
- Contributor version-synchronization tooling and release consistency checks.
- 开发者版本同步工具与发布一致性检查。

[完整中英说明 / Full release notes](docs/releases/v0.5.0.md)

## [0.4.0] - 2026-11-07

### Added / 新增

- Stable today summary, complete-range trend overview, and visible widget, help, and shortcut actions.
- 独立今日用量、完整范围趋势，以及直接可见的悬浮窗、帮助和快捷方式入口。
- Desktop and Start menu shortcut creation and repair; reopening the same data profile restores its existing window.
- 桌面／开始菜单快捷方式创建与修复；重复启动同一数据目录时恢复已有窗口。

### Changed / 调整

- Explicit account drawer at narrow widths, settings sections with scroll restoration, and consistent API estimate labels in six languages.
- 窄窗账号抽屉、设置分区与滚动位置恢复，以及六语统一 API 估价说明。

### Fixed / 修复

- Session-date navigation respects the motion-off setting.
- 会话日期跳转遵循关闭动效设置。

[完整中英说明 / Full release notes](docs/releases/v0.4.0.md)

## [0.3.0] - 2026-11-07

### Added / 新增

- Tauri desktop delivery with Clear and Meter, local analytics, full session replay, account capacity, portable storage, widget, exports, and signed updates.
- Tauri 桌面交付，提供清爽／刻度、本地分析、完整会话回放、账号额度、便携存储、悬浮窗、导出与签名更新。

[完整中英说明 / Full release notes](docs/releases/v0.3.0.md)

Earlier releases remain available in [GitHub Releases](https://github.com/zhulongqihan/codex-pulse/releases). / 更早版本保留在 GitHub Releases。

[Unreleased]: https://github.com/zhulongqihan/codex-pulse/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.5.0
[0.4.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.4.0
[0.3.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.3.0
