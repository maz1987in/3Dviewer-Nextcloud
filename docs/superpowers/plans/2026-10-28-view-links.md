# View Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A link that reopens a model as the sender saw it: camera, shading, lighting, cross-section, exploded view and a highlighted note in the full viewer, and the camera on public links and in the Files viewer.

**Architecture:** One pure module (`src/utils/viewLink.js`) encodes and validates a versioned `view=` query parameter and still reads the old `cam=` one. The full viewer (`ThreeViewer.vue` + `App.vue`) captures and applies the whole view; the light viewer (`ViewerComponent.vue`) applies and copies the camera only. No server changes.

**Tech Stack:** Vue 3, three.js r186, Jest, Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-10-28-views-units-embed-scans-design.md`, section 1 and the Decisions table.

## Global Constraints

- Nothing is stored on the server; the view lives in the link.
- The encoding carries a version number (`1`), so links made today keep opening later.
- A link stays well under 2,000 characters. Numbers are rounded (4 decimals for positions, 3 for factors).
- A malformed or hand-edited view is ignored, never an error. Every value is validated and clamped; nothing from the link reaches HTML or code.
- Opening a view link never changes the recipient's own preferences (`threedviewer:prefs` in `localStorage`, server settings).
- On public links and in the Files viewer (`ViewerComponent`), only the camera applies.
- The existing `cam=` links keep working.
- Every new control works from the keyboard and has an accessible name; every string goes through `t('threedviewer', …)`.
- Clipboard writes use the existing secure-context + textarea fallback (`App.onCopyViewLink`); move it into one helper rather than adding a third copy.

## Review Focus

1. A link opened for a file whose model is much smaller or larger than when it was made: the camera must still frame something. If the target lies outside the model's bounding box grown by its own size, fall back to the usual fit. (Task 3 test.)
2. A link with `note=` for a note that was deleted, or that is private to its author: it opens normally, with no panel forced open and no error. (Task 4 test.)
3. A link with `view=` and `cam=` both present: `view` wins. (Task 1 test.)
4. A link applied while the model is still loading, or a second model opened in the same tab: the view applies once, to the first load only. (Task 3 test.)
5. Projection in the link differs from the recipient's current projection: switch projection first, then set the camera, or the orthographic zoom is lost. (Task 3 test.)

---

### Task 1: Encode, decode and validate a view

**Files:**
- Create: `src/utils/viewLink.js`
- Modify: `src/utils/cameraUrlState.js` (keep exports; `buildShareableUrl` stays for the legacy path)
- Create: `src/utils/clipboard.js`
- Test: `tests/unit/utils/viewLink.test.js`, `tests/unit/utils/clipboard.test.js`

**Interfaces:**
- Produces:
  - `VIEW_PARAM = 'view'`, `VIEW_VERSION = 1`
  - `type ViewState = { camera: { position: [number, number, number], target: [number, number, number], zoom: number, projection: 'perspective'|'orthographic' }, renderMode?: 'standard'|'clay'|'normals'|'xray', wireframe?: boolean, lighting?: string, clipping?: { mode: 'plane', axis: 'x'|'y'|'z', position: number, flipped: boolean } | { mode: 'box', offsets: { xMin, xMax, yMin, yMax, zMin, zMax: number } }, exploded?: number, note?: number }`
  - `encodeView(view: ViewState): string` → `'1.' + base64url(JSON)` with short keys
  - `decodeView(raw: string): ViewState|null`
  - `readViewFromUrl(search?: string): ViewState|null`. It reads `view`, otherwise the legacy `cam` (converted via `parseCameraState`, projection `'perspective'`).
  - `buildViewUrl(base: string, view: ViewState): string`. It sets `view` and deletes `cam`, keeping every other parameter.
  - `copyText(text: string): Promise<void>` in `clipboard.js`. It throws when the copy fails.

- [ ] **Step 1: Write the failing tests**

```js
// viewLink.test.js
const full = { camera: { position: [1.23456, 2, 3], target: [0, 0.5, 0], zoom: 1, projection: 'orthographic' },
	renderMode: 'clay', wireframe: true, lighting: 'studio',
	clipping: { mode: 'plane', axis: 'z', position: -0.25, flipped: true }, exploded: 0.4, note: 42 }
it('round-trips a full view', () => expect(decodeView(encodeView(full))).toEqual({ ...full, camera: { ...full.camera, position: [1.2346, 2, 3] } }))
it('round-trips a box cut', () => { const v = { ...full, clipping: { mode: 'box', offsets: { xMin: 0.1, xMax: 0, yMin: 0, yMax: 0.2, zMin: 0, zMax: 0 } } }; expect(decodeView(encodeView(v)).clipping).toEqual(v.clipping) })
it('starts with the version', () => expect(encodeView(full).startsWith('1.')).toBe(true))
it('stays short', () => expect(encodeView(full).length).toBeLessThan(400))
it.each(['', 'x', '2.e30', '1.!!!', '1.' + btoa('[]'), '1.' + btoa('{"c":"nope"}')])('rejects %p', (raw) => expect(decodeView(raw)).toBeNull())
it('drops unknown or bad optional fields and keeps the camera', () => {
	const v = decodeView(encodeView({ ...full, renderMode: 'evil', lighting: '<img>', note: -1, exploded: 9 }))
	expect(v.renderMode).toBeUndefined(); expect(v.lighting).toBeUndefined(); expect(v.note).toBeUndefined(); expect(v.exploded).toBe(1)
})
it('clamps the cut position and zoom', () => {
	const v = decodeView(encodeView({ ...full, clipping: { ...full.clipping, position: 7 }, camera: { ...full.camera, zoom: 1e9 } }))
	expect(v.clipping.position).toBe(1); expect(v.camera.zoom).toBe(100)
})
it('rejects non-finite or huge coordinates', () => expect(decodeView(encodeView({ ...full, camera: { ...full.camera, position: [1e12, 0, 0] } }))).toBeNull())
it('reads the legacy cam parameter', () => expect(readViewFromUrl('?cam=1,2,3,0,0,0,1').camera).toEqual({ position: [1, 2, 3], target: [0, 0, 0], zoom: 1, projection: 'perspective' }))
it('prefers view over cam', () => expect(readViewFromUrl(`?cam=9,9,9,0,0,0,1&view=${encodeView(full)}`).renderMode).toBe('clay'))
it('builds a URL that keeps other parameters and drops cam', () => {
	const u = new URL(buildViewUrl('https://cloud.test/apps/threedviewer/f/7?dir=a&cam=1,2,3,0,0,0,1', full))
	expect(u.searchParams.get('dir')).toBe('a'); expect(u.searchParams.has('cam')).toBe(false); expect(decodeView(u.searchParams.get('view'))).not.toBeNull()
})
```

`lighting` is valid only when it's a key of `LIGHTING_PRESETS` (`src/config/lightingPresets.js`). Coordinates must satisfy `Math.abs(n) <= 1e7`. `zoom` is clamped to `[0.01, 100]`, `exploded` and box offsets to `[0, 1]`, and the plane `position` to `[-1, 1]`. `note` must be a positive safe integer. An invalid camera rejects the whole view; an invalid optional field is just dropped.

`clipboard.test.js` covers two cases:
- With `navigator.clipboard.writeText` available and `isSecureContext` true, it calls `writeText`.
- Otherwise it falls back to `document.execCommand('copy')` and removes the textarea afterwards.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/utils/viewLink.test.js tests/unit/utils/clipboard.test.js`
Expected: FAIL, "Cannot find module '../../../src/utils/viewLink.js'"

- [ ] **Step 3: Implement `viewLink.js` and `clipboard.js`**

Base64url means replacing `+` with `-` and `/` with `_`, with no `=` padding. Wrap decoding in try/catch so that any parse failure returns null. Have `App.onCopyViewLink` and `ThreeViewer.copyMeasurementReport` call `copyText`, which replaces their inline copies.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest tests/unit/utils/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/viewLink.js src/utils/clipboard.js src/utils/cameraUrlState.js src/App.vue src/components/ThreeViewer.vue tests/unit/utils/
git commit -m "feat(view-links): encode and validate a view in the link"
```

### Task 2: Capture the full viewer's view and copy it

**Files:**
- Modify: `src/utils/viewLink.js` (add `captureViewState`)
- Modify: `src/components/ThreeViewer.vue` (replace `getShareableViewLink`; add `getViewState`)
- Modify: `src/App.vue` (`onCopyViewLink`)
- Modify: `src/components/SlideOutToolPanel.vue` (button label "Copy link to this view"; shortcut hint)
- Modify: `src/utils/toolShortcuts.js` (add `{ key: 'l', event: 'copy-view-link' }`, after checking `l` is unused), `src/components/HelpPanel.vue` (list it)
- Test: `tests/unit/threeViewerViewState.test.js`, `tests/unit/toolPanelShortcuts.test.js` (extend)

**Interfaces:**
- Consumes: `encodeView`, `buildViewUrl`, `copyText` (Task 1)
- Produces:
  - `ThreeViewer.getViewState(): ViewState|null`. It returns null with no model or camera, and includes `note` only when `highlightedNoteId` is set (Task 4).
  - `ThreeViewer.getShareableViewLink(): string|null`. It is `buildViewUrl(origin + generateUrl('/apps/threedviewer/f/{fileId}', { fileId }), getViewState())`.

- [ ] **Step 1: Write the failing test.** Use the `getViewState` logic extracted as `captureViewState({ camera, controls, renderMode, wireframe, lightingPreset, clipping, exploded, highlightedNoteId })` from `src/utils/viewLink.js`, so it can be unit-tested without mounting ThreeViewer:

```js
it('captures only what is switched on', () => {
	const v = captureViewState({ camera: perspectiveCamera([3, 4, 5]), controls: { target: vec(0, 1, 0) }, renderMode: 'standard', wireframe: false,
		lightingPreset: 'default', clipping: { isActive: false }, exploded: { isActive: false, factor: 0 }, highlightedNoteId: null })
	expect(v).toEqual({ camera: { position: [3, 4, 5], target: [0, 1, 0], zoom: 1, projection: 'perspective' }, renderMode: 'standard', wireframe: false, lighting: 'default' })
})
it('captures an active plane cut, explode and note', () => { /* clipping { isActive:true, mode:'plane', axis:'x', position:0.3, flipped:false } → clipping set; exploded { isActive:true, factor:0.5 } → 0.5; highlightedNoteId 12 → note 12 */ })
it('captures an active box cut', () => { /* mode 'box', boxOffsets → clipping.offsets */ })
it('treats an OrthographicCamera as orthographic', () => { /* isOrthographicCamera true → projection 'orthographic', zoom kept */ })
```

Also extend `toolPanelShortcuts.test.js`: pressing `l` emits `copy-view-link`, and pressing it while a modal dialog is open does nothing.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/threeViewerViewState.test.js tests/unit/toolPanelShortcuts.test.js`
Expected: FAIL (`captureViewState` is not a function; no `copy-view-link` for `l`)

- [ ] **Step 3: Implement.** Make the following changes:
- `captureViewState` goes in `viewLink.js`.
- ThreeViewer's `getViewState` passes it the live composables: `renderMode.mode`, `props.wireframe`, `lightingPresets.currentPreset`, `clippingPlane.*`, `explodedView.*`.
- `getShareableViewLink` builds the `/f/{fileId}` link.
- App's `onCopyViewLink` keeps its toasts and uses `copyText`.
- Change the panel label from "Copy View Link" to "Copy link to this view".
- Change the toast message to "Anyone who can open this file will see it as you do."

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest tests/unit/threeViewerViewState.test.js tests/unit/toolPanelShortcuts.test.js`
Expected: PASS

- [ ] **Step 5: Commit** `feat(view-links): copy the whole view from the full viewer`

### Task 3: Apply a view when the full viewer opens a link

**Files:**
- Modify: `src/components/ThreeViewer.vue` (replace the `readCameraStateFromUrl` block in the load path, around the `cameraFromUrl` code)
- Modify: `src/App.vue` (receive `view-applied` to sync `renderMode`, `lightingPreset`, `wireframe`, exploded and clipping state without saving preferences)
- Test: `tests/unit/utils/viewLink.test.js` (extend with `isUsableTarget`), `tests/playwright/view-links.spec.ts` (new)

**Interfaces:**
- Consumes: `readViewFromUrl` (Task 1)
- Produces:
  - `isUsableTarget(target: [x,y,z], box: THREE.Box3): boolean` in `viewLink.js`. It returns true when the target lies inside `box` expanded by the box's own size on every side.
  - ThreeViewer emits `view-applied` with `{ renderMode, wireframe, lighting, exploded, clipping }`, listing only what was applied.

- [ ] **Step 1: Write the failing tests.** Add `isUsableTarget` unit cases: a target inside → true; one just past the grown box → false.

`view-links.spec.ts` runs on the harness (`startServer`/`openViewer`). The harness page URL takes a `view=` parameter appended to it. Write these tests:
- `a view link restores camera, Clay, Studio lighting, a plane cut and exploded factor`: build the link with `encodeView` on the Node side, open the page, then read back through `page.evaluate` on the viewer instance (`window.__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer`, as `viewerState` in `turntable.spec.ts` does) to get the camera position (±1e-3), `renderMode` `'clay'`, the lighting preset, the clipping axis and position, and the exploded factor.
- `opening a link with wireframe does not change saved preferences`: before the link, `localStorage['threedviewer:prefs']` has wireframe false. After opening a link with `wireframe: true` it is still false, and still false after the user toggles Grid.
- `an orthographic link keeps its zoom`: projection orthographic with zoom 2.5, read back as orthographic with zoom 2.5.
- `a camera aimed far from the model falls back to the usual framing`: target `[1e6, 0, 0]` gives the same camera as opening the page without a link.
- `the legacy cam link still sets the camera`.
- `the view applies to the first model only`: open with a link, then switch to a second model the way the file browser does (App's file-selection handler, which clears the URL's view), and get the usual framing.
- `copying from the panel gives a link that reproduces the view`: set Clay, copy (read the clipboard with `context.grantPermissions(['clipboard-read','clipboard-write'])`), decode the `view` parameter, and expect `renderMode` `'clay'`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run build && npx playwright test tests/playwright/view-links.spec.ts --project=chromium`
Expected: FAIL. Only the legacy `cam` test passes.

- [ ] **Step 3: Implement.** In the load path, after `fitCameraToObject`, read the view once per page (keep a module-level `viewLinkConsumed` flag) and apply it in this order:
1. projection, through `toggleCameraProjection` when it differs;
2. camera, through `applyCameraState`, skipped when `!isUsableTarget`;
3. `setRenderMode`;
4. `lightingPresets.applyPreset`;
5. clipping: `setMode`, then `setAxis`/`setPosition`/flip or the box offsets, then `toggle` on;
6. exploded: `toggle` on, then `setFactor`. Skip this unless `explodedView.hasMeshes`.

Emit `view-applied`. App sets its mirrors from it. App sets `wireframe` without persisting it, so `savePrefs` keeps writing the recipient's own last wireframe choice; track it in `ownWireframe`, which `onToggleWireframe` updates.

- [ ] **Step 4: Run them to verify they pass**

Run: `npm run build && npx playwright test tests/playwright/view-links.spec.ts --project=chromium && npx jest`
Expected: PASS

- [ ] **Step 5: Commit** `feat(view-links): reopen the full viewer as the link describes`

### Task 4: Links to a note, and bookmark links

**Files:**
- Modify: `src/components/ThreeViewer.vue` (annotation card action; `highlightedNoteId` ref; apply `note` after notes load)
- Modify: `src/components/SlideOutToolPanel.vue` (a "Copy link" icon button per bookmark), `src/App.vue` (`onCopyBookmarkLink(index)`)
- Test: `tests/playwright/view-links.spec.ts` (extend)

**Interfaces:**
- Consumes: `getViewState`, `buildViewUrl`, `copyText`
- Produces: `highlightedNoteId: Ref<number|null>`, read by `getViewState`.

- [ ] **Step 1: Write the failing tests.** The harness answers `/api/notes/{fileId}` with fixture notes, as in `shared-notes` specs.
- `a note link opens Annotations with that note highlighted and focused`: open with `note: 5`. The annotation panel is visible, the card for note 5 has `.is-highlighted` and holds focus, and its label is visible.
- `a link to a deleted or private note opens normally`: `note: 999` gives no panel, no toast and no console error.
- `Copy link to this note gives a link with that note`: the card action's link decodes to `note` equal to the card's `meta.noteId`. The action is absent on unsaved notes (`noteId === null`).
- `a bookmark's Copy link carries the bookmark's camera`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/playwright/view-links.spec.ts --project=chromium -g "note|bookmark"`
Expected: FAIL

- [ ] **Step 3: Implement.** Add a card action button, `tdv-btn tdv-btn--icon canvas-panel-delete`-styled, labelled "Copy link to this note", that calls `copyText(buildViewUrl(…, { ...getViewState(), note: annotation.meta.noteId }))` and shows a toast.

After shared notes finish loading for the first model, apply a pending `note` as follows:
- If an annotation has that `meta.noteId`, set `highlightedNoteId`, open the panel if it's closed, `scrollIntoView` the card and focus it.
- Otherwise drop the pending note.

Clicking another card or closing the panel clears the highlight.

The bookmark link is `getViewState()` with the camera replaced by the bookmark's `camera`/`target` and projection unchanged.

- [ ] **Step 4: Run them to verify they pass**

Run: `npm run build && npx playwright test tests/playwright/view-links.spec.ts --project=chromium`
Expected: PASS

- [ ] **Step 5: Commit** `feat(view-links): link to a note or a bookmark`

### Task 5: The light viewer: apply and copy the camera

**Files:**
- Modify: `src/views/ViewerComponent.vue`. After `fitCameraToModel` on the first load, apply `readViewFromUrl()?.camera`, using `isUsableTarget` and the projection the light viewer has (perspective only, so ignore the projection and zoom when it is orthographic). Add a "Copy link to this view" button to `.viewer-bottom-actions`.
- Test: `tests/playwright/view-links.spec.ts` (extend). If the harness can't mount `ViewerComponent`, add a `lite: true` option to `Viewer` in `tests/playwright/helpers/viewerServer.ts` that makes the share's initial state `isSingleFile: true`, the same as Nextcloud's `LoadPublicShareListener`, so `main.js` mounts the light viewer in `#content`.

**Interfaces:**
- Consumes: `readViewFromUrl`, `isUsableTarget`, `buildViewUrl`, `copyText`
- Produces: none

- [ ] **Step 1: Write the failing tests**
- `a public link with a view opens the light viewer at that camera`: with `lite: true` and `publicToken` set, the camera position matches within ±1e-3.
- `the light viewer ignores everything but the camera`: a link with `renderMode: 'clay'` throws no console error and leaves the materials unchanged.
- `a visitor's Copy link to this view keeps the page URL and adds the camera`: the copied URL has the page's path and parameters, and its `view` decodes to only the `camera` key.
- `a logged-in user's copy from the Files viewer links to the full viewer`: the path ends `/apps/threedviewer/f/{id}`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run build && npx playwright test tests/playwright/view-links.spec.ts --project=chromium -g "light viewer|visitor|Files viewer"`
Expected: FAIL

- [ ] **Step 3: Implement** as described under Files. For a visitor, the link base is `window.location.href`; for a logged-in user, it is the `/f/{fileId}` link.

- [ ] **Step 4: Run them to verify they pass**

Run: same as Step 2, then the whole spec.
Expected: PASS

- [ ] **Step 5: Commit** `feat(view-links): camera links on public pages and in Files`

### Task 6: Public link to this view, from the full viewer

**Files:**
- Create: `src/utils/linkShares.js`
- Modify: `src/App.vue`, `src/components/SlideOutToolPanel.vue` (a second item "Copy public link to this view", shown only when there are eligible shares; a picker when there are several)
- Test: `tests/unit/utils/linkShares.test.js`, `tests/playwright/view-links.spec.ts` (extend)

**Interfaces:**
- Produces (section 3, embedding, reuses these):
  - `listLinkShares(path: string): Promise<Array<{ id: string, token: string, url: string, label: string, created: number, hasPassword: boolean, expires: number|null, canDownload: boolean }>>`. It sends `GET` `generateOcsUrl('apps/files_sharing/api/v1/shares')` with `path`, `reshares=false`, `subfiles=false` and keeps `share_type === 3` (link shares). It returns `[]` on any error.
  - `pickableShares(shares, now = Date.now())`. It drops expired shares and sorts newest first.

- [ ] **Step 1: Write the failing tests.** The unit tests cover:
- mapping a captured OCS response (two link shares and one user share) to two entries;
- dropping an expired share;
- returning `[]` on a 404 and on a network error.

The Playwright test `a user who manages a link share copies its URL with the camera`: the harness answers the OCS shares route with one link share. The copied link is that share's `url` with `view`, holding only the camera. With no share the item is absent; with two, a picker lists both by label and date.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/unit/utils/linkShares.test.js`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement.** The full viewer builds the path from `dir` + `filename`. It fetches shares lazily, the first time the tools panel opens for a model, not on load. The link contains only the camera, because public pages apply nothing else.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx jest tests/unit/utils/linkShares.test.js && npm run build && npx playwright test tests/playwright/view-links.spec.ts --project=chromium`
Expected: PASS

- [ ] **Step 5: Commit** `feat(view-links): copy a public link to this view`

### Task 7: Docs and changelog

**Files:**
- Modify: `docs/TECHNICAL.md` (a "View Links" section covering the parameter format and version, what each viewer applies, the validation rules, and the legacy `cam`), `CHANGELOG.md` (one "Added" entry under `[Unreleased]`, plus a note that the camera-only "Copy View Link" now carries the whole view), `src/components/HelpPanel.vue` (if not already done in Task 2)

- [ ] **Step 1: Write the docs**
- [ ] **Step 2: Run the full gate:** `npm run lint && npm run stylelint && npx jest && npm run build && npx playwright test --project=chromium`. Expected: 0 lint errors, everything else passes.
- [ ] **Step 3: Commit** `docs: describe view links`
