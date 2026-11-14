# 卸载与数据保留 / Uninstallation and data retention

[中文](#中文) · [English](#english) · [隐私](../PRIVACY.md) · [使用说明](../README.md)

## 中文

Codex Pulse 是便携程序。可以移除程序并保留数据，也可以在确认不再需要后手动移除自己的 Pulse 数据；请先区分程序目录、Pulse 数据目录与原始 Codex 日志目录。

1. 在 **设置 → 桌面与 Codex → 安装入口** 选择 **检查入口**，记录“运行中的安装”“Pulse 数据”和各快捷方式的实际路径。此检查只读，不会卸载或清理文件；如果使用自定义 `PULSE_DATA_DIR`，也记下它的位置。
2. 如果启用过登录启动，在 **设置 → 通用 → 登录时启动 Pulse** 关闭，并确认显示未开启。若程序已经无法启动，可通过 Windows 的启动应用管理停用对应的 Pulse 项；先核对名称和程序路径，避免影响其他安装。
3. 如果安装过 Codex 侧栏插件，在 **Codex 的插件页** 卸载 **Codex Pulse**。这是客户端的操作，不是 Pulse 设置中的“添加到 Codex”。它不会删除 Pulse 的使用数据。客户端可能保留本地市场登记或缓存；如其管理入口提供清理，只移除属于本项目的 `codex-pulse-local`，不要删除整个 Codex 配置目录。
4. 从 Pulse 托盘选择 **退出**，确认本次安装的 Pulse 程序已停止。关闭主窗口只会隐藏到托盘。若客户端插件仍占用程序文件，先保存 Codex 中的工作，再正常退出 Codex 客户端，并确认相关 Pulse 插件进程不再运行。不要强制终止仍可能写入数据的进程，也不要覆盖或删除仍在运行的 EXE。
5. 只有完成第4步、确认程序不再运行后，才备份需要保留的数据：将整个 Pulse 数据目录完整复制到程序目录和原数据目录之外的独立位置，保留数据库配套文件、偏好与缓存，不只复制数据库主文件。自定义 `PULSE_DATA_DIR` 同样按此处理；确认副本完整后再继续。
6. 用文件资源管理器检查 **Codex Pulse** 桌面和开始菜单快捷方式的属性，确认目标属于本次移除的程序，再手动移除这些入口和已确认的便携程序目录；保留其他安装的入口。选择保留数据时，先完成第5步备份；因为删除整个程序目录也会删除其中的 `data`。以后可在新的便携目录中恢复 `data`，或继续使用独立数据目录。若选择连数据一起移除，请先确认不再需要、也未被其他安装共用，再手动移除该 Pulse 数据目录。

若选择移除 Pulse 数据，请只移除已确认的 Pulse 数据目录。程序外另存的 XLSX/Markdown 导出、个人备份及手动上传的反馈不会自动删除；是否保留由你决定。Pulse 没有替你删除官方账号、原始 `.codex` 会话或整个宿主缓存的卸载动作。卸载 Pulse 不需要退出或删除官方账号，也不需要移除其他软件共用的 WebView2。

清理本机资料不会删除你已经发到 GitHub 或其他服务的内容；按对应平台的规则处理。敏感问题的报告方式见 [SECURITY](../SECURITY.md)。

## English

Codex Pulse is portable. You can remove its program while keeping data, or manually remove your own Pulse data after deciding it is no longer needed. Distinguish the program folder, Pulse data folder and original Codex log folder first.

1. Choose **Check entries** under **Settings → Desktop & Codex → Installation entries** and record the running installation, Pulse data and shortcut paths. The check is read-only; it does not uninstall or clean files. Also record the location of any custom `PULSE_DATA_DIR`.
2. If sign-in startup was enabled, turn off **Settings → General → Start Pulse at sign-in** and confirm the disabled status. If Pulse can no longer launch, disable its matching entry through Windows startup-app management, checking the name and program path to avoid other installations.
3. If you installed the sidebar plugin, uninstall **Codex Pulse** on the **Codex plugin page**. This is a client action, separate from Add to Codex in Pulse settings. It does not remove Pulse usage data. The client may retain a marketplace registration or cache. Where its management interface offers cleanup, remove only this project's `codex-pulse-local` registration; do not delete the complete Codex configuration folder.
4. Choose **Quit** from Pulse's tray menu and confirm that this installation's Pulse program has stopped. Closing the main window only hides it. If a client plugin still holds program files open, first save your work in Codex, then exit the Codex client normally and confirm that the related Pulse plugin processes are no longer running. Do not force-terminate a process that may still be writing data, or replace or remove a running EXE.
5. Only after completing step 4 and confirming that the program has stopped, back up data you want to keep: copy the entire Pulse data directory to a separate location outside both the program folder and the original data folder. Retain database companion files, preferences and caches rather than copying only the main database file. Treat a custom `PULSE_DATA_DIR` the same way, and confirm the copy is complete before continuing.
6. In File Explorer, check the properties of **Codex Pulse** desktop and Start menu shortcuts. Confirm that their targets belong to this installation before manually removing those entries and the confirmed portable program folder; retain entries for other installations. To keep data, complete the backup in step 5 first: removing the whole program folder also removes `data` inside it. Later restore `data` into a new portable folder or continue using your separate data directory. If you choose to remove data too, first confirm it is no longer needed or shared by another installation, then manually remove that Pulse data folder.

If you choose to remove Pulse data, remove only the confirmed Pulse data folder. Separately saved XLSX/Markdown exports, personal backups and manually uploaded feedback are not automatically erased; you choose whether to retain them. Pulse does not uninstall your official account, original `.codex` conversations or complete client cache. Removing Pulse does not require deleting your official account or uninstalling WebView2 shared by other applications.

Local removal does not erase content already posted to GitHub or another service; manage that through the relevant platform. See [SECURITY](../SECURITY.md) for sensitive reports.
