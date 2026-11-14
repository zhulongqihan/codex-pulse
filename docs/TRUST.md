# 下载、数据访问与签名 / Downloads, data access and signatures

[中文](#中文) · [English](#english)

## 中文

Codex Pulse 是独立 MIT 开源项目，不隶属于 OpenAI。请从 [zhulongqihan/codex-pulse 正式发布页](https://github.com/zhulongqihan/codex-pulse/releases/latest)下载，核对完整仓库名，避免与同名项目混淆。

### 是否适合你的环境

- 本体：Windows 10/11 x64，需 Microsoft Edge WebView2 Evergreen Runtime。便携包不包含该系统运行时，不需要 Node.js 或 Rust。
- 右上角跟随：仅支持 Windows 商店版 Codex，需保持 Pulse 运行。独立桌面浮窗、本机分析与此跟随入口分别使用。
- 订阅额度：使用已有 Codex ChatGPT 登录。API Key 模式没有订阅额度，可查看保留的本机日志分析。
- 第一次取得实际余量和重置读数即可使用，只有周窗口也有效。条件预测需继续积累观测，不保证出现或准确工作时长。

### 桌面版访问哪些数据

原始 Codex 日志保持只读；本机分析和回放读取已留存的记录，不能恢复已删除或其他设备未同步的记录。应用自己的索引、缓存与偏好保存在程序旁 `data`，其中也可能含私人会话资料，请勿直接公开。

账号查询在本机 Rust 进程中使用既有登录，向官方账号服务请求额度；凭据不交给界面、导出或反馈摘要。登录与续期仍在官方 Codex 中完成，Pulse 不要求把密码或认证文件发给维护者。可选逐会话 Credits 默认关闭，开启后只发送正在查看的真实线程 ID，不发送正文。价格和重置信息有各自的外部来源；这不是完全离线的软件。

Pulse 不添加遥测、不上传本机会话。帮助与反馈的摘要仅由你主动预览和复制，打开 GitHub 表单也不会自动发送。请继续检查你手工填写的文字与截图；不要上传 `auth.json`、完整 `data`/`.codex` 或原始会话。

网页演示只运行合成数据，不读取本机文件或登录。公开工作场景中的客户端窗口为示意，不是官方客户端截图或真实用户反馈。

### 两种签名各自保护什么

当前 Windows EXE 尚无 **Authenticode 发布者代码签名**。系统是否提示或允许运行还取决于设备的防护与管理策略；有签名也不等于软件经过独立安全审计。

Release 的 `.sha256` 用于核对下载完整性，例如在 PowerShell 运行 `Get-FileHash .\CodexPulse-<版本>-windows-x64.zip -Algorithm SHA256`，与对应摘要文件比较。Pulse 更新器另行验证更新清单签名、包摘要、品牌和平台；这不等同于 Windows 发布者身份签名。不要为了运行软件关闭系统防护；如果设备策略阻止，请保留提示文本，按组织策略处理或报告最少信息。

退出与迁移说明见 [使用说明](../README.md#windows-启动)，故障与隐私报告见 [SUPPORT](../SUPPORT.md)、[SECURITY](../SECURITY.md)。

## English

Codex Pulse is an independent MIT-licensed project, not affiliated with OpenAI. Download from the [official zhulongqihan/codex-pulse release page](https://github.com/zhulongqihan/codex-pulse/releases/latest) and check the complete repository name to distinguish similarly named projects.

### Check compatibility

- App: Windows 10/11 x64 with Microsoft Edge WebView2 Evergreen Runtime. The archive does not bundle this system runtime. Node.js and Rust are not required.
- Corner following: the Microsoft Store edition of Codex only, with Pulse running. The independent desktop widget and local analysis are separate entry points.
- Subscription quota: uses an existing Codex ChatGPT sign-in. API-key mode does not expose subscription quota, but can analyze retained local logs.
- A returned quota and reset reading is sufficient for first use, including a weekly-only window. Conditional forecasts require further observations and do not guarantee working time or availability.

### Desktop data access

Original Codex logs remain read-only. Analysis and replay use retained records and cannot recover deleted or unsynced records from other devices. The app's own indexes, cache and preferences are stored in adjacent `data`; these can include private conversation material and should not be published as a whole.

The local Rust process uses the existing sign-in to query official account services. Credentials are not passed to the renderer, exports or feedback summary. The official Codex client remains responsible for sign-in and renewal; Pulse never asks you to send passwords or authentication files to its maintainer. Optional per-session Credits are off by default and send only the viewed real thread IDs, not conversation bodies. Pricing and reset information have their own external sources. The desktop app is not entirely offline.

Pulse adds no telemetry and does not upload local conversations. You explicitly preview and copy the feedback summary; opening a GitHub form does not submit it. Review your own text and screenshots too: never upload `auth.json`, entire `data`/`.codex` folders or raw conversations.

The browser demo uses synthetic data and accesses no local files or sign-in. Its client-window context is an illustration, not an official client screenshot or real-user testimonial.

### Two different signature mechanisms

The current Windows EXE has no **Authenticode publisher code signature**. Warnings and launch permissions depend on device protection and management policy. A signature would not constitute an independent security audit.

The release `.sha256` checks download integrity. For example, run `Get-FileHash .\CodexPulse-<version>-windows-x64.zip -Algorithm SHA256` in PowerShell and compare with its matching digest file. Pulse's updater separately verifies the manifest signature, package digest, product and platform. This does not establish Windows publisher identity. Do not disable system protection to run the app; if policy blocks it, retain the message and follow your organization's policy or report minimal non-sensitive details.

See the [user guide](../README.en.md#run-on-windows), [SUPPORT](../SUPPORT.md) and [SECURITY](../SECURITY.md) for exit, relocation and safe reporting.
