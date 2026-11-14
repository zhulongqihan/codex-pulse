import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { CodexLimitsResponse } from "@/lib/api";

export function AccountSubscriptionFacts({ limits }: { limits: CodexLimitsResponse | null }) {
  const { t } = useTranslation();
  if (!limits) return null;
  const expiresAt = limits.subscriptionExpiresAt ? dayjs(limits.subscriptionExpiresAt) : null;
  const daysLeft = expiresAt?.isValid() ? Math.max(0, Math.ceil(expiresAt.diff(dayjs(), "day", true))) : 0;
  const balance = limits.credits?.unlimited ? t("limits.credits_unlimited") : limits.credits?.balance?.trim() || (limits.credits?.hasCredits === false ? "0" : t("limits.credits_unavailable"));
  return <div className="pulse-account-subscription" data-testid="account-subscription-facts">
    {expiresAt?.isValid() ? <p>{t("limits.subscription_expires", { date: expiresAt.format("YYYY-MM-DD"), timeLeft: t(daysLeft === 1 ? "limits.days_left_one" : "limits.days_left_other", { count: daysLeft }) })}{limits.subscriptionWillRenew === false ? ` · ${t("limits.auto_renew_off")}` : ""}</p> : null}
    <p data-testid="credits-balance">{t("limits.credits_balance")}: <strong>{balance}</strong>{limits.creditsIsMock ? <> · {t("limits.credits_mock")}</> : null}</p>
  </div>;
}
