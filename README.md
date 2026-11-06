# Codex Pulse — Windows Codex 用量监控与 Token 统计

查看本机 Codex Token 消耗、ChatGPT / Codex 官方账号剩余额度，用一个置顶悬浮窗陪伴日常工作。Codex Pulse 是 Windows x64 桌面用量监控工具（Codex Usage Monitor / Token Tracker），提供 **清爽 Clear** 与 **刻度 Meter** 两种可切换主题。

**[English](README.en.md)** · **[下载 v0.2.0](https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.2.0)** · [在线演示](https://zhulongqihan.github.io/codex-pulse/) · [截图图集](https://zhulongqihan.github.io/codex-pulse/gallery.html) · [全部版本](https://github.com/zhulongqihan/codex-pulse/releases) · [反馈问题](https://github.com/zhulongqihan/codex-pulse/issues)

> 本项目独立开发，不隶属于 OpenAI，也不代表 OpenAI 官方产品。截图与网页演示均使用合成数据；网页演示无法读取你的本机日志或账号。

## v0.2.0 能做什么

- **两种主题，共用工作状态**：清爽强调留白与轻量阅读；刻度强化图表对比和数字层级。切换主题保留当前页面、日期、筛选、搜索、排序与选择。
- **六个主视图**：仪表盘、会话、模型、按日、按月、项目，另设独立设置页。按月将当前所选范围内的用量按月份分组。
- **本机 Token 历史**：从保留的 Codex 会话日志整理输入、缓存输入、输出和总 Token，按模型、项目、会话查看分布。
- **官方账号额度**：通过官方本地 app-server 复用现有 Codex 登录，读取实际返回的使用窗口、剩余比例和重置时间。
- **桌面悬浮窗**：置顶查看剩余额度和今日活动，需要详情时打开完整看板。
- **外观与动效分别控制**：清爽 / 刻度、浅色 / 深色 / 跟随系统、关闭 / 轻柔 / 完整动效分别选择；可尊重系统的减少动态效果偏好。
- **完整日期预设与自定义范围**：支持 1、2、7、14、30、60、90、180、365 天与全部历史，也可自定义包含起止两天的闭区间。
- **CSV 与 Markdown 导出**：导出当前日期范围内的每日统计。桌面保存对话框默认打开应用数据目录下的 `exports` 子目录，也可自行选择其他位置。
- **本地缓存**：将应用数据保存在自己选择的盘符。Codex Pulse 不添加分析遥测。

## 清爽与刻度

两种主题显示相同数据，在 **设置** 中选择适合自己的阅读方式。

| 清爽 Clear | 刻度 Meter |
|---|---|
| ![清爽主题仪表盘，使用合成演示数据](docs/screenshots/clear-overview.png) | ![刻度主题仪表盘，使用合成演示数据](docs/screenshots/meter-overview.png) |

| 设置 | 桌面悬浮窗 |
|---|---|
| ![主题、浅深模式与动效的独立设置](docs/screenshots/settings.png) | ![使用演示数据的 Codex Token 与剩余额度悬浮窗](docs/screenshots/widget.png) |

## Windows 启动方法

1. 从 [v0.2.0 发布页](https://github.com/zhulongqihan/codex-pulse/releases/tag/v0.2.0) 下载 [CodexPulse-0.2.0-windows-x64.zip](https://github.com/zhulongqihan/codex-pulse/releases/download/v0.2.0/CodexPulse-0.2.0-windows-x64.zip) 及对应 `.sha256` 校验文件。
2. 完整解压到可写目录，例如 `F:\Apps\CodexPulse`。保留全部随附文件，运行 **CodexPulse.exe**。便携版无需安装 Node.js 或 npm。
3. 查询账号额度需要兼容的官方 Codex 桌面端或 CLI，并保持通过 **ChatGPT 登录**。无需在 Pulse 中另填 API Key 或密码；若自动发现失败，可在设置中选择 Codex 可执行文件。
4. 进入设置，分别选择主题、浅深模式、动效、语言、刷新间隔及是否显示悬浮窗。

应用读取现有 Codex Home 中保留的会话文件，默认位置通常为 `%USERPROFILE%\.codex`；已设置的 `CODEX_HOME` 环境变量优先。账号额度不可用时，本机统计仍可独立使用。关闭看板会将其隐藏；需要完全退出时，使用系统托盘菜单中的 **退出**。

## 怎样理解这些数字

| 数据 | 来源 | 含义 |
|---|---|---|
| 按日、按月、模型、项目与会话 Token | 本机保留的 Codex 日志 | 这台电脑可恢复的活动，按本机时区归集 |
| 剩余额度与重置时间 | 官方 Codex app-server | 当前登录账号实际返回的使用窗口 |
| 可用时显示的估算费用 | 兼容的本机参考价格缓存 | API Token 价格估算，**不是 ChatGPT Pro 账单、Credits 余额或额外扣款** |

缓存输入已经包含在输入 Token 中，不能再向总量加一次。账号额度可能包含其他设备的消耗，因此不能把本机 Token 总数直接换算为剩余百分比。

未知额度显示为暂不可用，不会伪装成 0%。账号刷新失败时，保留的结果会标为上次成功数据，本机历史仍可查看。未知价格不等于免费：初次安装可能尚无参考价格，估价也不覆盖全部速度档位或工具费用。

## 数据位置与隐私

- **便携版**：偏好、统计缓存、浏览器缓存、临时文件和应用日志保存在可执行文件旁的 `data` 目录。可放在 F 盘等任意可写盘符。
- **源码运行**：应用状态默认位于 `.local/data`；按下文配置后，安装缓存和临时文件也使用 `.local`。`.local` 与 `data` 均已排除在 Git 之外。
- **自定义应用数据目录**：启动前将 `PULSE_DATA_DIR` 设为绝对可写路径。这只改变 Pulse 的存储位置；Codex 自己的日志和认证仍保存在原有位置。

便携版的默认导出位置为 `data/exports`；自定义数据目录后，则使用其下的 `exports` 子目录。导出内容仅包含当前所选闭区间内的每日用量统计。

原始 Codex 会话日志只读。Pulse 的用量快照包含统计与会话元数据，不包含对话正文或认证材料。若本机已有兼容的 Codex Usage Desktop 聚合缓存，可复用它加速首次显示，并从其参考价格缓存读取估价；无需为了 Pulse 另装该应用。

Pulse 不要求复制 `auth.json` 或输入账号凭据，认证及令牌刷新由官方 Codex 客户端处理。查询账号额度时，该客户端会连接 OpenAI；Pulse 不上传本机用量统计。公开反馈请仅提供合成或充分脱敏的诊断资料，私人报告方式见 [SECURITY.md](SECURITY.md)。

## 当前功能范围

v0.2.0 将两种主题接入桌面程序，并提供六个主视图。目前支持用量分析和会话元数据，**尚不提供完整对话与工具调用回放**，也不宣称已与其他 Codex 用量应用实现全部功能对等。

本机历史取决于这台电脑实际保留的文件，不能恢复已删除的日志，也不覆盖全部云端任务、其他设备历史、所有旧日志格式或 WSL 自动发现。账号字段以已安装 Codex 客户端与服务实际返回的内容为准。

当前版本尚不支持 Credits 与重置次数明细、重置预测、完整模型价格目录、XLSX 导出和应用内自动更新。会话页显示用量与元数据，完整消息、工具活动及代理树回放尚未提供。

## 从源码运行

需要 **Node.js 24.10 或更高版本**及 npm。仓库可放在 F 盘等任意可写目录：

```sh
git clone https://github.com/zhulongqihan/codex-pulse.git
cd codex-pulse
npm --cache .local/cache/npm ci
npm run dev
```

只用合成数据体验，不读取自己的账号与日志：

```sh
npm run dev -- --demo
```

测试并运行正式构建：

```sh
npm test
npm run build
npm start
```

在 Windows x64 上生成 Windows x64 便携 ZIP：

```sh
npm run package
```

压缩包与 SHA256 校验文件输出至 `release/`，打包排除私人应用数据和开发缓存。

<details>
<summary>将首次安装的缓存与临时文件放在仓库所在盘</summary>

Electron 的 postinstall 包装器默认使用项目内 `.local`。npm 会在包装器运行前下载依赖，因此上面的安装命令也显式指定了 npm 缓存。若要让首次安装的临时文件也使用同一目录，可在**安装之前**设置仅对当前进程生效的 PowerShell 变量：

```powershell
$env:npm_config_cache = "$PWD\.local\cache\npm"
$env:ELECTRON_CACHE = "$PWD\.local\cache\electron"
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:TEMP = "$PWD\.local\tmp"
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force $env:TEMP | Out-Null
npm ci
```

不要把账号凭据、真实对话导出或私人诊断资料提交到仓库。

</details>

## 参与贡献

欢迎提交问题与聚焦的 PR。请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，说明期望行为，截图与测试样本使用合成数据。提交前运行 `npm test` 和 `npm run build`。CI 通过不代表全部历史统计绝对精确，也不能替代 Windows 应用实测。

## 灵感与许可

轻量用量伴随工具与详细本机看板的组合，受到 [ChatGPT-Usage](https://github.com/asetho/ChatGPT-Usage) 和 [Codex Usage Desktop](https://github.com/itvincent-git/codex-usage-desktop) 的启发。Codex Pulse 使用自己的实现与视觉标识，相关说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

使用 [MIT License](LICENSE) 开源。
