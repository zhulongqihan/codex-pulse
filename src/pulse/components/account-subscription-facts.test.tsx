// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccountSubscriptionFacts } from "./account-subscription-facts";
import type { CodexLimitsResponse } from "@/lib/api";
import i18n from "@/i18n";

const limits: CodexLimitsResponse = { session: null, weekly: null, source: "synthetic", updatedAt: "2026-11-14T00:00:00Z" };
beforeEach(async () => { await i18n.changeLanguage("en"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("keeps a subscription with less than one day remaining at one day", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
  render(<AccountSubscriptionFacts limits={{ ...limits, subscriptionExpiresAt: "2026-11-14T12:00:00Z" }}/>);
  expect(screen.getByTestId("account-subscription-facts")).toHaveTextContent(i18n.t("limits.days_left_one", { count: 1 }));
});

it("keeps subscription expiry, auto-renew and simulated credits in the account panel", () => {
  render(<AccountSubscriptionFacts limits={{ ...limits, subscriptionExpiresAt: "2099-01-15T00:00:00Z", subscriptionWillRenew: false, credits: { balance: "12.50", unlimited: false, hasCredits: true }, creditsIsMock: true }}/>);
  expect(screen.getByTestId("account-subscription-facts")).toHaveTextContent("Expires 2099-01-15");
  expect(screen.getByTestId("account-subscription-facts")).toHaveTextContent("Auto-renew off");
  expect(screen.getByTestId("credits-balance")).toHaveTextContent("12.50");
  expect(screen.getByTestId("credits-balance")).toHaveTextContent("Simulated data");
});

it("keeps unknown, zero and unlimited credits distinct", () => {
  const { rerender } = render(<AccountSubscriptionFacts limits={limits}/>);
  expect(screen.getByTestId("credits-balance")).toHaveTextContent("Unavailable");
  rerender(<AccountSubscriptionFacts limits={{ ...limits, credits: { balance: null, hasCredits: false, unlimited: false } }}/>);
  expect(screen.getByTestId("credits-balance")).toHaveTextContent(": 0");
  rerender(<AccountSubscriptionFacts limits={{ ...limits, credits: { balance: "0", hasCredits: false, unlimited: true } }}/>);
  expect(screen.getByTestId("credits-balance")).toHaveTextContent("Unlimited");
  rerender(<AccountSubscriptionFacts limits={null}/>);
  expect(screen.queryByTestId("account-subscription-facts")).not.toBeInTheDocument();
});
