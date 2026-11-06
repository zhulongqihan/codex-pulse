# Codex Pulse v0.2.0：全局、仪表盘、日/月功能对照

审计日期：2026-11-06。范围：G01–G06、D01–D04、T01–T02，共 12 组。只读源码审计；未启动扫描、未读取认证文件或私人会话日志、未安装或发布、未修改运行代码。

- 当前正式版本：`package.json:4` 为 `0.2.0`，HEAD 为 `d45ee79e384e1075e24ba272a192b2885a220f8e`。当前源码路径均相对 `F:/codex++/CodexPulse/`。
- 上游固定版本：`.local/redesign-20261106/upstream-source/`，app-v5.6.0，固定提交 `1e8d2a2bae8ed466b0a48a37eb16f936629aa9c0`。下文 `U/` 代表该目录；绝不借用其他上游版本的能力。
- 正式入口：`src/renderer/App.jsx:2–7` 懒加载 `Dashboard.jsx`；只有 `#widget` 分支加载 `LegacyApp.jsx`。旧主面板、prototype、演示数据不计正式实现。
- “已实现”要求整组能力成立；“部分实现”不代表该组验收通过。下面不计算完成百分比。无真实账号/本地记录的运行验证，故“源码支持”不冒充实际服务已返回数据。

| ID | 结论 | 最重要的事实 |
| --- | --- | --- |
| G01 | 部分实现 | 六主视图和设置均有正式入口；可选诊断日志页不存在。 |
| G02 | 未实现 | 无导航侧栏折叠/调宽/偏好保存，无设置返回原页面；账户区隐藏不是此功能。 |
| G03 | 部分实现 | 能扫描/强制重扫、显示天数/更新时间/文件进度；缺扫描耗时与缓存复用/新解析数量，并且失败后顶栏仍可标“已同步”。 |
| G04 | 已实现 | 九种预设、自定义起止、含首尾日期范围及有效性校验均贯通正式 IPC/数据源。 |
| G05 | 部分实现 | 范围导出和保存对话框成立；实际格式只有 CSV、Markdown，无 XLSX，Markdown 内容也少于上游。 |
| G06 | 部分实现 | 日志/额度独立刷新且保留旧值；缺预测请求及其独立状态，扫描失败状态反馈仍不足。 |
| D01 | 部分实现 | 范围总量/输入/输出/API 估价已显示；范围缓存绝对量只有数据字段/导出，首页只给命中率。 |
| D02 | 部分实现 | 有缓存命中率和 Token 日均，但日均是有记录日口径；无自然日日均费用、综合每百万成本、范围缓存量展示。 |
| D03 | 部分实现 | 首页只有项目 Token 排行与跳转；缺项目/模型/日期三维成本排行及成本占比。 |
| D04 | 部分实现 | 有 Token/估价图切换；缺费用/额度切换、独立图例开关、悬停明细及全屏。 |
| T01 | 部分实现 | 有日表/分项/成本，三种固定降序；缺完整排序、星期/命中率/额度、峰值/无活动日合并，点日跳首页而非会话。 |
| T02 | 部分实现 | 有 YYYY-MM 聚合，但仅聚合当前日期截片；缺独立最近 12 自然月、额度/命中率/环比/排序/峰值/空月合并。 |

## G01：六主视图、设置、可选诊断页

**结论：部分实现。**

- 当前：`src/renderer/Dashboard.jsx:54–64` 定义 overview/sessions/models/daily/monthly/projects 六入口和 settings 白名单；`Dashboard.jsx:443–456` 渲染六入口；`Dashboard.jsx:481–488` 渲染设置按钮；各页实际渲染位于 `683`、`991`、`1104`、`1312`、`1509` 附近。这里确认的是入口与对应视图存在，不代表这些视图内的每项功能已齐。
- 上游：`U/src/components/app-sidebar.tsx:17–25,74–86` 包含六页、logs 与设置；logs 由 `showLogsTab` 可选显示；`U/src/App.tsx:517,531–532` 贯通设置开关与 `LogPanel`。
- 缺口：正式路由白名单没有 logs，无日志页及显示日志标签的设置。不能把打开数据目录或源文件中的旧组件算作可选诊断页。

## G02：侧栏折叠/调宽/保存、设置返回

**结论：未实现。**

- 当前：`Dashboard.jsx:443–456` 使用顶部导航；`Dashboard.jsx:296–310` 的 `go` 只改 route/hash，`toggleAccount` 只控制账户区临时显隐；`Dashboard.jsx:188–193` 的 `accountVisible` 默认 true，未保存到偏好；`Dashboard.jsx:1509–1516` 给设置组件的 props 里没有返回原页的回调。`SettingsPanel.jsx:52–58` 同样没有返回 props。
- 上游：`U/src/App.tsx:32–47,134–141` 读取并持久化 `sidebar_collapsed` / `sidebar_width`，另存 `settingsReturnView`；`U/src/App.tsx:182,226` 记录来源页并提供返回；`U/src/components/app-sidebar.tsx:27–58,64,89–110` 支持宽度约束、拖动以及键盘调宽。
- 缺口：没有同等的导航侧栏折叠、拖动调宽与宽度/折叠偏好持久化；没有“设置返回此前页面”。用户可手动重新选导航，但这不等价于设置返回。账户侧栏的临时显示/隐藏不是导航侧栏能力。

## G03：扫描、同步元信息

**结论：部分实现。**

- 当前：`Dashboard.jsx:506–528` 显示扫描/“已同步 N 天”、上次日志时间与本地刷新；`Dashboard.jsx:553–562` 显示文件数进度；`SettingsPanel.jsx:418–443` 强制重扫调用 `refresh({logs:true,quota:false,force:true})`。扫描 worker 有指纹复用与新解析计数（`src/main/scanner-worker.mjs:115–127,146`）。
- 上游：`U/src/components/dashboard-header.tsx:61–66,87–105` 显示同步成功/不同步、更新时间和耗时；`U/src/hooks/use-usage-dashboard.ts:412–422` 将 `importedDays/filesReused/filesParsed` 与耗时交给 UI。
- 缺口：`src/main/usage-service.mjs:156–162` 未把 parsedFiles/复用数/耗时加入正式 snapshot 展示，页头只有日数、更新时间、进度和页脚总文件数。页头 `Dashboard.jsx:509–513` 只看 scanning，扫描失败结束后仍会显示“已同步”，未像上游将失败变成 out-of-sync。已有 warning 信息不能替代正确同步状态。

## G04：日期预设、自定义、校验

**结论：已实现。**

- 当前：`Dashboard.jsx:588–610` 提供 1/2/7/14/30/60/90/180/365 天（额外支持全部）；`Dashboard.jsx:645–678` 提供起止输入和无效范围提示。`src/renderer/analytics.js:7,11–43` 校验真实日历日期、起止顺序、结束不晚于 anchor，预设按含首尾自然日计算。`use-pulse.js:55–68,113–135,184–188` 将当前范围传入正式 `getSnapshot(range)`，范围未载入成功前保留旧 snapshot 并禁止导出（`Dashboard.jsx:532–550,624`）。`src/main/index.mjs:205` 与 `src/main/usage-service.mjs:130–136` 将范围传到底层筛选。
- 上游：`U/src/components/range-switcher.tsx:27–36,61–74` 提供相同九预设与自定义起止/顺序校验；`U/src-tauri/src/overview.rs:35–56` 按含首尾自然日解析范围。
- 限定：此项通过的是日期选择、校验和所选范围过滤能力；不代表图表会覆盖范围内所有天，也不代表按月页正确使用独立自然月口径，那些缺口另见 D04/T02。

## G05：范围 XLSX/Markdown 导出

**结论：部分实现。**

- 当前：`Dashboard.jsx:322–340` 通过 `bridge.exportData(format,range)` 使用已成功读取的范围，`Dashboard.jsx:631–639` 实际只有 CSV / Markdown 两项；`src/main/index.mjs:167–182,208` 仅允许 csv/markdown，重新获取该范围 snapshot 后通过原生保存对话框写文件，并支持取消；完成/失败 toast 在 `Dashboard.jsx:327–340`。`analytics.js:151–180,240–287` 按范围过滤日数据并输出日表和合计，包含价格口径与未知值说明。
- 上游：`U/src/hooks/use-usage-dashboard.ts:1113–1135` 选择保存路径、按所选 range 导出并反馈；`U/src-tauri/src/exporter.rs:24–26,39–47` 真正写 XLSX，含 Summary/Daily/Models/Projects 四表；`exporter.rs:288–370` 的 Markdown 包含汇总指标、每日、模型、项目。
- 缺口：没有 `.xlsx` 生成器、格式分支或入口。CSV 能被 Excel 打开并不构成 XLSX 保全。Markdown 只有每日分项/合计，缺上游模型、项目部分及日均/综合单价等汇总。范围、路径选择和成功/失败反馈已经补上，不再沿用旧 v0.1“只导出全部”的结论。

## G06：独立载入、失败保留、重试

**结论：部分实现。**

- 当前：`src/main/usage-service.mjs:110–118,171–229` 日志和额度分别维护 scanJob/quotaJob 与 scanning/quotaRefreshing，可并发，失败时保留已有 local/quota；`use-pulse.js:113–135` 范围读取失败不替换旧 snapshot。`Dashboard.jsx:532–550` 对范围/桥接请求错误保留数据并给重试；`Dashboard.jsx:1518–1526` 展示数据警告。`AccountPanel.jsx:158–160,247–261` 有额度独立忙碌与独立刷新，stale/error 消息链见 `AccountPanel.jsx:45–80,188–194`。
- 上游：`U/src/hooks/use-usage-dashboard.ts:130–158,341–368,407–427` 分开管理扫描、额度、预测/重置等状态，且扫描不等待额度成功。`U/src/hooks/use-codex-forecast.ts:6–34,53` 有预测独立 data/error/isRefreshing、失败保留旧 data、refresh。
- 缺口：正式 snapshot 和 hook 无预测请求/数据/加载/错误/重试链。扫描失败在 `usage-service.mjs:188–208` 会设置错误码但 `resolve()`，`use-pulse.js:152–162` 的 refresh 因此通常仍走成功清空 error；失败可从 notes 警告看到，但没有与扫描错误准确对应的主动重试/失败状态，且顶栏可能仍“已同步”（G03）。所以不能判整组完成。

## D01：范围 Token 分项与 API 费用

**结论：部分实现。**

- 当前：`Dashboard.jsx:685–718` 按 `snapshot.totals` 显示总 Token、输入（含缓存）、输出、缓存命中率、API 估价；`src/main/usage-service.mjs:130–160` 对所选范围聚合且缓存包含在输入中；`usage-service.mjs:95–99,147–160` 由模型输入/缓存/输出价格计算费用，未知价格返回 undefined，由 UI 显示 `—`，并标“非 Pro 账单”。
- 上游：`U/src/components/dashboard-hero-card.tsx:123–129,249–254` 使用当前范围费用/Token；`U/src/lib/usage-dashboard.ts:94,110–115` 明确将所选范围 `cachedInputTokens` 绝对量显示于缓存卡说明；`U/src-tauri/src/overview.rs:205–209` 保留全部 Token 分项。
- 缺口：当前首页缓存卡只显示命中率，未显示所选范围缓存绝对量；该值虽存在于 `totals.cachedTokens` 并进入导出，但不是首页的完整分项展示。日表/单日图展示缓存分项不等于所选范围缓存总量。其余总量、输入、输出、估价的数据链已成立。

## D02：自然日日均、缓存量、综合成本

**结论：部分实现。**

- 当前：`Dashboard.jsx:702–705` 有命中率；`Dashboard.jsx:831–845` 的 Token 日均公式为 `total.totalTokens / Math.max(1,rows.length)`。`src/main/scanner-core.mjs:236–253` 只为有记录的日期建 daily bucket；`usage-service.mjs:135,139` 只筛选已有日行并以 selected.length 作 activeDays，不补零活动日。
- 上游：`U/src-tauri/src/overview.rs:50,77–93,211–221` 用起止范围包含的自然日数做 Token/费用日均，补齐无记录日期；`U/src/lib/usage-dashboard.ts:94–119` 展示 Token/费用双日均、命中率/缓存总量、cost per million。
- 缺口：当前“日均”实际以有记录日数除，不等价于范围自然日日均。例：选 7 天仅 2 天各 100 Token，当前为 200/2=100，上游为 200/7≈28.57（这是由源码公式推得的合成例，不是私人用量）。首页还缺日均估算费用、范围缓存量、综合每百万 Token 成本。不能以“可推导”记为已交付。

## D03：项目/模型/日期成本分布

**结论：部分实现。**

- 当前：`Dashboard.jsx:849–885` 仅首页 top-5 项目 Token 排行，条宽分母为 `total.totalTokens`，点击能进入对应项目；`src/main/usage-service.mjs:152,160` 模型/项目按 Token 排序，项目列表未附估价。它不是成本排行。
- 上游：`U/src/components/dashboard-hero-card.tsx:40–58,69–73` 构建项目/模型/日期三种 top-3 成本驱动，按 costUSD 排名、除总成本算占比；`dashboard-hero-card.tsx:194–236` 提供三维切换、排名、费用值和百分比。
- 缺口：没有三维成本切换、成本排名、成本占比。当前项目 Token 份额不能当成本份额，不同模型单价会改变排名。
- **基线纠正**：旧矩阵写了“跳转相关明细”，但固定上游 `dashboard-hero-card.tsx:217–240` 的成本榜项实际是无 onClick 的 div，因此不把“上游成本榜点击跳转”冒充事实，也不为此制造差距。当前 Token 榜的项目跳转已实现。

## D04：费用/额度趋势、图例、悬停、全屏

**结论：部分实现。**

- 当前：`Dashboard.jsx:234–249` 固定取所选范围最后 7 个有记录日；`Dashboard.jsx:726–754` 的切换是 Token / 估价，图例是静态 span；`Dashboard.jsx:755–829` 依据皮肤使用 MeterPlot 或简单条形；`variant-ui.jsx:23–33,73–138` 只有日期点击、键盘选中和 ARIA 文本，没有悬停详情或各序列隐藏状态。`Dashboard.jsx:924–970` 另有点击选择日期的旁栏说明，但不能视作图上 hover 明细。
- 上游：`U/src/components/usage-trends-card.tsx:43,123–153,184–241` 是 cost / quota 切换，Token 三分项与费用/双窗口额度序列可独立隐藏；`usage-trends-card.tsx:45–112,292–293` 有悬停明细；`usage-trends-card.tsx:156–171,234–241,392–402` 有全屏与 Escape 退出。输入序列扣除缓存（`130–132`），未重复计算。
- 缺口：无按日历史额度曲线/费用-额度模式，只有账户当前额度卡；没有输入/缓存/输出/费用各自开关、完整悬停、全屏/Escape。当前图还把 30/365 天等选择截为最后 7 个有记录日，不能作为上游全范围趋势的对等实现。Clear 皮肤费用模式的轴仍使用 Token max（`Dashboard.jsx:767–770`），费用条宽却按费用最大值（`806–814`）缩放，轴口径也不一致。

## T01：按日详情、排序、峰值、空日、会话联动

**结论：部分实现。**

- 当前：`Dashboard.jsx:991–1086` 渲染日期、分布条、输入（含缓存）、缓存、输出、总量、会话与估价；分布条在 `Dashboard.jsx:119–135` 正确扣缓存后分为非缓存/缓存/输出。`Dashboard.jsx:385–395,999–1014` 仅日期最新、Token 最多、估价最高三种固定降序，无升序及输入/缓存/输出排序。`Dashboard.jsx:1041–1053` 点行或 Enter 都 `setSelectedDay(date);go('overview')`。
- 上游：`U/src/components/daily-usage-table.tsx:23–30,76–92,165–185` 有日期/总量/输入/缓存/输出/成本六字段与升降；`32–73,206–219` 合并连续无活动日；`114–139,249–280` 显示星期、峰值、命中率与双窗口额度。`U/src/App.tsx:462–468` 点日期设置 selectedSessionDate 并进入 sessions，`App.tsx:490` 传入 initialExpandedDate。
- 缺口：缺星期、命中率、5h/长期额度估算、完整升降排序、峰值识别、无活动日期补齐与合并。当前点日期是进入首页当天检查器，并非进入该天会话；即使再点“查看范围内全部会话”，`showSessions` 也只支持项目/模型筛选（`Dashboard.jsx:301–306`），没有日期过滤。另，日表条形的 max 来自最后 7 日（`Dashboard.jsx:234–235,1061`），较早的大值可能超出该比例；上游使用完整 daily 峰值。

## T02：独立自然月汇总、额度、环比与排序

**结论：部分实现。**

- 当前：`Dashboard.jsx:220–231` 从当前 snapshot.daily 和 sessions 调用 monthlyTotals；`use-pulse.js:121–135` 的 snapshot 已受当前日范围截取。`analytics.js:75–112,125–148` 按 YYYY-MM 累计 Token/成本/活动天数、按月去重会话并在明细不足时显示未知，月排序固定倒序；`Dashboard.jsx:991–1086` 有正式 monthly 视图，但只有 daily 才有排序选择器（`999`）。
- 上游：`U/src/hooks/use-usage-dashboard.ts:326–329` 独立 fetchMonthlyUsage，不传当前日 range；`U/src-tauri/src/overview.rs:432–500` 取当前月及前 11 月，完整月份边界查询并预填空月，累积 Token/成本/双窗口额度。`U/src/components/monthly-usage-table.tsx:20–30,60–99,145–170,195–215` 支持六字段升降、空月合并；`116–135,163,275–303` 计算自然前月环比并显示命中率、额度、峰值。
- 缺口：当前只是“所选范围中已有日期按月份分桶”。比如选 2026-10-31 至 2026-11-06，10 月行只有 10/31，不是上游独立最近 12 自然月；不存在的月份不会被补齐。无命中率/额度列、环比、六字段升降排序、峰值/无活动月份合并。不能再称“完全没有按月”，但也不能因有按月标签与 YYYY-MM 行就称自然月能力已对等。

## 可直接用于后续验收的区分

1. G04 的日期范围本身正确；D02 的分母、D04 的图范围、T02 的月数据源分别仍错位，不能混作一个“范围已修复”。
2. G05 的路径选择、成功/失败反馈与所选范围已具备；缺 XLSX 和完整导出内容。不能继续说“只有全部 CSV”，也不能说“Excel 导出已经实现”。
3. 以上结论来自正式入口与完整数据调用链，不以 UI 截图、测试通过、源字段存在或旧面板功能替代实际能力验收。
