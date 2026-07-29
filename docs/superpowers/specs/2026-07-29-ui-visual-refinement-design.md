# Mikanarr UI Visual Refinement Design

**Date:** 2026-07-29

**Status:** Approved

**Scope:** Frontend visual refinement plus the remaining overlapping TMDB refresh race

## 1. Context

Mikanarr now has a secure Cookie session flow, safe DOM rendering, accessible semantic controls, CSP, responsive card/table views, and a broad `node:test` suite. The remaining merge blocker is a frontend race: two overlapping `loadSeries()` calls can complete their background TMDB refreshes out of order, allowing an older Series snapshot to replace the newest option list and clear the current selection.

The current UI is functional but visually inconsistent. The top action area is dense, information hierarchy is weak, several CSS rules duplicate or override earlier definitions, and inline dimensions make responsive behavior harder to reason about. The chosen direction is a targeted layout upgrade rather than a framework rewrite.

## 2. Goals

- Deliver a refined Maillard visual system in both light and dark themes.
- Keep the default Pattern experience as a compact card view with high information density.
- Improve hierarchy, spacing, state communication, loading/empty/error presentation, and visual consistency.
- Use visible motion for navigation, cards, filtering, dialogs, and Toasts without delaying functionality.
- Preserve all existing features, APIs, authentication, CSP, XSS protections, and user preferences.
- Fix overlapping `loadSeries()` refreshes so only the newest load may update Series UI.
- Keep the frontend Bootstrap-based, dependency-free, and understandable as native HTML/CSS/JavaScript.

## 3. Non-goals

- No React, Vue, TypeScript, bundler, component framework, state-management library, or animation library.
- No backend API, database, authentication, proxy, or container redesign.
- No sidebar or multi-page dashboard architecture.
- No new fonts, remote assets, raster artwork, or icon package.
- No screenshot-regression infrastructure in this iteration.
- No local Docker image/runtime verification; that remains pending a later Docker-capable environment.

## 4. Design Principles

1. **Compact, not cramped.** Reduce wasted vertical space while retaining clear grouping and touch targets.
2. **Warm, not decorative.** Keep the Maillard identity but replace excessive gradients, shadows, and hover motion with deliberate visual hierarchy.
3. **State must be legible.** Status uses text and shape as well as color.
4. **Motion communicates change.** Animation explains entry, filtering, selection, and dialog state; it never blocks data or input.
5. **Native first.** Prefer semantic HTML, CSS transitions, Bootstrap utilities, and small existing JavaScript helpers.

## 5. Visual System

### 5.1 Color tokens

The CSS will expose semantic tokens rather than page-specific color literals.

Light theme:

- Canvas: warm parchment `#f6f1e9`
- Raised surface: soft ivory `#fffdf9`
- Subtle surface: oat `#eee5d8`
- Primary text: espresso `#382d27`
- Secondary text: taupe `#74665d`
- Accent: caramel `#a86f4c`
- Accent hover: roasted caramel `#895638`
- Success: muted olive `#657a57`
- Warning: amber `#b98238`
- Danger: brick `#a84f43`
- Information: desaturated blue `#627f91`

Dark theme:

- Canvas: dark cocoa `#1f1915`
- Raised surface: coffee `#2a211c`
- Subtle surface: warm charcoal `#352a23`
- Primary text: cream `#eee5da`
- Secondary text: mushroom `#b8a99d`
- Accent: light caramel `#d09069`

Borders, focus rings, overlays, shadows, and state backgrounds derive from these semantic colors. Bootstrap contextual classes are overridden once at the token/component layer rather than repeatedly throughout the file.

### 5.2 Density and geometry

- Spacing scale: 4, 8, 12, 16, 24, and 32 px.
- Default body text: 14 px on dense application surfaces; headings retain a clear type scale.
- Control height: approximately 36 px for ordinary toolbar controls and 40 px for primary form actions.
- Radius scale: 8 px controls, 12 px cards, 16 px major panels/dialogs.
- Shadows: one subtle resting shadow and one raised shadow; no page-specific shadow stacks.
- Focus rings remain clearly visible in both themes.

### 5.3 Motion

- Micro feedback: 140–180 ms for buttons, controls, and focus changes.
- View/state transitions: 220–280 ms.
- Dialog and page-section entry: up to 360 ms.
- Pattern cards may enter with a capped stagger using a CSS custom property; the delay is capped so large libraries do not take longer to become usable.
- Hover lift and action reveal apply only to hover-capable devices. Touch devices show actions persistently.
- `prefers-reduced-motion: reduce` disables transforms, stagger, smooth scrolling, and nonessential transitions while preserving state visibility.

## 6. Page Architecture

### 6.1 Login

- Retain a centered login surface with a quieter warm gradient and a restrained brand glow.
- Remove hover translation from the form container so fields do not move under the pointer.
- Separate local credentials and SSO with clearer labelling and spacing.
- Keep authentication errors inline and compact.
- On success, reveal the application with a short opacity/translate transition that does not delay navigation.

### 6.2 Main navigation

- Keep the current top navigation and mobile collapse behavior.
- Simplify the gradient and reduce glass effects so the content remains the focal point.
- Keep theme and logout actions clearly visible and keyboard operable.
- Do not add a sidebar for the single current application area.

### 6.3 Pattern list header and toolbar

The list view becomes three visual layers:

1. Page title and compact summary chips for total Patterns, current exceptions, and selected count.
2. Search/filter/view controls grouped as discovery controls.
3. New/import/export and contextual batch actions grouped as data actions.

Batch actions remain hidden until there is a selection, then animate into the toolbar without moving the primary New action unpredictably. At narrow widths, the toolbar wraps into ordered rows; low-frequency actions may collapse into a compact secondary group, but every action remains reachable without a new navigation system.

### 6.4 Compact Pattern cards

- Card grid uses an adaptive `minmax` layout and remains the default view.
- Cards keep a consistent compact poster ratio and reduce excess vertical padding.
- A state rail plus labelled status badge communicates normal, mismatch, and missing-series states.
- Primary title, optional Chinese title, season, language, quality, and match progress follow a strict hierarchy.
- Operational metadata uses short rows and tooltips where necessary; secret-bearing URLs are never shown by default.
- Common actions remain in a stable footer. Hover-capable devices reveal secondary actions with motion; touch layouts show them persistently.
- Selection remains easy to see through checkbox, border, and surface state.
- Skeleton, empty library, no filtered results, and load failure each receive distinct layouts and messages.

### 6.5 Table view

- Retain table view for users who prefer dense data.
- Use the same status colors, badges, focus treatment, and toolbar state as cards.
- Preserve semantic sort buttons and `aria-sort` behavior.
- Improve sticky header contrast and horizontal-scroll affordance without making table the default.

### 6.6 Pattern editor

The editor is reorganized visually into four sections without changing field semantics:

1. Subscription source and Mikan quick import.
2. Matching rule and match test.
3. Sonarr Series/season mapping and Series information.
4. Output language, quality, offset, release group, and generated proxy URL.

Desktop uses an 8/4 form-preview split with the RSS preview kept visible in its column. Narrow layouts place preview below the form. Field-specific success/error/match feedback appears next to its field; Toast remains for cross-page outcomes. Save/back actions stay easy to locate during long edits.

## 7. Responsive Behavior

- Large desktop: multi-column compact card grid and 8/4 editor split.
- Tablet: fewer card columns, wrapped toolbar groups, normal editor flow.
- 360 px mobile baseline: horizontal compact cards, visible touch actions, full-width search/filter controls, and no inaccessible table-only operation.
- No fixed pixel width may force the toolbar or editor beyond the viewport.
- Icon-only actions retain accessible names; primary actions keep text labels where space permits.

## 8. Frontend State and Data Flow

### 8.1 Latest-load-wins Series refresh

`MikanarrApp` gains one monotonically increasing Series load generation counter.

1. Every `loadSeries()` captures `generation = ++this.seriesLoadGeneration`.
2. The Sonarr response renders immediately with current/English names.
3. TMDB synchronization starts in the background and does not block `loadSeries()` completion.
4. Before any background result redraws options or Pattern views, it compares its captured generation with the current counter.
5. A stale generation returns without any DOM or selection update.
6. The latest generation rebuilds translated options, restores the current selection when it still exists, and redraws the current filtered view locally without a second Pattern fetch.

This fixes the remaining merge blocker without introducing cancellation primitives or a global store.

### 8.2 Visual state classes

Existing renderers add small semantic state classes and CSS custom properties rather than inline presentation strings. JavaScript remains responsible for data and interaction; CSS owns layout, color, and motion. Static HTML is adjusted only where grouping or semantics require it.

## 9. CSS Organization

`public/css/style.css` is reorganized in place into five sections:

1. Theme/design tokens.
2. Base element and Bootstrap normalization.
3. Reusable controls, panels, badges, empty/loading states, and motion helpers.
4. Page-specific login, list/card/table, editor, preview, and dialog layout.
5. Responsive, dark-theme, hover-capability, and reduced-motion rules.

Duplicate `.login-box`, `.btn`, `.navbar-brand`, badge, and contextual color definitions are consolidated. Replaceable inline widths/styles move to named classes. This is a cleanup of the existing stylesheet, not a new CSS architecture or separate design-system package.

## 10. Error and Empty States

- Loading uses compact skeletons or in-place progress, not layout-blocking overlays.
- Empty library includes a primary New Pattern action.
- No search/filter results explain how to reset filters.
- Failed loads use a concise safe message with a Retry action where the request is repeatable.
- Field validation remains adjacent to the field.
- Destructive actions continue using accessible confirmation dialogs.

## 11. Testing Strategy

### 11.1 Deterministic race regression

Add a jsdom test with two overlapping `loadSeries()` calls:

- First load returns an old Series snapshot and holds its TMDB Promise unresolved.
- Second load returns the new snapshot, renders it, and selects the new Series.
- Resolving the first TMDB Promise must not alter options or selection.
- Resolving the second Promise may enrich names but must retain the selection.
- Neither background completion may cause a second Pattern fetch.

The test must fail if the generation guard is removed.

### 11.2 UI behavior tests

- Toolbar summary and contextual batch-action visibility.
- Compact card state classes and safe dynamic text.
- Distinct empty-library and no-filter-result states.
- Semantic controls, focus behavior, and dark-theme/reduced-motion hooks.
- Login and editor structural classes without relying on brittle full-document snapshots.

### 11.3 Gates

- Frontend-focused `node:test` files.
- Full `npm run check`.
- `npm audit --omit=dev --audit-level=high`.
- `git diff --check`.
- Static scans for inline handlers, unsafe dynamic HTML regressions, secret-bearing logs, and disallowed new dependencies.
- Docker runtime remains an explicit deferred verification in a later Docker-capable environment.

## 12. Acceptance Criteria

- Light and dark themes share the same refined Maillard hierarchy and readable contrast.
- Compact cards remain the default and show more useful information per desktop viewport than the current implementation.
- The header/toolbar does not overflow at 360 px and keeps search, filter, New, import, and batch operations reachable.
- Cards, loading states, empty states, dialogs, Toasts, and view changes use visible motion; reduced-motion users receive equivalent immediate state changes.
- Pattern editing is visually separated into four understandable sections, with responsive RSS preview placement.
- Two overlapping Series loads cannot let an older TMDB completion replace newer options or clear the current selection.
- No authentication, API, CSP, XSS, accessibility, sorting, selection, import/export, theme, or card/table behavior regresses.
- Frontend-focused tests, full checks, production audit, and static scans pass; Docker runtime is documented as deferred.

## 13. Rollout and Rollback

The change is delivered as frontend HTML/CSS/JavaScript plus tests. There is no database or API migration. Existing stored theme/view preferences remain compatible. If visual regressions are found, the UI commit can be reverted without rolling back server, database, authentication, or deployment changes.
