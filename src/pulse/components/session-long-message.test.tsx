// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { SessionReplayDetail } from "@/lib/api";
import { buildConversation } from "@/lib/session-conversation";
import { buildSearchDocuments, SessionSearchIndex } from "@/lib/session-search";
import { ConversationItem } from "./session-detail-modal";

const markdown = vi.hoisted(() => ({
  suspended: false,
  inputs: [] as string[],
  pending: new Promise<never>(() => {}),
}));

vi.mock("@/components/markdown-content", () => ({
  MarkdownContent: ({ content }: { content: string }) => {
    markdown.inputs.push(content);
    if (markdown.suspended) throw markdown.pending;
    return <div data-testid="message-markdown">{content}</div>;
  },
}));

const ending = "UNIQUE_LONG_MESSAGE_END";
const longText = `Synthetic conversation start. ${"retained conversation content ".repeat(4000)} ${ending}`;

function message(text: string, role: "user" | "assistant" = "user") {
  const turn: SessionReplayDetail["turns"][number] = {
    turnId: "large-message", startedAt: null, completedAt: null, durationMs: null,
    systemMessages: [], userMessages: [], assistantMessages: [], reasoningSummaries: [],
    toolCalls: [], patchResults: [], tokenEvents: [], errors: [],
    items: [{ kind: "message", role, source: role === "user" ? "user_message" : "agent_message", timestamp: null, text }],
  };
  return { turn, block: buildConversation(turn)[0] };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  markdown.suspended = false;
  markdown.inputs.length = 0;
});

it.each(["user", "assistant"] as const)("previews a long %s message before parsing Markdown and retains full copy and expansion", async (role) => {
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  const { block } = message(longText, role);
  const { container } = render(<ConversationItem block={block} rawJsonlLines={[]} />);
  const body = await screen.findByTestId("message-markdown");
  expect(body.textContent!.length).toBeLessThan(3000);
  expect(markdown.inputs.every((input) => input.length < 3000)).toBe(true);
  expect(container).not.toHaveTextContent(ending);

  await user.click(screen.getByRole("button", { name: i18n.t("sessions.detail.copy_content") }));
  expect(write).toHaveBeenCalledWith(longText);
  await user.click(screen.getByRole("button", { name: i18n.t("sessions.detail.show_full_text") }));
  expect(await screen.findByTestId("message-markdown")).toHaveTextContent(ending);
  expect(screen.getByTestId("message-markdown").textContent).toBe(longText);
  await user.click(screen.getByRole("button", { name: i18n.t("sessions.detail.hide_full_text") }));
  expect(container).not.toHaveTextContent(ending);
});

it("keeps both the lazy Markdown fallback and parser input bounded", async () => {
  markdown.suspended = true;
  const { block } = message(longText);
  const { container } = render(<ConversationItem block={block} rawJsonlLines={[]} />);
  await waitFor(() => expect(markdown.inputs.length).toBeGreaterThan(0));
  expect(container).toHaveTextContent("Synthetic conversation start.");
  expect(container).not.toHaveTextContent(ending);
  expect(container.textContent!.length).toBeLessThan(4000);
  expect(markdown.inputs.every((input) => input.length < 3000)).toBe(true);
});

it("shows a far search hit with one full-text action and restores the preview when search clears", async () => {
  const { block, turn } = message(longText);
  const index = new SessionSearchIndex(buildSearchDocuments([turn]), "");
  const matches = (await index.search(ending, "timeline", async () => {}))!.matches;
  expect(matches.length).toBe(1);
  const { container, rerender } = render(<ConversationItem block={block} rawJsonlLines={[]} />);
  await screen.findByTestId("message-markdown");
  rerender(<ConversationItem block={block} rawJsonlLines={[]} searchHits={matches} />);
  expect(screen.getByTestId("session-search-current")).toHaveTextContent(ending);
  expect(screen.getAllByRole("button", { name: i18n.t("sessions.detail.show_full_text") })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: i18n.t("sessions.detail.hide_full_text") })).not.toBeInTheDocument();
  rerender(<ConversationItem block={block} rawJsonlLines={[]} searchHits={[]} />);
  expect(container).not.toHaveTextContent(ending);
  expect(screen.getByRole("button", { name: i18n.t("sessions.detail.show_full_text") })).toHaveAttribute("aria-expanded", "false");
});

it("preserves a user-expanded message across temporary search highlighting", async () => {
  const user = userEvent.setup();
  const { block, turn } = message(longText);
  const matches = (await new SessionSearchIndex(buildSearchDocuments([turn]), "").search(ending, "timeline", async () => {}))!.matches;
  const { rerender } = render(<ConversationItem block={block} rawJsonlLines={[]} />);
  await screen.findByTestId("message-markdown");
  await user.click(screen.getByRole("button", { name: i18n.t("sessions.detail.show_full_text") }));
  rerender(<ConversationItem block={block} rawJsonlLines={[]} searchHits={matches} />);
  expect(screen.getByTestId("session-search-current")).toHaveTextContent(ending);
  rerender(<ConversationItem block={block} rawJsonlLines={[]} searchHits={[]} />);
  expect(await screen.findByTestId("message-markdown")).toHaveTextContent(ending);
  expect(screen.getByRole("button", { name: i18n.t("sessions.detail.hide_full_text") })).toHaveAttribute("aria-expanded", "true");
});

it("keeps short messages complete while a growing message becomes a bounded preview", async () => {
  const { rerender, container } = render(<ConversationItem block={message("A complete short message.").block} rawJsonlLines={[]} />);
  expect(await screen.findByTestId("message-markdown")).toHaveTextContent("A complete short message.");
  expect(screen.queryByRole("button", { name: i18n.t("sessions.detail.show_full_text") })).not.toBeInTheDocument();
  rerender(<ConversationItem block={message(longText).block} rawJsonlLines={[]} />);
  expect(container).not.toHaveTextContent(ending);
  expect(screen.getByRole("button", { name: i18n.t("sessions.detail.show_full_text") })).toHaveAttribute("aria-expanded", "false");
});
