// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

type PanelWindow = Window & typeof globalThis;
type PanelDom = {window:PanelWindow};
const {JSDOM}=createRequire(import.meta.url)('jsdom') as {JSDOM:new (html:string,options:{url:string;runScripts:'dangerously';beforeParse:(window:PanelWindow)=>void})=>PanelDom};

const template = readFileSync(new URL('./panel.html', import.meta.url), 'utf8');
const translations = JSON.parse(readFileSync(new URL('./panel-copy.json', import.meta.url), 'utf8'));
function panel(language='en', local?: string) {
  const html = template.replace('__PULSE_COPY__',JSON.stringify(translations)).replace('__PULSE_ICON__','data:image/svg+xml,<svg/>').replace('__PULSE_VERSION__','0.0.0');
  return new JSDOM(html,{url:'https://pulse.invalid/',runScripts:'dangerously',beforeParse(window){
    Object.defineProperty(window.navigator,'language',{value:language});
    if(local)window.localStorage.setItem('pulse-panel-style',local);
  }});
}
function present(dom:PanelDom, skin:string){
  const value={schemaVersion:1,capturedAt:new Date().toISOString(),presentation:{skinId:skin,theme:'light',language:'en'},quotas:[],today:{totalTokens:null,costUSD:null}};
  dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:value}}}));
}
describe('Codex panel paper style and existing local overrides',()=>{
  it.each(['zh','zh-Hant','en','ja','ko','de'])('provides a named paper choice in %s',language=>{
    const dom=panel(language);try{const choice=dom.window.document.querySelector<HTMLButtonElement>('[data-style-choice=paper]');expect(choice).not.toBeNull();expect(choice!.textContent?.trim()).toBeTruthy();}finally{dom.window.close();}
  });
  it('follows paper from Pulse, preserves an explicit old style, then returns to follow',()=>{
    const dom=panel();try{present(dom,'paper');const document=dom.window.document;expect(document.querySelector('main')?.dataset.style).toBe('paper');document.querySelector<HTMLButtonElement>('[data-style-choice=meter]')!.click();present(dom,'paper');expect(document.querySelector('main')?.dataset.style).toBe('meter');expect(dom.window.localStorage.getItem('pulse-panel-style')).toBe('meter');document.querySelector<HTMLButtonElement>('[data-style-choice=follow]')!.click();expect(document.querySelector('main')?.dataset.style).toBe('paper');expect(dom.window.localStorage.getItem('pulse-panel-style')).toBeNull();}finally{dom.window.close();}
  });
  it('restores an explicit paper choice and can switch back to Clear',()=>{
    const dom=panel('en','paper');try{present(dom,'meter');expect(dom.window.document.querySelector('main')?.dataset.style).toBe('paper');dom.window.document.querySelector<HTMLButtonElement>('[data-style-choice=clear]')!.click();expect(dom.window.document.querySelector('main')?.dataset.style).toBe('clear');expect(dom.window.localStorage.getItem('pulse-panel-style')).toBe('clear');}finally{dom.window.close();}
  });
});
