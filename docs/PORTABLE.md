Codex Pulse for Windows x64
==========================

中文

将完整压缩包解压到可写目录，建议双击 Start-Codex-Pulse.cmd；也可运行 CodexPulse.exe。
需要桌面和开始菜单入口，可在程序内创建，或双击 Create-Codex-Pulse-Shortcuts.cmd；移动文件夹后重新创建。
需要 Codex 客户端入口，在设置→桌面与 Codex中选择“添加到 Codex”，然后在客户端插件页安装并固定。需支持本地 MCP Apps 的桌面客户端；移动目录后重新添加。
需要右上角无输入框节奏卡片，在设置中开启“Codex 右上角节奏提示”，保持 Pulse 运行并切到 Windows 商店版 Codex。切换其他程序时自动隐藏。
需要重启电脑后自动运行，在设置→通用开启“登录时启动 Pulse”；只打开 Codex 不会启动已退出的 Pulse。0.7.1 起插件文件由程序内嵌准备，升级包不覆盖已有插件目录。
节奏区间须积累至少 15 分钟的同账号、同窗口有效官方观测；采样默认约 60 秒只读查询，错误时冷却，不发模型请求。区间不保证工作时长；本机 Token 占比不等于个人额度占比。
首次取得实际余量和重置读数即可使用，只有周窗口也有效；没有预测不等于安装失败。未返回额度时到账号面板检查登录和连接，本机分析可单独使用。API Key 模式不提供订阅额度。
原有 MCP 侧栏页的输入框由 Codex 宿主管理，无法可靠隐藏；新右上角卡片没有输入框。
需要 Windows 10/11 x64 和 Microsoft Edge WebView2 Evergreen Runtime。
WebView2 下载：https://developer.microsoft.com/microsoft-edge/webview2/

程序的偏好、数据库、日志、临时文件和 WebView 缓存均放在程序旁的 data 文件夹。
可以把整个文件夹移动到其他可写位置。保留 data 即保留使用状态；原 Codex 日志只读。
搬迁后在设置→桌面与 Codex检查快捷方式、登录启动与本地插件绑定，查看影响后按项修复；检测不改系统，未配置入口不会自动启用。宿主缓存的旧插件可能仍需从 Codex 插件页重新安装。
自定义数据位置：启动前设置 PULSE_DATA_DIR 为绝对路径。
查询额度需要已有 ChatGPT 登录；来源与账号数据不可用时仍可查看本地统计。
再次启动会找回同一 data 目录的已有窗口。关闭主窗口会隐藏到托盘；关闭桌面浮窗只隐藏浮窗，可从设置重新显示；右上角卡片的关闭只收起卡片；使用托盘的“退出”才会完全结束程序。浮窗图钉显示当前可执行的“置顶”或“取消置顶”。
重置服务加载失败可单独重试，无需重新扫描日志。
使用说明、体验讨论和问题表单在设置→帮助与反馈。可选摘要先预览再主动复制，不自动上传账号、额度、路径或会话。

当前EXE没有Windows Authenticode发布者签名；更新清单签名与包摘要校验是独立机制，不等同Windows发布者认证。不要关闭系统防护；遇到策略拦截请保留提示并按设备/组织策略处理。
桌面版在本机使用既有登录访问官方账号服务，原始日志只读，不上传会话、不添加遥测；价格与预告有各自外部来源。
下载、数据与签名说明：https://github.com/zhulongqihan/codex-pulse/blob/main/docs/TRUST.md

完整说明：https://github.com/zhulongqihan/codex-pulse

English

Extract the complete archive into a writable folder. Prefer Start-Codex-Pulse.cmd; CodexPulse.exe is also available.
Create desktop and Start menu entries from the app, or run Create-Codex-Pulse-Shortcuts.cmd. Recreate them after moving the folder.
For an entry inside Codex, choose Add to Codex in Settings → Desktop & Codex, then install and pin it in the client. Requires a desktop client with local MCP Apps support; add it again after moving Pulse.
For the corner card without an input box, enable the Codex corner pace indicator in settings, keep Pulse running, and switch to the Microsoft Store edition of Codex for Windows. It hides when another app is active.
Enable Start Pulse at sign-in in General settings for automatic operation after a restart. Opening Codex alone does not launch a quit Pulse instance. From 0.7.1, plugin files are prepared from embedded templates; upgrades do not overwrite the prepared plugin folder.
Pace ranges require at least 15 minutes of valid official observations for the same account and window. Sampling reads quota about every 60 seconds by default, with error cooldowns and no model requests. Ranges do not guarantee working time; local token shares are not shares of personal quota.
A returned quota and reset reading is sufficient for first use, including a weekly-only window. A missing forecast does not mean installation failed. Check sign-in and connection in the account panel if quota is unavailable; local analysis remains separate. API-key mode does not provide subscription quota.
The original MCP sidebar composer belongs to the Codex host and cannot be reliably hidden. The new corner card has no input box.
Requires Windows 10/11 x64 and Microsoft Edge WebView2 Evergreen Runtime.
Runtime download: https://developer.microsoft.com/microsoft-edge/webview2/

Preferences, database, logs, temporary files and WebView cache live in the adjacent data folder.
Move the whole folder to relocate the portable app. Keep data to preserve settings and history.
After relocation, check shortcut, sign-in startup and local plugin bindings in Settings → Desktop & Codex. Inspect the impact and choose repairs individually. Checks do not change system settings or enable unconfigured entries. A cached plugin may still require reinstallation in Codex.
Original Codex logs are read-only. Set PULSE_DATA_DIR to an absolute path to override data storage.
Account queries require an existing ChatGPT sign-in. Local statistics work independently.
Opening the app again restores the existing window for the same data folder. Closing the main window hides it to the tray. Closing the desktop widget only hides it; show it again from settings. Closing the expanded corner card only collapses it. Choose Quit in the tray menu to exit completely. The widget pin names the current Pin or Unpin action.
Retry a failed reset service directly without rescanning local logs.
Find usage guidance, discussions and the bug form in Settings → Help & feedback. The optional summary is previewed before you choose to copy it; accounts, quota, paths and conversations are not uploaded automatically.

The current EXE has no Windows Authenticode publisher signature. Update-manifest signatures and package digests are separate mechanisms, not Windows publisher authentication. Do not disable system protection; retain policy-block messages and follow your device/organization policy.
The desktop app uses the existing local sign-in to contact official account services, reads original logs without changing them, and adds no telemetry or conversation upload. Pricing and notices have their own external sources.
Downloads, data access and signatures: https://github.com/zhulongqihan/codex-pulse/blob/main/docs/TRUST.md#english

Full documentation: https://github.com/zhulongqihan/codex-pulse/blob/main/README.en.md

Codex Pulse is independent of OpenAI. Includes MIT-licensed Codex Usage Desktop code
by Vincent and contributors; see the accompanying licenses.
