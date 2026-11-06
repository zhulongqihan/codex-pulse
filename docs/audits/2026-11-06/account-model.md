# v0.2.0 账号、重置与模型功能审计

审计日期：2026-11-06。范围为 Q01–Q06、R01–R04、M01–M04，共 14 组。只有该组全部子项存在真实可达实现才记为“已实现”；“部分实现”不代表验收通过。

## 固定版本与方法

- **P（Pulse）**：`F:/codex++/CodexPulse`，HEAD `d45ee79e384e1075e24ba272a192b2885a220f8e`，v0.2.0。
- **U（原应用源码）**：`F:/codex++/CodexPulse/.local/redesign-20261106/upstream-source`，HEAD `1e8d2a2bae8ed466b0a48a37eb16f936629aa9c0`，`app-v5.6.0`。与已核实本机原 exe 的 ProductVersion 5.6.0 对应。
- 下文 `P/文件:行号`、`U/文件:行号` 均指上述绝对根目录下真实源码。旧 `feature-parity.md` 只用于确定需求集合，没有沿用 v0.1.0 的实现状态。
- 正式主界面入口为 `P/src/renderer/App.jsx:2`、`:6`、`:7`：一般路由加载 Dashboard，只有 `#widget` 使用 LegacyApp。主界面证据追踪 Dashboard → AccountPanel/use-pulse → preload IPC → main/service/parser。演示快照、prototype 和静态文案不算账号或模型功能实现。
- 上游对应组件也确实挂在正式界面：`U/src/App.tsx:400`（账户信息）、`:412`（公告/reset credits）、`:424`（预测/Feed）、`:429`（模型页）、`:569`（历史弹层），不是仅依据类型或未挂载组件判定。
- 只读检查源码，未安装、构建、启动真实额度请求，未读取认证文件、用户数据库、私人日志或会话正文。另执行了一次纯函数合成数据验证，不产生模型请求。

## 结论

| ID | 状态 | 核心结果 |
|---|---|---|
| Q01 | 部分实现 | 有会员 plan；无真实账号标识、工作区、有效期/剩余时间、续订状态 |
| Q02 | 部分实现 | 有窗口剩余百分比/固定重置时刻/状态；无倒计时，月窗口会被标成周窗口 |
| Q03 | 已实现 | 独立只读额度查询及加载、失败、未登录、缺窗口状态有真实链路 |
| Q04 | 未实现 | 无显式启动窗口、最小模型请求、确认及防重复状态机 |
| Q05 | 未实现 | 无 Credits 余额及有限/无限/未知/演示状态 |
| Q06 | 未实现 | 无 reset credits 次数、逐个有效期及 Usage 管理入口 |
| R01 | 未实现 | 无全局重置公告、类型、相对时间和原文来源 |
| R02 | 未实现 | 无 30 天重置历史、日历、弹层、更多、间隔统计 |
| R03 | 未实现 | 无第三方预测/信号、有效性/时效/证据和刷新链路 |
| R04 | 未实现 | 无 Feed、原帖/上下文、更新时间与过期提示 |
| M01 | 部分实现 | 有按模型 Token 汇总/固定降序、输入/输出/命中率；缺完整构成/份额及成本/综合单价排序 |
| M02 | 未实现 | 内部价格缓存可支持估价，但没有模型单价和定价状态的 live 功能 |
| M03 | 未实现 | 无历史额度快照采样、模型 5h/周消耗推断、上下界及样本披露 |
| M04 | 部分实现 | 有用量视图和用量模型名搜索；价格目录及其全部操作缺失 |

合计：**已实现 1 / 部分实现 4 / 未实现 9**。在本审计范围内，v0.2.0 不满足与原应用逐功能齐全。

## 逐组证据与缺口

### Q01：账号、会员、工作区、有效期和续订——部分实现

真实存在：`normalizeQuota` 接收 `bucket.planType` 并输出 `plan`（`P/src/main/quota-service.mjs:58`、`:74`）；AccountPanel 显示返回的 plan（`P/src/renderer/AccountPanel.jsx:172`、`:218`）。

缺口：面板的“当前 Codex 账户”只是固定泛称（`P/src/renderer/AccountPanel.jsx:217`），不是实际账号标识。该归一化返回体不包含 account、workspace、subscriptionExpiresAt、subscriptionWillRenew（`P/src/main/quota-service.mjs:72`），对应 UI 也不存在；因而工作区、到期日、剩余天数和续订状态均缺。

上游：响应字段在 `U/src/lib/api.ts:163`、`:172`；服务把账号和订阅元数据写入响应（`U/src-tauri/src/codex_limits.rs:737`）；首页显示账号、工作区、会员、到期和未续订提示（`U/src/components/dashboard-hero-card.tsx:134`、`:143`、`:149`、`:166`）。到期剩余时间计算在该文件 `:264`。**上游采用减去一天宽限期的显示规则（`:269`），这只是原程序规则，不能据此当成服务官方保证。**

### Q02：5h/长期窗口、百分比、时长与重置——部分实现

真实存在：后台保留 `usedPercent`、`remainingPercent`、`windowMinutes` 和 `resetsAt`（`P/src/main/quota-service.mjs:67`）；AccountPanel 显示剩余百分比、仪表、重置日期时间与时区，区分百分比未知、重置未知和未返回窗口（`P/src/renderer/AccountPanel.jsx:93`、`:102`、`:132`）；总体还有查询中、可用、陈旧/上次成功等状态（`:268`）。

缺口：长期窗口归一化为 `minutes >= 10080 → weekly`（`P/src/main/quota-service.mjs:66`），UI 也选取 `>=10080` 并固定标题“每周额度”（`P/src/renderer/AccountPanel.jsx:165`、`:230`）。因此 43200 分钟等月窗口会被标为周窗口；无随时间更新的重置倒计时。双方界面都以剩余百分比为主，原应用并无“已用/剩余切换”或直接展示精确分钟数的控件；后台已有 usedPercent/windowMinutes，**不将未直接显示已用百分比或精确分钟数另算 Pulse 的 1:1 缺口**。

上游：服务字段保留两种百分比、时长与重置时间（`U/src/lib/api.ts:145`）；侧栏按订阅显示 5h+Weekly 或 monthly（`U/src/components/codex-limits-card.tsx:152`），显示固定时间和倒计时（`:298`、`:326`、`:343`），每 30 秒更新时钟（`:98`）。上游也不是对任意时长自动命名，不能把其标签逻辑夸大成服务准确性证明。

纯函数验证：向 Pulse `normalizeQuota` 提供 `windowDurationMins:43200`，输出为 `{key:"weekly",name:"Weekly",windowMinutes:43200}`；该结论不是根据截图猜测。

### Q03：独立只读查询及错误状态——已实现

真实链路：刷新账号按钮明确调用 `refresh({logs:false,quota:true})`，busy 时禁用（`P/src/renderer/AccountPanel.jsx:247`）；`use-pulse` 转交 bridge（`P/src/renderer/use-pulse.js:152`），preload 转交 IPC（`P/src/main/preload.cjs:16`），main 校验并转发布尔选项（`P/src/main/index.mjs:210`），service 只执行要求的任务（`P/src/main/usage-service.mjs:223`）。

额度客户端初始化后发送 `account/rateLimits/read` 与 `account/usage/read`（`P/src/main/quota-service.mjs:150`、`:151`），没有创建 thread/turn 或模型提示请求；并按 `AUTH_REQUIRED`、客户端缺失/不兼容、一般失败归类（`:142`）。面板对应提示和缺窗口状态在 `P/src/renderer/AccountPanel.jsx:44`、`:132`。失败保留成功值并标 stale，查询请求防重入（`P/src/main/usage-service.mjs:211`）。

上游对应独立查询按钮和状态在 `U/src/components/codex-limits-card.tsx:198`、`:42`、`:56`，刷新处理在 `U/src/hooks/use-usage-dashboard.ts:1051`，原生命令在 `U/src/lib/api.ts:294`。此处“已实现”是源码链路审计结论，没有在本审计中实际登录联网验证接口返回。

### Q04：显式启动窗口——未实现

需求子项：明确启动按钮；告知会发送真实最小模型请求并少量消耗额度的确认；执行中；成功/失败/已激活/刚请求过；防重复。

Pulse：额度客户端只提供 `read/close`，仅发初始化和两种 read 请求（`P/src/main/quota-service.mjs:150`、`:164`）；主界面只有查询按钮（`P/src/renderer/AccountPanel.jsx:247`），main action 允许项也无启动窗口（`P/src/main/index.mjs:185`）。全部子项缺失。仅有 `read()` 的 in-flight 去重不能替代模型请求的激活防重。

上游：启动按钮与禁用状态（`U/src/components/codex-limits-card.tsx:186`、`:203`），确认及运行状态（`U/src/hooks/use-usage-dashboard.ts:1062`），后端锁、已激活判断、冷却与执行后重查（`U/src-tauri/src/codex_limits.rs:264`、`:310`），真实 `codex exec` 与 prompt 参数（`:1051`）；中文确认明确写明会消耗额度（`U/src/locales/zh.json:152`）。**CLI 的 `read-only` 是文件访问沙箱，不能把该真实模型请求说成只读额度查询。**

### Q05：Credits 余额及状态——未实现

需求子项：数值余额、有余额/无余额、无限、未知、演示标记；与 API 美元估价分开。

Pulse：归一化返回体没有 credits，也不保留服务可能返回的 credits 信息（`P/src/main/quota-service.mjs:72`）；正式账号面板不渲染余额（`P/src/renderer/AccountPanel.jsx:211`、`:268`）。`estimatedCost` 只是本地 Token 参考价格估算（`P/src/main/usage-service.mjs:95`），不计作 Credits 实现。

上游：结构在 `U/src/lib/api.ts:157`，原生传出 credits/演示标志（`U/src-tauri/src/codex_limits.rs:743`），余额/无限/零/未知选择与独立演示标记（`U/src/components/dashboard-hero-card.tsx:64`、`:175`）。

### Q06：reset credits 次数、逐个有效期和管理入口——未实现

需求子项：可用次数；每个 credit 的到期日和剩余时间；零次、详情缺失/部分缺失状态；打开 ChatGPT Usage 管理。

Pulse：额度返回体无 `resetCreditsAvailableCount/resetCredits`（`P/src/main/quota-service.mjs:72`），账号面板无次数或列表（`P/src/renderer/AccountPanel.jsx:268`）；action 列表没有 Usage 设置链接（`P/src/main/index.mjs:185`）。下一次窗口重置时间（AccountPanel `:295`）不是可主动消耗的 reset credit，不能充作此项。

上游：字段在 `U/src/lib/api.ts:168`，面板次数/明细/缺失状态（`U/src/components/codex-limits-card.tsx:353`、`:402`、`:414`、`:428`）、剩余有效时间（`:440`）；打开 `https://chatgpt.com/#settings/Usage` 的处理在 `U/src/hooks/use-usage-dashboard.ts:76`、`:1229`。

### R01：最近一次全局重置公告——未实现

需求子项：最近一次公告、距今时间、regular/banked 类型、原帖/来源链接。

Pulse：snapshot 只返回 quota、Token 汇总与来源，没有公告对象（`P/src/main/usage-service.mjs:155`）；账号“下一次重置”取的是当前窗口 `resetsAt`（`P/src/renderer/AccountPanel.jsx:183`、`:295`），既不是最近发生的公告，也没有原文或 regular/banked 类型。

上游：公告结构（`U/src/lib/api.ts:221`）；最近重置与相对时间（`U/src/components/codex-reset-history.tsx:76`、`:124`）、详情原文/来源（`:300`、`:326`）；数据从第三方 timeline 取并挑选最近 regular（`U/src-tauri/src/codex_resets.rs:7`、`:34`）。准确地说，上游最近按钮选择 regular 公告，历史中另含 banked 类型，并非随意挑最新任意类型。

### R02：30 天重置历史、日历和间隔——未实现

需求子项：30 天历史；小日历和完整日历；历史弹层；展开更多；常规重置平均/最长间隔。

Pulse：正式 Dashboard 调用 AccountPanel（`P/src/renderer/Dashboard.jsx:1542`），AccountPanel 仅有当前窗口重置摘要（`P/src/renderer/AccountPanel.jsx:295`）；snapshot/bridge 没有重置历史读取或对象（`P/src/main/usage-service.mjs:155`、`P/src/main/preload.cjs:2`）。上述子项均无 live 链路。

上游：30 天范围和常规间隔计算（`U/src/components/codex-reset-history.tsx:7`、`:25`），首页小日历（`:84`）、完整日历（`:186`）、展开更多（`:270`）、统计（`:356`）、弹层及请求（`:368`、`:385`）；原生 history 过滤（`U/src-tauri/src/codex_resets.rs:42`）。

### R03：下一次重置预测和信号——未实现

需求子项：有依据/待到来/无信号/过期/陈旧等状态；原始预测窗口和时区；刷新与更新时间；证据来源。

Pulse：没有预测 service、snapshot 字段、IPC 或正式组件；可核查的 live 数据出口仅 `P/src/main/usage-service.mjs:155`、`P/src/main/preload.cjs:2`。AccountPanel 的未来时刻来自账号窗口 `resetsAt`（`P/src/renderer/AccountPanel.jsx:183`、`:318`），不能算第三方全局重置预测。

上游：预测请求（`U/src/lib/api.ts:302`），数据源为 `codex-reset.com/api/forecast`（`U/src-tauri/src/codex_forecast.rs:7`）；5 分钟陈旧规则、信号/已应答/窗口有效性状态（`U/src/components/codex-forecast-card.tsx:9`、`:28`）；刷新与失败状态（`:75`），过期与更新时间（`:115`），原始窗口和时区（`:144`）。该服务是第三方聚合预测，即使包含官方帖线索，也不能叫作官方保证或账号窗口的权威重置时间。

### R04：最近 Feed、原帖和上下文——未实现

需求子项：最近 5 条 Feed；原文链接；原帖和回复上下文证据；更新时间；过期或缺证据提示。

Pulse：主界面和 bridge/snapshot 中无 Feed/evidence 数据或获取操作（`P/src/main/preload.cjs:2`、`P/src/main/usage-service.mjs:155`）；账号查询刷新没有 Feed 分支（`P/src/main/usage-service.mjs:223`）。

上游：第三方 feed URL（`U/src-tauri/src/codex_forecast.rs:8`），回复祖先链提取（`:49`）、最近 5 条排序截取（`:71`）；Feed 列表/空/不可用/过期/原链接（`U/src/components/codex-forecast-card.tsx:118`），原帖与上下文/缺失/过期及更新时间（`:137`）。

### M01：模型汇总、构成、份额和排序——部分实现

真实存在：原生 parser 按模型聚合 Token（`P/src/main/scanner-core.mjs:246`），service 按总 Token 固定降序并附内部估价（`P/src/main/usage-service.mjs:137`、`:152`）。模型页模型列表、总 Token、输入、输出、命中率、日期趋势、关联项目和会话是真数据（`P/src/renderer/Dashboard.jsx:1312`、`:1364`）。

缺口：没有用户可切换的 Token/成本/综合单价排序；模型页 entityRows 只过滤、不自行排序（`P/src/renderer/Dashboard.jsx:396`）。未显示模型成本与综合单价比较、占全部模型的用量/费用份额、完整非缓存输入/缓存/输出构成；模型页 Input 为含缓存的 inputTokens，Cache 只有命中率，无独立缓存 Token 数（`:1367`）。现有“项目分布”百分比是所选模型的项目构成（`:1423`），不能冒充模型之间份额。页面顶部普通 `sort` 控制仅用于按日表（`:385`、`:999`），不能算模型排序。

上游：模型总览、综合价、命中率（`U/src/components/model-usage-card.tsx:108`），Token 构成和模型份额（`:162`、`:182`）；三种排序（`:198`）、每行分项和用量/费用份额（`:225`）；排序函数在 `U/src/lib/model-analytics.ts:42`。

### M02：每模型价格与定价状态——未实现

需求子项：每模型输入/缓存/输出/综合每百万 Token 单价；已定价、免费、不可用状态。

Pulse 内部确有参考价缓存读取和 Token 成本计算（`P/src/main/usage-service.mjs:80`、`:95`），但对前端只附 `estimatedCost`、全局 pricingAsOf/source/basis（`:152`、`:157`），未暴露每模型三种费率、effectiveCostPerMillionTokens 或 pricingStatus。正式模型详情也只显示 Token/命中率/趋势（`P/src/renderer/Dashboard.jsx:1355`）。因此这些后台计算基础不构成此组的 live 单价功能；未知价格保留 undefined 是正确处理，但不是完整状态 UI。

上游：模型费率和状态结构（`U/src/lib/api.ts:36`）；后端解析定价状态、三种费率及综合价（`U/src-tauri/src/overview.rs:356`），价格目录免费/不可用显示（`U/src/components/models-page.tsx:77`），用量模型四种单价渲染（`U/src/components/model-usage-card.tsx:230`）。

### M03：模型额度消耗估算、上下界与采样——未实现

需求子项：每模型 5h/周额度消耗估算；每百万 Token 对额度消耗；上下界；采样 Token 数及样本数；无样本状态。

Pulse：parser 对 token_count 只保存 Token 统计候选项，未提取 rate_limits 历史快照（`P/src/main/scanner-core.mjs:126`、`:133`）；模型 service 返回 Token/会话/estimatedCost，不含额度采样聚合或估计（`P/src/main/usage-service.mjs:137`、`:152`）。模型页面亦无配额估计展示（`P/src/renderer/Dashboard.jsx:1355`）。当前账号实时窗口、Token 份额、命中率均不能替代按模型的历史额度消耗估计。

上游：历史额度快照提取（`U/src-tauri/src/scanner.rs:755`），按模型 300/10080 分钟查询采样（`U/src-tauri/src/overview.rs:135`），以样本比例推断并披露上下界/样本数（`:380`）；界面无样本/总消耗/每百万/上下界/采样量（`U/src/components/model-usage-card.tsx:51`）、双窗口图（`:127`）。该功能本身是带采样误差的估算，不是 Token 到官方额度的固定汇率。

### M04：用量/价格目录、搜索、过滤、分页与刷新——部分实现

真实存在：正式模型用量视图、按模型名搜索和选择（`P/src/renderer/Dashboard.jsx:396`、`:1312`）。这是用量模型搜索，只计作该组已有基础子能力。

缺口：没有“用量/价格目录”切换、价格目录数据模型/页面、目录内模型搜索、供应商筛选、目录分页、从公开源刷新价格或受限目录提示。Pulse 的 refresh 只是重读另一应用本地价格缓存（`P/src/main/usage-service.mjs:102`、`:225`），没有 LiteLLM 目录请求；preload 也无目录 API（`P/src/main/preload.cjs:2`）。已有会话分页与模型用量名搜索不等于目录分页/目录搜索。

上游：50 条分页、目录 lazy load、供应商及模型名筛选、远端刷新（`U/src/components/models-page.tsx:13`、`:24`、`:34`、`:43`、`:60`），视图切换、受限提示、目录表和翻页（`:92`、`:97`、`:105`、`:106`）；目录源为 LiteLLM（`U/src-tauri/src/pricing.rs:13`），目录生成及每百万换算（`:258`）。

## 旧基线修正：不扩大原应用实际能力

1. Q01：上游能读取续订布尔值，但 UI 只在 `subscriptionWillRenew === false` 显示“自动续订关闭”（`U/src/components/dashboard-hero-card.tsx:170`）；没有 true/false/unknown 三态开关或管理续订功能。1:1 只要求已有的元数据与关闭提示，不能另外要求三态控件。
2. Q02：上游侧栏显示剩余百分比和倒计时（`U/src/components/codex-limits-card.tsx:340`、`:347`），没有独立“已用百分比”视图或精确分钟时长列。其 usedPercent/windowMinutes 是后台字段；Pulse 已有这两个字段，不能把这两项 UI 写成新增缺口。月/周语义和动态倒计时差距仍成立。
3. R01：上游最近公告按钮打开历史弹层（`U/src/components/codex-reset-history.tsx:151`），从弹层再打开来源（`:348`）；不是首页按钮直接跳原帖。服务的最近记录专取 regular（`U/src-tauri/src/codex_resets.rs:34`）；banked 类型在历史中保留。历史 text 来自第三方服务摘要，不等于完整原帖正文。
4. R04：上游 Feed 本体显示每条帖子的时间和链接（`U/src/components/codex-forecast-card.tsx:128`）；证据区域才条件显示 `evidenceUpdatedAt`（`:157`）。不宣称它有独立无条件显示的 Feed 抓取时间控件。其过期提示与证据源更新时间数据仍有实现。
5. M01/M02：上游命中率汇总是全部模型的总体命中率（`U/src/components/model-usage-card.tsx:96`、`:112`），不将“逐模型命中率列”虚构为原能力；定价状态可通过费率值、免费文本和不可用文本体现，并非每模型都有 priced/free/unavailable 三个显式状态徽标（`U/src/components/models-page.tsx:77`）。Pulse 已有 API 估价后端，M02 未实现专指单价/定价状态 live 功能缺失，不是否认估价计算。

## 验证边界与根因

1. 本报告确认的是固定源码是否有完整可达实现，不声称第三方服务此刻可用，亦不声称任何账号当前实际持有某项权益。
2. 合成验证直接 import `normalizeQuota`，未构造 quota client，也未调用 `read()`。43200 分钟被标 Weekly；返回字段也不含给定测试 credits，均与静态阅读一致。
3. 根因不在样式：主账号 schema 从原应用的完整账户权益模型缩成 plan+窗口；扫描器仅保留 Token 元数据；模型页复用通用 entity 详情，没有目录/额度采样数据链；预测/公告/Feed 服务没有迁入。补标签、静态数字或只扩 CSS 都无法补齐这些能力。
4. 订阅、余额、reset credits 只应显示真实服务返回；预测与公告必须披露第三方来源与时效；启动窗口必须保留显式确认和消耗说明。不能用 Token 线性换算、演示数据或账号窗口时间填充缺失功能。
