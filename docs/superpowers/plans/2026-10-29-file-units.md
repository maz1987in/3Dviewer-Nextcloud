# File Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people who can edit a file say what unit a unitless model (STL, OBJ, PLY, OFF, 3DS, an FBX without a unit scale) was drawn in, saved with the file for everyone who can see it, so sizes, measurement, Print check and Send to Slicer come out right.

**Architecture:** The app already turns every format into "millimetres per scene unit" in `src/utils/sourceUnits.js`; a chosen unit becomes an override at that one point, and everything downstream (stats, measurement, Print check, 3MF/USDZ export, comparison) follows. The chosen unit is stored server-side per file id in a new `threedviewer_file_settings` table, read and written through routes modelled on the notes routes (`NoteAccess` for rights, a `PublicShareController` for public links, a daily orphan cleanup). A shared `FileUnitControl.vue` shows the unit in the stats panel and the Print check card: a select for editors, text for everyone else.

**Tech Stack:** Vue 2/3-compat Options+Composition API (as the repo uses), three.js, Jest, Playwright; PHP 8.1+ Nextcloud app framework (QBMapper, migrations, TimedJob), PHPUnit.

**Spec:** `docs/superpowers/specs/2026-10-28-views-units-embed-scans-design.md`, section "2. File units" plus Goals, Anti-goals and Decisions. Point-cloud units (LAS/LAZ/E57 coordinate systems, the metres default for scans) belong to the point-clouds plan, not this one.

## Global Constraints

- Nextcloud 31–35 (`appinfo/info.xml` `<nextcloud min-version="31" max-version="35"/>`).
- Every route that changes data checks the request token and the user's permission on the file, as the notes routes do (`NoteAccess`); no route on the new controllers carries `#[NoCSRFRequired]` except the public read.
- A unit setting never changes the file. It rescales numbers only, never the model in the scene.
- The unit list, exactly: millimetres, centimetres, metres, inches, feet, US survey feet. Keys `mm`, `cm`, `m`, `in`, `ft`, `us-ft`; millimetres per unit `1`, `10`, `1000`, `25.4`, `304.8`, `1200000 / 3937`.
- Changeable formats: `stl`, `obj`, `ply`, `off`, `3ds`, and `fbx` only when `fbxUnit(root)` is null. Every other format shows its unit read-only. G-code is never changeable.
- The default stays today's: the format's own default from `millimetresPerFileUnit` (millimetres for STL/OBJ/PLY/OFF/3DS, centimetres for an FBX without a unit).
- The measurement tool's display-unit menu (`VIEWER_CONFIG.measurement.unitScales`) is unchanged: it is the unit numbers are *shown* in; this feature sets the file's *source* unit.
- On a public link the unit is read-only.
- Every string goes through `t('threedviewer', …)` (the i18n scanner only sees that form or `this.t(`); British spelling in copy, as the app's strings use; `npm run i18n:sync` after adding strings.
- Controls work from the keyboard and are announced: native `<select>` with a `<label>`, status text in a `role="status"` region.
- Bundle budgets in `scripts/check-bundle-size.mjs` hold (app chunk `maxGzip` 108000).
- Commits: conventional types only (`feat`, `fix`, `docs`, `test`, `refactor`, …), no Co-Authored-By trailer. CHANGELOG entries under `[Unreleased]`. Nothing is pushed without asking.
- Never mount the repo into a container. PHP runs only in containers, on copies:
  - **PHP unit, psalm, cs, openapi** — in `tdv-php` (PHP 8.3), on a fresh copy:
    `D=/w35/units-$(date +%s); docker exec tdv-php mkdir -p $D && git ls-files -co --exclude-standard -z | COPYFILE_DISABLE=1 tar --no-xattrs --null -cf - -T - | docker exec -i tdv-php tar -xf - -C $D && COPYFILE_DISABLE=1 tar --no-xattrs -cf - vendor vendor-bin | docker exec -i tdv-php tar -xf - -C $D`
    then `docker exec -w $D tdv-php php vendor/bin/phpunit -c tests/phpunit.xml` (baseline on main: 712 tests OK, 4 skipped). OpenAPI: `docker exec -w $D tdv-php php vendor/bin/generate-spec`, then copy `openapi.json` back with `docker exec -w $D tdv-php cat openapi.json > openapi.json`.
  - **Integration (database) and HTTP suites** — in `tdv-188-test` (Nextcloud 35, SQLite). Move its app copy aside with `mv`, never `rm`: `docker exec tdv-188-test mv /var/www/html/custom_apps/threedviewer /var/www/html/tdv-old-$(date +%s)`, recreate `/var/www/html/custom_apps/threedviewer` from the same tar stream as above (plus `vendor vendor-bin`), `chown -R www-data`, then `occ upgrade` (or `occ migrations:migrate threedviewer` when the version hasn't moved) and run `vendor/bin/phpunit -c tests/phpunit.integration.xml` / `TDV_HTTP_BASE=http://localhost vendor/bin/phpunit -c tests/phpunit.http.xml` as `www-data` from the app dir. CI runs both suites again on MySQL and PostgreSQL after the push.

## Review Focus

1. **A unit that arrives after the model has changed.** The setting is fetched after the model loads; if the user opens another file first, the late answer must not rescale the new model. Pinned by `useFileUnit` "ignores an answer for a model that has since been replaced" (Task 4).
2. **Saving fails (network, 403 after rights were revoked, 409/500).** The select must go back to the unit actually in force, and say so, not show a unit the numbers don't use. Pinned by `useFileUnit` "keeps the unit in force when saving fails" (Task 4).
3. **Two editors set the unit at once.** The second insert must not 500 on the unique index; last write wins. Pinned by `FileSettingsServiceTest::testASecondWriterUpdatesTheRowTheFirstMade` (Task 3) and the mapper integration test (Task 2).
4. **A file whose format records a unit, or an FBX with a unit scale, receives a stored unit** (set before the file was replaced, or by a crafted request). The stored value must be ignored, never applied. Pinned by `sourceUnits` "ignores a chosen unit for a format that records its own" (Task 1) and the 400 for a non-unitless extension (Task 3).
5. **Send to Slicer with a non-millimetre model and a passthrough list that includes its extension.** Sending the raw file would hand the slicer inches as millimetres; it must convert instead. Pinned by `SlicerModal` "converts a passthrough format whose unit was set to something other than millimetres" (Task 6).

---

### Task 1: The chosen unit in `sourceUnits.js`

**Files:**
- Modify: `src/utils/sourceUnits.js`
- Test: `tests/unit/utils/sourceUnits.test.js`

**Interfaces:**
- Produces:
  - `FILE_UNITS`: frozen `{ [key: 'mm'|'cm'|'m'|'in'|'ft'|'us-ft']: { millimetres: number, suffix: string, display: string } }`. Suffixes `mm`, `cm`, `m`, `in`, `ft`, `ft (US)`. `display` is the `unitScales` key the panels start in: `millimeters`, `centimeters`, `meters`, `inches`, `feet`, `feet` (US survey feet read in feet; the 2 ppm difference is shown honestly, as international feet).
  - `isUnitChangeable(filename: ?string, root?: ?Object3D): boolean`
  - `millimetresPerFileUnit(filename, root = null, chosenUnit = null): number`, `millimetresPerUnit(filename, root = null, chosenUnit = null): number`, `defaultDisplayUnit(filename, root = null, chosenUnit = null): string`. A `chosenUnit` that is not a `FILE_UNITS` key, or given for a file where `isUnitChangeable` is false, is ignored.
  - `fileUnitKey(millimetres: number): ?string`: the `FILE_UNITS` key within a relative 1e-9, else null.
  - `unitSuffix(millimetres: number): string`: the `FILE_UNITS` suffix, else `µm` (0.001), `dm` (100), `km` (1e6), `yd` (914.4), else `` `${formatLength(millimetres)} mm` ``.
  - `assumesMillimetres` stays for now; Task 5 removes it together with its one caller.

- [ ] **Step 1: Write the failing tests** in `tests/unit/utils/sourceUnits.test.js`, new `describe('a unit chosen for the file')`:

```js
it('applies to the formats that record no unit', () => {
	for (const name of ['a.stl', 'a.obj', 'a.ply', 'a.off', 'a.3ds']) {
		expect(millimetresPerFileUnit(name, null, 'in')).toBe(25.4)
		expect(isUnitChangeable(name)).toBe(true)
	}
	expect(millimetresPerFileUnit('a.stl', null, 'us-ft')).toBeCloseTo(304.8006096, 7)
})
it('applies to an FBX without a unit scale, and not to one with', () => {
	const bare = new THREE.Group()
	const scaled = new THREE.Group(); scaled.userData.unitScaleFactor = 1
	expect(millimetresPerFileUnit('a.fbx', bare, 'm')).toBe(1000)
	expect(isUnitChangeable('a.fbx', scaled)).toBe(false)
	expect(millimetresPerFileUnit('a.fbx', scaled, 'm')).toBe(10)
})
it('ignores a chosen unit for a format that records its own', () => {
	expect(millimetresPerFileUnit('a.glb', null, 'in')).toBe(1000)
	expect(millimetresPerFileUnit('a.3mf', null, 'in')).toBe(1)
	expect(isUnitChangeable('a.gcode')).toBe(false)
})
it('ignores an unknown unit', () => {
	expect(millimetresPerFileUnit('a.stl', null, 'furlong')).toBe(1)
	expect(millimetresPerFileUnit('a.stl', null, 'constructor')).toBe(1)
})
it('still divides out the viewer\'s rescale', () => {
	const root = new THREE.Group(); root.userData.viewerScale = 0.1
	expect(millimetresPerUnit('a.obj', root, 'cm')).toBe(100)
})
it('starts the panels in the chosen unit', () => {
	expect(defaultDisplayUnit('a.stl', null, 'in')).toBe('inches')
	expect(defaultDisplayUnit('a.stl', null, 'us-ft')).toBe('feet')
})
it('names units', () => {
	expect(fileUnitKey(25.4)).toBe('in')
	expect(fileUnitKey(914.4)).toBeNull()
	expect(unitSuffix(1200000 / 3937)).toBe('ft (US)')
	expect(unitSuffix(0.001)).toBe('µm')
	expect(unitSuffix(914.4)).toBe('yd')
	expect(unitSuffix(2)).toBe('2.000 mm')
})
```

- [ ] **Step 2: Run** `npx jest tests/unit/utils/sourceUnits.test.js` — Expected: FAIL (`isUnitChangeable is not a function`).
- [ ] **Step 3: Implement** the Interfaces above in `src/utils/sourceUnits.js`. Look keys up with `Object.hasOwn(FILE_UNITS, key)`. Extend the file's header comment with a short "a unit chosen for the file" paragraph.
- [ ] **Step 4: Run** `npx jest tests/unit/utils/sourceUnits.test.js`, then the full `npx jest` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(units): a unit chosen for a file that records none`

### Task 2: Storage — migration, entity, mapper, orphan cleanup

**Files:**
- Create: `lib/Migration/Version031000Date20261029000000.php`, `lib/Db/FileSetting.php`, `lib/Db/FileSettingMapper.php`, `lib/Cron/CleanupOrphanFileSettings.php`
- Modify: `appinfo/info.xml` (add `<job>OCA\ThreeDViewer\Cron\CleanupOrphanFileSettings</job>`)
- Test: `tests/unit/Migration/Version031000Date20261029000000Test.php`, `tests/integration/FileSettingMapperTest.php`, `tests/unit/Cron/CleanupOrphanFileSettingsTest.php`

**Interfaces:**
- Produces:
  - Table `threedviewer_file_settings`: `id` BIGINT autoincrement PK; `file_id` BIGINT not null, unique index `tdv_fset_file`; `unit` STRING(8) nullable; `updated_by` STRING(64) not null; `updated_at` BIGINT not null. One table for every per-file setting: the point-cloud plan adds its up-direction column here.
  - `FileSetting` entity: `fileId` int, `unit` ?string, `updatedBy` string, `updatedAt` int (same docblock style as `Note`).
  - `FileSettingMapper extends QBMapper<FileSetting>`: `findByFile(int $fileId): ?FileSetting`, `deleteByFile(int $fileId): void`, `deleteOrphans(): int` (the `NoteMapper::deleteOrphans` join on `filecache`, chunked by 500).
  - `CleanupOrphanFileSettings extends TimedJob`: interval 86400, time-insensitive, logs `'3D Viewer removed unit settings of deleted models'` with the count when > 0.

- [ ] **Step 1: Write the failing tests**
  - Migration test, modelled on `Version030600Date20260928000000Test`: creates the table with the columns above and the unique index on `file_id`; returns the schema untouched when the table exists.
  - Mapper integration test, modelled on `NoteMapperTest`: `testFindByFileReturnsNullWhenUnset`, `testTheUniqueIndexRefusesASecondRowForAFile` (second `insert` for the same `file_id` throws `OCP\DB\Exception` with `getReason() === Exception::REASON_UNIQUE_CONSTRAINT_VIOLATION`), `testDeleteOrphansKeepsSettingsOfExistingFiles`.
  - Cron test: `run()` calls `deleteOrphans()` once.
- [ ] **Step 2: Run** the PHP unit suite in `tdv-php` and the integration test in `tdv-188-test` (Global Constraints) — Expected: FAIL (classes don't exist).
- [ ] **Step 3: Implement** the four classes and the `info.xml` job line, docblocks in the notes classes' style (why the key is the file id: it follows renames and moves; a trashed file keeps its row until permanently deleted).
- [ ] **Step 4: Run** both suites — Expected: PASS; the unit suite is 712 + the new tests, all OK.
- [ ] **Step 5: Commit** `feat(units): store a unit per file`

### Task 3: Routes — read and save, signed in and on public links

**Files:**
- Create: `lib/Service/FileSettingsService.php`, `lib/Service/Exception/InvalidFileSettingException.php`, `lib/Controller/FileSettingsController.php`, `lib/Controller/PublicFileSettingsController.php`
- Modify: `lib/Service/NoteAccess.php`, `lib/Service/NoteAccessResult.php`, `openapi.json` (regenerated)
- Test: `tests/unit/Service/FileSettingsServiceTest.php`, `tests/unit/Controller/FileSettingsControllerTest.php`, `tests/unit/Controller/PublicFileSettingsControllerTest.php`, `tests/unit/Service/NoteAccessTest.php`, `tests/http/FileSettingsHttpTest.php`, `tests/http/WriteRoutesCsrfHttpTest.php`

**Interfaces:**
- Consumes: `FileSettingMapper` (Task 2); the unit keys from Global Constraints.
- Produces:
  - `NoteAccessResult(bool $canEdit, string $fileName = '')`: `NoteAccess::forUser` fills `fileName` with the name of the file it judged by (the updateable one, else the first).
  - `FileSettingsService`: `UNITS = ['mm', 'cm', 'm', 'in', 'ft', 'us-ft']`, `UNITLESS_FORMATS = ['stl', 'obj', 'ply', 'off', '3ds', 'fbx']`; `unit(int $fileId): ?string`; `setUnit(int $fileId, string $fileName, mixed $unit, string $uid): ?string` — `null` removes the row; a value not in `UNITS`, or a file whose lower-cased extension is not in `UNITLESS_FORMATS`, throws `InvalidFileSettingException`; insert, and on `REASON_UNIQUE_CONSTRAINT_VIOLATION` find the row and update it.
  - `GET /apps/threedviewer/api/file-settings/{fileId}` and `PUT` (body `{unit}`) on `FileSettingsController extends BaseController`, `#[NoAdminRequired]`, no `#[NoCSRFRequired]`. Both answer `{canEdit: bool, unit: ?string}`. No access → 404 `{error: 'Not found'}`; PUT without edit rights → 403 `{error: 'This model is view-only for you'}`; invalid → 400 `{error: <message>}`.
  - `GET /ocs/v2.php/apps/threedviewer/public/file-settings/{token}/{fileId}` on `PublicFileSettingsController extends PublicShareController` (`#[PublicPage]`, `#[NoCSRFRequired]`, `#[ApiRoute]`), answering a plain `JSONResponse` `{canEdit: false, unit}` for the file the share resolves to (`ShareFileService::getFileFromShare`), 404 otherwise. Its share lookup copies `PublicNotesController`'s (`share()` memo, `isValidToken`, `isPasswordProtected`, `getPasswordHash`), as that class copies `PublicFileController`'s.

- [ ] **Step 1: Write the failing tests**
  - `FileSettingsServiceTest`: `testUnitIsNullWhenNoneIsStored`; `testStoresAKnownUnitForAUnitlessFormat` (`model.STL`, `in` → `in`, `updatedBy` = uid); `testNullRemovesTheUnit`; `testRefusesAnUnknownUnit` (`'furlong'`, `42`, `['in']`); `testRefusesAFormatThatRecordsItsOwnUnit` (`model.glb`); `testASecondWriterUpdatesTheRowTheFirstMade` (mapper `insert` throws the unique-violation `Exception`, then `findByFile` returns the row and `update` is called with the new unit).
  - `FileSettingsControllerTest` (style of `NotesControllerTest`): `testNoRouteOptsOutOfCsrf`; `testInaccessibleFileIs404ForBothRoutes`; `testReadReturnsTheUnitAndTheCallersRights`; `testAViewOnlyUserCannotSave` (403, `setUnit` never called); `testAnInvalidUnitIs400`.
  - `PublicFileSettingsControllerTest` (style of `PublicNotesControllerTest`): extends `PublicShareController`; password-protected share is not authenticated without session; `testReadsTheUnitOfTheFileTheShareResolvesTo` (URL id 99, resolved file 7 → `unit(7)`); unknown share → 404.
  - `NoteAccessTest`: `testReportsTheNameOfTheFileItJudgedBy`.
  - `FileSettingsHttpTest` (style of `NotesHttpTest`): `testAnEditorSetsTheUnitAndARecipientSeesIt`; `testAReadOnlyRecipientCannotSetIt`; `testAStrangerGets404`; `testASessionWriteWithoutTheRequestTokenIsRejected`; `testAPublicLinkShowsTheUnitReadOnly`; `testAPasswordProtectedLinkWithoutThePasswordGetsNothing`; `testTheUnitFollowsARename`.
  - `WriteRoutesCsrfHttpTest`: `testSavingAFilesUnitNeedsTheRequestToken`.
- [ ] **Step 2: Run** the PHP unit suite (`tdv-php`) and `FileSettingsHttpTest` + `WriteRoutesCsrfHttpTest` (`tdv-188-test`) — Expected: FAIL (classes/routes missing). `PublicRouteGuardTest` must pass after Step 3 without new entries in its exception lists.
- [ ] **Step 3: Implement** the Interfaces above. Regenerate `openapi.json` in `tdv-php` and copy it back; run `php-cs-fixer` (`--config=.php-cs-fixer.dist.php --path-mode=intersection` on the new files) and `psalm --threads=1 --no-cache` there.
- [ ] **Step 4: Run** the same suites — Expected: PASS; psalm and cs clean; `openapi.json` diff limited to the new public route.
- [ ] **Step 5: Commit** `feat(units): read and save a file's unit`

### Task 4: Client — API and `useFileUnit`

**Files:**
- Create: `src/utils/fileSettingsApi.js`, `src/composables/useFileUnit.js`
- Test: `tests/unit/utils/fileSettingsApi.test.js`, `tests/unit/composables/useFileUnit.test.js`

**Interfaces:**
- Consumes: the routes of Task 3; `FILE_UNITS`, `isUnitChangeable`, `millimetresPerFileUnit`, `fileUnitKey`, `unitSuffix` (Task 1).
- Produces:
  - `createFileSettingsApi({ fileId, shareToken = null })` → `{ readOnly: boolean, get(): Promise<{canEdit: boolean, unit: ?string}>, setUnit(unit: ?string): Promise<{canEdit: boolean, unit: ?string}> }`. Signed in: `generateUrl('/apps/threedviewer/api/file-settings/{fileId}')` via `@nextcloud/axios` (request token attached). Public: `generateOcsUrl('apps/threedviewer/public/file-settings/{token}/{fileId}')` with `OCS-APIRequest: true`; `canEdit` is always false; `setUnit` throws `'The unit is read-only on a public link'` without a request. A `unit` in a response that isn't a `FILE_UNITS` key reads as null.
  - `useFileUnit()` → `{ state, chosen, describe(filename, root), load(api): Promise<boolean>, set(key: ?string): Promise<boolean>, reset() }`.
    - `state` (ref): `{ millimetres: number, key: ?string, suffix: string, source: 'file'|'chosen'|'default', changeable: boolean, canEdit: boolean, status: ''|'saving'|'saved'|'failed' }`.
    - `chosen` (ref): the chosen key in force, or null.
    - `describe` sets `state` from the format alone (source `'file'` when not changeable, else `'default'`), `chosen` null, `canEdit` false, and starts a new generation.
    - `load` returns false without a request when the file isn't changeable; otherwise applies the answer (`chosen`, `source: 'chosen'` when set, `canEdit`), returning true when `chosen` changed. An answer from an older generation, or a failed request, changes nothing and returns false.
    - `set` sets status `'saving'`, calls `api.setUnit`, and on success applies it (status `'saved'`, returns true); on failure status `'failed'`, `chosen` and `state.key` stay as they were, returns false.

- [ ] **Step 1: Write the failing tests**
  - API: signed-in GET/PUT URLs and body `{unit}`; public GET URL and header; public `setUnit` rejects without calling axios; a bogus `unit` in the response reads as null.
  - Composable: `it('needs no request for a format that records its unit')`; `it('applies the unit the server has for the file')` (`a.stl` + `{canEdit: true, unit: 'in'}` → `chosen` `'in'`, `state.millimetres` 25.4, `source` `'chosen'`, `canEdit` true, `load` resolves true); `it('ignores an answer for a model that has since been replaced')` (load pending, `describe('b.stl')`, answer arrives → `chosen` null, resolves false); `it('keeps the unit in force when saving fails')` (`chosen` `'in'`, `setUnit` rejects → `chosen` `'in'`, `state.key` `'in'`, `status` `'failed'`); `it('says it saved')`; `it('treats a failed read as no unit set')`.
- [ ] **Step 2: Run** `npx jest tests/unit/utils/fileSettingsApi.test.js tests/unit/composables/useFileUnit.test.js` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both modules; doc comments in `notesApi.js`'s style.
- [ ] **Step 4: Run** the same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(units): load and save a file's unit in the viewer`

### Task 5: The full viewer — Units control in stats and Print check

**Files:**
- Create: `src/components/FileUnitControl.vue`
- Modify: `src/components/ThreeViewer.vue` (stats panel "Measurements" section, `applySourceUnits`, the load path beside the notes load, the Print check state object and its events, comparison loads), `src/components/PrintCheckCard.vue`, `src/composables/usePrintCheck.js`, `src/composables/useComparison.js`, `tests/playwright/helpers/viewerServer.ts`
- Test: `tests/unit/fileUnitControl.test.js`, `tests/unit/composables/usePrintCheck.test.js`, `tests/unit/printCheckCard.test.js`, `tests/playwright/file-units.spec.ts`

**Interfaces:**
- Consumes: `useFileUnit`, `createFileSettingsApi` (Task 4); `millimetresPerUnit`/`millimetresPerFileUnit`/`defaultDisplayUnit` with `chosenUnit` (Task 1).
- Produces:
  - `FileUnitControl.vue`: props `unit` (the `state` object), `controlId` (string); emits `set` with a key. Label `t('threedviewer', 'File units')`. Editors: a `<select>` of the six units named `Millimetres`, `Centimetres`, `Metres`, `Inches`, `Feet`, `US survey feet`, described by `t('threedviewer', 'Saved with the file for everyone who can open it')`. Everyone else: the unit's name (or its suffix when it has no name) with `From the file` / `Set for this file` / `Assumed, because this file doesn't record a unit`. A `role="status"` line: `Saving…`, `Saved`, `Couldn't save the units`.
  - `applySourceUnits(filename, root, chosenUnit = null)`.
  - `usePrintCheck(...).unitChanged()`: refreshes fit, estimate and the thickness overlay's limits from the current `mmPerUnit`. `assumesMm` is removed, and with it `assumesMillimetres` and `UNITLESS_MILLIMETRE_FORMATS` in `sourceUnits.js` (and their tests).
  - The control is hidden while no file is open (the demo scene).
  - Print check card prop `state.fileUnit` and event `set-unit`.
  - `loadComparisonModel*` `context.fileUnit` (a key or null), applied as `millimetresPerUnit(filename, object, context.fileUnit ?? null)`. A version comparison passes the open file's `chosen`; a comparison against another file passes null (it is opened by path, and its id is not at hand).
  - Harness `Viewer` options `unit?: string | null` and `unitCanEdit?: boolean`, answering both settings routes and recording PUT bodies on `window.__unitPuts` — or a returned array — for assertions.

- [ ] **Step 1: Write the failing tests**
  - `fileUnitControl.test.js`: editor sees a select with the six options in order and the chosen one selected; changing it emits `set` with `'in'`; a read-only state shows `Inches` and `Set for this file` with no select; a recorded unit shows `From the file`; status text is in `role="status"`.
  - `usePrintCheck.test.js`: `it('refits when the unit changes')` — a 10-unit cube, `mmPerUnit` ref 1 then 25.4 and `unitChanged()` → the fit's model extent grows 25.4×.
  - `printCheckCard.test.js`: the old "Sizes assume millimetres" note is gone; the control renders for a mesh and not for G-code.
  - `file-units.spec.ts` (STL cube of 10 from `stlCube`): `editor sets inches and the sizes follow` (stats X reads `10.000 in`, Print check card shows the select at Inches, one PUT `{unit: 'in'}`); `a saved unit applies on open for a read-only user` (`unit: 'in'`, `unitCanEdit: false` → text `Inches`, `Set for this file`, no select); `a glTF shows metres from the file`; `a failed save leaves the unit in force` (PUT answers 500 → select back at Millimetres, `Couldn't save the units`); `the select works from the keyboard`.
- [ ] **Step 2: Run** `npx jest tests/unit/fileUnitControl.test.js tests/unit/composables/usePrintCheck.test.js tests/unit/printCheckCard.test.js`, then `npm run build && npx playwright test tests/playwright/file-units.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** In the load path: `fileUnit.describe(filename, root)` and `applySourceUnits(filename, root)` where `applySourceUnits` runs today; then, beside the notes load and under the same `fileId !== 'comparison'` guard, `fileUnit.load(createFileSettingsApi({ fileId, shareToken: share?.token ?? null }))` and, when it resolves true, `applySourceUnits(filename, root, fileUnit.chosen.value)` and `printCheck.value?.unitChanged()`. The same follows a successful `set`. `reset()` where the model is cleared (`applySourceUnits(null, null)`). The control sits in the stats panel's Measurements section under its header, and at the top of the Print check card's body, where the note was.
- [ ] **Step 4: Run** the same — Expected: PASS; then `npm run i18n:sync`, `npm run lint`, `npm run stylelint`, `npx jest` (full), `npx playwright test` (full).
- [ ] **Step 5: Commit** `feat(units): choose a file's units in the stats and Print check`

### Task 6: Send to Slicer in millimetres

**Files:**
- Modify: `src/utils/ownDisplayState.js` (add `withMillimetres`), `src/components/SlicerModal.vue`, `src/App.vue` (pass the scale through), `src/components/ThreeViewer.vue` (expose `modelMillimetresPerUnit` and whether the unit was chosen, as App reads other viewer state)
- Test: `tests/unit/utils/ownDisplayState.test.js`; create `tests/unit/slicerModal.test.js`

**Interfaces:**
- Produces:
  - `withMillimetres(root: Object3D, millimetresPerUnit: number, fn: Function): *` — runs `fn` with every mesh's `matrixWorld` scaled by `millimetresPerUnit` about the scene origin, and restores the matrices before returning or throwing. Nested inside `withExportState`.
  - `SlicerModal` props `millimetresPerUnit: Number` (default 1) and `unitChosen: Boolean` (default false). STL, OBJ and PLY exports are written in millimetres. A passthrough file is sent as-is only when `!unitChosen || millimetresPerUnit === 1`; otherwise it is converted.

- [ ] **Step 1: Write the failing tests**
  - `withMillimetres`: a mesh with a vertex at x = 1, factor 25.4 → `STLExporter` output has x = 25.4; after the call `matrixWorld` equals what it was; restored when `fn` throws.
  - `SlicerModal`: `it('writes the STL in millimetres')` (factor 25.4, vertex 1 → 25.4); `it('converts a passthrough format whose unit was set to something other than millimetres')` (`filename` `a.stl`, passthrough `['stl']`, `unitChosen` true, factor 25.4 → the export path runs, the file fetch does not); `it('sends a passthrough file as-is otherwise')`.
- [ ] **Step 2: Run** `npx jest tests/unit/utils/ownDisplayState.test.js tests/unit/slicerModal.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. This also writes a glTF (metres) or an FBX (centimetres) sent to a slicer in millimetres, which the spec's rule ("a slicer reads an STL as millimetres") requires. It gets its own CHANGELOG line in Task 8.
- [ ] **Step 4: Run** the same, then the full `npx jest` — Expected: PASS.
- [ ] **Step 5: Commit** `fix(slicer): send models to the slicer in millimetres`

### Task 7: The light viewer's Size row

**Files:**
- Modify: `src/views/ViewerComponent.vue`
- Test: `tests/playwright/file-units.spec.ts` (light viewer cases)

**Interfaces:**
- Consumes: `createFileSettingsApi` (Task 4); `millimetresPerUnit`, `millimetresPerFileUnit`, `defaultDisplayUnit`, `displayLengthFactor`, `isUnitChangeable` (Task 1); `VIEWER_CONFIG.measurement.unitScales`.
- Produces: the stats panel's Size row reads `{x} × {y} × {z} {suffix}` in `defaultDisplayUnit(filename, root, chosen)`, scaled by `displayLengthFactor`. The light viewer fetches the setting (public on a share page, signed in from Files) only when `isUnitChangeable`, and never shows a unit control: it is read-only there.

- [ ] **Step 1: Write the failing tests** — `light viewer shows the size in the file's unit` (`lite: true`, `unit: 'in'`, cube of 10 → Size `10.00 × 10.00 × 10.00 in`); `light viewer shows millimetres when no unit is set`.
- [ ] **Step 2: Run** `npm run build && npx playwright test tests/playwright/file-units.spec.ts` — Expected: the two new tests FAIL.
- [ ] **Step 3: Implement**, keeping the row's existing number format.
- [ ] **Step 4: Run** the same, then the full `npx playwright test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(units): the light viewer shows sizes in the file's unit`

### Task 8: Docs and release notes

**Files:**
- Modify: `docs/TECHNICAL.md` (a "File units" section and TOC entry: the override point, the table, the routes, who may write, the cleanup job, the slicer rule), `CHANGELOG.md` (`[Unreleased]`: Added — choose the units of a file that records none; Fixed — Send to Slicer sends models in millimetres)

- [ ] **Step 1: Write** both, in the existing sections' style.
- [ ] **Step 2: Run** `npm run i18n:check`, `npm run build` (bundle check), the full Jest and Playwright suites, and the PHP unit suite — Expected: all pass, the app chunk within 108000 gzip.
- [ ] **Step 3: Commit** `docs: describe file units`
