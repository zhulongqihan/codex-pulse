# Codex Pulse v0.2.0：托盘、维护和来源兼容审计

审计日期：2026-11-06。范围 A01–A07、B01–B02，共九组。P 为 `F:/codex++/CodexPulse`，正式 HEAD `d45ee79e384e1075e24ba272a192b2885a220f8e`；U 为其 `.local/redesign-20261106/upstream-source`，固定 `app-v5.6.0` / `1e8d2a2bae8ed466b0a48a37eb16f936629aa9c0`。本机原 exe 的 ProductVersion/FileVersion 均核实为 5.6.0。

这是正式入口及数据链的源码审计，没有读取用户认证或私人会话，没有执行真实模型请求，没有修改运行代码或发布。原软件的接口字段不自动算作 UI；Pulse 的未挂载旧主面板、演示和 prototype 也不算正式能力。整组子项齐全才判已实现。

| ID | 状态 | 已有能力与缺口 |
|---|---|---|
| A01 | 部分实现 | 常驻托盘、打开/退出/刷新和独立悬浮窗已有；原托盘弹出板的双窗口、倒计时、今日费用等信息未对等。 |
| A02 | 未实现 | 无托盘标题/提示与弹出板指标的独立设置，无倒计时单位自定义。 |
| A03 | 部分实现 | 登录启动、1/2/5/10分钟定时刷新、失败保留旧值已有；缺原间隔全集与焦点/可见性恢复时按时效刷新。 |
| A04 | 部分实现 | 有中英和浅/深/系统；缺繁中、日、韩、德语。 |
| A05 | 未实现 | 只有仓库外链，无应用内检查、更新说明、下载进度、安装/重启及忽略提醒流程。 |
| A06 | 未实现 | 无带时间/级别的诊断日志页及自动滚动、复制、清空操作。 |
| A07 | 部分实现 | 强制重扫、重试、数据目录、CLI选择、坏缓存自动重建已有；缺显式缓存重置、分类诊断/复制、Codex Home选择等恢复流程。 |
| B01 | 部分实现 | 支持环境变量CODEX_HOME和CLI发现/选择；缺手动选择数据根目录与Windows原生无日志时默认WSL回退。 |
| B02 | 部分实现 | 增量/异步扫描、归档/zstd、累计快照与子代理继承去重已有；缺完整会话/来源/关系/内容索引和历史额度观测。 |

合计：0 已实现、6 部分实现、3 未实现。组大小不一致，不换算完成百分比。

## A01：常驻托盘与信息弹出板——部分实现

P `src/main/index.mjs:133–140,232` 的托盘菜单固定提供打开看板、显示悬浮窗、刷新、退出；tooltip 是固定品牌文字。`src/renderer/App.jsx:2–7` 仅在 `#widget` 加载旧 renderer；`LegacyApp.jsx:178–184` 的 Widget 实际显示账号剩余环、今日 Token、扩展输入/输出/缓存与固定重置时刻，有展开和隐藏。

U `src/components/tray-popover.tsx:61–100` 的真实托盘弹出板显示账号/工作区/会员、各窗口剩余和重置文案、今日 Token 的简写与精确值、估算费用，底部打开/退出。P 的独立悬浮窗是额外已有能力，但缺双窗口完整明细、动态倒计时、今日费用和原托盘弹出板链路；不能因有悬浮窗便判整组完成。

平台限定：U `src-tauri/src/lib.rs:987–1024` 只有 macOS 分支使用 `set_title`，Windows 等使用 tooltip。不能宣称原 Windows 托盘已有 macOS 菜单栏文字效果，也不据此给 P 制造 Windows 特有缺口。

## A02：托盘指标和倒计时格式设置——未实现

U `src/components/settings-page.tsx:418–500` 将 `trayTitleShow`、`trayMenuShow` 分开控制 limit5h/limitWeekly/tokens/cost，并在 `465` 允许自定义分钟/小时/日单位。Windows 的标题设置对应上面的提示文字/平台行为，不能套用 macOS 的位置。

P `src/main/index.mjs:95–119` 的持久化设置白名单没有这三组字段，`SettingsPanel.jsx:52–58` 的正式设置契约也无对应功能。皮肤切换、悬浮窗显隐与展开不等于这些指标设置，故未实现。

## A03：启动与刷新策略——部分实现

P `SettingsPanel.jsx:313–363` 有登录启动和刷新间隔；`index.mjs:105–112,129–131` 校验并使用 60/120/300/600 秒，设置后重建 timer。`usage-service.mjs:188–229` 在失败后不清空已成功的日志/额度数据。

U `src/hooks/use-usage-dashboard.ts:71` 支持 1/2/3/4/5/15/30/60 分钟；`689–730` 在重新获取焦点、页面恢复可见时，按已过去的间隔决定是否刷新。P 没有相应 focus/visibility 事件恢复策略，间隔集合也不同。原基线写“唤醒恢复”过宽：本审计确认的是焦点/可见性恢复，不凭空要求未验证的系统休眠原生监听。

## A04：语言与外观——部分实现

P `index.mjs:101`、`SettingsPanel.jsx:264–291` 只有 zh/en；已有 light/dark/system。U `src/lib/languages.ts:1–15` 的可用语言为 en、zh、zh-Hant、ja、ko、de。缺四种语言；两套原创皮肤和动效开关是应保留的额外能力，不抵消翻译缺口。

## A05：应用更新——未实现

U `settings-page.tsx:168–271` 有当前版本、手动检查、错误、更新说明、进度和安装/重启状态；正式 hooks 与原生更新命令连接。P `index.mjs:184–202` 只支持 `open-repo` 等动作，正式设置无更新状态、下载或安装 IPC。GitHub 已发布新包只证明可以手动获取，不等于应用内更新已实现。未来必须使用 Pulse 自己的发布源，不能更新回原软件。

## A06：诊断日志页——未实现

U `src/components/log-panel.tsx:21–68,108` 通过 attachLogger 采集带时间/级别/消息的日志，限量保存并支持自动滚动、复制、清空；`App.tsx:517,531–532` 有真实开关/挂载。P `Dashboard.jsx:54–64` 路由没有 logs；`1518–1526` 的 warning 折叠区只是来源警告，不是运行日志时间线。打开数据目录也不是日志页。

## A07：缓存重置与故障恢复——部分实现

P `SettingsPanel.jsx:380–443` 有打开数据目录、选CLI和强制重扫；重扫仅 `refresh({logs:true,quota:false,force:true})`。`scanner-worker.mjs:88–94` 对缺失或损坏指纹缓存会自动重建。`Dashboard.jsx:532–550,1518–1526` 有错误重试及警告，旧数据可保留。

U `use-usage-dashboard.ts:1089–1104` 有确认后 resetUsageState 并重建；`usage-recovery-card.tsx:10–31,48–86` 能分类目录/缓存/扫描问题、复制诊断、选择或重新检测 Codex Home、扩大空范围、安排坏缓存重建。P 无相应操作/结构化诊断，选可执行文件并不等于选日志根目录。强制重解析不是完整的缓存/价格状态重置；不应为审计擅自删除任何用户缓存。

## B01：本机环境和 WSL——部分实现

P `usage-service.mjs:102–104` 读取 CODEX_HOME 或本机用户 `.codex`；`index.mjs:195–198` 可选择CLI；`226` 创建服务只传 dataDir、codexExecutable、onUpdate，没有用户可选 codexHome/timeZone。`SettingsPanel.jsx:67,279–291` 的时区只读展示系统解析值。

U `src/lib/api.ts:262–263` 有 configureCodexHome；`use-usage-dashboard.ts:1028–1043` 提供选目录/自动检测并重扫；`src-tauri/src/codex_environment.rs:38–86,117–180` 实现选择目录、默认WSL探测及原生优先防混合。P 无 WSL 发现与原生/WSL择一逻辑，也无数据根目录选项。

**旧基线纠正：** “显式CLI/时区设置”混在 B01 中过度概括了上游。固定原版设置组件没有时区选择器，API 的 timezone 多为返回值；本次不把“缺手动时区选择”算成原软件1:1缺口，也不要求原版未验证的CLI选文件控件。应保全的是实际目录选择、环境发现和WSL策略。Pulse可选CLI是自己已有的能力。

## B02：增量、归档与完整数据索引——部分实现

P `scanner-worker.mjs:23–50,88–146` 在 worker 异步发现 sessions/archived_sessions、解压 zstd、以 size+mtime 指纹复用；force 可重解析，缺坏缓存会重建。`scanner-core.mjs:78–86,126–138,194–254` 处理累计快照、子代理继承基线、压缩/response去重并输出统计。不能把已有引擎说成完全没有兼容能力。

但 P `scanner-core.mjs:86` 明确只保留 Token 元数据；标题/路径/父子关系、消息/工具和历史额度观测未进入最终模型，session按日期/模型/末级项目名切分。U `src-tauri/src/scanner.rs:169–171,322–331,451–463,597` 保留标题索引及quota观测；`session_file.rs:10–16`支持归档压缩文件；`session_replay.rs:135–154` 从源记录生成完整会话详情。对应项目/会话缺口见另份报告。

根因是 P 的缓存/聚合模型面向统计，而 U 还保留可关联的完整会话数据链。仅添加组件或把 `sessionDetailsComplete` 标志当作全内容完备，无法补齐这些能力。
