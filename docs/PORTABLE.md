Codex Pulse for Windows x64
==========================

中文

将完整压缩包解压到可写目录，双击 Start-Codex-Pulse.cmd 或 CodexPulse.exe。
需要桌面和开始菜单入口，可在程序内创建，或双击 Create-Codex-Pulse-Shortcuts.cmd；移动文件夹后重新创建。
需要 Codex 客户端入口，在设置→常规中选择“添加到 Codex”，然后在客户端插件页安装并固定。需支持本地 MCP Apps 的桌面客户端；移动目录后重新添加。
需要右上角无输入框节奏卡片，在设置中开启“Codex 右上角节奏提示”，保持 Pulse 运行并切到 Windows 商店版 Codex。切换其他程序时自动隐藏。
节奏区间须积累至少 15 分钟的同账号、同窗口有效官方观测；采样默认约 60 秒只读查询，错误时冷却，不发模型请求。区间不保证工作时长；本机 Token 占比不等于个人额度占比。
原有 MCP 侧栏页的输入框由 Codex 宿主管理，无法可靠隐藏；新右上角卡片没有输入框。
需要 Windows 10/11 x64 和 Microsoft Edge WebView2 Evergreen Runtime。
WebView2 下载：https://developer.microsoft.com/microsoft-edge/webview2/

程序的偏好、数据库、日志、临时文件和 WebView 缓存均放在程序旁的 data 文件夹。
可以把整个文件夹移动到其他可写位置。保留 data 即保留使用状态；原 Codex 日志只读。
自定义数据位置：启动前设置 PULSE_DATA_DIR 为绝对路径。
查询额度需要已有 ChatGPT 登录；来源与账号数据不可用时仍可查看本地统计。
再次启动会找回同一 data 目录的已有窗口。关闭主窗口会隐藏到托盘；使用托盘的“退出”才会完全结束程序。

完整说明：https://github.com/zhulongqihan/codex-pulse

English

Extract the complete archive into a writable folder. Run Start-Codex-Pulse.cmd or CodexPulse.exe.
Create desktop and Start menu entries from the app, or run Create-Codex-Pulse-Shortcuts.cmd. Recreate them after moving the folder.
For an entry inside Codex, choose Add to Codex in General settings, then install and pin it in the client. Requires a desktop client with local MCP Apps support; add it again after moving Pulse.
For the corner card without an input box, enable the Codex corner pace indicator in settings, keep Pulse running, and switch to the Microsoft Store edition of Codex for Windows. It hides when another app is active.
Pace ranges require at least 15 minutes of valid official observations for the same account and window. Sampling reads quota about every 60 seconds by default, with error cooldowns and no model requests. Ranges do not guarantee working time; local token shares are not shares of personal quota.
The original MCP sidebar composer belongs to the Codex host and cannot be reliably hidden. The new corner card has no input box.
Requires Windows 10/11 x64 and Microsoft Edge WebView2 Evergreen Runtime.
Runtime download: https://developer.microsoft.com/microsoft-edge/webview2/

Preferences, database, logs, temporary files and WebView cache live in the adjacent data folder.
Move the whole folder to relocate the portable app. Keep data to preserve settings and history.
Original Codex logs are read-only. Set PULSE_DATA_DIR to an absolute path to override data storage.
Account queries require an existing ChatGPT sign-in. Local statistics work independently.
Opening the app again restores the existing window for the same data folder. Closing the main window hides it to the tray. Choose Quit in the tray menu to exit.

Full documentation: https://github.com/zhulongqihan/codex-pulse/blob/main/README.en.md

Codex Pulse is independent of OpenAI. Includes MIT-licensed Codex Usage Desktop code
by Vincent and contributors; see the accompanying licenses.
