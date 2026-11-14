import { useRef, useState } from "react";
import { ArrowRight, Code2, Download, ExternalLink, Monitor, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PulseStyleSwitcher } from "./pulse-appearance-controls";
import { PulseBrandMark } from "./pulse-brand-mark";
import { PulsePaceBadgeView, PulsePaceCard } from "./pulse-pace";
import { syntheticCoachSnapshot, type SyntheticCoachScenario } from "@/lib/pulse-pace";
import { version } from "../../../package.json";
import "./pulse-browser-welcome.css";

const repository = "https://github.com/zhulongqihan/codex-pulse";
const messages = {
  zh: {
    title: "余量与时间，一起看。",
    lead: "Windows 额度配速伴侣。工作时随手看清还剩多少、何时重置与消耗节奏，需要时再追溯本机项目和模型用量。",
    download: "下载 Windows 版", demo: "打开完整工作台", source: "源码", docs: "使用说明",
    requirement: "Windows 10 / 11 x64 · 便携版 · 需要 WebView2",
    support: "右上角跟随仅支持 Windows 商店版 Codex。订阅额度需已有 ChatGPT 登录；API Key 模式可分析本机日志，不提供订阅额度。",
    downloadFacts: "桌面版只读本机日志，使用既有登录查询官方额度，不上传会话。当前 EXE 尚无 Windows 发布者代码签名。",
    preview: "在工作中随手看一眼", previewDetail: "展开提示，继续工作时收起，或试试切换到其他应用。里面运行的是软件中的配速组件。",
    synthetic: "合成工作情境，不是官方客户端截图；不读取你的账号或文件。",
    scene: "Codex 工作情境示意", foreground: "Codex 在前台", away: "切到其他应用", otherApp: "其他应用示意",
    task: "示例任务：检查项目改动", taskDetail: "查看改动，准备下一项任务。", continue: "模拟继续工作，收起提示",
    toggle: "展开或收起配速提示", cardTitle: "配速提示", collapse: "收起提示", hidden: "已切到其他应用，Pulse 提示隐藏。回到 Codex 后恢复紧凑提示。",
    sceneStatusOpen: "提示已展开，可查看余量、重置和配速。", sceneStatusClosed: "提示已收起，工作内容保持可见。",
    next: "到工作台查看本机用量", nextDetail: "在左侧“用量分析”查看项目与模型；本机 Token 不等于它们占用的账号额度。",
    scenarios: "演示数据状态", roomy: "余量宽裕", fast: "用量偏快", notice: "重置预告", stale: "数据陈旧",
    stateDetail: "分配参考把当前余量均摊到重置前，不代表每天新增额度或保证工作时长。",
    difference: "让额度数字，变成安排任务的参考。",
    features: [
      ["本轮额度配速", "余量、重置时间与时间进度一起判断，配上日均或每小时分配参考。百分比暂未变化时，基本信息仍然可用。"],
      ["需要时追溯消耗", "在完整工作台按日期、项目和模型查看本机留存日志，或只读回放会话。账号额度与本机 Token 分开，不把参考成本当订阅账单。"],
      ["需要时才展开", "小图标与状态条贴在 Codex 右上角。点击展开无输入框卡片；离开 Codex 时隐藏。清爽与刻度两版保持同样的能力。"],
    ],
    install: "几步放到手边。",
    steps: [
      ["下载、核对后打开", "从 GitHub Release 下载 Windows ZIP 和对应 SHA256 文件，核对后完整解压到可写文件夹，运行 Start-Codex-Pulse.cmd。"],
      ["先看到有效读数", "确认 Codex Home 和已有 ChatGPT 登录。看到已返回的余量与重置时间就已可用；仅返回周窗口也可正常使用。趋势随后积累，不保证出现预测。"],
      ["选择常用入口", "在“设置 → 桌面与 Codex”开启跟随提示或独立浮窗，保持 Pulse 运行。快捷方式与登录启动按需开启；“设置 → 帮助与反馈”可查说明或分享体验。"],
    ],
    firstSuccess: "首次看到有效余量和重置时间，即可开始使用。预测还需足够连续观测；没有预测不等于安装失败。",
    trustTitle: "下载前，了解数据与签名",
    dataTitle: "桌面版访问什么",
    data: "在本机只读 Codex 日志，Rust 进程使用既有登录向官方账号服务查询额度。不会索取你的密码，不上传本机会话，不添加遥测；模型价格和重置预告有独立外部来源。",
    signingTitle: "Windows 发布者签名",
    signing: "当前 Windows EXE 尚无 Authenticode 发布者代码签名。SHA256 用于核对下载完整性，更新器另验更新清单签名与包摘要；这不等同于 Windows 发布者认证，也不保证系统不会提示。",
    safety: "遇到系统拦截时，保留提示并反馈，先核对来源与完整性；无需关闭系统防护。",
    privacyLink: "隐私与安全说明", checksLink: "如何核对 SHA256", runtimeLink: "获取 WebView2",
    questions: "先了解这几个边界。",
    faqs: [
      ["这会额外消耗模型额度吗？", "节奏采样默认约每 60 秒只读查询已有额度，出错与限流时会冷却，不会发起模型请求。主工作台的“启动窗口”是另一个需要明确确认的操作，可能消耗额度。"],
      ["预测可靠吗？为什么有时没有时间？", "它描述近期消耗持续时的趋势，不承诺剩余工作时长或请求次数。缺少连续样本、消耗过慢、换账号、重置或数据过期时，卡片会显示对应状态并停止给出预测。"],
      ["和 Codex 插件页是什么关系？", "右上角提示由 Windows 伴随窗口提供，无需在插件页输入内容。原有 MCP 插件入口仍可使用；它底部的对话输入框由 Codex 宿主管理，Pulse 无法可靠隐藏。"],
      ["数据留在哪里？怎样退出？", "桌面版自己的缓存和偏好默认在程序旁的 data 文件夹，原始 Codex 记录只读。关闭主窗会回到托盘；在托盘选择“退出”完全结束程序。搬迁时保留整个目录。"],
    ],
    privacy: "独立开源项目，不隶属于 OpenAI。个人额度、本机 Token 和 API 参考成本分开呈现。",
    footer: "本地记录，清楚呈现。", release: "版本记录", feedback: "反馈与建议", skip: "跳到产品介绍",
  },
  en: {
    title: "Quota and time, together.",
    lead: "A Windows quota-pacing companion for Codex. Glance at what remains, when it resets and how quickly it is being used, then explore local project and model usage when needed.",
    download: "Download for Windows", demo: "Explore the workspace", source: "Source", docs: "User guide",
    requirement: "Windows 10 / 11 x64 · Portable · WebView2 required",
    support: "The corner indicator follows only Microsoft Store Codex. Subscription quota needs an existing ChatGPT sign-in; API-key mode can analyze local logs but exposes no subscription quota.",
    downloadFacts: "The desktop app reads local logs and uses the existing sign-in for official quota queries, without uploading conversations. The current EXE has no Windows publisher code signature.",
    preview: "A glance during your work", previewDetail: "Expand the indicator, collapse it to continue, or switch away. The pacing components here are the ones used in the app.",
    synthetic: "Synthetic work scenario, not an official client screenshot. No account or file access.",
    scene: "Illustrative Codex work window", foreground: "Codex in foreground", away: "Switch to another app", otherApp: "Illustrative other app",
    task: "Example task: review project changes", taskDetail: "Review the changes before starting the next task.", continue: "Simulate continuing work; collapse indicator",
    toggle: "Expand or collapse the pace indicator", cardTitle: "Pace indicator", collapse: "Collapse indicator", hidden: "Switched to another app: the Pulse indicator is hidden. Returning to Codex restores the compact indicator.",
    sceneStatusOpen: "Indicator expanded: quota, reset time and pace are available.", sceneStatusClosed: "Indicator collapsed: your work remains visible.",
    next: "Explore local usage in the workspace", nextDetail: "Choose Usage analysis in the sidebar for projects and models. Local tokens do not represent their share of account quota.",
    scenarios: "Demo data state", roomy: "Roomy quota", fast: "High pace", notice: "Reset notice", stale: "Stale data",
    stateDetail: "Reference allocations spread the current remainder until reset; they are not daily refills or guaranteed working hours.",
    difference: "Turn quota readings into a planning reference.",
    features: [
      ["This window’s pace", "View remaining quota, reset time and time progress together, with daily or hourly reference allocations. Basic information remains useful even when the percentage has not changed."],
      ["Trace usage when needed", "Explore retained local logs by date, project and model, or replay a session read-only. Account quota and local tokens stay separate; reference cost is not your subscription bill."],
      ["Expand when needed", "An app icon and compact status follow the top right of Codex. Click for a card without a text box; it hides when you leave Codex. Clear and Meter share the same capabilities."],
    ],
    install: "Keep it within reach.",
    steps: [
      ["Download, verify and open", "Download the Windows ZIP and matching SHA256 file from GitHub Releases. Verify, fully extract to a writable location and run Start-Codex-Pulse.cmd."],
      ["Get your first valid reading", "Confirm Codex Home and your existing ChatGPT sign-in. Returned quota and reset time are already useful, including a weekly-only window. Trends accumulate later; a forecast may not appear."],
      ["Choose a daily shortcut", "Enable the corner indicator or independent widget in Settings → Desktop & Codex, keeping Pulse running. Shortcuts and sign-in startup are optional; Settings → Help & feedback provides guidance and feedback links."],
    ],
    firstSuccess: "A valid quota reading and reset time are enough to start. Forecasts require sufficient continuous observations; no forecast does not mean setup failed.",
    trustTitle: "Before downloading: data and signing",
    dataTitle: "What the desktop app accesses",
    data: "Local Codex logs are read-only. The Rust process uses the existing sign-in to query official account services. Pulse asks for no password, uploads no local conversations and adds no telemetry. Model pricing and reset notices have separate external sources.",
    signingTitle: "Windows publisher signing",
    signing: "The current Windows EXE has no Authenticode publisher signature. SHA256 checks download integrity; the updater separately verifies its manifest signature and package digest. These are not Windows publisher authentication and do not guarantee the absence of system warnings.",
    safety: "If your system blocks launch, retain the message and report it while checking the source and integrity. Disabling system protection is not required.",
    privacyLink: "Privacy and security", checksLink: "How to verify SHA256", runtimeLink: "Get WebView2",
    questions: "A few things to know.",
    faqs: [
      ["Does sampling consume model quota?", "The sampler reads existing quota about every 60 seconds by default, with cooldowns for errors and rate limits. It sends no model requests. Activate window in the main workspace is a separate, explicitly confirmed action that may consume quota."],
      ["How reliable is the range? Why is it sometimes absent?", "It describes a trend if recent consumption continues, not remaining working hours or request counts. Missing samples, low consumption, account changes, resets, or stale readings show their own states and stop the estimate."],
      ["How does this relate to the Codex plugin?", "The corner indicator is a Windows companion surface, with no plugin chat input needed. The original MCP entry remains available; its bottom composer belongs to the Codex host and cannot be reliably hidden by Pulse."],
      ["Where is data kept, and how do I quit?", "The app’s own cache and preferences stay in the adjacent data folder by default; original Codex records are read-only. Closing the main window sends it to the tray. Choose Quit in the tray to exit completely; keep the whole folder when relocating."],
    ],
    privacy: "Independent open-source project, not affiliated with OpenAI. Personal quota, local tokens, and API reference costs remain separate.",
    footer: "Local records. A clearer view.", release: "Release notes", feedback: "Feedback", skip: "Skip to product overview",
  },
} as const;

export function PulseBrowserWelcome() {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language).startsWith("zh") ? "zh" : "en";
  const copy = messages[language];
  const [scenario, setScenario] = useState<Exclude<SyntheticCoachScenario, "balanced">>("roomy");
  const [snapshot, setSnapshot] = useState(() => syntheticCoachSnapshot("roomy"));
  const [foreground, setForeground] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const scene = useRef<HTMLDivElement>(null);
  const demo = new URL(location.href); demo.search = "?demo=1"; demo.searchParams.set("coachScenario", scenario); demo.hash = "";
  const trust = `${repository}/blob/main/docs/TRUST.md#${language === "zh" ? "中文" : "english"}`;
  const collapse = () => {
    setExpanded(false);
    scene.current?.querySelector<HTMLButtonElement>('[data-testid="pace-badge"]')?.focus({ preventScroll: true });
  };
  const setLanguage = (value: "zh" | "en") => {
    try { localStorage.setItem("language", value); } catch { /* Language remains usable without storage. */ }
    document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
    void i18n.changeLanguage(value);
  };
  return <div className="pulse-site" lang={language === "zh" ? "zh-CN" : "en"}>
    <a className="pulse-site-skip" href="#product">{copy.skip}</a>
    <header className="pulse-site-header">
      <a className="pulse-site-brand" href={location.pathname} aria-label="Codex Pulse"><PulseBrandMark size={36}/><strong>Codex Pulse</strong><span>{version}</span></a>
      <nav aria-label={language === "zh" ? "网站导航" : "Site navigation"}>
        <a href={`${repository}/blob/main/${language === "zh" ? "README.md" : "README.en.md"}`}>{copy.docs}</a>
        <a href={repository}><Code2 size={17} aria-hidden="true"/>{copy.source}</a>
        <div className="pulse-site-languages" role="group" aria-label="Language / 语言"><button type="button" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")}>中文</button><button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button></div>
      </nav>
    </header>
    <main id="product">
      <section className="pulse-site-hero" aria-labelledby="site-title">
        <div className="pulse-site-intro">
          <h1 id="site-title">{copy.title}</h1><p className="pulse-site-lead">{copy.lead}</p>
          <p className="pulse-site-requirement"><Monitor size={15} aria-hidden="true"/>{copy.requirement}</p>
          <p className="pulse-site-support" data-testid="site-support">{copy.support}</p>
          <p className="pulse-site-download-facts">{copy.downloadFacts} <a href="#download-trust">{copy.trustTitle}</a></p>
          <div className="pulse-site-actions"><a className="pulse-site-download" href={`${repository}/releases/latest`}><Download size={18} aria-hidden="true"/>{copy.download}</a><a href={demo.href}>{copy.demo}<ArrowRight size={17} aria-hidden="true"/></a></div>
          <p className="pulse-site-first-success">{copy.firstSuccess}</p>
          <p className="pulse-site-privacy"><ShieldCheck size={19} aria-hidden="true"/>{copy.privacy}</p>
        </div>
        <div className="pulse-site-preview">
          <div className="pulse-site-preview-heading"><h2>{copy.preview}</h2><PulseStyleSwitcher/></div><p>{copy.previewDetail}</p>
          <p className="pulse-site-synthetic">{copy.synthetic}</p>
          <div className="pulse-site-contexts" role="group" aria-label={copy.scene}>
            <button type="button" aria-pressed={foreground} onClick={() => setForeground(true)}>{copy.foreground}</button>
            <button type="button" aria-pressed={!foreground} onClick={() => { setForeground(false); setExpanded(false); }}>{copy.away}</button>
          </div>
          <div ref={scene} className={`pulse-site-work-scene${foreground ? " is-codex" : " is-away"}`} data-testid="site-work-scene" onKeyDown={event => { if (event.key === "Escape" && expanded) { event.preventDefault(); collapse(); } }}>
            <header className="pulse-site-window-bar"><span>{foreground ? copy.scene : copy.otherApp}</span>{foreground ? <div title={copy.toggle}><PulsePaceBadgeView data={snapshot} expanded={expanded} controls="site-pace-card" onToggle={() => setExpanded(value => !value)}/></div> : null}</header>
            <div className="pulse-site-work-sample">
              {foreground ? <button type="button" onClick={collapse} aria-label={copy.continue}><Code2 size={20} aria-hidden="true"/><strong>{copy.task}</strong><span>{copy.taskDetail}</span></button> : <p>{copy.hidden}</p>}
            </div>
            <div id="site-pace-card">{foreground && expanded ? <div className="pulse-site-live-card" data-testid="site-live-card"><div className="pulse-site-card-tools"><span>{copy.cardTitle}</span><button type="button" onClick={collapse} aria-label={copy.collapse}><X size={17} aria-hidden="true"/></button></div><PulsePaceCard data={snapshot} variant="popover" onRefresh={() => setSnapshot(syntheticCoachSnapshot(scenario))} onDetails={() => location.assign(demo.href)} onRecover={() => location.assign(demo.href)} onMarkNoticeRead={id => setSnapshot(previous => previous.coachExtras?.resetNotice?.id === id ? { ...previous, coachExtras: { ...previous.coachExtras, resetNotice: { ...previous.coachExtras.resetNotice, isUnread: false } } } : previous)}/></div> : null}</div>
          </div>
          <p className="pulse-site-scene-status" role="status">{foreground ? expanded ? copy.sceneStatusOpen : copy.sceneStatusClosed : copy.hidden}</p>
          <div className="pulse-site-scenarios" role="group" aria-label={copy.scenarios}>{(["roomy", "fast", "notice", "stale"] as const).map(value => <button type="button" key={value} aria-pressed={scenario === value} onClick={() => { setScenario(value); setSnapshot(syntheticCoachSnapshot(value)); setForeground(true); setExpanded(true); }}>{copy[value]}</button>)}</div>
          <p className="pulse-site-synthetic">{copy.stateDetail}</p>
          <a className="pulse-site-usage-link" href={demo.href}>{copy.next}<ArrowRight size={15} aria-hidden="true"/></a><p className="pulse-site-next-detail">{copy.nextDetail}</p>
        </div>
      </section>
      <section className="pulse-site-trust" id="download-trust" aria-labelledby="site-trust-title"><h2 id="site-trust-title">{copy.trustTitle}</h2><div><h3>{copy.dataTitle}</h3><p>{copy.data}</p><h3>{copy.signingTitle}</h3><p>{copy.signing}</p><p>{copy.safety}</p><div className="pulse-site-trust-actions"><a href={trust}>{copy.checksLink}<ExternalLink size={14} aria-hidden="true"/></a><a href={`${repository}/blob/main/SECURITY.md`}>{copy.privacyLink}</a><a href="https://developer.microsoft.com/microsoft-edge/webview2/">{copy.runtimeLink}</a></div></div></section>
      <section className="pulse-site-difference" aria-labelledby="site-difference"><h2 id="site-difference">{copy.difference}</h2><dl>{copy.features.map(([title, detail]) => <div key={title}><dt>{title}</dt><dd>{detail}</dd></div>)}</dl></section>
      <section className="pulse-site-install" aria-labelledby="site-install"><h2 id="site-install">{copy.install}</h2><ol>{copy.steps.map(([title, detail]) => <li key={title}><h3>{title}</h3><p>{detail}</p></li>)}</ol><a href={`${repository}/blob/main/docs/${language === "zh" ? "CODEX_INTEGRATION.md" : "CODEX_INTEGRATION.en.md"}`}>{copy.docs}<ExternalLink size={15} aria-hidden="true"/></a></section>
      <section className="pulse-site-faq" aria-labelledby="site-questions"><h2 id="site-questions">{copy.questions}</h2><div>{copy.faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer className="pulse-site-footer"><span><PulseBrandMark size={22}/>{copy.footer}</span><div><a href={`${repository}/discussions`}>{copy.feedback}</a><a href={`${repository}/releases`}>{copy.release}</a><a href={`${repository}/blob/main/LICENSE`}>MIT</a><a href={repository}>GitHub</a></div></footer>
  </div>;
}
