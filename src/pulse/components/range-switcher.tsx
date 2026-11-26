import { ChevronDown, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/api";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { getRangeLabel } from "@/lib/usage-dashboard";
import dayjs from "dayjs";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";
import { getLanguage, languages } from "@/lib/languages";
import { currentDateInTimezone } from "@/lib/trend-buckets";
import { timeZoneLabel } from "@/lib/time-context";
import "./range-switcher.css";

type RangeSwitcherProps = {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
  timezone?: string;
};

const ranges: Array<{ value: RangeKey; label: string }> = [
  { value: "1d", label: "Last 1 Day" },
  { value: "2d", label: "Last 2 Days" },
  { value: "7d", label: "Last 7 Days" },
  { value: "14d", label: "Last 14 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "60d", label: "Last 60 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "180d", label: "Last 180 Days" },
  { value: "365d", label: "Last 365 Days" },
  { value: "all", label: "All retained history" },
];

export function RangeSwitcher({ value, onChange, timezone }: RangeSwitcherProps) {
  const { t, i18n } = useTranslation();
  const sourceToday = currentDateInTimezone(timezone);
  // Calendar cells are date-only source keys, represented in the browser's local calendar.
  const sourceTodayDate = dayjs(sourceToday).toDate();
  const timezoneText = timezone ? t("reading_context.statistics_short", { zone: timeZoneLabel(timezone, i18n.resolvedLanguage ?? i18n.language) }) : null;
  const currentLocale = languages[getLanguage(i18n.resolvedLanguage ?? i18n.language)].dateLocale;
  const selectedRange = ranges.find((range) => range.value === value);
  const displayLabel = selectedRange ? t(`ranges.${selectedRange.value}`, { defaultValue: selectedRange.label }) : getRangeLabel(value, t);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!isModalOpen || !dialog) return;
    const trigger = triggerRef.current;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      trigger?.focus({ preventScroll: true });
    };
  }, [isModalOpen]);
  const wrapDialogTab = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const from = event.shiftKey ? closeRef.current : applyRef.current;
    const to = event.shiftKey ? applyRef.current : closeRef.current;
    if (event.target !== from) return;
    event.preventDefault();
    to?.focus();
  };
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (value.startsWith("custom:")) {
      const [start, end] = value.slice("custom:".length).split("_");
      return {
        from: start ? dayjs(start).toDate() : undefined,
        to: end ? dayjs(end).toDate() : undefined,
      };
    }
    return {
      from: dayjs(sourceToday).subtract(29, "day").startOf("day").toDate(),
      to: sourceTodayDate,
    };
  });
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    if (!dateRange?.from || !dateRange?.to) {
      setError(t("range_switcher.err_select_both"));
      return;
    }
    if (dayjs(dateRange.to).isBefore(dayjs(dateRange.from), "day")) {
      setError(t("range_switcher.err_end_before_start"));
      return;
    }
    if (dayjs(dateRange.to).format("YYYY-MM-DD") > sourceToday) {
      setError(t("range_switcher.err_future"));
      return;
    }
    const startStr = dayjs(dateRange.from).format("YYYY-MM-DD");
    const endStr = dayjs(dateRange.to).format("YYYY-MM-DD");
    setError(null);
    onChange(`custom:${startStr}_${endStr}`);
    setIsModalOpen(false);
  };

  const handleSelect = (range: DateRange | undefined, selectedDay: Date) => {
    if (dateRange?.from && dateRange?.to) {
      setDateRange({
        from: selectedDay,
        to: undefined,
      });
      setError(null);
    } else {
      setDateRange(range);
      setError(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "min-w-[11rem] justify-between")}
            aria-label={t("range_switcher.aria_select_range")}
          >
            <span>{displayLabel}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[11rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto" onCloseAutoFocus={(event) => {
          if (!openingDialog.current) return;
          openingDialog.current = false;
          event.preventDefault();
          setIsModalOpen(true);
        }}>
          {timezoneText ? <p className="max-w-72 break-words px-2 py-2 text-xs leading-normal text-muted-foreground">{timezoneText}</p> : null}
          <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as RangeKey)}>
            {ranges.map((range) => (
              <DropdownMenuRadioItem key={range.value} value={range.value}>
                {t(`ranges.${range.value}`, { defaultValue: range.label })}
              </DropdownMenuRadioItem>
            ))}
            {value.startsWith("custom:") && (
              <DropdownMenuRadioItem value={value}>
                {getRangeLabel(value, t)}
              </DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>
          <div className="h-px bg-border my-1" />
          <DropdownMenuItem
            onSelect={() => { openingDialog.current = true; }}
            className="text-primary font-medium focus:text-primary cursor-pointer justify-center"
          >
            {t("range_switcher.custom_range")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isModalOpen &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-modal="true"
            aria-labelledby="pulse-range-title"
            className="pulse-range-dialog bg-surface border border-border rounded-2xl text-foreground shadow-2xl"
            onCancel={(event) => { event.preventDefault(); setIsModalOpen(false); }}
            onKeyDown={wrapDialogTab}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect();
              if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) setIsModalOpen(false);
            }}
          >
            <header className="pulse-range-dialog-header flex items-center justify-between gap-3 border-b border-border/60">
              <h3 id="pulse-range-title" className="text-lg font-bold text-foreground">{t("range_switcher.modal_title")}</h3>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground transition cursor-pointer"
                aria-label={t("range_switcher.modal_close_aria")}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="pulse-range-dialog-body space-y-4">
              {timezoneText ? <p className="break-words text-xs leading-normal text-muted-foreground">{timezoneText}</p> : null}

              <div className="flex flex-col items-center py-2 space-y-3">
                <div className="text-center text-xs text-muted-foreground min-h-[1.25rem]">
                  {dateRange?.from ? (
                    <span>
                      {dateRange.to ? (
                        t("range_switcher.selected_range", {
                          start: dayjs(dateRange.from).format("YYYY-MM-DD"),
                          end: dayjs(dateRange.to).format("YYYY-MM-DD"),
                          defaultValue: `Selected: ${dayjs(dateRange.from).format("YYYY-MM-DD")} to ${dayjs(dateRange.to).format("YYYY-MM-DD")}`
                        })
                      ) : (
                        t("range_switcher.selected_start_only", {
                          start: dayjs(dateRange.from).format("YYYY-MM-DD"),
                          defaultValue: `Selected: ${dayjs(dateRange.from).format("YYYY-MM-DD")} (Choose end date...)`
                        })
                      )}
                    </span>
                  ) : (
                    <span>{t("range_switcher.choose_start")}</span>
                  )}
                </div>
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleSelect}
                  disabled={{ after: sourceTodayDate }}
                  className="rounded-md border bg-card border-border/60"
                  locale={currentLocale}
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-error font-medium text-center">{error}</p>
              )}
            </div>

            <footer className="pulse-range-dialog-footer flex flex-wrap gap-2 border-t border-border/60">
              <button
                type="button"
                onClick={() => setDateRange(undefined)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-medium hover:bg-muted transition cursor-pointer text-muted-foreground"
              >
                {t("range_switcher.btn_clear")}
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-medium hover:bg-muted transition cursor-pointer"
              >
                {t("range_switcher.btn_cancel")}
              </button>
              <button
                ref={applyRef}
                type="button"
                onClick={handleApply}
                className="flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90 transition shadow-glow cursor-pointer"
              >
                {t("range_switcher.btn_apply")}
              </button>
            </footer>
          </dialog>,
          document.body
        )}
    </>
  );
}
