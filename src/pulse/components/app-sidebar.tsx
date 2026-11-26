import { CalendarDays, ChartColumn, ChartNoAxesCombined, Folder, LayoutDashboard, Logs, PanelLeftClose, PanelLeftOpen, Settings, Terminal, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DashboardView } from "@/components/dashboard-header";
import { useShellCopy } from "@/lib/shell-copy";
import "./app-sidebar.css";

type AppSidebarProps = {
  presentation?: "sidebar" | "paper-tabs";
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  showLogsTab: boolean;
  limits: ReactNode;
};

const primaryPages = [
  { view: "dashboard", label: "dashboard", icon: LayoutDashboard },
  { view: "analysis", label: "analysis", icon: ChartNoAxesCombined },
  { view: "sessions", label: "sessions", icon: Terminal },
] as const;

const detailPages = [
  { view: "models", label: "model", icon: ChartColumn },
  { view: "daily", label: "daily", icon: CalendarDays },
  { view: "monthly", label: "monthly", icon: Wallet },
  { view: "projects", label: "project", icon: Folder },
  { view: "logs", label: "logs", icon: Logs },
] as const;

const MIN_WIDTH = 160;
const MAX_WIDTH = 280;
// Keep the macOS traffic lights fully inside the collapsed sidebar.
const COLLAPSED_WIDTH = 60;
export const clampSidebarWidth = (width: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));

export function AppSidebar({ view, onViewChange, collapsed, onToggleCollapsed, width, onWidthChange, showLogsTab, limits, presentation = "sidebar" }: AppSidebarProps) {
  const { t } = useTranslation();
  const copy = useShellCopy();
  const pageLabel = (label: string) => label === "analysis" ? copy("analysis") : t(`common.${label}`);
  const toggleLabel = t(collapsed ? "header.expand_sidebar" : "header.collapse_sidebar");
  const pages = [...primaryPages, ...detailPages.filter(page => page.view !== "logs" || showLogsTab)];
  const [resizingWidth, setResizingWidth] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const isResizing = resizingWidth !== null;

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number, tabs: readonly { view: DashboardView }[], orientation: "vertical" | "horizontal") => {
    const previous = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const following = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : event.key === following ? (index + 1) % tabs.length
      : event.key === previous ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    const nextView = tabs[next].view;
    onViewChange(nextView);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-testid="${nextView}-nav-tab"]`)?.focus();
  };

  useEffect(() => {
    if (!isResizing) return;
    const resize = (event: MouseEvent) => {
      if (!drag.current) return;
      drag.current.width = clampSidebarWidth(drag.current.startWidth + event.clientX - drag.current.startX);
      setResizingWidth(drag.current.width);
    };
    const finishResize = () => {
      if (!drag.current) return;
      onWidthChange(drag.current.width);
      drag.current = null;
      setResizingWidth(null);
    };
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", finishResize);
    window.addEventListener("blur", finishResize);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", finishResize);
      window.removeEventListener("blur", finishResize);
    };
  }, [isResizing, onWidthChange]);

  if (presentation === "paper-tabs") {
    const tabs = [...pages, {view: "settings", label: "settings", icon: Settings}] as const;
    return <nav className="pulse-paper-navigation" aria-label={t("header.navigation")}>
      <div role="tablist" aria-orientation="horizontal" aria-label={t("header.navigation")}>
        {tabs.map(({view: page, label, icon: Icon}, index) => <button key={page} type="button" role="tab" aria-selected={view === page} tabIndex={view === page ? 0 : -1} data-nav-group={index < primaryPages.length ? "primary" : "detail"} data-testid={`${page}-nav-tab`} onClick={() => onViewChange(page)} onKeyDown={event => moveTab(event, index, tabs, "horizontal")}><Icon size={16} aria-hidden="true"/><span>{pageLabel(label)}</span></button>)}
      </div>
    </nav>;
  }

  return (
    <aside data-app-sidebar style={{ width: collapsed ? COLLAPSED_WIDTH : resizingWidth ?? width }} className="relative flex h-full shrink-0 flex-col border-r border-border/80 bg-[rgb(var(--sidebar))]">
      <div aria-hidden="true" className="h-[var(--window-drag-height)] shrink-0" />
      <div className={`pulse-sidebar-header flex h-16 shrink-0 items-center gap-2 px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed ? <span className="pulse-sidebar-caption">{t("header.navigation")}</span> : null}
        <button type="button" onClick={onToggleCollapsed} aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="app-navigation" className="relative z-20 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      <nav id="app-navigation" aria-label={t("header.navigation")} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div role="tablist" aria-orientation="vertical" aria-label={t("header.navigation")} className="space-y-1">
          {pages.map(({ view: page, label, icon: Icon }, index) => {
            const primary = index < primaryPages.length;
            const name = pageLabel(label);
            return <Fragment key={page}>
              {index === primaryPages.length ? <div className="pulse-sidebar-detail-divider" aria-hidden="true">
                {!collapsed ? <span>{t("header.detail_views")}</span> : null}
              </div> : null}
              <button type="button" role="tab" aria-selected={view === page} aria-label={name} title={name} data-testid={`${page}-nav-tab`} onClick={() => onViewChange(page)} onKeyDown={event => moveTab(event, index, pages, "vertical")} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring ${collapsed ? "justify-center" : "text-left"} ${view === page ? "bg-primary/10 font-semibold text-primary" : primary ? "font-medium text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed ? <span className="truncate">{name}</span> : null}
              </button>
            </Fragment>;
          })}
        </div>
      </nav>
      {limits ? <div className={`mx-2 max-h-[55%] shrink-0 overflow-y-auto border-t border-border/80 pb-4 pt-3 ${collapsed ? "" : "px-1"}`}>{limits}</div> : null}
      <div className="shrink-0 border-t border-border/80 p-2">
        <button type="button" data-testid="settings-nav-tab" onClick={() => onViewChange("settings")} aria-label={t("common.settings")} title={t("common.settings")} className={`pulse-sidebar-settings flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${collapsed ? "justify-center" : "text-left"}`}>
          <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed ? <span>{t("common.settings")}</span> : null}
        </button>
      </div>
      {!collapsed ? (
        <div
          role="separator"
          tabIndex={0}
          aria-label={t("header.resize_sidebar")}
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={resizingWidth ?? width}
          className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none select-none outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 hover:after:bg-primary/50 focus-visible:after:bg-primary"
          onMouseDown={(event) => {
            if (event.button !== 0 || drag.current) return;
            event.preventDefault();
            event.currentTarget.focus();
            drag.current = { startX: event.clientX, startWidth: width, width };
            setResizingWidth(width);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            onWidthChange(clampSidebarWidth(width + (event.key === "ArrowRight" ? 8 : -8)));
          }}
        >
          {resizingWidth !== null ? <div className="fixed inset-0 cursor-col-resize" /> : null}
        </div>
      ) : null}
    </aside>
  );
}
