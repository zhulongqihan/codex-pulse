# 隐私与网络访问 / Privacy and network access

[中文](#中文) · [English](#english) · [下载与数据说明](docs/TRUST.md) · [卸载与数据保留](docs/UNINSTALL.md)

## 中文

更新日期：2026-11-14。Codex Pulse 是由 [zhulongqihan](https://github.com/zhulongqihan) 维护的独立开源项目，不隶属于 OpenAI。本页说明桌面程序、公开演示和反馈入口当前的数据边界。

### 留在本机的数据

Pulse 只读你选择的 Codex 日志，用于统计与回放；日志可能含提示词、工具结果、项目路径和其他私人内容。程序将自己的数据库、索引、偏好、诊断日志、额度观测及 WebView 缓存保存在程序旁的 `data`，或你指定的 `PULSE_DATA_DIR`。这些文件也可能含私人资料，不会自动上传或云同步。索引和缓存可能重建、更新或淘汰；需要长期保留的资料请另行备份，按自己的需要选择保留或移除。

每日官方额度使用独立的 `quota-history.db` 长期保存最小读数、时间、覆盖与本地身份哈希；不保存访问令牌、刷新令牌或会话正文，不随日志缓存重建删除。记录默认开启，Pulse 运行时即使窗口隐藏也会后台只读采样；退出或休眠时停止。可在设置的数据来源分区关闭新记录，旧历史保留。备份或移动资料前请先退出 Pulse，并保留完整 `data`。

账号查询在本机 Rust 进程中读取既有 Codex ChatGPT 登录。凭据不传给 Pulse 界面、导出或可选反馈摘要；访问官方服务时，请求仍需向官方发送访问令牌与适用的账号标识。登录和令牌续期由官方 Codex 管理，不应把密码、认证文件或原始会话发送给维护者。

### 哪些操作会联网

普通启动和后台运行可发起服务请求，并非每次请求前都弹出确认。关闭主窗口只会隐藏到托盘，不会停止后台请求。外部服务可能处理连接 IP、请求时间与发送的 HTTP 头；其处理和保留规则由相应服务说明。

| 功能与接收方 | 发送内容及触发方式 | 服务说明 |
|---|---|---|
| 账号额度、订阅与 reset credits：`chatgpt.com` | 启动、后台采样或手动刷新使用既有访问令牌和适用的账号 ID；订阅查询还带本地时区偏移。不上传本机会话正文 | [OpenAI 隐私政策](https://openai.com/policies/communications-privacy-policy/)，并提供其列出的地区版本 |
| 可选逐会话 Credits：`chatgpt.com` | 默认关闭；开启后发送当前查看的真实线程 ID、认证头，不发送消息正文 | [OpenAI 隐私政策](https://openai.com/policies/communications-privacy-policy/) |
| 重置历史、预告与 Feed：`codex-reset.com` | 启动或后台检查可请求公开数据；预测查询含界面语言，User-Agent 含 Pulse 版本。此请求不带账号凭据、个人额度或本机日志 | [Codex Reset 隐私说明](https://codex-reset.com/privacy) |
| API 参考价格：GitHub 托管的 LiteLLM 公开目录 | 缓存缺失或需要刷新时下载同一公开价目文件，不上传本机模型用量或会话。接收请求的是 GitHub 托管服务 | [价目来源](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json)、[GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| Pulse 更新：GitHub Releases 及其下载服务 | 启动、定期或手动检查获取更新清单；你选择安装后下载程序包。不发送本机统计、会话或账号凭据 | [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| 打开帮助、源链接或提交反馈：你打开的网页 | 点击链接会打开浏览器；在 GitHub 提交时，你填写的文字、附件和账号信息由 GitHub 处理。复制摘要不会自动提交 | [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)；其他网页适用其自己的说明 |

“启动窗口”是另一个需要明确确认的操作，会通过官方 Codex CLI 发出最小模型请求，可能消耗额度。普通只读刷新不会执行它。

Pulse 不添加遥测或会话上传。Microsoft WebView2 是单独安装的系统运行时，Windows、WebView2、浏览器及网络服务各自的诊断或更新行为不属于 Pulse 自建遥测；参阅 [Microsoft 隐私声明](https://www.microsoft.com/en-us/privacy/privacystatement)。在浏览器访问第三方网站，也可能加载其网站脚本和分析服务；这与 Pulse 读取公开 JSON 接口不同。

### 现有控制与限制

- 在 **设置 → 通用** 关闭逐会话 Credits，可停止该可选功能后续查询。调整本机扫描间隔只影响扫描节奏，不会关闭所有联网功能。
- 当前没有一个 GUI 总开关分别停用全部账号、价格、预告和更新请求。关闭浮窗、跟随提示或主窗口，也不等于关闭联网。要停止 Pulse 的后台活动，请从托盘选择 **退出**。
- 需要仅用本机分析时，可先完全退出 Pulse，再在便携目录的 PowerShell 中使用已有的离线启动选项：

```powershell
$env:PULSE_OFFLINE = '1'
.\CodexPulse.exe
```

此选项阻止 Pulse 内置账号、逐会话 Credits、价格、重置/预告、更新和模型激活请求；已有本机记录与缓存可继续使用，实时字段可能显示不可用。它不是系统防火墙，不限制你主动打开的浏览器或 Windows/WebView2 自身服务，也不会改变 Codex 客户端的网络设置。该变量只影响当前 PowerShell 及其子进程；恢复正常联网时，先退出 Pulse、关闭该 PowerShell，再从常规入口启动。

### 演示、反馈和移除资料

公开演示只运行合成数据，不能读取你的本机文件或 Codex 登录；托管方 GitHub 仍可接收一般网页访问数据。演示中的客户端场景是示意，不是真实用户反馈。

“帮助与反馈”的摘要先完整预览，再由你主动复制；不会自动附上账号、额度、路径、会话或原始错误日志。请审阅你自己填写的文字与截图；不要发布认证文件、完整 `data`/`.codex` 或原始会话。公开帖子和附件可能被他人保存；删除本机数据不会删除已发布内容，外部内容应按对应平台的规则处理。

按[卸载与数据保留](docs/UNINSTALL.md)选择保留或移除 Pulse 的本机资料；这不会删除官方账号或原始 Codex 日志。隐私或安全问题请使用 [SECURITY](SECURITY.md) 中的报告方式；需要私下联系时先请求联系方法，不在公开 Issue 贴私人资料。

## English

Updated: 2026-11-14. Codex Pulse is an independent open-source project maintained by [zhulongqihan](https://github.com/zhulongqihan), not affiliated with OpenAI. This page describes the current boundaries of the desktop app, public demo and feedback links.

### Data kept locally

Pulse reads your selected Codex logs without modifying them for statistics and replay. Logs may contain prompts, tool results, project paths and other private material. Pulse keeps its own database, indexes, preferences, diagnostics, quota observations and WebView cache in the adjacent `data` folder or your chosen `PULSE_DATA_DIR`. These files can also contain private information and are not automatically uploaded or cloud-synchronized. Indexes and caches may be rebuilt, refreshed or evicted. Back up information you need to retain, and choose which local files to keep or remove.

Daily official quota history retains minimal readings, times, coverage and a local identity hash in a separate `quota-history.db`. It stores no access tokens, refresh tokens or conversation bodies and is not deleted by log-cache rebuilds. Recording is enabled by default while Pulse is running, including with hidden windows; quitting or sleep stops it. Disable new recording in Settings → Data source without removing history. Quit Pulse and retain the complete `data` folder before backup or relocation.

The local Rust process reads an existing Codex ChatGPT sign-in for account queries. Credentials are not passed to Pulse's renderer, exports or optional feedback summary. Authenticated requests still send the access token and applicable account identifier to the official service. The official Codex client manages sign-in and renewal. Do not send passwords, authentication files or raw conversations to the maintainer.

### Network requests

Normal startup and background operation can contact services without a confirmation before each request. Closing the main window hides Pulse to the tray and does not stop those requests. Services may process your connection IP, request time and transmitted HTTP headers under their own handling and retention policies.

| Feature and recipient | Data sent and trigger | Service information |
|---|---|---|
| Account quota, subscription and reset credits: `chatgpt.com` | Startup, background sampling or manual refresh sends the existing access token and applicable account ID. Subscription checks also send the local time-zone offset. No local conversation bodies are uploaded | [OpenAI Privacy Policy](https://openai.com/policies/communications-privacy-policy/), including its linked regional versions |
| Optional per-session Credits: `chatgpt.com` | Off by default. When enabled, requests send the viewed real thread IDs and authentication headers, without message bodies | [OpenAI Privacy Policy](https://openai.com/policies/communications-privacy-policy/) |
| Reset history, notices and feed: `codex-reset.com` | Startup or background checks request public data. Forecast requests include interface language; the User-Agent includes the Pulse version. No account credentials, personal quota or local logs are included | [Codex Reset Privacy](https://codex-reset.com/privacy) |
| API reference prices: the public LiteLLM catalog hosted by GitHub | Downloads the same public catalog when a cache is missing or a refresh is needed, without uploading local model usage or conversations. GitHub hosting receives the request | [Price source](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json), [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| Pulse updates: GitHub Releases and download services | Startup, scheduled or manual checks fetch the update manifest. Choosing installation downloads the package. Local statistics, conversations and account credentials are not sent | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| Help, source links and submitted feedback: the websites you open | Links open your browser. Submitting on GitHub sends the text, attachments and account information you provide to GitHub. Copying a summary does not submit it | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement); other websites have their own policies |

**Activate window** is a separate operation requiring explicit confirmation. It sends a minimal model request through the official Codex CLI and may consume quota. Ordinary read-only refresh does not perform it.

Pulse adds no telemetry or conversation upload. Microsoft WebView2 is a separately installed system runtime. Diagnostics or updates from Windows, WebView2, your browser and network services are separate from Pulse's own behavior; see the [Microsoft Privacy Statement](https://www.microsoft.com/en-us/privacy/privacystatement). Opening a third-party website in your browser can load that site's scripts and analytics, unlike Pulse's public JSON requests.

### Available controls and limits

- Turn off per-session Credits in **Settings → General** to stop later queries for that optional feature. Changing the local scan interval does not disable all networking.
- There is currently no GUI master switch separately disabling all account, price, notice and update requests. Hiding the widget, corner indicator or main window does not stop networking. Choose **Quit** from the tray to stop Pulse's background activity.
- For local analysis only, quit Pulse completely, then use the existing offline launch option in PowerShell from the portable folder:

```powershell
$env:PULSE_OFFLINE = '1'
.\CodexPulse.exe
```

This blocks Pulse's built-in account, per-session Credits, price, reset/forecast, update and model-activation requests. Retained local records and cached values remain usable; live fields may be unavailable. It is not a system firewall and does not restrict browsers you open or Windows/WebView2 services, nor change the Codex client's networking. The variable affects only that PowerShell session and its children. To resume normal networking, quit Pulse, close that PowerShell session and start Pulse from the usual entry.

### Demo, feedback and data removal

The public demo uses synthetic data and cannot read local files or your Codex sign-in. Its GitHub host can still receive ordinary web-access data. The illustrated client context is not a real-user testimonial.

Help & feedback displays the complete optional summary before you choose to copy it. It does not automatically attach accounts, quota, paths, conversations or raw errors. Review your own text and screenshots; never publish authentication files, complete `data`/`.codex` folders or raw sessions. Others may retain public posts and attachments. Removing local data does not erase content already published; manage that content through the relevant platform.

Use [Uninstallation and data retention](docs/UNINSTALL.md#english) to retain or remove Pulse's local files. This does not delete your official account or original Codex logs. Follow [SECURITY](SECURITY.md) for privacy or security reports; request a private contact method before sharing sensitive information.
