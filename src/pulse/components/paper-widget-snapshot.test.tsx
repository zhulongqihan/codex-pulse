// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaperWidgetSnapshot } from './paper-widget-summary';

const state=vi.hoisted(()=>({native:false,invoke:vi.fn(),event:null as null|((event:{payload:unknown})=>void),unlisten:vi.fn()}));
function deferred<T>() {
  let resolve!:(value:T)=>void,reject!:(reason:Error)=>void;
  const promise=new Promise<T>((accept,fail)=>{resolve=accept;reject=fail;});
  return{promise,resolve,reject};
}
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>state.native,invoke:state.invoke}));
vi.mock('@tauri-apps/api/event',()=>({listen:vi.fn(async(_name:string,callback:(event:{payload:unknown})=>void)=>{state.event=callback;return state.unlisten;})}));
describe('paper widget published local snapshot transport',()=>{
  beforeEach(()=>{state.native=false;state.invoke.mockReset().mockResolvedValue({integration:{today:{date:'2026-11-18',totalTokens:13600,costUSD:.03645}}});state.event=null;state.unlisten.mockClear();history.replaceState(null,'','/');delete document.documentElement.dataset.demo;});
  afterEach(()=>{cleanup();delete document.documentElement.dataset.demo;});
  it('leaves an ordinary browser and an uninitialized demo URL alone',async()=>{
    const view=renderHook(()=>usePaperWidgetSnapshot(true));await act(async()=>{});expect(state.invoke).not.toHaveBeenCalled();view.unmount();
    history.replaceState(null,'','/?demo=1');renderHook(()=>usePaperWidgetSnapshot(true));await act(async()=>{});expect(state.invoke).not.toHaveBeenCalled();
  });
  it('uses the same read-only command when explicit browser demo IPC is already installed',async()=>{
    history.replaceState(null,'','/?demo=1');document.documentElement.dataset.demo='true';
    const {result}=renderHook(()=>usePaperWidgetSnapshot(true));
    await waitFor(()=>expect(state.invoke).toHaveBeenCalledExactlyOnceWith('get_widget_snapshot'));
    expect(result.current.snapshot?.integration?.today.totalTokens).toBe(13600);
    expect(result.current.snapshot?.integration?.today.costUSD).toBe(.03645);
  });
  it('reads native published data and listens for local updates without querying an account',async()=>{
    state.native=true;const {result,unmount}=renderHook(()=>usePaperWidgetSnapshot(true));await waitFor(()=>expect(result.current.snapshot).not.toBeNull());
    await act(async()=>{state.event?.({payload:{integration:{today:{totalTokens:42}}}});});
    expect(result.current.snapshot?.integration?.today.totalTokens).toBe(42);
    expect(state.invoke.mock.calls.map(([command])=>command)).toEqual(['get_widget_snapshot']);unmount();expect(state.unlisten).toHaveBeenCalledOnce();
  });
  it('keeps a newer push when an older initial read resolves later',async()=>{
    state.native=true;
    const pending=deferred<unknown>();state.invoke.mockReturnValueOnce(pending.promise);
    const {result}=renderHook(()=>usePaperWidgetSnapshot(true));
    await waitFor(()=>expect(state.invoke).toHaveBeenCalledExactlyOnceWith('get_widget_snapshot'));
    const newer={integration:{today:{date:'2026-11-18',totalTokens:42,costUSD:.1}}};
    await act(async()=>{state.event?.({payload:newer});});
    expect(result.current.snapshot).toEqual(newer);
    await act(async()=>{pending.resolve({integration:{today:{date:'2026-11-18',totalTokens:7,costUSD:.02}}});});
    expect(result.current.snapshot).toEqual(newer);
    expect(result.current.failed).toBe(false);
  });
  it('does not mark a successful newer push failed when the initial read rejects late',async()=>{
    state.native=true;
    const pending=deferred<unknown>();state.invoke.mockReturnValueOnce(pending.promise);
    const {result}=renderHook(()=>usePaperWidgetSnapshot(true));
    await waitFor(()=>expect(state.invoke).toHaveBeenCalledExactlyOnceWith('get_widget_snapshot'));
    const newer={integration:{today:{date:'2026-11-18',totalTokens:42,costUSD:.1}}};
    await act(async()=>{state.event?.({payload:newer});});
    await act(async()=>{pending.reject(new Error('Synthetic delayed initial-read failure'));});
    expect(result.current.snapshot).toEqual(newer);
    expect(result.current.failed).toBe(false);
  });
  it('still reports an initial-read failure when no successful push has superseded it',async()=>{
    state.native=true;state.invoke.mockRejectedValueOnce(new Error('Synthetic current read failure'));
    const {result}=renderHook(()=>usePaperWidgetSnapshot(true));
    await waitFor(()=>expect(result.current.failed).toBe(true));
    expect(result.current.snapshot).toBeNull();
  });
});
