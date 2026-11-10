// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { closeBehaviorCopy } from "@/lib/close-behavior-copy";
import { CloseBehaviorNote } from "./close-behavior";

describe("existing native close behavior guidance", () => {
  it.each(["zh", "zh-Hant", "en", "ja", "ko", "de"])("explains hiding, reopening and the actual tray quit label without an interrupting dialog in %s", async language => {
    await i18n.changeLanguage(language);
    render(<CloseBehaviorNote/>);
    const quit = i18n.t("settings.menu_bar_quit");
    const note = screen.getByRole("note", { name: closeBehaviorCopy(language, "heading") });
    expect(note).toHaveTextContent(closeBehaviorCopy(language, "main"));
    expect(note).toHaveTextContent(closeBehaviorCopy(language, "widget"));
    expect(note).toHaveTextContent(closeBehaviorCopy(language, "corner"));
    expect(note).toHaveTextContent(closeBehaviorCopy(language, "quit", { quit }));
    expect(note).toHaveTextContent(closeBehaviorCopy(language, "tray"));
    expect(note).not.toHaveTextContent(/[{}]/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
