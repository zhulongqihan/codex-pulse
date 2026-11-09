# Codex 右上角节奏提示与侧栏入口

[English](CODEX_INTEGRATION.en.md) · [返回首页](../README.md)

Codex Pulse 提供两种入口：Windows 右上角伴随提示，以及本地 MCP 插件侧栏。右上角提示由 Pulse 自己的 Windows 窗口提供；插件入口的位置、固定方式和显示模式由 Codex 客户端决定。两者均需保持 Pulse 运行。

## 右上角节奏提示

1. 启动 Pulse，在设置中开启 **Codex 右上角节奏提示**。
2. 打开 Windows 商店版 Codex 桌面客户端，并切到前台。右上角显示软件图标与当前节奏状态；不重复显示 Pulse 品牌文字。
3. 点击状态条展开无输入框卡片。查看剩余额度、距个人重置的时间、消耗与时间进度的比较，以及日均／每小时参考分配；有新预告时显示带来源的提醒。
4. 按 Esc、点外部或关闭按钮收起卡片。“详情”打开完整 Pulse 工作台。

需要重启后继续自动跟随时，开启 **设置 → 通用 → 登录时启动 Pulse**。右上角开关控制跟随显示，不会单独启动 Pulse；登录启动让 Pulse 在后台先运行。当前 Codex 使用无标题栏的正常主窗时也可识别；最小化和切到其他应用时仍会隐藏。

这是独立伴随窗口，不修改 Codex 安装文件。提示跟随客户端移动和调整大小；切换到其他程序、Codex 最小化、找不到受支持客户端或窗口太小时隐藏。设置会说明当前未显示的原因。右上角跟随目前仅支持 Windows 商店版 Codex，不适用于 Codex Web、macOS 或普通 CLI。

### 节奏数据的含义

- 首屏展示个人周期余量、重置时间，以及额度消耗相对时间进度的建议；不需要等到可预测触顶才有基本信息。主界面与独立桌面浮窗采用同一口径。
- 日均／每小时参考是把当前余量均摊到个人重置前，不代表每天补充额度。只有周窗口的账号按该窗口判断，不强造短周期读数。
- 本轮每日记录只包含已观测增长与覆盖时段，首次安装不补历史。新重置预告明确标第三方来源、预计时段及待确认状态，旧消息不反复提示。

- 从官方个人额度的连续只读观测估算，不把 Tokens、API 金额或 Credits 换算为百分比。
- 同账号、工作区、日志来源与真实额度窗口分别采样。至少 4 个有效点、跨度至少 15 分钟，且有足够正消耗时，才显示保守触顶区间。
- 区间描述近期节奏持续时的趋势，不保证还能工作多久、还能发送多少请求，也不保证实际触顶早于或晚于重置。
- 采样中、无变化、消耗缓慢、缺少数据、陈旧和过期均有明确状态。换账号、重置、负增量或超过 10 分钟的采样间隔会重新分段；超过约 6 分钟未更新时不继续预测。
- 采样默认约每 60 秒只读查询已有额度，错误与限流时冷却，不发起模型请求。已有主工作台的“启动窗口”仍是独立、需确认且可能消耗额度的操作。
- 周额度的慢速变化会积累更长的连续观察，避免短时间整数百分比不动就丢失趋势。无可测变化时不生成预测，已知余量与重置时间仍可显示。接口没有返回短周期额度，不代表该窗口额度为零。
- 主工作台的项目／模型占比只代表本机 Token，不能解释为它们分别用了多少个人额度；官方读数可能包括其他设备的消耗。

公开网页可试用[节奏卡片的合成演示](https://zhulongqihan.github.io/codex-pulse/?demo=1&coachScenario=roomy#pulse-pace)，也可在[产品首页](https://zhulongqihan.github.io/codex-pulse/)切换用量偏快、重置预告与陈旧状态。网页不连接本机 Codex。

## 添加 MCP 侧栏入口

本地 MCP 插件适用于支持 MCP Apps 的 Codex 桌面客户端，相关入口见 [OpenAI 官方文档](https://developers.openai.com/plugins/build/extensions)。插件底部的对话输入框由 Codex 宿主管理，Pulse 无法可靠隐藏；希望只看数据时，可使用上面的右上角无输入框卡片。

1. 将完整便携包解压到准备长期使用的位置，启动 Codex Pulse，并完成一次数据刷新。
2. 在 Pulse 的 **设置 → 通用 → Codex 客户端快捷入口** 中，点击 **添加到 Codex**。
3. 在打开的 Codex 插件详情页中检查信息并选择 **Install / 安装**。如果客户端显示额外确认，按客户端提示完成。
4. 在 Codex 侧栏中打开 **Codex Pulse**。客户端提供会话面板入口时，也可以在当前会话中打开；若提供固定选项，可将入口固定到侧栏。

从 0.7.1 起，正常启动和添加操作都会从程序内嵌模板幂等准备 `integrations/codex`，便携包不再携带会覆盖它的占位模板。添加操作还会打开客户端的插件详情页，安装由 Codex 完成。无需 Node.js、API Key 或额外的后台 Web 服务。普通启动保留已有有效的数据目录绑定；在设置中显式重新添加可更换绑定。

首次打开后，面板可以查看今日 tokens、估算金额，以及实际额度窗口的剩余额度和重置时间。窗口时长按 Pulse 获得的数据标注。面板还提供刷新、打开 Pulse 主窗口和打开桌面挂件的按钮。无法取得的数据会显示为空或过期状态。

## 数据与刷新

插件读取 Pulse 最近保存的本地汇总快照。Pulse 刷新后会更新这份快照；面板里的刷新按钮重新读取快照。它不会独立登录账号、读取认证文件或向额度接口发起请求。

- 今日金额使用 Pulse 的本地估算口径，不等同于账单金额。
- 额度来自 Pulse 已获取的个人使用额度信息，显示剩余百分比及重置时间。
- Pulse 没有运行、尚未生成快照或数据已过期时，面板会明确提示；请先打开 Pulse 刷新，再刷新面板。
- MCP 模式只提供汇总读取和打开本机 Pulse 窗口的操作，不向插件暴露聊天内容、账号凭据或原始会话日志。

## 手动准备与注册

也可在完整便携包目录中打开 PowerShell，运行：

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path
```

脚本生成插件、通过已安装的 Codex CLI 注册 `codex-pulse-local` 本地市场，然后打开官方插件详情页。仍需在详情页完成安装。Codex CLI 不在 PATH 中时，可使用 `-CodexExecutable` 指定 CLI 路径；也可以直接使用 Pulse 设置内的入口。

脚本把数据目录固定到插件配置中：优先使用 `-DataDirectory`，其次使用当前 PowerShell 的 `PULSE_DATA_DIR`，未设置时使用程序旁的 `data`。自定义目录必须为绝对路径；准备操作不会创建或修改该数据目录。已运行的 Codex 不会继承此 PowerShell 的环境变量，因此更换 Pulse 数据目录后需重新添加插件。

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path -DataDirectory 'F:\PulseData'
```

只生成供检查的文件和安装链接，不更改 Codex 配置、不打开客户端：

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path -PrepareOnly -Json
```

该模式仍会写入程序目录下的 `integrations/codex`。返回内容包括可执行文件路径、插件目录、市场文件和 `deepLink`。需要继续安装时，可在 PowerShell 中用 `Start-Process` 打开该链接。

测试指定 Codex 配置目录的市场注册，并保持客户端界面关闭：

```powershell
.\install-codex-plugin.ps1 -AppDirectory $PWD.Path -CodexHome 'F:\CodexProfiles\PulseTest' -NoOpen -Json
```

`-CodexHome` 仅控制此次 CLI 注册使用的 Codex 配置目录；它不会隔离 Pulse 的用量数据。隔离注册检查请同时使用 `-NoOpen`，避免链接交由当前正在运行的桌面客户端处理。脚本只注册自己的市场，不替换其他插件设置。

## 兼容与维护

- 这是桌面本地 stdio 插件。Codex Web、手机端和普通 CLI 不能提供相同的客户端侧栏界面。
- 客户端需要支持 MCP Apps 和 global/thread 入口；组织策略可能限制本地插件安装。缺少相应入口时，应先检查客户端版本与插件权限。
- 通过客户端插件页安装后，支持热加载的客户端可直接发现工具。若仍未显示，先检查插件是否已启用，再尝试新会话；需要时正常退出并重新打开客户端。
- 插件通过可执行文件名及绑定安装目录的 PATH 启动 Pulse。安装目录不能包含分号。移动便携目录后，请移除 Codex 中旧的 Pulse 插件，再从新位置重新添加。升级后若客户端仍使用旧插件缓存，也应在插件页重新安装。
- 在 Codex 插件页卸载 **Codex Pulse** 即可停用客户端入口，Pulse 本身和已有用量数据继续保留。

插件的 stdio 配置、`${PLUGIN_ROOT}` 路径与本地安装方式见 [OpenAI 插件打包说明](https://developers.openai.com/plugins/build/plugins)和[桌面本地 MCP 说明](https://developers.openai.com/plugins/deploy/desktop-only)。
