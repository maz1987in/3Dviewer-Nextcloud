# Point Clouds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open laser, drone and phone scans (LAS, LAZ, E57, PCD, XYZ, and a PLY with vertices and no faces) as point clouds. They are coloured by the file's colours, height, intensity or classification, thinned to what the device can draw, and turned the right way up. A note says why the mesh-only tools are off.

**Architecture:** Every scan goes through one pipeline in `src/pointclouds/`.
- **Download.** The viewer downloads a scan as a `Blob`, never one `ArrayBuffer`. The browser keeps a large Blob out of the JS heap.
- **Parse in a worker.** A dedicated worker reads the Blob in windows (`Blob.slice`), with one small reader per format. It writes points into a `PointSink`, which is allocated once at the device's point budget, thins evenly when the file holds more points than that, and re-centres in double precision before writing Float32. The worker sends the typed arrays back as transferables.
- **Build the cloud.** `buildPointCloud` turns them into a `THREE.Points`. Colour-by recolours a `color` attribute on the CPU, so `PointsMaterial`, clipping planes and the thumbnail renderer all work unchanged.
- **Mark it as a scan.** The root carries `userData.tdvPointCloud`, the one content-based signal the rest of the viewer reads. A PLY can be either a mesh or a scan, so the extension alone can't decide.
- **Panel controls.** The full viewer loads the point-cloud controls as an async chunk (`PointCloudControls.vue`), because the App chunk has about 2 KB of headroom. The same chunk holds the list of tools that are off and why. The gated controls in the App chunk only point at that list with `aria-describedby`.
- **Which way is up** is a second file setting, beside the unit, in the same table and routes.

**Tech Stack:** three.js 0.186 (`Points`, `PointsMaterial`, `Raycaster` points threshold), Web Workers (Vite `new Worker(new URL(...), { type: 'module' })`), `laz-perf` 0.0.7 (Apache-2.0, WASM; new dependency), `@xmldom/xmldom` (already a dependency, for E57's XML), Vue 3, Nextcloud app framework (PHP 8.1+, QBMapper, migrations), Jest, Playwright, PHPUnit.

**Spec:** `docs/superpowers/specs/2026-10-28-views-units-embed-scans-design.md`. This plan covers section "4. Point clouds", plus:
- section 2's point-cloud rules: clouds default to metres, and LAS, LAZ and E57 read their unit from the coordinate system;
- section 5's "Which way is up", which applies to point clouds too;
- Goals, Non-goals and Anti-goals;
- these "My calls": point clouds default to metres; Print check and export are off for clouds; transform stays on; exploded view, shading modes and wireframe are off; phones and tablets get a smaller point budget; view links restore point size and colour-by; `.xyz` chemistry files are left alone.

## Global Constraints

- **Nothing slows opening an ordinary model.** Point-cloud code is reached only through the loader registry's dynamic imports, the worker, and the async `PointCloudControls` chunk.
- **Bundle budgets** (`scripts/check-bundle-size.mjs`) hold:
  - `threedviewer-main.mjs` 5800 / 2100;
  - `threedviewer-embed.mjs` 5800 / 2100;
  - App chunk 384000 / 108000.
  - The new worker entry gets its own budget, `point-cloud-worker-*.mjs` 40000 raw / 14000 gzip.
  - A budget is never raised without a ledgered ruling.
- **Parsing runs off the main thread and can be cancelled.** Cancel loading terminates the worker. Inside the thumbnail worker, which is already off the main thread, the same readers run in-line.
- **Budgets and limits** live in one module, `src/pointclouds/limits.js`:
  - `POINT_BUDGET = { desktop: 20_000_000, tablet: 4_000_000, phone: 2_000_000, thumbnail: 300_000 }`;
  - `SCAN_CEILING_BYTES = 2 * 1024 ** 3`;
  - `PLY_MESH_CEILING_BYTES = 500 * 1024 ** 2` (today's server limit).
  - A file loads whole when its point count is at most the budget. A 200 MB uncompressed LAS is about 6M points, so it loads whole on a desktop.
- **Copy** is fixed by this plan. Every string goes through `t('threedviewer', …)` with British spelling, and `npm run i18n:sync` runs after adding strings.
  - Thinning note: `Showing 1 in {n} points` (n = round(total / kept), shown when n ≥ 2), otherwise `Showing {kept} of {total} points` (when kept < total).
  - Ceiling refusal: `This scan is {size}. The viewer opens scans up to 2 GB.`
  - PLY mesh too large: `This model is {size}. The viewer opens models up to 500 MB.`
  - Chemistry XYZ: `This .xyz file lists atoms, not a scan, so it can't be shown here.`
  - Unreadable scan: `This scan couldn't be read: {reason}`
- **The tools that are off for a scan, and their notes** (exact copy, from `POINT_CLOUD_UNAVAILABLE` in `src/pointclouds/unavailable.js`):

  | Tool | Note |
  |---|---|
  | Print check | `A scan is a cloud of points with no closed surface, so there's nothing to check for printing.` |
  | Shading and wireframe | `Colour by takes the place of shading for a scan.` |
  | Exploded view | `A scan is a single cloud of points, with no parts to pull apart.` |
  | Compare and version comparison | `Comparing scans isn't available yet.` |
  | Export | `Export saves meshes, and a scan is points.` |

- **Controls:**
  - Colour by: values `'file' | 'height' | 'intensity' | 'classification' | 'single'`, labelled `File colours`, `Height`, `Intensity`, `Classification`, `Single colour`. Only values whose attribute the cloud has are offered; `height` and `single` always are.
  - Colour by defaults to `'file'` when the cloud has colours, otherwise `'height'`.
  - Point size: 1–10 px, step 0.5, default 2, screen-space (`sizeAttenuation: false`).
- **Which way is up:**
  - Values `'+y' | '-y' | '+z' | '-z'`, labelled `+Y up`, `−Y up`, `+Z up`, `−Z up`.
  - Defaults: `'+z'` for las, laz and e57; `'+y'` for pcd, xyz and ply.
  - The rotation applied to the model root (not the geometry, so notes and view-link cameras stay valid):
    - `+y` is none;
    - `-y` is π about X;
    - `+z` is −π/2 about X;
    - `-z` is +π/2 about X.
  - It is saved per file, like the unit, under the same permissions: anyone who can read the file reads it, and only users with update permission write it.
- **Units:**
  - Clouds default to metres.
  - A LAS or LAZ file whose GeoKeys or WKT name a linear unit records it: `'m'`, `'ft'` or `'us-ft'`, judged by conversion factor (1, 0.3048, 0.3048006096012192), compared with a relative tolerance of 1e-9.
  - E57 always records `'m'`: the standard stores SI metres.
  - A recorded unit is read-only ("From the file"). A cloud with no recorded unit is changeable.
- **Formats and their limits:**
  - LAS 1.2–1.4, point formats 0–10.
  - LAZ point formats 0–3 and 6–8. 4, 5, 9 and 10 are refused with `{reason}` = `LAZ point format {n} isn't supported`.
  - PCD: ascii, binary and binary_compressed.
  - XYZ text with whitespace, comma or semicolon separators. Its columns are x y z, optionally followed by r g b (0–255, or 0–1 floats) or intensity.
  - E57: cartesian Float and ScaledInteger fields, colour, intensity, several scans each with its pose, and the bitpack codec. Spherical-only scans are refused with `{reason}` = `spherical E57 scans aren't supported yet`.
- **Classification palette** (LAS standard classes; any other class `#9e9e9e`):
  - 1 `#9e9e9e`
  - 2 ground `#a0784b`
  - 3 low vegetation `#9acd32`
  - 4 medium vegetation `#3cb043`
  - 5 high vegetation `#1e7b34`
  - 6 building `#e2725b`
  - 7 noise `#ff00ff`
  - 9 water `#3d85c6`
  - 11 road `#7f7f7f`
  - 17 bridge `#b8860b`
- **Other colour-by colours:**
  - Height ramp, low to high: `#30123b`, `#4686fb`, `#1be5b5`, `#a4fc3c`, `#fb8022`, `#7a0403`.
  - Intensity: a grey ramp between the 1st and 99th percentile.
  - Single colour: `#8fa3b3`.
- **Server:** the signed-in file route (`FileController`) allows `SCAN_CEILING_BYTES` for `SupportedFormats::POINT_CLOUD_EXTENSIONS` (`las, laz, e57, pcd, xyz, ply`). Every other model keeps 500 MB.
- **Platform and APIs:** Nextcloud 31–35, OCP APIs only (`tests/unit/NoPrivateServerApiTest.php`). Every route that changes data checks the request token and update permission, as `FileSettingsController` does now.
- **Commits and process:**
  - Conventional commit types, no Co-Authored-By trailer.
  - CHANGELOG entries under `[Unreleased]`. The README's format list is updated in Task 11.
  - Nothing is pushed without asking.
  - Never mount the repo into a container. PHP runs on streamed copies with the scratchpad's `php-tools/` scripts (`php-unit.sh`, `php-tool.sh`, `nc-sync.sh`, `nc-test.sh`).
  - Never write the test server's admin password anywhere.
  - **Downloads need the user's OK first**, stating the filename, source, size and licence. That covers `npm install laz-perf` (Task 9) and the real LAZ and E57 fixtures (Tasks 9, 10).
  - The lockfile is regenerated with npm 10 and no `node_modules` (the scratchpad's `npm10`).

## Review Focus

1. **Survey coordinates in the millions** (a LAS with UTM x ≈ 500 000, y ≈ 4 500 000). Points 1 mm apart stay 1 mm apart, with no banding. Pinned by `pointSink.test.js` "re-centres in double precision" (Task 2) and the LAS fixture with a UTM offset (Task 8).
2. **A chemistry `.xyz`** (an atom count, a comment, then `C 0.1 0.2 0.3` lines). It is never drawn as a scan: the viewer says it lists atoms, and the background thumbnailer skips it. Pinned by `xyz.test.js` "refuses a chemistry file" (Task 3) and the thumbnail sample (Task 11).
3. **Cancel loading during a large scan.** The worker is terminated, no model appears, no error toast shows, and the next file opens normally. Pinned by `parsePointCloud.test.js` "abort terminates the worker" (Task 3) and the Playwright cancel case (Task 3).
4. **A cloud without colours or intensity, and a view link asking for intensity.** Colour by offers only Height and Single colour, defaults to Height, and the link's `cb=intensity` falls back to the default without an error. Pinned by `pointCloudControls.test.js` and `viewLink.test.js` (Task 4).
5. **"Which way is up" set by an editor, then opened by a view-only colleague and by a public-link visitor.** Both see it turned, and the colleague sees the control read-only. Pinned by `FileSettingsHttpTest` up cases (Task 1) and `fileUpControl.test.js` plus the light-viewer Playwright case (Task 5).

---

### Task 1: Server — up direction, scan formats, size ceiling

**Files:**
- Create: `lib/Migration/Version031000Date20261030000000.php`
- Modify:
  - `lib/Db/FileSetting.php`
  - `lib/Service/FileSettingsService.php`
  - `lib/Controller/FileSettingsController.php`
  - `lib/Controller/PublicFileSettingsController.php`
  - `lib/Constants/SupportedFormats.php`: `POINT_CLOUD_EXTENSIONS` only. Extensions are registered in their format tasks.
  - `lib/Controller/FileController.php`
  - `openapi.json`
- Test:
  - `tests/unit/Service/FileSettingsServiceTest.php`
  - `tests/unit/Controller/FileSettingsControllerTest.php`
  - `tests/unit/Controller/PublicFileSettingsControllerTest.php`
  - `tests/http/FileSettingsHttpTest.php`
  - `tests/http/WriteRoutesCsrfHttpTest.php`
  - `tests/unit/Controller/FileControllerTest.php`

**Interfaces:**
- Produces:
  - A table column `up` (string(3), nullable) on `threedviewer_file_settings`.
  - `FileSettingsService::UPS = ['+y', '-y', '+z', '-z']`.
  - `FileSettingsService::UP_FORMATS = ['las', 'laz', 'e57', 'pcd', 'xyz', 'ply']`. Splats add theirs later.
  - `FileSettingsService::UNITLESS_FORMATS` gains `las, laz, pcd, xyz`. E57 always records metres.
  - `up(int $fileId): ?string`.
  - `setUp(int $fileId, string $fileName, mixed $up, string $uid): ?string`. It throws `InvalidArgumentException` for a value not in `UPS`, or an extension not in `UP_FORMATS`.
  - Clearing one setting keeps the other. The row is deleted only when both `unit` and `up` are null.
  - `GET /api/file-settings/{fileId}` and the public GET answer `{canEdit, unit, up}`.
  - `PUT` accepts `unit` and/or `up`, and needs at least one. Otherwise it answers 400 `{error: 'Nothing to change'}`.
  - `SupportedFormats::POINT_CLOUD_EXTENSIONS = ['las', 'laz', 'e57', 'pcd', 'xyz', 'ply']`.

- [ ] **Step 1: Write the failing tests**
  - `FileSettingsServiceTest`:
    - `testSetUpStoresAndReadsBack` (`'+z'` on `scan.las`).
    - `testSetUpRefusesAnUnknownValue` (`'up'`, `'+x'`).
    - `testSetUpRefusesAMeshOnlyFormat` (`part.stl`).
    - `testClearingTheUpKeepsTheUnit`: set unit `ft` and up `-y`, clear up; the row remains with `ft`.
    - `testClearingBothDeletesTheRow`.
  - `FileSettingsControllerTest`:
    - `testShowIncludesUp`.
    - `testUpdateWithUpOnly`.
    - `testUpdateWithNothingIsRefused` (400, `Nothing to change`).
    - `testUpdateUpNeedsUpdatePermission` (403).
  - `PublicFileSettingsControllerTest::testShowIncludesUp`.
  - `FileSettingsHttpTest`:
    - `testAnEditorSetsUpAndAViewerReadsIt`: share with read-only, then read as the recipient.
    - `testAPublicVisitorReadsUp`.
  - `WriteRoutesCsrfHttpTest::testSavingUpNeedsTheRequestToken`.
  - `FileControllerTest`:
    - `testAScanUpToTheCeilingIsServed`: `part.laz`, size 1.5 GiB, not 413.
    - `testAMeshOverFiveHundredMegabytesIsStillRefused`: `part.stl`, 600 MB, 413.

- [ ] **Step 2: Run them to see them fail**

  Run: `php-unit.sh --filter 'FileSettings|FileControllerTest'`
  Expected: FAIL. `setUp`, `UP_FORMATS` and `up` are undefined.

- [ ] **Step 3: Implement**
  - **Migration:** `Version031000Date20261030000000::changeSchema` adds `up` if missing.
  - **Entity:** `FileSetting` gains `up` with `addType('up', 'string')`.
  - **Service:** both setters go through one private `save(int $fileId, ?string $unit, ?string $up, string $uid)`. It inserts, updates, or deletes when both are null.
  - **Controllers:** `update` reads `unit` and `up` with `array_key_exists`, so a key that is present but null clears that setting.
  - **Size ceiling:** `FileController` passes `2 * 1024 ** 3` to `isFileSizeAcceptable` when the extension is in `POINT_CLOUD_EXTENSIONS`, and reports that value as `max_size`.
  - **API docs:** regenerate `openapi.json` with `php-tool.sh composer openapi`.

- [ ] **Step 4: Run the tests again**

  Run: `php-unit.sh`, `nc-sync.sh`, then `nc-test.sh http --filter 'FileSettings|WriteRoutesCsrf'`
  Expected: PASS. `nc-sync.sh` runs the migration, and its output lists it.

- [ ] **Step 5: Commit** `feat(scans): save which way is up with the file`

---

### Task 2: The point-cloud core — sink, budget, colour, object

**Files:**
- Create:
  - `src/pointclouds/limits.js`
  - `src/pointclouds/pointSink.js`
  - `src/pointclouds/budget.js`
  - `src/pointclouds/colourBy.js`
  - `src/pointclouds/buildPointCloud.js`
  - `src/pointclouds/upAxis.js`
- Test:
  - `tests/unit/pointclouds/pointSink.test.js`
  - `tests/unit/pointclouds/budget.test.js`
  - `tests/unit/pointclouds/colourBy.test.js`
  - `tests/unit/pointclouds/buildPointCloud.test.js`
  - `tests/unit/pointclouds/upAxis.test.js`

**Interfaces:**
- Produces:
  - **Constants** in `limits.js`: `POINT_BUDGET`, `SCAN_CEILING_BYTES`, `PLY_MESH_CEILING_BYTES` (values in Global Constraints), and `POINT_SIZE = { min: 1, max: 10, step: 0.5, initial: 2 }`.
  - **`class PointSink`** (`pointSink.js`):
    - **Constructor:** `new PointSink({ total: ?number, budget: number, attributes: { color?: bool, intensity?: bool, classification?: bool }, origin?: [x,y,z], seed?: number })`. It allocates `Float32Array(3·cap)`, plus `Uint8Array(3·cap)` for colour, `Uint16Array(cap)` for intensity and `Uint8Array(cap)` for classification, only for the attributes asked for.
    - **Capacity:** cap is `min(total, budget)`, or `budget` when `total` is unknown.
    - **Thinning:** `add(x, y, z, r?, g?, b?, intensity?, classification?)` takes float64 values.
      - With a known total it keeps point i when `floor((i+1)·cap/total) > floor(i·cap/total)`.
      - With an unknown total it uses reservoir sampling (Algorithm R) with a seeded mulberry32 PRNG (default seed 1).
    - **Origin:** the first point sets the origin unless `origin` was given. Each kept point is stored as `value − origin` in float64 before being written to Float32.
    - **Colour values:** r, g, b are 0–255.
    - **Result:** `finish(): { positions, colors?, intensity?, classification?, count, total, origin, bounds: { min:[3], max:[3] } }`. The bounds are in stored (re-centred) space. `total` is the count of points seen.
  - **`pointBudget(env)`** (`budget.js`): `env = { userAgentData?, userAgent, maxTouchPoints, coarsePointer: bool, screenMin: number, deviceMemory? }`, returning a number.
    - Phone: coarse pointer and `screenMin < 600`, or `userAgentData.mobile`.
    - Tablet: coarse pointer, or `maxTouchPoints > 1` with a Mac user agent.
    - `deviceMemory <= 4` caps the result at the tablet budget.
    - Otherwise desktop.
  - **`currentBudget()`** reads `env` from `navigator` and `matchMedia('(pointer: coarse)')`.
  - **`thinningNote(kept, total)`** returns the string, or null when nothing was thinned.
  - **`colourBy.js`:**
    - `COLOUR_BY = ['file', 'height', 'intensity', 'classification', 'single']`.
    - `availableColourBy(cloudMeta): string[]`.
    - `defaultColourBy(cloudMeta): string`.
    - `writeColours(target: Uint8Array, mode, data, upAxis): void`. `data` is the finished sink; height is measured along `upAxis`.
  - **`buildPointCloud(data, { fileName, format, unit: ?string, defaultUp }): THREE.Points`**:
    - Geometry has `position`, plus a normalised `color` attribute that is always present.
    - Material is `PointsMaterial({ size: POINT_SIZE.initial, sizeAttenuation: false, vertexColors: true })`.
    - `userData.tdvPointCloud = { format, count, total, attributes: {color, intensity, classification}, origin, unit, defaultUp, colourBy, source: data }`.
    - `setColourBy(points, mode)` and `setPointSize(points, px)` are exported beside it.
  - **`upAxis.js`:**
    - `UPS = ['+y', '-y', '+z', '-z']`.
    - `defaultUp(format)` returns `'+z'` for las, laz and e57, otherwise `'+y'`.
    - `upRotation(up): THREE.Euler` (values in Global Constraints).
    - `applyUp(root, up)` sets `root.rotation` from `upRotation`. `ThreeViewer` applies it before positioning, then re-records the reset pose (`rememberTransform`). A later change of up therefore replaces any rotation made with the transform gizmo, and Reset returns to the up pose.

- [ ] **Step 1: Write the failing tests** (Jest, with `three` real, no mocks):
  - **"re-centres in double precision":** add `(500000.001, 4500000.000, 100)` and `(500000.002, 4500000.000, 100)`. The stored x values differ by 0.001 ± 1e-6.
  - **"keeps every point under the budget":** 10 points, budget 20, so `count` is 10.
  - **"thins a known total evenly":** total 1000, budget 250; `count` is 250 and the kept indices are spaced 4 apart.
  - **"reservoir keeps exactly the budget for an unknown total":** 10 000 points, budget 100; `count` is 100, and two runs with seed 1 match.
  - **"bounds"** match the extremes.
  - **`budget.test.js`:**
    - iPhone UA with coarse pointer and screenMin 390 gives 2 000 000;
    - an iPad reporting a Mac UA with `maxTouchPoints: 5` gives 4 000 000;
    - desktop gives 20 000 000;
    - a desktop with `deviceMemory: 4` gives 4 000 000.
  - **`thinningNote`:**
    - `(250, 1000)` gives `Showing 1 in 4 points`;
    - `(900, 1000)` gives `Showing 900 of 1,000 points` (`toLocaleString`);
    - `(10, 10)` gives null.
  - **`colourBy.test.js`:**
    - a cloud with only positions offers `['height', 'single']` and defaults to `'height'`;
    - with colours it defaults to `'file'`;
    - classification 2 writes `#a0784b`;
    - height writes `#30123b` at the lowest point and `#7a0403` at the highest along `'+z'`;
    - intensity clips at the 1st and 99th percentiles.
  - **`buildPointCloud.test.js`:**
    - the result is a `THREE.Points` whose `userData.tdvPointCloud.count` matches;
    - `setPointSize(points, 20)` clamps to 10;
    - `setColourBy(points, 'intensity')` on a cloud without intensity leaves the mode unchanged.
  - **`upAxis.test.js`:** for each value, `(0, 1, 0)` in the file ends up pointing up (world `+Y`) after `applyUp`. For example, `'+z'` turns the file's `(0, 0, 1)` into `(0, 1, 0)`.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds`
  Expected: FAIL. The modules don't exist yet.

- [ ] **Step 3: Implement the six modules to the interfaces above.** Strings use `t()` from `@nextcloud/l10n` with the same eslint-disable comment `embed.js` uses.

- [ ] **Step 4: Run them again**

  Run: `npx jest tests/unit/pointclouds`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(scans): point sink, budget, colour by and the cloud object`

---

### Task 3: The worker, the download path, and XYZ end to end

**Files:**
- Create:
  - `src/pointclouds/pointCloud.worker.js`
  - `src/pointclouds/createPointCloudWorker.js`
  - `src/pointclouds/parsePointCloud.js`
  - `src/pointclouds/blobReader.js`
  - `src/pointclouds/readers/xyz.js`
  - `src/pointclouds/scanFormats.js`
  - `src/loaders/types/pointCloud.js`
  - `src/loaders/types/xyz.js`
  - `scripts/make-point-fixtures.mjs`
  - `tests/fixtures/pointclouds/` (generated `cube.xyz`, `cube-rgb.xyz`, `molecule.xyz`)
  - `tests/playwright/point-clouds.spec.ts`
- Modify:
  - `src/composables/useModelLoading.js` (around lines 238–349)
  - `src/views/ViewerComponent.vue` (around lines 1074–1146)
  - `vite.config.js` (`WORKER_FILE` and `workerPrefix`)
  - `scripts/check-bundle-size.mjs`
  - Registration of `xyz` at every sync point (`docs/TECHNICAL.md:372-380`):
    - `SupportedFormats.php` `EXT_MIME_MAP` and `CONTENT_TYPE_MAP`, as `'xyz' => ['application/x-xyz-pointcloud']`;
    - `viewer-config.js` `SUPPORTED_FORMATS`;
    - `registry.js`;
    - `main.js` `SUPPORTED_MIMES`;
    - `appinfo/mimetypemapping.json`;
    - `sourceUnits.js` `SOURCE_UNITS`;
    - `thumbnail-worker.spec.ts` `SAMPLES` (Task 11 fills this in; add the entry here with the `cube.xyz` fixture).
- Test:
  - `tests/unit/pointclouds/xyz.test.js`
  - `tests/unit/pointclouds/blobReader.test.js`
  - `tests/unit/pointclouds/parsePointCloud.test.js`
  - `tests/unit/composables/useModelLoading.test.js` (or the nearest existing test of the fetch path)
  - `tests/playwright/point-clouds.spec.ts`

**Interfaces:**
- Consumes: Task 2's `PointSink`, `currentBudget`, `buildPointCloud`, `defaultUp` and `SCAN_CEILING_BYTES`.
- Produces:
  - **`blobReader.js`:**
    - `readWindows(blob, { windowBytes = 64 * 1024 ** 2, start = 0, signal })` is an async iterator of `{ offset, bytes: Uint8Array }`.
    - `readRange(blob, start, length): Promise<DataView>`.
  - **Readers.** A reader module exports `async read(blob, { budget, onProgress(fraction), signal }): { sink: finished PointSink result, unit: ?string, format }`. It throws `ScanError(reason)` (exported from `scanFormats.js`), and a chemistry XYZ throws `NotAScanError`.
  - **`scanFormats.js`:**
    - `SCAN_EXTENSIONS = ['las', 'laz', 'e57', 'pcd', 'xyz']`.
    - `isScanExtension(ext)`.
    - `readerFor(ext)` returns a dynamic import of `./readers/{ext}.js`; `laz` shares `las.js` and `ply` uses `plyPoints.js`.
  - **Worker protocol.**
    - In: `{ blob, ext, budget }`.
    - Out: `{ type: 'progress', fraction }`, `{ type: 'done', result }` with every typed array transferred, or `{ type: 'error', kind: 'scan' | 'not-a-scan' | 'other', message }`.
  - **`parsePointCloud(blob, ext, { budget, onProgress, signal, inline = false })`** returns a promise of the reader result.
    - `inline` reads in the calling thread; the thumbnail worker uses it.
    - Otherwise it starts one worker per parse, and `signal` abort terminates it and rejects with an `AbortError`.
  - **`loadPointCloud(input: Blob | ArrayBuffer, context)`** (`src/loaders/types/pointCloud.js`):
    - wraps an ArrayBuffer in a Blob;
    - picks the budget, using `POINT_BUDGET.thumbnail` when `context.thumbnail` is true;
    - calls `parsePointCloud`, with `inline` when there is no `window`;
    - builds the cloud;
    - returns it through `BaseLoader.processModel` like every other loader.
    - `NotAScanError` and `ScanError` surface as a load error whose message is the Global Constraints copy.
  - **`xyz.js`** is the loader class wrapping `loadPointCloud`.
  - **Download path.** In `useModelLoading` and `ViewerComponent`, for `isScanExtension(ext)` or `ext === 'ply'`:
    - check `content-length` against `SCAN_CEILING_BYTES` before reading the body, and refuse with the ceiling copy if it is over;
    - otherwise read the body as `await new Response(body.pipeThrough(byteCounter(onBytes))).blob()`, keeping download progress;
    - pass the **Blob** to `loadModelByExtension`;
    - set `result.sourceFiles = [new File([blob], filename)]`.

    Every other extension keeps today's ArrayBuffer path. `byteCounter(onBytes)` is a `TransformStream` exported from `blobReader.js`.

- [ ] **Step 1: Write the failing tests**
  - **`xyz.test.js`:**
    - **"reads x y z":** whitespace, comma and semicolon separators.
    - **"reads rgb 0–255 and 0–1":** the sixth column ≤ 1.0 for every line in the first window means 0–1.
    - **"reads intensity in a fourth column".**
    - **"skips a count header and # comments".**
    - **"refuses a chemistry file":** `3\nwater\nO 0 0 0\nH 0.76 0.59 0\nH -0.76 0.59 0\n` throws `NotAScanError`.
    - **"thins an unknown total with the reservoir":** 5 000 lines with budget 1 000 gives a count of 1 000.
  - **`blobReader.test.js`:** windows cover the blob exactly once, and the last window is short.
  - **`parsePointCloud.test.js`** (inject a fake `createPointCloudWorker`):
    - **"done result resolves".**
    - **"error kinds map to ScanError / NotAScanError".**
    - **"abort terminates the worker":** `terminate` is called once and the promise rejects with `name === 'AbortError'`.
  - **Fetch path test:**
    - a `.laz` response with `content-length` `3 * 1024 ** 3` is refused before `getReader` or `blob` is called;
    - a `.xyz` reaches the registry as a `Blob`;
    - a `.stl` still reaches it as an `ArrayBuffer`.
  - **Playwright `point-clouds.spec.ts`** (harness model `cube-rgb.xyz`):
    - **"an XYZ scan opens as points":** the canvas is visible, there are no console errors, and the scene has one `Points` object, read through the harness's existing scene accessor.
    - **"a chemistry xyz says it lists atoms".**
    - **"cancel during a scan load leaves no model and no error":** gate the file response, press Cancel loading, then release the gate. There is no `Points`, no toast, and the next file opens.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds && npx playwright test tests/playwright/point-clouds.spec.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**
  - **Fixtures:** `scripts/make-point-fixtures.mjs` writes the XYZ fixtures deterministically. They are committed: a 1 000-point cube of side 10, and its RGB variant.
  - **Worker build:** add `point-cloud` to `WORKER_FILE` and `workerPrefix` in `vite.config.js`, and add the budget line to `check-bundle-size.mjs`.

- [ ] **Step 4: Run them again**

  Run: `npx jest && npm run build && npx playwright test tests/playwright/point-clouds.spec.ts && npm run format:check`
  Expected: PASS, and the budgets are OK.

- [ ] **Step 5: Commit** `feat(scans): read scans in a worker, and open XYZ`

---

### Task 4: Point clouds in the full viewer

**Files:**
- Create:
  - `src/components/PointCloudControls.vue` (async chunk)
  - `src/pointclouds/unavailable.js`
- Modify:
  - `src/App.vue`: `isPointCloud`, `pointCloud` meta, colour-by and point-size state, and the `defineAsyncComponent` for the controls.
  - `src/components/SlideOutToolPanel.vue`:
    - a "Scan" section that hosts the controls;
    - gated controls get `aria-disabled="true"` and `aria-describedby="tdv-unavailable-{key}"`;
    - Exploded view stays hidden as today, and its note is listed.
  - `src/components/ThreeViewer.vue`:
    - emits `isPointCloud` and meta in `model-loaded`;
    - `setColourBy` / `setPointSize` handlers;
    - Print check refused for clouds;
    - export refused for clouds;
    - stats rows.
  - `src/composables/useModelStats.js`: an `isPoints` branch, `pointCount`, `attributes`.
  - `src/utils/modelScaleUtils.js` `raycastIntersection`: accepts `isPoints`, sets `raycaster.params.Points.threshold`, and snaps to the hit point's own position.
  - `src/composables/useMeasurement.js` and `src/composables/useAnnotation.js` filters: `(isMesh || isPoints) && visible && !isHelperMesh`.
  - `src/utils/viewLink.js` and `src/components/ThreeViewer.vue` (`captureViewState`, `applyLinkedView`): `ps` and `cb`.
  - `src/utils/sourceUnits.js`: clouds default to metres; a recorded cloud unit makes `isUnitChangeable` false.
- Test:
  - `tests/unit/pointCloudControls.test.js`
  - `tests/unit/pointclouds/unavailable.test.js`
  - `tests/unit/utils/viewLink.test.js`
  - `tests/unit/utils/modelScaleUtils.test.js`
  - `tests/unit/composables/useModelStats.test.js`
  - `tests/unit/utils/sourceUnits.test.js`
  - `tests/playwright/point-clouds.spec.ts`

**Interfaces:**
- Consumes: Task 2's `userData.tdvPointCloud`, `availableColourBy`, `defaultColourBy`, `setColourBy`, `setPointSize`, `thinningNote` and `POINT_SIZE`.
- Produces:
  - **`unavailable.js`:** `POINT_CLOUD_UNAVAILABLE` is an ordered list of `{ key: 'printCheck' | 'shading' | 'exploded' | 'compare' | 'export', label, note }`, with the copy from Global Constraints.
  - **`PointCloudControls.vue`:**
    - Props: `meta` (`tdvPointCloud` without `source`), `colourBy`, `pointSize`, `upState` (Task 5; `null` until then).
    - Emits: `set-colour-by`, `set-point-size`, `set-up` (Task 5).
    - It renders:
      - the thinning note (`role="status"`);
      - a Colour by `<select id="tdv-colour-by">` with only the available modes;
      - a Point size range input `id="tdv-point-size"` with `aria-valuetext` `{size} px`;
      - a "Not available for scans" `<ul>` whose `<li id="tdv-unavailable-{key}">` reads `{label}: {note}`.

      The list renders whether or not the section is collapsed: the gated controls' descriptions point at it.
  - **View links:**
    - `encodeView` writes `ps` (rounded to 0.5) and `cb`.
    - `decodeView` clamps `ps` to `POINT_SIZE` and whitelists `cb` against `COLOUR_BY`. The version stays 1.
    - `applyLinkedView` applies `cb` only when it is among `availableColourBy(meta)`.
  - **Stats.** For a cloud the stats show:
    - Points: `{count}` (and the thinning note);
    - Extent, in the file's unit;
    - Attributes: the list from `Colours`, `Intensity`, `Classification`.

    The triangle, vertex, watertight, surface-area, volume and per-mesh rows are not shown for a cloud.
  - **Units.** `millimetresPerFileUnit(ext, root, chosen)`:
    - for a root with `tdvPointCloud`, uses the chosen unit, else `tdvPointCloud.unit`, else metres;
    - `isUnitChangeable(ext, root)` is false when `tdvPointCloud.unit` is set;
    - las, laz, pcd and xyz are added to `CHANGEABLE_FORMATS`.

- [ ] **Step 1: Write the failing tests**
  - **`pointCloudControls.test.js`** (mountSfc):
    - offers only Height and Single colour for a bare cloud;
    - the select emits `set-colour-by`;
    - the slider emits `set-point-size` with a number and has `aria-valuetext` `2 px`;
    - the unavailable list has the five ids and exact copy;
    - the thinning note reads `Showing 1 in 4 points` for meta `{count: 250, total: 1000}`.
  - **`viewLink.test.js`:**
    - `ps` and `cb` round-trip;
    - `ps` 99 clamps to 10;
    - `cb` `'rainbow'` is dropped and the rest of the view kept.
  - **`modelScaleUtils.test.js`:** a ray through a `Points` of 3 points returns the nearest point's exact position, not the ray's closest approach.
  - **`useModelStats.test.js`:** a cloud reports `pointCount` and `attributes`, with no triangles.
  - **`sourceUnits.test.js`:**
    - an XYZ cloud defaults to 1000 mm per unit (metres) and is changeable;
    - a cloud with `tdvPointCloud.unit = 'us-ft'` gives 304.8006096 mm and is not changeable.
  - **Playwright, on `cube-rgb.xyz`:**
    - **"the scan section and what's off":** Colour by defaults to File colours; Print check, Compare, Compare earlier version and Export are `aria-disabled` and described by their notes; the shading buttons and the wireframe switch are `aria-disabled` and described by the shading note.
    - **"colour by and point size change the cloud":** read the material's size and the first colour through the scene accessor.
    - **"measurement snaps to a point":** click two canvas points; the distance shown equals the distance between two fixture points.
    - **"a view link restores colour by and point size".**
    - **"cross-section cuts the cloud":** with the plane on, the renderer's `clippingPlanes` length is 1 and the cloud is still drawn.
    - **"transform works":** the gizmo attaches to the model root.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest && npx playwright test tests/playwright/point-clouds.spec.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**
  - **Panel copy:** the panel strings beyond the attributes (`aria-disabled`, `aria-describedby`) live in `PointCloudControls.vue` and `unavailable.js`, so they stay out of the App chunk.
  - **Refusals:** Print check and Export also refuse in `ThreeViewer.vue` for a cloud, so a keyboard shortcut can't reach them.
  - **Points threshold:** `raycaster.params.Points.threshold` is 0.5% of the cloud's bounding-box diagonal.

- [ ] **Step 4: Run them again**

  Run: `npx jest && npm run lint && npm run build && npx playwright test && npm run i18n:sync && npm run i18n:check`
  Expected: PASS. The App chunk is within 384000 / 108000.

- [ ] **Step 5: Commit** `feat(scans): colour by, point size and the tools that are off for scans`

---

### Task 5: Which way is up

**Files:**
- Create:
  - `src/components/FileUpControl.vue` (in the `PointCloudControls` chunk)
  - `src/composables/useFileUp.js`
- Modify:
  - `src/utils/fileSettingsApi.js`: `up` in `settingsFrom`, and `setUp`.
  - `src/components/PointCloudControls.vue`
  - `src/components/ThreeViewer.vue`:
    - apply the up direction before the positioning at about line 1575;
    - re-fit after a change: grid, clipping bounds, camera, stats.
  - `src/views/ViewerComponent.vue`: read `up` from the same `get()` it already makes (line 700) and apply it before its camera fit.
- Test:
  - `tests/unit/fileUpControl.test.js`
  - `tests/unit/composables/useFileUp.test.js`
  - `tests/unit/utils/fileSettingsApi.test.js`
  - `tests/playwright/point-clouds.spec.ts`

**Interfaces:**
- Consumes: Task 1's routes and Task 2's `applyUp`, `defaultUp` and `UPS`.
- Produces:
  - **`useFileUp()`** mirrors `useFileUnit`: a generation guard, one save at a time, and a 403 drops `canEdit`. It returns `{ state: Ref<{ up, saved: ?string, canEdit, saving, error }>, load(fileId, shareToken, defaultUp), set(up) }`.
  - **`FileUpControl.vue`:**
    - Props: `state`. Emits `set-up`.
    - When `canEdit`, it is a `<select id="tdv-up">` labelled `Which way is up`. It is described by `Saved with the file for everyone who can see it.`
    - Otherwise it shows the value with the note `Only people who can edit this file can change this.`
    - A `role="status"` line says `Saving…` while a save runs.

- [ ] **Step 1: Write the failing tests**
  - **`fileUpControl.test.js`:** the editable and read-only branches, the labels and notes (exact copy above), and emits.
  - **`useFileUp.test.js`:** stale answers are dropped, rapid picks collapse into one save, and a 403 drops `canEdit`.
  - **`fileSettingsApi.test.js`:** an unknown `up` is dropped; `setUp` throws on a public link.
  - **Playwright:**
    - **"an editor turns a scan and it stays turned on reload":** route the settings PUT/GET; after picking `+Z up`, the model root's rotation.x is −π/2.
    - **"a public link applies the saved up":** run in the light viewer, with the public settings route answering `up: '-y'`.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest && npx playwright test tests/playwright/point-clouds.spec.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement** to the interfaces.

- [ ] **Step 4: Run them again**

  Run: `npx jest && npm run build && npx playwright test && npm run i18n:sync`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(scans): which way is up, saved with the file`

---

### Task 6: A PLY with no faces opens as points

**Files:**
- Create: `src/pointclouds/readers/plyPoints.js`
- Modify: `src/loaders/types/ply.js`
- Test:
  - `tests/unit/pointclouds/plyPoints.test.js`
  - `tests/unit/loaders/ply.test.js`
  - fixtures from `make-point-fixtures.mjs`: `points-ascii.ply`, `points-binary-le.ply`, `points-binary-be.ply`, `points-rgb.ply`

**Interfaces:**
- Consumes: Task 3's reader contract and `loadPointCloud`.
- Produces:
  - **`plyHeader(bytes: Uint8Array): { format: 'ascii' | 'binary_little_endian' | 'binary_big_endian', elements: [{ name, count, properties: [{ name, type }] }], headerLength }`.**
  - **`ply.js` `loadModel(input, context)`:**
    1. It reads the first 64 KB and parses the header.
    2. When there is no `face` element, or a face count of 0, it calls `loadPointCloud`.
    3. Otherwise it refuses a Blob larger than `PLY_MESH_CEILING_BYTES` with the PLY copy.
    4. It then runs today's mesh path on `await input.arrayBuffer()`.
  - Colour comes from `red`/`green`/`blue` (or `r`/`g`/`b`) and intensity from `intensity` or `scalar_intensity`.
  - Splat PLYs, with `f_dc_0`, are left on the mesh path untouched. Splats change that later.
  - The mesh path keeps today's `rotation.x = −π/2`. Only face-less PLYs take the cloud default, `+y`, from the spec.

- [ ] **Step 1: Write the failing tests**
  - Each fixture reads its point count and first point.
  - `ply.test.js`: a vertex-only PLY returns a `Points`; a PLY with faces still returns a `Mesh`; a 600 MB mesh Blob is refused.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds/plyPoints.test.js tests/unit/loaders/ply.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run them again**

  Run: `npx jest`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(scans): a PLY with no faces opens as points`

---

### Task 7: PCD

**Files:**
- Create:
  - `src/pointclouds/readers/pcd.js`
  - `src/loaders/types/pcd.js`
  - fixtures `cube-ascii.pcd`, `cube-binary.pcd`, `cube-compressed.pcd`, written by `make-point-fixtures.mjs`. The compressed one uses an LZF encoder in the script that emits literal runs and back-references.
- Modify: registration of `pcd` at every sync point, with MIME `application/x-pcd`.
- Test: `tests/unit/pointclouds/pcd.test.js`

**Interfaces:**
- Consumes: Task 3's reader contract.
- Produces:
  - **Header:** a `pcd.js` reader porting the header parsing, field layout and LZF decompression from three's MIT `PCDLoader` (credited in a comment).
  - **Output:** it writes straight into the sink. Fields are `x y z`, `rgb`/`rgba` (packed float or uint), `intensity` and `label` (used as classification). It honours `COUNT` and ignores unknown fields.
  - **Bounded reads:** binary data is read in windows, and binary_compressed is decompressed field block by field block. Point count comes from `POINTS`.

- [ ] **Step 1: Write the failing tests.** Each of the three fixtures gives the same 1 000 points and colours; a header with a double space between fields still parses; `DATA` with an unknown type throws `ScanError`.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds/pcd.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run them again**

  Run: `npx jest && npm run format:check`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(scans): open PCD`

---

### Task 8: LAS, with the unit from its coordinate system

**Files:**
- Create:
  - `src/pointclouds/readers/las.js`
  - `src/pointclouds/lasCrsUnit.js`
  - `src/loaders/types/las.js`
  - fixtures `utm-1.2.las` (format 3, UTM offset, GeoKey 3076 = 9001), `feet-1.4.las` (format 7, WKT `UNIT["US survey foot",0.3048006096012192]`) and `classes-1.4.las` (format 6, classes 2, 5 and 6), written by `make-point-fixtures.mjs`
- Modify: registration of `las` at every sync point, with MIME `application/vnd.las`.
- Test:
  - `tests/unit/pointclouds/las.test.js`
  - `tests/unit/pointclouds/lasCrsUnit.test.js`

**Interfaces:**
- Consumes: Task 3's reader contract.
- Produces:
  - **`lasHeader(view: DataView): { version: [major, minor], pointFormat, recordLength, pointCount, offsetToPoints, scale: [3], offset: [3], min: [3], max: [3], vlrs: [{ userId, recordId, data: Uint8Array }], compressed: bool }`.**
    - The point count uses the 1.4 64-bit field when the version is 1.4.
    - `compressed` is bit 7 of the format byte.
    - It reads VLRs, and EVLRs for 1.4.
  - **Point records** go through a `DataView` for formats 0–10, giving x/y/z (scaled, in float64), intensity, classification (the 5-bit field for 0–5, a full byte for 6–10) and RGB (16-bit scaled to 8-bit).
  - **The sink's origin** is the header `min`.
  - **`crsUnit(vlrs): 'm' | 'ft' | 'us-ft' | null`:**
    - GeoKeys (`LASF_Projection`/34735): 3076, else 4099, mapping 9001 → m, 9002 → ft, 9003 → us-ft. 3077 with the double params is used by factor.
    - Otherwise WKT (2112): the last `UNIT`/`LENGTHUNIT` in `PROJCS`/`PROJCRS`, judged by factor; the `GEOGCS` unit is ignored.
    - `null` when neither names a length unit.

- [ ] **Step 1: Write the failing tests**
  - Each fixture's count, first point and bounds.
  - The UTM fixture's adjacent points keep their 1 mm spacing.
  - Classification and intensity are read.
  - The `crsUnit` cases: GeoKey 9002 → `ft`; WKT factor 0.3048006096012192 → `us-ft`; WKT with only `GEOGCS` → null; no VLR → null.
  - A compressed header passed to `las.js` without the LAZ path throws a `ScanError` (Task 9 replaces that with decoding).

- [ ] **Step 2: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds/las.test.js tests/unit/pointclouds/lasCrsUnit.test.js`
  Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run them again**

  Run: `npx jest && npm run format:check`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(scans): open LAS, with its coordinate system's unit`

---

### Task 9: LAZ

**Files:**
- Create:
  - `src/pointclouds/readers/lazChunks.js`
  - `src/pointclouds/lazPerf.js` (memoised WASM module, as `occt-runtime.js` does)
  - `tests/fixtures/pointclouds/SOURCES.md`
- Modify:
  - `package.json`, `package-lock.json`: `laz-perf` 0.0.7, **after the user's OK**, with the lockfile from npm 10 and no `node_modules`.
  - `scripts/copy-decoders.mjs`: copy `laz-perf.wasm` to `lazperf/`.
  - `src/pointclouds/readers/las.js`
  - registration of `laz` at every sync point, with MIME `application/vnd.laszip`.
- Test: `tests/unit/pointclouds/laz.test.js`, with two real LAZ files **downloaded with the user's OK** (point formats 1 and 6 or 7, under 2 MB each), recorded with source and licence in `SOURCES.md`.

**Interfaces:**
- Consumes: Task 8's `lasHeader` and record decoding.
- Produces:
  - **`readChunkTable(blob, header): Promise<[{ pointCount, byteCount }]>`.**
    - It reads the LASzip VLR (`laszip encoded`/22204), then the 8-byte table offset at `offsetToPoints`.
    - It decodes the arithmetic-coded table. The code is ported from laz-rs (Apache-2.0, credited in a comment).
    - The chunk sizes in the LASzip VLR give the point counts of fixed-size chunks.
  - **Decoding.** `las.js`, for a compressed file, reads each chunk with `readRange`, decodes it with laz-perf's `ChunkDecoder`, and decodes each record with Task 8's code into the sink.
  - **Cancellation and progress.** The signal is checked between chunks, and progress is reported per chunk.
  - **Refusals:**
    - point formats 4, 5, 9 and 10 throw the Global Constraints reason;
    - a missing chunk table (offset −1) on a file within the budget falls back to `LASZip.open` on the whole buffer;
    - over the budget, it throws `ScanError('this LAZ file has no chunk table')`.

- [ ] **Step 1: Ask the user.** `npm install laz-perf@0.0.7` adds a download of about 1.2 MB from npm, Apache-2.0. The two LAZ fixtures need their own download, stating each file's name, source, size and licence. Stop until they answer.

- [ ] **Step 2: Write the failing tests**
  - Each fixture's count, first point and bounds agree with its uncompressed twin, or with the counts in `SOURCES.md`.
  - A budget of a quarter of the count thins to that number.
  - Aborting between chunks rejects with `AbortError`.

- [ ] **Step 3: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds/laz.test.js`
  Expected: FAIL.

- [ ] **Step 4: Implement.** The WASM path goes through `appAssetPath('lazperf', 'laz-perf.wasm')`; the CSP already allows WASM.

- [ ] **Step 5: Run them again**

  Run: `npx jest && npm run build && npx playwright test tests/playwright/point-clouds.spec.ts && npm run format:check`
  Expected: PASS, and the worker budget is OK.

- [ ] **Step 6: Commit** `feat(scans): open LAZ`

---

### Task 10: E57

**Files:**
- Create:
  - `src/pointclouds/readers/e57.js`
  - `src/pointclouds/e57/pages.js`
  - `src/pointclouds/e57/xml.js`
  - `src/pointclouds/e57/bitpack.js`
  - `src/loaders/types/e57.js`
  - a test-only `tests/unit/pointclouds/helpers/e57Writer.js` (for the edge cases)
- Modify:
  - registration of `e57` at every sync point, with MIME `model/e57`;
  - `SOURCES.md`
- Test: `tests/unit/pointclouds/e57.test.js`, with two or three real E57 files from the MIT `cry-inc/e57` test data, **downloaded with the user's OK**.

**Interfaces:**
- Consumes: Task 3's reader contract and `@xmldom/xmldom`.
- Produces:
  - **Pages.** The 48-byte header gives the signature `ASTM-E57`, version, length, XML offset and length, and page size. `pages.js` maps logical offsets to physical ones (1020 payload bytes per 1024-byte page) and reads logical ranges with `readRange`. CRC is not checked.
  - **XML.** `xml.js` parses the XML section into `{ scans: [{ pose: { rotation: [w,x,y,z], translation: [3] }, prototype: [{ name, type: 'Float' | 'Integer' | 'ScaledInteger', precision?, min?, max?, scale?, offset? }], recordCount, binaryOffset, colorLimits?, intensityLimits? }] }`.
  - **Bitpack.** `bitpack.js` decodes a CompressedVector's data packets field by field, handling records that straddle packets.
  - **The reader** applies each scan's pose in float64 and merges the scans into one sink, sized by the summed `recordCount`. Points with `cartesianInvalidState` 2 are skipped. Colour and intensity are scaled by their limits. The unit is always `'m'`.
  - **Refusals.** A scan with only spherical fields throws the Global Constraints reason.
- **Deferral clause** (the spec's E57 risk): if the common-case reader passes 1 200 lines without the tests green, or the real fixtures can't be had, stop. Ledger the ruling, unregister nothing (E57 was never registered), and say so in the final message. Do not drop E57 silently.

- [ ] **Step 1: Ask the user** for the fixture download (names, source, size, licence MIT). Stop until they answer.

- [ ] **Step 2: Write the failing tests**
  - Each real fixture's count and first point, compared with the counts its source lists.
  - The writer helper's cases:
    - ScaledInteger fields;
    - a record straddling two packets;
    - two scans with poses;
    - an invalid-state point skipped;
    - a spherical-only scan refused.

- [ ] **Step 3: Run them to see them fail**

  Run: `npx jest tests/unit/pointclouds/e57.test.js`
  Expected: FAIL.

- [ ] **Step 4: Implement.** The Rust `e57` crate (MIT) is the reference; credit it in a comment.

- [ ] **Step 5: Run them again**

  Run: `npx jest && npm run build && npm run format:check`
  Expected: PASS.

- [ ] **Step 6: Commit** `feat(scans): open E57`

---

### Task 11: Thumbnails, docs, and a check in a real Nextcloud

**Files:**
- Modify:
  - `src/thumbnails/thumbnail.worker.js`: pass `thumbnail: true` in the loader context, which sets the budget.
  - `src/thumbnails/formats.js`: `canRenderInBackground` stays true for scans.
  - `tests/playwright/thumbnail-worker.spec.ts` `SAMPLES`: one sample per scan format, plus a chemistry xyz expected to fail as not a scan.
  - `docs/TECHNICAL.md`: a "Point clouds" section and a TOC entry.
  - `CHANGELOG.md` `[Unreleased]` Added.
  - `README.md`: the format list.
- Create: `scripts/live-pointcloud-check.mjs`
- Test:
  - `tests/playwright/thumbnail-worker.spec.ts`
  - the live check run against `tdv-188-test`

**Interfaces:**
- Consumes everything above.
- Produces: `scripts/live-pointcloud-check.mjs`.
  - Environment: `TDV_BASE`, `TDV_USER`, `TDV_PASSWORD`. The password is never printed.
  - It uploads each fixture through WebDAV and opens it in the full viewer in Chromium. It checks for a `Points` object, the stats point count and the absence of console errors.
  - It sets `+Z up` and reads it back through the settings route.
  - It opens one scan through a public link.
  - It cleans up afterwards.

- [ ] **Step 1: Write the failing thumbnail samples.** Each scan sample yields a non-empty PNG; the chemistry xyz yields the not-a-scan failure.

- [ ] **Step 2: Run them to see them fail**

  Run: `npx playwright test tests/playwright/thumbnail-worker.spec.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.** The thumbnail is drawn from the format's default up. The background thumbnailer doesn't read file settings, and the viewer's own capture on open replaces it.

- [ ] **Step 4: Run the full verification**

  Run, in this order:
  1. `npx jest`
  2. `npm run lint` (0 errors on the summary line, not the fixable line)
  3. `npm run stylelint`
  4. `npm run build`
  5. `npx playwright test`
  6. `npm run validate`
  7. `php-unit.sh`
  8. `nc-sync.sh`
  9. `nc-test.sh integration`
  10. `nc-test.sh http`
  11. psalm in `tdv-php`, where only `GdImage` may report, being environmental
  12. `TDV_BASE=http://localhost:8089 … node scripts/live-pointcloud-check.mjs`, with a throwaway user from `occ user:add --password-from-env`, deleted afterwards

  Expected: all PASS.

- [ ] **Step 5: Commit** `docs: describe point clouds`
