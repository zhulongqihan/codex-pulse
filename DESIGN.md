# Codex Pulse design

Status: active. The selected Quiet Folio direction combines neutral white, charcoal navigation, restrained olive data colors and a literary headline. Seven functional views share one visual system.

## Scene and strategy
A Windows user keeps a small status instrument next to Codex during a long daylight work session. The main canvas is neutral white for readable charts; the compact floating instrument is charcoal for separation from work content. Restrained olive brand, one sky-blue comparison series, quiet structural surfaces.

## Tokens (OKLCH)
Background oklch(1 0 0); surface oklch(.975 0 0); ink oklch(.21 .012 130); muted oklch(.47 .012 130); primary oklch(.48 .14 130); widget primary oklch(.82 .16 130); accent oklch(.48 .15 245); stroke oklch(.9 .005 130). Support dark theme through matching semantic tokens.

## Type and layout
System sans (Segoe UI Variable / Segoe UI / sans-serif), tabular numbers, 14px base. Sidebar + main workspace, one detailed activity plot, compact table with deliberate density. Rounded corners max16px, full pills for tiny status labels. No decorative grids, gradient text, cards inside cards, or border-plus-large-shadow.

## Motion
180–240ms ease-out for switches, count interpolation 450ms on new data, purposeful syncing pulse, chart-path introduction with an immediate visible fallback. Respect prefers-reduced-motion everywhere. No bounce or blanket entrance delays.

## Optional motion
Motion can be full, gentle or off, with a global quick toggle, settings control and system reduced-motion support. Motion conveys refresh, selection, changing values and widget expansion; turning it off must preserve all content.
