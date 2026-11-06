# Codex Pulse design system

Status: production v0.2.0. **Clear** and **Meter** are the two supported interface styles in the Windows desktop app. The same usage data, navigation, and working state are available in both styles.

## Source of truth

The dashboard loads these production stylesheets in this order:

| File | Responsibility |
|---|---|
| [dashboard.css](src/renderer/dashboard.css) | Base semantic tokens, Clear layout, typography, navigation, tables, settings, and responsive behavior |
| [variants.css](src/renderer/variants.css) | Clear/Meter previews, Meter tokens and layout, activity plot, and dark-mode overrides |
| [production.css](src/renderer/production.css) | Production refinements for real data, empty and failure states, filters, ranges, and responsive layout |

These files define the shipped dimensions, tokens, and behavior. Keep this document aligned with them when changing the design. [Dashboard.jsx](src/renderer/Dashboard.jsx), [variant-ui.jsx](src/renderer/variant-ui.jsx), and [SettingsPanel.jsx](src/renderer/SettingsPanel.jsx) provide the corresponding interaction structure.

The floating widget retains its compact/expanded structure in [LegacyApp.jsx](src/renderer/LegacyApp.jsx) and [styles.css](src/renderer/styles.css). Its colors follow the selected interface style; the dashboard layout does not replace the widget layout.

## Clear and Meter

| Element | Clear | Meter |
|---|---|---|
| Presentation | White work surface, pale blue-gray chrome, blue selection | Pale gray shell, white work surface, blue-green selection |
| Activity comparison | Horizontal date rows with common-scale token or cost bars | One vertical comparison plot for up to seven recent activity days in the selected range |
| Emphasis | Continuous lists and light divisions | Stronger numerical hierarchy and a dark activity field |
| Supporting data | Readable tables, selected-day detail, and separate account region | The same information, with spacing and hierarchy adapted to the Meter layout |

In light Meter mode, the activity comparison is the single dark data field. Account details remain on a light surface. Do not spread the dark plot treatment across every panel or add decorative gradients, glows, or textures.

## Semantic color tokens

The following light-mode values describe the current palette; use the stylesheet variables rather than copying colors into new components.

| Role | Clear | Meter |
|---|---|---|
| Work surface | `#ffffff` | `#ffffff` |
| Chrome / outer shell | `#f4f6f8` | `#e9eeef` |
| Main text | `#252b34` | `#20383e` |
| Secondary text | `#626b79` | `#586e75` |
| Active state | `#285fc3` | `#326d79` |
| Dividing line | `#e5e9ef` | `#dce4e5` |

Meter's light-mode activity field is `#20383e`. Inside that field, uncached input uses `#5798a7`, cached input `#b3d3d9`, and output `#d9ad70`. Dark mode has its own semantic surface, text, line, and accent overrides for each style. Preserve contrast through those tokens.

## Typography and hierarchy

Use system sans-serif fonts: Segoe UI Variable Text / Segoe UI / Microsoft YaHei UI, with normal system fallbacks. The interface is Chinese-first and supports English. Preserve original model and project names.

- Main reading content is generally 13–14px; supporting metadata is generally 11–12px.
- Use tabular numerals and Bahnschrift or the existing numeric fallbacks for prominent usage values.
- Page titles sit around 22–24px. Meter gives the primary usage value more emphasis while keeping secondary metrics smaller.
- Compact mode changes row spacing; it must not make the reading text smaller.

## Layout and charts

The main header exposes Dashboard, Sessions, Models, Daily, Monthly, and Projects. Settings is a separate destination. Keep date range and export controls near the data they affect. The account region remains distinct from local usage, with a reachable compact presentation at narrower widths.

Meter's comparison plot uses a common zero baseline and a dynamically rounded upper bound derived from the displayed data. The scale follows readable steps such as 1, 2, 2.5, 5, and 10 times a power of ten. Token and API-price views use their own units and scales; do not hardcode a demonstration-data ceiling or normalize each bar independently.

Show uncached input, cached input, and output as separate stack segments. Cached input is already included in input tokens. When only a total is available, show an aggregate bar rather than inventing a breakdown. Unknown prices remain unavailable.

Date selection links the activity comparison to the existing detail view. Keep selected states visible, support the plot's keyboard navigation, and avoid movement that makes repeated date selection harder to follow.

## Independent preferences and preserved state

- `skinId`: Clear or Meter.
- `theme`: Light, Dark, or System.
- `motionLevel`: Off, Gentle, or Full, with a separate preference to respect system reduced motion.
- `compactMode`: normal or tighter row spacing.

Changing one preference must preserve the others. Switching styles preserves the route, date range, selected date, model/project filters, search, sorting, and selected session. It must not trigger a log scan or account query by itself.

Motion answers an action or a data update. Keep feedback restrained, avoid blanket entrance delays, and retain all content and controls with motion off. System reduced-motion preferences are honored when that option is enabled.

## Data, failure, and demonstration states

Label local log statistics, official account limits, and optional API-price references as separate sources. A missing quota is unavailable rather than 0%; an old successful account result is visibly stale. A failed refresh retains existing usable data and provides a retry path.

Empty data, malformed preferences, failed reads, and failed writes need clear recovery feedback without fabricated values. The normal desktop app reads actual sources; browser previews and explicit demo mode use labeled synthetic data. Public screenshots must use that demo data.

## Widget and accessibility

Keep the established compact/expanded floating widget, its drag area, open-dashboard action, expand/collapse control, hide control, and source labels. Apply the selected theme colors without changing those interactions.

Use semantic buttons, selects, and switches; visible keyboard focus; text labels in addition to color; and readable contrast in both color modes. Changes need source/build checks, renderer failure recovery checks, and native Electron verification of the relevant views. Those checks cover the shipped scope, not full upstream feature parity.
