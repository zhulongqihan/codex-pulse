# Changelog / 版本记录

User-facing changes are grouped by release, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). See [VERSIONING.md](VERSIONING.md) for version and compatibility rules.

## [Unreleased]

## [0.7.0] - 2026-11-09

### Added / 新增

- Quota pacing across the corner card, desktop widget and workspace: remaining quota, personal reset time, consumption versus time progress, and a clearly labelled daily or hourly reference allocation.
- 右上角卡片、桌面浮窗与主界面统一额度配速：余量、个人周期重置时间、消耗与时间进度比较，以及明确标注的日均或每小时分配参考。
- Partial daily observations for the current cycle, a near-reset surplus hint and conditional remaining-at-reset ranges when measured trends support them. Missing history is never treated as zero.
- 本轮逐日部分观测、临近重置余量提示，以及数据充分时的重置余量条件区间；缺失记录不会当作零。
- Background reset notices with visible third-party source, expected time, unread state and deduplication. A global notice does not confirm a personal reset.
- 后台重置预告提供醒目的来源、预计时间、未读状态与去重；全局消息不等于本人额度已重置。

### Fixed / 修复

- Give recent depletion risk priority over long-task advice, retain the full-cycle comparison baseline, and replace a clamped zero-to-zero projection with a clear conditional warning.
- 近期可能提前用尽时优先提醒风险，保留整轮比较基线，并把零到零的预测改为明确条件提示。
- Keep the compact widget at its intended client size under Windows high DPI; keep public demo scenes, gallery identity and screenshots consistent.
- 高 DPI 下折叠浮窗保持设计尺寸，公开演示场景、图库图标和截图同步。
- Adapt weekly quota observations to slow, integer-percentage changes instead of requiring a measurable change in every fifteen-minute slice. Flat, stale and interrupted observations still do not produce a time estimate.
- 周额度采样适配较慢的整数百分比变化，不再机械要求每个十五分钟片段都能分辨消耗；持续不变、陈旧和中断的观测仍不生成预测。
- Keep conservative time bounds near exhaustion when the service does not specify how integer quota percentages are rounded.
- 官方未说明整数百分比舍入方式时，靠近额度上限也保留更保守的时间误差范围。
- Explain why an estimate is unavailable, show known reset times and actual local token totals, and distinguish a window the service did not return from a zero balance.
- 无法预测时说明原因，保留已知重置时间与本机实际 Token 数量；区分接口未返回的窗口和额度为零。
- Follow Codex movement through Windows location events and coalesced updates instead of the old quarter-second polling interval, while retaining focus and host validation.
- 通过 Windows 窗口位置事件和合并更新跟随 Codex，替代原先每四分之一秒轮询，并保留焦点与宿主校验。

[完整中英说明 / Full release notes](docs/releases/v0.7.0.md)

## [0.6.1] - 2026-11-08

### Fixed / 修复

- Prioritize a fresh exhausted quota window over a forecast whose lower time bound is zero. The compact status now reports the exhausted window while retaining each window's own readings.
- 当另一窗口的预测时间下界恰好为零时，优先显示已经用尽的额度窗口；各窗口原有读数继续保留。
- Keep the public homepage version in sync with the application manifest.
- 产品首页版本号改为读取软件清单，随版本更新同步。

### Community / 社区

- Opened Discussions and added clearer bilingual feedback and contribution links, including the public preview footer.
- 开启讨论区并完善双语问题、建议与贡献入口，公开演示页脚也可直接进入反馈。

[完整中英说明 / Full release notes](docs/releases/v0.6.1.md)

## [0.6.0] - 2026-11-08

### Added / 新增

- Compact Windows companion at the top right of Codex, with a shared app icon and an expandable pace card without a text box. Follows the Microsoft Store client and hides outside it.
- Codex 右上角 Windows 伴随提示，统一软件图标与无输入框节奏卡片；跟随商店版客户端，切到其他窗口时隐藏。
- Personal quota pace from consecutive official observations: conservative time-to-limit ranges, relation to reset, and explicit sampling, slow, idle, stale, and unknown states.
- 连续官方观测得到的个人额度节奏：保守触顶区间、与重置的先后关系，以及采样中、缓慢、无变化、陈旧和未知状态。
- Today's local project/model token sources, kept separate from account quota. Read-only sampling sends no model requests and applies error/rate-limit cooldowns.
- 今日项目／模型 Token 来源与账号额度独立呈现；只读采样不发模型请求，错误与限流时冷却。
- Chinese/English product homepage with the actual interactive pace card, synthetic forecast/sampling/stale scenarios, and Windows downloads.
- 中英产品首页、真实节奏卡片交互、合成预测／采样／陈旧场景及 Windows 下载入口。

### Changed / 调整

- Shared app identity across the executable, tray, companion, and interface. Clear and Meter remain available.
- 程序、托盘、伴随窗口与界面统一软件图标，保留清爽／刻度。
- The existing MCP sidebar entry remains available. Its host-owned composer cannot be reliably hidden; the corner card provides the input-free view.
- 保留原有 MCP 侧栏入口；宿主输入框无法可靠隐藏，右上角卡片提供无输入框视图。

[完整中英说明 / Full release notes](docs/releases/v0.6.0.md)

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

[Unreleased]: https://github.com/zhulongqihan/codex-pulse/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.6.0
[0.5.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.5.0
[0.4.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.4.0
[0.3.0]: https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.3.0
