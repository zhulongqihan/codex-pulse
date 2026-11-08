import { useState } from "react";
import { ArrowRight, Code2, Download, ExternalLink, Monitor, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PulseStyleSwitcher } from "./pulse-appearance-controls";
import { PulseBrandMark } from "./pulse-brand-mark";
import { usePulsePreferences } from "@/lib/pulse-appearance";
import { version } from "../../../package.json";
import "./pulse-browser-welcome.css";

const repository = "https://github.com/zhulongqihan/codex-pulse";
const messages = {
  zh: {
    title: "余量与时间，一起看。",
    lead: "给 Windows 上的 Codex，一个随手可看的额度配速提示。看清还剩多少、何时重置，知道可以从容安排任务，还是该给后半程留些余量。",
    download: "下载 Windows 版", demo: "打开完整工作台", source: "源码", docs: "使用说明",
    requirement: "Windows 10 / 11 x64 · 便携版 · 需要 WebView2",
    preview: "亲手试一下", previewDetail: "这里运行的就是软件中的配速卡片。切换余量、预告和陈旧状态，试试清爽与刻度。",
    synthetic: "合成数据演示，不读取你的账号或文件。", frame: "Codex Pulse 节奏卡片，合成数据演示",
    scenarios: "演示数据状态", roomy: "余量宽裕", fast: "用量偏快", notice: "重置预告", stale: "数据陈旧",
    stateDetail: "分配参考把当前余量均摊到重置前，不代表每天新增额度或保证工作时长。",
    difference: "让额度数字，变成安排任务的参考。",
    features: [
      ["本轮额度配速", "余量、重置时间与时间进度一起判断，配上日均或每小时分配参考。百分比暂未变化时，基本信息仍然可用。"],
      ["有依据的新提醒", "本轮每日观测明确覆盖范围；新重置预告显示第三方来源与待确认状态。不会把缺记录当零，也不把全局消息当个人已重置。"],
      ["需要时才展开", "小图标与状态条贴在 Codex 右上角。点击展开无输入框卡片；离开 Codex 时隐藏。清爽与刻度两版保持同样的能力。"],
    ],
    install: "几步放到手边。",
    steps: [
      ["解压，打开", "从 GitHub Release 下载便携包，完整解压到可写文件夹，运行 CodexPulse.exe。"],
      ["打开右上角提示", "在设置中开启 Codex 右上角节奏提示，保持 Pulse 运行。也可创建桌面快捷方式或设置登录启动。"],
      ["查看你的实际配速", "沿用已有 ChatGPT 登录，读取真实余量与个人周期时间。趋势与逐日记录随后积累，缺少历史不影响基本配速信息。"],
    ],
    questions: "先了解这几个边界。",
    faqs: [
      ["这会额外消耗模型额度吗？", "节奏采样默认约每 60 秒只读查询已有额度，出错与限流时会冷却，不会发起模型请求。主工作台的“启动窗口”是另一个需要明确确认的操作，可能消耗额度。"],
      ["预测可靠吗？为什么有时没有时间？", "它描述近期消耗持续时的趋势，不承诺剩余工作时长或请求次数。缺少连续样本、消耗过慢、换账号、重置或数据过期时，卡片会显示对应状态并停止给出预测。"],
      ["和 Codex 插件页是什么关系？", "右上角提示由 Windows 伴随窗口提供，无需在插件页输入内容。原有 MCP 插件入口仍可使用；它底部的对话输入框由 Codex 宿主管理，Pulse 无法可靠隐藏。"],
      ["数据留在哪里？", "桌面版默认将自己的缓存和偏好保存在程序旁的 data 文件夹，只读本机 Codex 记录。公开网页仅运行合成演示，不读取本机文件或登录凭证。"],
    ],
    privacy: "独立开源项目，不隶属于 OpenAI。个人额度、本机 Token 和 API 参考成本分开呈现。",
    footer: "本地记录，清楚呈现。", release: "版本记录", feedback: "反馈与建议", skip: "跳到产品介绍",
  },
  en: {
    title: "Quota and time, together.",
    lead: "A quiet quota-pacing companion for Codex on Windows. See what remains and when it resets, then plan upcoming tasks with a clear view of the current window’s pace.",
    download: "Download for Windows", demo: "Explore the workspace", source: "Source", docs: "User guide",
    requirement: "Windows 10 / 11 x64 · Portable · WebView2 required",
    preview: "Try the real interface", previewDetail: "This is the app’s pacing card. Explore Clear and Meter with roomy, fast, reset-notice and stale states.",
    synthetic: "Synthetic demo. Your account and files are not accessed.", frame: "Codex Pulse pace card with synthetic demonstration data",
    scenarios: "Demo data state", roomy: "Roomy quota", fast: "High pace", notice: "Reset notice", stale: "Stale data",
    stateDetail: "Reference allocations spread the current remainder until reset; they are not daily refills or guaranteed working hours.",
    difference: "Turn quota readings into a planning reference.",
    features: [
      ["This window’s pace", "View remaining quota, reset time and time progress together, with daily or hourly reference allocations. Basic information remains useful even when the percentage has not changed."],
      ["Grounded observations and notices", "Daily records state their coverage. Reset notices retain their third-party source and unconfirmed state. Missing history is not zero, and global news is not a personal reset confirmation."],
      ["Expand when needed", "An app icon and compact status follow the top right of Codex. Click for a card without a text box; it hides when you leave Codex. Clear and Meter share the same capabilities."],
    ],
    install: "Keep it within reach.",
    steps: [
      ["Extract and open", "Download the portable archive from GitHub Releases, extract the complete folder to a writable location, and run CodexPulse.exe."],
      ["Enable the corner status", "Turn on the Codex corner pace indicator in settings and keep Pulse running. Create desktop shortcuts or enable launch at sign-in if helpful."],
      ["See your current pace", "Use your existing ChatGPT sign-in to read current quota and the personal window time. Trends and daily observations accumulate afterward; basic pacing does not require a full history."],
    ],
    questions: "A few things to know.",
    faqs: [
      ["Does sampling consume model quota?", "The sampler reads existing quota about every 60 seconds by default, with cooldowns for errors and rate limits. It sends no model requests. Activate window in the main workspace is a separate, explicitly confirmed action that may consume quota."],
      ["How reliable is the range? Why is it sometimes absent?", "It describes a trend if recent consumption continues, not remaining working hours or request counts. Missing samples, low consumption, account changes, resets, or stale readings show their own states and stop the estimate."],
      ["How does this relate to the Codex plugin?", "The corner indicator is a Windows companion surface, with no plugin chat input needed. The original MCP entry remains available; its bottom composer belongs to the Codex host and cannot be reliably hidden by Pulse."],
      ["Where does my data go?", "The desktop app keeps its own cache and preferences in an adjacent data folder by default, and reads local Codex records without changing them. This public site runs only synthetic demos and accesses no local files or sign-in credentials."],
    ],
    privacy: "Independent open-source project, not affiliated with OpenAI. Personal quota, local tokens, and API reference costs remain separate.",
    footer: "Local records. A clearer view.", release: "Release notes", feedback: "Feedback", skip: "Skip to product overview",
  },
} as const;

export function PulseBrowserWelcome() {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language).startsWith("zh") ? "zh" : "en";
  const copy = messages[language];
  const { skinId } = usePulsePreferences();
  const [scenario, setScenario] = useState<"roomy" | "fast" | "notice" | "stale">("roomy");
  const [previewRevision, setPreviewRevision] = useState(0);
  const demo = new URL(location.href); demo.search = "?demo=1&coachScenario=roomy"; demo.hash = "";
  const preview = new URL(demo); preview.searchParams.set("coachScenario", scenario); preview.hash = "pulse-pace";
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
          <div className="pulse-site-actions"><a className="pulse-site-download" href={`${repository}/releases/latest`}><Download size={18} aria-hidden="true"/>{copy.download}</a><a href={demo.href}>{copy.demo}<ArrowRight size={17} aria-hidden="true"/></a></div>
          <p className="pulse-site-requirement"><Monitor size={15} aria-hidden="true"/>{copy.requirement}</p><p className="pulse-site-privacy"><ShieldCheck size={19} aria-hidden="true"/>{copy.privacy}</p>
        </div>
        <div className="pulse-site-preview">
          <div className="pulse-site-preview-heading"><h2>{copy.preview}</h2><PulseStyleSwitcher/></div><p>{copy.previewDetail}</p>
          <iframe key={`${language}-${skinId}-${scenario}-${previewRevision}`} src={preview.href} title={copy.frame} className="pulse-site-frame"/>
          <div className="pulse-site-scenarios" role="group" aria-label={copy.scenarios}>{(["roomy", "fast", "notice", "stale"] as const).map(value => <button type="button" key={value} aria-pressed={scenario === value} onClick={() => { setScenario(value); setPreviewRevision(previous => previous + 1); }}>{copy[value]}</button>)}</div>
          <p className="pulse-site-synthetic">{copy.synthetic} {copy.stateDetail}</p>
        </div>
      </section>
      <section className="pulse-site-difference" aria-labelledby="site-difference"><h2 id="site-difference">{copy.difference}</h2><dl>{copy.features.map(([title, detail]) => <div key={title}><dt>{title}</dt><dd>{detail}</dd></div>)}</dl></section>
      <section className="pulse-site-install" aria-labelledby="site-install"><h2 id="site-install">{copy.install}</h2><ol>{copy.steps.map(([title, detail]) => <li key={title}><h3>{title}</h3><p>{detail}</p></li>)}</ol><a href={`${repository}/blob/main/docs/${language === "zh" ? "CODEX_INTEGRATION.md" : "CODEX_INTEGRATION.en.md"}`}>{copy.docs}<ExternalLink size={15} aria-hidden="true"/></a></section>
      <section className="pulse-site-faq" aria-labelledby="site-questions"><h2 id="site-questions">{copy.questions}</h2><div>{copy.faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    </main>
    <footer className="pulse-site-footer"><span><PulseBrandMark size={22}/>{copy.footer}</span><div><a href={`${repository}/discussions`}>{copy.feedback}</a><a href={`${repository}/releases`}>{copy.release}</a><a href={`${repository}/blob/main/LICENSE`}>MIT</a><a href={repository}>GitHub</a></div></footer>
  </div>;
}
