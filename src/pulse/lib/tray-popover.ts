import type { PulseIntegrationData } from "./pulse-integration";

export type TrayPopoverData = {
  integration?: PulseIntegrationData;
  updatedAt?: string | null;
  stale?: boolean;
  account: string | null;
  membership: string | null;
  workspace: string | null;
  quotas: {
    kind: "5h" | "weekly" | "monthly" | "custom";
    label: string;
    remainingPercent: number | null;
    usedText: string;
    resetText: string;
  }[];
  tokens: { value: string; exact: string } | null;
  cost: string | null;
  labels: {
    remaining: string;
    today: string;
    cost: string;
    unavailable: string;
    showMain: string;
    quit: string;
  };
};
