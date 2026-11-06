# Internal interface contract

Backend exports createUsageService({dataDir,codexHome?,codexExecutable?,onUpdate}) from src/main/usage-service.mjs. It returns {getSnapshot(),refresh(),close()}; snapshot reads are synchronous, refresh can be async and emits progress through onUpdate. No authentication material or prompt text enters snapshots.

Snapshot shape:

{version:1,mode:'live'|'demo',status:{scanning:boolean,progress:{done,total},scanAt:string|null,quotaAt:string|null,error:string|null,warnings:string[]},quota:{available:boolean,remainingPercent:number|null,usedPercent:number|null,resetsAt:string|null,plan:string|null,windows:[{name,remainingPercent,resetsAt,windowMinutes}],source:'codex-app-server'},today:{date,totalTokens,inputTokens,cachedTokens,outputTokens,sessions},daily:[{date,totalTokens,inputTokens,cachedTokens,outputTokens,sessions}],models:[{name,totalTokens,inputTokens,cachedTokens,outputTokens,sessions}],projects:[{name,totalTokens,sessions}],sessions:[{id,project,model,totalTokens,startedAt}],source:{sessionFiles:number,lastScan:string|null,localOnly:true}}

Renderer API exposed as window.pulse:
getSnapshot():Promise<Snapshot>; onSnapshot(callback):unsubscribe; refresh():Promise<void>; getSettings():Promise<Settings>; saveSettings(partial):Promise<Settings>; action(name):Promise<any>.

Action names: show-dashboard, toggle-widget, hide-widget, minimize, close, quit, open-data-folder, open-codex, open-repo, export-csv, choose-codex. Settings: {theme:'light'|'dark'|'system',language:'zh'|'en',widgetVisible:boolean,launchAtLogin:boolean,refreshSeconds:60,reducedMotion:boolean,codexExecutable?:string}. #/widget selects floating view. Browser preview without bridge uses explicit labeled demo mode, never masquerades as live.
