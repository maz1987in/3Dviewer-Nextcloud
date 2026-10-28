# Version Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare the open model with an earlier Nextcloud version of the same file, side by side or as a see-through overlay.

**Architecture:** Versions are listed and downloaded straight from Nextcloud's `versions` WebDAV collection in the browser, so Nextcloud's own permission checks apply and the app adds no server code. The earlier version loads through the existing comparison path (`useComparison`), which gains a version source and an overlay mode. A new dialog lists the versions; the tools panel gets one new button.

**Tech Stack:** Vue 3, three.js r186, `@nextcloud/axios`, `@nextcloud/router`, `@nextcloud/auth`, `@nextcloud/vue` (NcDialog), Jest (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-viewer-tools-design.md` (section "1. Version comparison", plus Goals, Non-goals, Anti-goals)

## Global Constraints

- Nextcloud 31–35: `appinfo/info.xml` keeps `<nextcloud min-version="31" max-version="35"/>`.
- Every string goes through `t('threedviewer', …)` (or `n()` for plurals); after adding strings run `npm run i18n:sync`, and `npm run i18n:check` reports no ERROR.
- Every new control is a native `button`/`input`/`select` with a visible or `aria-label` name; toggles carry `aria-pressed`; status text sits in an `aria-live="polite"` region. Same standard as `tests/playwright/tool-panel-keyboard.spec.ts`.
- Nothing new loads until used: new Vue components are imported with `defineAsyncComponent`. `npm run build` (which runs `size:check`) passes with every existing budget in `scripts/check-bundle-size.mjs` unchanged.
- The version ghost is never in an export or a thumbnail. Thumbnails render `modelRoot` in their own scene (`src/thumbnails/renderThumbnail.js`), and the comparison model is not under `modelRoot`; keep it that way.
- No public-share access to versions: the button is hidden when `isPublicShare()` (`src/composables/usePublicShare.js`) is true.
- No new server routes. If one turns out to be unavoidable, stop and report: it must check access like `FileController` and carry CSRF protection (#235).
- Commits use conventional types (`feat`, `fix`, `test`, `docs`, `chore`), scope `comparison`. **No `Co-Authored-By` trailer.** Do not push and do not open a PR.
- CHANGELOG entries go under `## [Unreleased]` → `### Added`.
- Never bind-mount the repo or a worktree into a Nextcloud container (the image's rsync deletes the source). Copy files in with `docker cp`.
- Verify before each commit: `npm run lint`, `npm run stylelint`, and the task's tests.

## Review Focus

1. A file that was never edited has no earlier versions: the dialog says "No earlier versions", with no error toast. (Task 2: `listVersions` on a collection with only itself; Task 4: Playwright empty state.)
2. The Versions app is disabled: the PROPFIND returns 404 or 405, and the dialog shows the same empty state rather than an error. (Task 2 tests.)
3. A share recipient opens a file shared with them. Versions list when Nextcloud allows it; any other refusal shows "Couldn't load the versions" inside the dialog and leaves the viewer usable. (Task 1 records the real behaviour; Task 2 test for 403.)
4. An earlier version fails to parse (an old corrupt upload): the dialog closes, an error toast names the version date, comparison mode exits, and the open model is untouched. (Task 3 test.)
5. The user closes the viewer or opens another model while a version downloads: the download is aborted, and no ghost or comparison model attaches to the next model. (Task 3 test.)

---

### Task 1: Record what Nextcloud's versions API really returns

**Files:**
- Create: `tests/fixtures/versions/owner-two-versions.xml`, `tests/fixtures/versions/only-current.xml`, `tests/fixtures/versions/recipient.xml` (raw PROPFIND bodies captured from a real server; replace user names and hosts with `alice`, `bob` and `localhost`)
- Modify: `docs/TECHNICAL.md` (new subsection "File versions")

This task decides the facts the parser in Task 2 relies on. No product code.

- [ ] **Step 1:** Start a Nextcloud 31 container and a Nextcloud 35 container (`nextcloud:31-apache`, `nextcloud:35-apache`, or the closest tags). Do not mount the repo; the app isn't needed for this task.
- [ ] **Step 2:** As `alice`, upload `a.stl`, then upload it again twice (PUT over WebDAV), so it has earlier versions. Share it with `bob`.
- [ ] **Step 3:** For each server, as `alice` and then `bob`, run:

```bash
curl -s -u alice:alice -X PROPFIND -H 'Depth: 1' \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns" xmlns:oc="http://owncloud.org/ns"><d:prop><d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><nc:version-label/><nc:version-author/></d:prop></d:propfind>' \
  "http://localhost:8080/remote.php/dav/versions/alice/versions/<fileId>"
```

Also GET one version href and confirm the bytes match the earlier upload.
- [ ] **Step 4:** Write down in `docs/TECHNICAL.md` → "File versions":
  - whether the response lists the current version as an entry, and how to tell it apart (for example, its href ends in the file's mtime);
  - which props come back on 31 and on 35;
  - what `bob` gets: his own `versions/bob/versions/<fileId>`, a 403, or a 404;
  - the status code when the `files_versions` app is disabled (`occ app:disable files_versions`).
- [ ] **Step 5:** Save the three bodies as the fixtures above.
- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/versions docs/TECHNICAL.md
git commit -m "docs(comparison): record what the versions API returns on Nextcloud 31 and 35"
```

### Task 2: List and download versions

**Files:**
- Create: `src/utils/fileVersions.js`
- Test: `tests/unit/utils/fileVersions.test.js`

**Interfaces:**
- Consumes: the facts and fixtures from Task 1.
- Produces:
  - `typedef Version = { id: string, url: string, mtime: number /* ms */, size: number, label: ?string, author: ?string }`
  - `versionsUrl(userId: string, fileId: number|string): string`. This is `generateRemoteUrl('dav') + '/versions/' + encodeURIComponent(userId) + '/versions/' + fileId`.
  - `parseVersions(xmlText: string, { currentMtime = null } = {}): Version[]`. It returns entries newest first. It leaves out the collection's own entry, and the current version by whatever rule Task 1 recorded.
  - `listVersions({ userId, fileId, currentMtime = null, signal }): Promise<Version[]>`. It resolves `[]` on 404 or 405, and rejects on any other non-2xx status.
  - `fetchVersion(version: Version, { signal } = {}): Promise<ArrayBuffer>`

- [ ] **Step 1: Write the failing tests**

```js
describe('parseVersions', () => {
	test('lists earlier versions newest first, without the collection or the current version', () => {
		const versions = parseVersions(readFixture('owner-two-versions.xml'), { currentMtime: CURRENT_MTIME })
		expect(versions).toHaveLength(2)
		expect(versions[0].mtime).toBeGreaterThan(versions[1].mtime)
		expect(versions.every(v => v.url.includes('/versions/alice/versions/'))).toBe(true)
		expect(versions.every(v => Number.isFinite(v.size) && v.size > 0)).toBe(true)
	})
	test('a file never edited has none', () => {
		expect(parseVersions(readFixture('only-current.xml'), { currentMtime: CURRENT_MTIME })).toEqual([])
	})
	test('missing label and author read as null', () => { /* from a fixture entry without them */ })
})
describe('listVersions', () => {
	test.each([404, 405])('resolves [] when the server answers %i', async (status) => { /* axios mock */ })
	test('rejects on 403', async () => { /* axios mock → expect(...).rejects */ })
	test('sends PROPFIND with Depth 1 to versionsUrl', async () => { /* assert method, header, url */ })
})
test('fetchVersion resolves the body as an ArrayBuffer', async () => { /* axios mock, responseType arraybuffer */ })
```

Set `CURRENT_MTIME` from the fixture, by the rule Task 1 recorded.

- [ ] **Step 2:** Run `npx jest tests/unit/utils/fileVersions.test.js`. Expected: FAIL, because the module is not found.
- [ ] **Step 3:** Implement `src/utils/fileVersions.js` with `@nextcloud/axios` (`method: 'PROPFIND'`, `headers: { Depth: '1' }`) and the browser `DOMParser`. Match props by namespace URI and local name, not by prefix.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(comparison): list and download a file's earlier versions`

### Task 3: Load an earlier version as the comparison model

**Files:**
- Modify: `src/composables/useComparison.js` (beside `loadComparisonModelFromPath`, around lines 163–290; return block around line 1460)
- Test: `tests/unit/composables/comparisonVersion.test.js`

**Interfaces:**
- Consumes: `fetchVersion` (Task 2); the existing `loadComparisonModelFromArrayBuffer(arrayBuffer, extension, filename, context)` and `loadModelWithDependencies(fileId, filename, extension, dirPath)`.
- Produces, all added to the returned object:
  - `comparisonSource: Readonly<Ref<'file'|'version'|null>>`
  - `comparisonVersion: Readonly<Ref<?Version>>`
  - `loadComparisonModelFromVersion(version: Version, file: { fileId, filename, dirPath }, context): Promise<object>`. It uses the earlier version's bytes for the main file. For `['obj', 'gltf', 'fbx', '3ds', 'dae']` it takes the supporting files from `loadModelWithDependencies` and discards that call's `mainFile`. On failure it sets `comparisonError`, leaves `comparisonModel` null and rethrows. It aborts through the existing `abortController`.
- `clearComparison` resets `comparisonSource` and `comparisonVersion` to null.

- [ ] **Step 1: Write the failing tests**:
  - `loads the version's bytes, not the current file's`: mock `fetchVersion` to return bytes A and the file endpoint to return bytes B, and assert that the loader received A.
  - `takes supporting files from the current folder for multi-file formats`: `.obj`, with the dependencies from `loadModelWithDependencies` passed in `context.additionalFiles`.
  - `failure leaves no comparison model`: the loader throws, so `comparisonModel` is null, `comparisonError` is set, and the promise rejects.
  - `abort stops the download`: call `clearComparison()` mid-fetch, and the fetch's `signal.aborted` is true and `comparisonModel` stays null.
  - `source and version are recorded`.
- [ ] **Step 2:** Run `npx jest tests/unit/composables/comparisonVersion.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Reuse the multi-file branch of `loadComparisonModelFromPath` rather than copying it, by extracting a shared helper inside the composable.
- [ ] **Step 4:** Run the tests, then the existing `npx jest tests/unit/comparisonUnits.test.js`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(comparison): load an earlier version of the open file as the comparison model`

### Task 4: Overlay the earlier version as a ghost

**Files:**
- Modify: `src/composables/useComparison.js`
- Test: `tests/unit/composables/comparisonOverlay.test.js`

**Interfaces:**
- Consumes: the comparison wrapper layout that `fitBothModelsToView` builds (`useComparison.js` ~631–1100); `showStandIn`/`restoreOwnMaterial` from `src/utils/materialStandIns.js`.
- Produces:
  - `overlayActive: Readonly<Ref<boolean>>`
  - `setOverlay(on: boolean, originalRoot: THREE.Object3D, fitFunction: Function, scene: THREE.Scene): void`
  - `GHOST_OPACITY = 0.35` and `GHOST_COLOR = 0x5b9bd5`, exported constants

Behaviour:
- When on, every mesh of the comparison model shows a stand-in `MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: GHOST_OPACITY, depthWrite: false })`, with one shared material.
- The comparison model is placed so that its file coordinates coincide with the open model's. Undo whatever side-by-side offset and wrapper transform `fitBothModelsToView` applied, then give it the open model root's world transform. Never align by bounding boxes (spec, "Overlay alignment").
- When off, it restores the own materials and calls `fitBothModelsToView(originalRoot, comparisonModel, fitFunction, scene)` again.
- `clearComparison` turns it off first.

- [ ] **Step 1: Write the failing tests.** Build the open model and the version from the same geometry, process both the way the viewer does (centre the open one, then run `fitBothModelsToView`), and assert:
  - `an identical version sits exactly on the open model`: the two world `Box3`s are equal within 1e-6.
  - `shared parts stay put when the earlier version lacks a part`: the version has one cube and the open model has that cube plus a second one, and the first cube's world vertices coincide within 1e-6.
  - `ghost uses one translucent material and turning off restores the own ones`
  - `turning off puts the models side by side again`: the world boxes no longer intersect.
  - `clearComparison turns the overlay off`
- [ ] **Step 2:** Run `npx jest tests/unit/composables/comparisonOverlay.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `setOverlay`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(comparison): overlay an earlier version on the open model as a ghost`

### Task 5: Dialog, panel button and overlay switch

**Files:**
- Create: `src/components/VersionPickerDialog.vue`; `tests/playwright/version-comparison.spec.ts`
- Modify:
  - `src/components/SlideOutToolPanel.vue`: Analyze section, after the Comparison button (~line 194), plus the `emits` list (~line 750);
  - `src/App.vue`: an `@compare-version` handler beside `onToggleComparison` (~line 744);
  - `src/components/ThreeViewer.vue`: the comparison controls bar (~line 306), plus a new exposed method;
  - `src/config/icon-paths.js`: a `history` icon, added the way `scripts/sync-icon-paths.mjs` documents;
  - `l10n/en.json`, via `npm run i18n:sync`.
- Test: `tests/unit/versionPickerDialog.test.js`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - **The panel:** it emits `compare-version`. The button is hidden when `isPublicShare()` is true, and disabled while `!modelLoaded || comparisonMode`.
  - **`ThreeViewer`:** it exposes `startVersionComparison(): Promise<void>`. That enters comparison mode and opens the dialog. Choosing a version loads it and adds it to the scene through the same post-load path the file picker uses: extract the scene-adding block of `toggleComparisonMode` (~2958–3060) into `addLoadedComparisonModel()` and call it from both. Cancelling exits comparison mode.
  - **`VersionPickerDialog` props:** `{ fileId, filename, userId, multiFile: boolean }`. It emits `pick(version)` and `cancel`.
  - **The overlay switch:** in the comparison controls bar, shown only when `comparisonSource === 'version'`. It's a `button.comparison-btn` with `aria-pressed`.

Exact copy:
- the panel button: `'Compare with earlier version'`;
- the dialog title: `'Earlier versions'`;
- the empty state: `'No earlier versions'`;
- the error state: `"Couldn't load the versions"`;
- the note shown when `multiFile`: `'Supporting files such as textures are loaded as they are now.'`;
- the diff table's column labels: `'This version'` and the version date, from `Intl.DateTimeFormat` in the user's locale with date and time;
- the overlay button: `'Overlay'`, title `'Show the earlier version on top of this one'`;
- the load-failure toast: `t('threedviewer', "Couldn't open the version from {date}", { date })`.

Each version row is one `button` showing the date, the size (`formatFileSize`), and the author and label when present.

- [ ] **Step 1: Write the failing component test** (`tests/unit/versionPickerDialog.test.js`, following `tests/unit/toggleSwitchRow.test.js`):
  - it lists rows newest first;
  - it shows the empty state for `[]`;
  - it shows the error state when `listVersions` rejects;
  - the multi-file note appears only when `multiFile`;
  - clicking a row emits `pick` with that version.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the dialog, the panel button, the App handler, `startVersionComparison`, the overlay button and the icon. Run `npm run i18n:sync`.
- [ ] **Step 4:** Run the component test. Expected: PASS.
- [ ] **Step 5: Write the Playwright spec.** Serve the built app the way `tests/playwright/inspection-tools.spec.ts` does; move its server and page helpers to `tests/playwright/helpers/` if you reuse them. Mock the versions PROPFIND with `tests/fixtures/versions/owner-two-versions.xml`, and the version GET with a second STL. Then check:
  - `picking a version shows both models and labels the table`
  - `overlay toggles and reports its state`: `aria-pressed` reads `true`, then `false`.
  - `no earlier versions shows the empty state`
  - `public share links have no version button`
  - `keyboard: the button, a row and the overlay switch work with Enter`
- [ ] **Step 6:** Run `npm run build && npx playwright test tests/playwright/version-comparison.spec.ts`. Expected: PASS, and `size:check` passes.
- [ ] **Step 7: Commit**: `feat(comparison): compare the open model with an earlier version of its file`

### Task 6: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `### Added`, add:

  "Compare a model with an earlier version of the same file: pick one of the versions Nextcloud kept, and see the two side by side with what changed, or the earlier one as a see-through ghost over the current one. Supporting files such as textures are loaded as they are now."

- [ ] **Step 2: Commit**: `docs(comparison): changelog for version comparison`
