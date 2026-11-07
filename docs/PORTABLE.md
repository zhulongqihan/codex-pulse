Codex Pulse for Windows x64
==========================

中文

将完整压缩包解压到可写目录，双击 Start-Codex-Pulse.cmd 或 CodexPulse.exe。
需要桌面和开始菜单入口，可在程序内创建，或双击 Create-Codex-Pulse-Shortcuts.cmd；移动文件夹后重新创建。
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
