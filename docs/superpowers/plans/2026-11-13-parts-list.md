# Parts List Implementation Plan

**Goal:** A Parts section in the tools panel: a tree of the model's parts to choose, hide, isolate and zoom to, chosen both from the list and from the model, with an IFC element's properties.

**Spec:** `docs/superpowers/specs/2026-11-13-parts-list-design.md`.

**Architecture:** Three layers, so the logic is testable without a browser.
- `src/utils/partsTree.js` (plain module): the tree (`createPartsModel`: lazy records, single-child chains, search, path to a node) and what hiding does to the scene (`createPartsVisibility`: hide, isolate, Show all, suspend for exports). Hiding goes through `utils/viewerHidden.js`, so thumbnails and exports already show every part.
- `src/utils/partHighlight.js`: the tint, a second mesh per chosen mesh in the scene, following its mesh as it is drawn.
- `src/composables/usePartsTree.js`: the panel's state as plain data (`rows`, `summary`, `selection`), plus picking, the camera move and IFC properties. Returned as `reactive()`, so the panel takes it as one prop and Vue never wraps a scene object.
- `src/components/PartsTree.vue`: the list (windowed, WAI-ARIA tree), the buttons and the details.
- `src/loaders/ifcProperties.js`, `ifcRuntime.js`, `types/ifc.js`: elements named and grouped by storey; properties read on demand.

## Global constraints

- Nothing loads until the section is opened: `PartsTree`, `usePartsTree` and `ifcProperties` are dynamic imports. The panel asks the viewer for the composable with `load-parts` when the section is on screen.
- `scripts/check-bundle-size.mjs`: the App chunk's raw budget rises 2 KB (spec).
- Every string goes through `t('threedviewer', …)`; `npm run i18n:sync` after adding strings.
- Buttons use doubled classes (`buttonSpecificity`), colours come from tokens (`chromeLiterals`, `designSystemAdoption`), and nothing pointer-operable in the panel may be skipped by Tab (`tool-panel-keyboard.spec.ts`), which is why the eye in a row is not a button.

## Tasks

- [x] Share `raycastHit` between `raycastIntersection` and a new `raycastObject`; make a ray skip a mesh with a hidden ancestor; treat `userData.tdvHelper` as viewer furniture (`isHelperMesh`).
- [x] `partsTree.js`: names, chain labels, the model, visibility. Jest: `tests/unit/utils/partsTree.test.js` (naming fallbacks, single-child collapsing, lazy making, search, hide/isolate/Show all, render modes and Exploded view leaving it alone, thumbnails showing it).
- [x] `partHighlight.js`, `usePartsTree.js`. Jest: `tests/unit/composables/usePartsTree.test.js` (rows as opened, filter, hide/isolate/Show all, tint, a click on the viewport, a drag, a hidden part, IFC properties asked for on choosing and not before).
- [x] IFC loader: storey grouping, names, `userData.ifc`; `ifcProperties.js`. Jest: `tests/unit/loaders/ifcProperties.test.js`. Fixture: `tests/fixtures/two-walls.ifc`.
- [x] `PartsTree.vue`; the section in `SlideOutToolPanel.vue`; `parts` in the off-tools lists for scans and splats, with their notes; two icons; forced-colors rules.
- [x] `ThreeViewer.vue`: load on request, init per model, click and pointer-down hooks, export suspend/resume, clear on file change; `App.vue`: the prop and two events.
- [x] Playwright: `tests/playwright/parts-list.spec.ts` on a three-colour glTF assembly (what was drawn, read back from the canvas), the keyboard, a 3,000-part OBJ, the IFC fixture, a scan, a phone.
- [x] CHANGELOG, README, help panel, `l10n/en.json`.
