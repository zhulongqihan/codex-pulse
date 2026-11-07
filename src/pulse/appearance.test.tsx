// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "./i18n";
import { PulseAppearanceSettings, PulseStyleSwitcher } from "./components/pulse-appearance-controls";
import { defaultPulsePreferences, initializePulseAppearance, normalizePulsePreferences, updatePulsePreferences } from "./lib/pulse-appearance";

const native = vi.hoisted(() => ({
  preferences: {} as Record<string,unknown>,
  events: new Map<string,(event:{payload:unknown})=>void>(),
  fail: false,
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/core",()=>({isTauri:()=>true,invoke:(command:string,args?:{patch:object})=>native.invoke(command,args)}));
vi.mock("@tauri-apps/api/event",()=>({listen:async(name:string,handler:(event:{payload:unknown})=>void)=>{native.events.set(name,handler);return ()=>native.events.delete(name);}}));

beforeEach(async()=>{
  await i18n.changeLanguage("en");
  native.fail=false;
  native.preferences={...defaultPulsePreferences};
  native.invoke.mockImplementation(async(command:string,args?:{patch:object})=>{
    if(command==="get_pulse_preferences") return native.preferences;
    if(command==="set_pulse_preferences") {
      if(native.fail) throw new Error("data folder is read-only");
      native.preferences={...native.preferences,...args?.patch};return native.preferences;
    }
    throw new Error(`Unexpected data request: ${command}`);
  });
  await initializePulseAppearance();
  await updatePulsePreferences(defaultPulsePreferences);
  native.invoke.mockClear();
});

describe("shared Pulse appearance",()=>{
  it("ignores malformed preference types without losing independent choices",()=>{
    const value=normalizePulsePreferences({skinId:"meter",theme:"dark",motionLevel:"off",compactMode:"false",widgetVisible:1});
    expect(value).toMatchObject({skinId:"meter",theme:"dark",motionLevel:"off",compactMode:false,widgetVisible:false});
  });
  it("changes the skin without changing other preferences or querying usage",async()=>{
    await updatePulsePreferences({theme:"dark",motionLevel:"off",compactMode:true});
    native.invoke.mockClear();
    render(<PulseStyleSwitcher/>);
    await userEvent.click(screen.getByRole("button",{name:"Meter"}));
    expect(document.documentElement.dataset).toMatchObject({skin:"meter",theme:"dark",motion:"off",density:"compact"});
    expect(native.invoke.mock.calls.map(call=>call[0])).toEqual(["set_pulse_preferences"]);
  });
  it("applies another window's saved preference event without another request",async()=>{
    render(<PulseStyleSwitcher/>);
    await act(async()=>native.events.get("pulse-preferences-changed")?.({payload:{...defaultPulsePreferences,skinId:"meter",theme:"light"}}));
    expect(screen.getByRole("button",{name:"Meter"})).toHaveAttribute("aria-pressed","true");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(native.invoke).not.toHaveBeenCalled();
  });
  it("keeps the persisted appearance when writing fails and exposes recovery feedback",async()=>{
    render(<PulseAppearanceSettings/>);
    native.fail=true;
    await userEvent.click(screen.getByRole("button",{name:"Dark"}));
    expect(document.documentElement.dataset.theme).not.toBe("dark");
    expect(await screen.findByText(/Could not save preferences: data folder is read-only/)).toBeInTheDocument();
    expect(native.invoke.mock.calls.map(call=>call[0])).toEqual(["set_pulse_preferences","get_pulse_preferences"]);
  });
  it("honors explicit motion off while preserving every appearance control",async()=>{
    render(<PulseAppearanceSettings/>);
    await userEvent.click(screen.getByRole("button",{name:"Off"}));
    expect(document.documentElement.dataset.motion).toBe("off");
    expect(screen.getByRole("button",{name:"Meter"})).toBeEnabled();
    expect(screen.getByRole("checkbox",{name:"Compact rows"})).toBeEnabled();
  });
});
