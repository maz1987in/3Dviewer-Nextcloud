# Gaussian Splats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the photo-real captures that phone apps produce (`.splat`, `.spz` and splat `.ply`) as Gaussian splats. They can be orbited, bookmarked, linked, recorded, thumbnailed, shared and embedded, and turned the right way up. Thinning fits each one to what the device can draw. A note says why the tools that need a surface are off.

**Architecture:** Spark (`@sparkjsdev/spark`) parses and renders.
- **Parsing:** Spark parses in its own worker pool, so a splat never parses on the page's thread. Everything else lives in `src/splats/`.
- **Loader (`loadSplat`):** it hands Spark the file's bytes and waits for its `PackedSplats`. Over the device's splat budget, it thins with Spark's own `extractSplats`. It then returns a model root: a `THREE.Group` holding the `SplatMesh` and an invisible bounds box.
- **The bounds box:** a `SplatMesh` has no geometry, so `Box3.setFromObject` would see nothing. With the box in the root, the camera fit, grid, statistics and thumbnail framing work unchanged.
- **Renderer (`attachSpark`):** each place that draws a scene (the full viewer, the light viewer, the thumbnail renderer) attaches a `SparkRenderer` to its own scene when a splat opens. It awaits `SparkRenderer.update()` before drawing any frame it renders explicitly: turntable frames and thumbnails.
- **The splat marker:** the root carries `userData.tdvSplat`, the content signal the viewer reads, like `userData.tdvPointCloud`.
- **Gated tools:** the tools that are off move from "is this a point cloud" checks to one list of keys per kind of content.
- **Which way is up and the unit:** the file settings that point clouds already use.

**Tech Stack:** three.js 0.186, `@sparkjsdev/spark` 2.4.0 (MIT; new dependency, requires three ≥ 0.180), Vue 3, Nextcloud app framework (PHP 8.1+), Jest, Playwright, PHPUnit.

**Spec:** `docs/superpowers/specs/2026-10-28-views-units-embed-scans-design.md`. This plan covers section "5. Gaussian splats", plus:
- Goals, Non-goals and Anti-goals;
- these "My calls": AR is off for splats; "Which way is up" (+Y, −Y, +Z, −Z) is saved with the file;
- the point-cloud rules section 5 shares (the 200 MB guidance, the thinning note, the hard ceiling).

View links, file units, embedding and point clouds are built and merged into local `main`; this plan builds on them.

## Decisions this plan makes

The spec leaves these open. Each is a call for the user to check:

- **Renderer:** Spark 2.4.0 (MIT, updated 2026-10-20), not GaussianSplats3D (last release January 2025).
  - Spark parses and sorts in its own workers.
  - Awaiting its `update({ scene, camera })` finishes the sort before a frame is drawn. This meets the spec's turntable rule.
- **Worker policy:** Spark builds its workers from `blob:` URLs (Vite `?worker&inline`), so the viewer's pages allow `worker-src 'self' blob:`.
  - Starting a blob worker takes script already running on the page, as `'self'` workers do.
  - `script-src` is unchanged.
- **Cancel:** Cancel loading stops waiting at once and drops the result. Spark's worker cannot be stopped from outside, so it finishes the parse in the background and its result is disposed.
- **Thinning:** stride sampling through `extractSplats`, after Spark has decoded the whole file.
  - Memory therefore peaks at the whole file once. That is why the splat ceiling (1 GB) is lower than the scan ceiling (2 GB).
- **Units:** a splat is treated like a scan with no recorded unit: metres, changeable. The spec's unit list doesn't name splats. The extent is the only length a splat shows, so this costs one control.
- **Notes are off for splats**, like measurement: a note pins to a surface.
- **"AR is off"** means the top bar's WebXR button ("Enter VR") is hidden for a splat. VR is listed among the tools that are off.
- **A SuperSplat "compressed" PLY** (a `chunk` element and `packed_position` vertex properties) is a splat too, though it lacks the spec's `f_dc_0` marker.
- **The extent** shown, and the camera framing, use the 0.5th–99.5th percentile of the splat centres on each axis. Captures carry stray "floaters" far from the subject.

## Global Constraints

- **Nothing slows opening an ordinary model.** Spark is reached only through the loader registry's dynamic imports. `SplatControls.vue` and `SplatStats.vue` are async chunks.
- **Bundle budgets** (`scripts/check-bundle-size.mjs`) hold:
  - `threedviewer-main.mjs` 5800 / 2100;
  - `threedviewer-embed.mjs` 5800 / 2100;
  - App chunk 384000 / 108000.
  - Spark gets its own chunk, `spark-*.chunk.mjs` (`manualChunks: { spark: ['@sparkjsdev/spark'] }`). It gets its own budget, set in Task 4 from the measured build at measured + 5%, rounded up to the next 1000. The thumbnail worker's copy gets the same budget under its worker prefix.
  - A budget is never raised without a ledgered ruling.
- **Limits** live in `src/splats/limits.js`:
  - `SPLAT_BUDGET = { desktop: 8_000_000, tablet: 3_000_000, phone: 1_500_000, thumbnail: 500_000 }`;
  - `SPLAT_CEILING_BYTES = 1024 ** 3`;
  - `BOUNDS_SAMPLE = 100_000`;
  - `BOUNDS_PERCENTILE = 0.005`.
  - A 200 MB `.splat` (32 bytes a splat) is about 6.5M splats, so it loads whole on a desktop.
- **Device class:** the device class comes from the logic `pointBudget` uses today, factored out as `deviceClass(env)` (`'desktop' | 'tablet' | 'phone'`) in `src/pointclouds/budget.js`.
  - A device reporting `deviceMemory` ≤ 4 is at most `'tablet'`.
  - `pointBudget(env)` returns `POINT_BUDGET[deviceClass(env)]`, with unchanged results.
- **Copy** is fixed by this plan. Every string goes through `t('threedviewer', …)` with British spelling, and `npm run i18n:sync` runs after adding strings.
  - Thinning: `Showing 1 in {n} splats` (n = round(total / kept), when n ≥ 2), otherwise `Showing {kept} of {total} splats`.
  - Ceiling: `This splat is {size}. The viewer opens splats up to 1 GB.`
  - Unreadable: `This splat couldn't be read.` Spark's own error goes to the log as the `cause`, not to the person: it is English and internal.
  - Empty: `This file holds no splats.`
  - Panel heading: `Not available for splats`.
- **The tools that are off for a splat, and their notes**, in the order the panel and top bar show them, from `SPLAT_UNAVAILABLE` in `src/splats/unavailable.js`:

  | Key | Label | Note |
  |---|---|---|
  | `shading` | Shading and wireframe | `A splat shows the colours it was captured with, so it has no shading or wireframe.` |
  | `measure` | Measurement | `A splat has no real surface to measure.` |
  | `notes` | the annotation control's own label in the panel | `A splat has no real surface to pin a note to.` |
  | `compare` | Comparison | `Comparing splats isn't available yet.` |
  | `crossSection` | Cross-section | `A splat has no real surface to cut through.` |
  | `printCheck` | Print check | `A splat has no real surface, so there's nothing to check for printing.` |
  | `exploded` | Exploded view | `A splat is a single capture, with no parts to pull apart.` |
  | `transform` | Transform | `A splat is for looking at. Which way is up turns it the right way.` |
  | `export` | Export | `Export saves meshes, and a splat has no surface to save.` |
  | `vr` | VR | `VR isn't available for splats.` |

  - `compare` covers comparison and version comparison, as it does for scans.
  - `export` covers Export and Send to Slicer.
  - If the panel's order differs from the table, the panel's order wins: rule it and ledger it.
- **What works for a splat:** orbit and zoom, bookmarks, view links (camera), snapshots, turntable videos, thumbnails, public links and embedding.
- **The splat marker:** `root.userData.tdvSplat = { format, count, total, unit: 'm', defaultUp: '+y', up: '+y' }`.
  - `format` is `'splat' | 'spz' | 'ply'`.
  - `count` is the number drawn, `total` the number in the file.
- **The bounds box:**
  - a `THREE.Mesh` of a `BoxGeometry` spanning the percentile bounds, placed at their centre;
  - `name = 'tdv-splat-bounds'`, `visible = false`, `layers.set(31)`, `userData.tdvBoundsProxy = true`.
  - Statistics and every traversal that counts geometry skip `tdvBoundsProxy`.
- **Which way is up:** the values, labels, rotations, permissions and `FileUpControl` are those point clouds use (`src/pointclouds/upAxis.js`, `upValues.js`). Splats default to `'+y'`.
- **Formats:**
  - `.splat` is the antimatter15 layout, passed to Spark as `fileType: SplatFileType.SPLAT`.
  - `.spz` (Niantic, versions 2 and 3) and splat `.ply` are detected by Spark from their bytes. `fileName: 'splat.<ext>'` is passed too.
  - A PLY is a splat when its vertex element has all of `f_dc_0`, `scale_0`, `rot_0` and `opacity`, or when it has a `chunk` element and its vertex element has `packed_position`. The splat test runs before the point-cloud test.
- **Server:**
  - Formats:
    - `splat` → `model/x-gaussian-splat`;
    - `spz` → `model/x-spz`;
    - `SupportedFormats::SPLAT_EXTENSIONS = ['splat', 'spz']`;
    - `SPLAT_MAX_BYTES = 1024 ** 3`, allowed by `FileController` for those extensions.
  - File settings: `FileSettingsService::UP_FORMATS` and `UNITLESS_FORMATS` gain `splat` and `spz`. `ply` is already in both.
  - The repair steps register the new mappings and leave an admin's own mapping for either extension alone.
- **Policy:** `CspListener` and `ResponseBuilder` add `blob:` to the allowed worker sources, beside `'self'`. Nothing else in the policy changes.
- **Platform and APIs:** Nextcloud 31–35, OCP APIs only (`tests/unit/NoPrivateServerApiTest.php`). The file-settings routes already check the request token and permissions; nothing here adds a route.
- **Commits and process:**
  - Conventional commit types, no Co-Authored-By trailer.
  - CHANGELOG entries under `[Unreleased]`; the README's format list and feature bullets are updated in Task 8.
  - Nothing is pushed without asking.
  - Never mount the repo into a container. PHP runs on streamed copies with the scratchpad's `php-tools/` scripts (`php-unit.sh`, `php-tool.sh`, `nc-sync.sh`, `nc-test.sh`).
  - Never write the test server's admin password anywhere. Throwaway users are made with `occ user:add --password-from-env` and a random `openssl rand` value that is never printed.
  - **Downloads need the user's OK first**, stating the filename, source, size and licence. That covers `npm install @sparkjsdev/spark@2.4.0` (Task 1). The fixtures are generated, not downloaded.
  - The lockfile is regenerated with npm 10 and no `node_modules` (the scratchpad's `npm10`), and `npm ci` must then install cleanly.

## Review Focus

1. **The turntable of a splat.** Every recorded frame is drawn after the sort for that frame's camera has finished, so no frame shows the previous angle's ordering as see-through streaks. Pinned by `useTurntable.test.js` "awaits prepareFrame before each frame is drawn" and the Playwright turntable case (Task 6).
2. **A splat on a public link and in an embed.** Both pages' policy allows Spark's blob workers, so the splat opens with no policy violation in the console. Pinned by the `CspListenerTest` and `ResponseBuilderTest` cases (Task 1), the embed Playwright case (Task 7) and the live check, which fails on any console message naming the Content Security Policy (Task 8).
3. **A splat PLY, a face-less scan PLY and a mesh PLY in the same folder.** Each opens as what it is: splat, point cloud, mesh. Pinned by `splatPly.test.js` and `ply.test.js` routing cases (Task 3) and the Playwright PLY case (Task 4).
4. **Cancel loading while Spark is still parsing a large splat.** No model appears, no error toast shows, the late result is disposed, and the next file opens normally. Pinned by `loadSplat.test.js` "abort drops a late result and disposes it" (Task 3) and the Playwright cancel case (Task 4).
5. **A capture with floaters far from the subject.** The camera frames the subject, not the floaters. Pinned by `splatBounds.test.js` "ignores the outer 0.5 % on each axis" (Task 3).

---

### Task 1: Spark, the names this plan uses, and the policy for its workers

**Files:**
- Modify: `package.json`, `package-lock.json` (npm 10, no `node_modules`)
- Create: `tests/unit/splats/sparkContract.test.js`
- Modify: `lib/Listener/CspListener.php`, `lib/Service/ResponseBuilder.php`
- Test: `tests/unit/Listener/CspListenerTest.php`, `tests/unit/Service/ResponseBuilderTest.php`. Use the existing test files for these classes if their paths differ.

**Interfaces:**
- Produces: the dependency `@sparkjsdev/spark` pinned at exactly `2.4.0`, and the names later tasks use:
  - `SplatMesh` (options `packedSplats`; `initialized`; `dispose()`);
  - `PackedSplats` (options `fileBytes`, `fileType`, `fileName`; `initialized`, `numSplats`, `extractSplats(indices: Uint32Array, pageColoring: boolean): PackedSplats`, `getSplat(index)`, `dispose()`);
  - `SparkRenderer` (option `renderer`; `update({ scene, camera }): Promise`, `dispose()`);
  - `SplatFileType.SPLAT`.

- [ ] **Step 1:** Ask the user before installing. State the filename `@sparkjsdev/spark@2.4.0`, the source (npm registry), the size (17.2 MB unpacked, about 2.85 MB for the minified module the build bundles) and the licence (MIT). On approval, add it as an exact dependency and regenerate the lockfile with npm 10.
- [ ] **Step 2: Write `sparkContract.test.js`.**
  - It reads `node_modules/@sparkjsdev/spark/dist/types/{SplatMesh,PackedSplats,SparkRenderer,defines}.d.ts` as text.
  - It asserts that each name in the Produces block is declared there.
  - It asserts that `package.json` pins `"@sparkjsdev/spark": "2.4.0"`.
  - An upgrade that renames any of them fails here, not in a browser.
- [ ] **Step 3:** Run `npx jest tests/unit/splats/sparkContract.test.js`. Expected: PASS once installed. Then point it at a misspelt name (`extractSplat`) and watch it FAIL, so the test is shown to bite. Revert the misspelling.
- [ ] **Step 4: Write the failing PHP tests.**
  - `CspListenerTest` "allows the app's own and blob workers": the policy built for the event allows worker sources `'self'` and `blob:`.
  - `ResponseBuilderTest`: the same for its policy.
  - Both also assert that `script-src` is what it was before.
- [ ] **Step 5:** Run `php-unit.sh --filter 'CspListener|ResponseBuilder'`. Expected: FAIL on the missing `blob:`.
- [ ] **Step 6:** Add `$policy->addAllowedWorkerSrcDomain('blob:')` beside the existing `'self'` in both places. Extend the comment: Spark builds its sort and parse workers from blob URLs, and only script already on the page can create one.
- [ ] **Step 7:** Run `php-unit.sh --filter 'CspListener|ResponseBuilder'`, then `php-unit.sh`. Expected: PASS.
- [ ] **Step 8: Commit.** `build(splats): add Spark and allow its blob workers`

### Task 2: Server — splat formats, size limit, up and unit

**Files:**
- Modify: `lib/Constants/SupportedFormats.php`, `lib/Controller/FileController.php`, `lib/Service/FileSettingsService.php`, `appinfo/mimetypemapping.json`
- Modify, if their output changes: `openapi.json` (regenerated) and `psalm-baseline.xml`
- Test: `tests/unit/Constants/SupportedFormatsTest.php`, `tests/unit/Controller/FileControllerTest.php`, `tests/unit/Service/FileSettingsServiceTest.php`, the repair-step tests, `tests/http/FileSettingsHttpTest` (or the existing HTTP test for file settings)

**Interfaces:**
- Produces:
  - `SupportedFormats::SPLAT_EXTENSIONS` and `SupportedFormats::SPLAT_MAX_BYTES`;
  - MIME types `model/x-gaussian-splat` and `model/x-spz`;
  - `splat` and `spz` accepted by `FileSettingsService::set()` for both `up` and `unit`.

- [ ] **Step 1: Write the failing tests.**
  - `SupportedFormatsTest`: `splat` maps to `model/x-gaussian-splat` and `spz` to `model/x-spz`.
  - `mappableExtensions` leaves a site's own mapping for `splat` alone.
  - `FileControllerTest` "a splat may run to 1 GB": a 900 MB `.spz` is served, a 1.1 GB one is refused with the route's existing too-large response, and a 600 MB `.stl` is still refused.
  - `FileSettingsServiceTest`: `up` `'-y'` on a `.splat` is stored, `unit` `'cm'` on a `.spz` is stored, and `up` on an `.stl` is still refused.
  - The HTTP test: an editor sets `up` on a `.splat` and a view-only colleague reads it back.
- [ ] **Step 2:** Run `php-unit.sh --filter 'SupportedFormats|FileController|FileSettings|ThreeDMimeTypes'`. Expected: FAIL.
- [ ] **Step 3:** Add the constants, the two formats in every table `SupportedFormats` keeps (follow `e57`), the `FileController` limit, the two lists in `FileSettingsService`, and the two mapping lines.
- [ ] **Step 4:** Run `php-unit.sh`, `nc-sync.sh`, then `nc-test.sh http --filter 'FileSettings'`. Expected: PASS. Regenerate `openapi.json` if its enums list formats. Splice psalm's baseline only for environment issues, as before.
- [ ] **Step 5: Commit.** `feat(splats): register splat formats on the server`

### Task 3: The splat core — budget, bounds, PLY detection, and the loader

**Files:**
- Create:
  - `src/splats/limits.js`;
  - `src/splats/splatBudget.js`;
  - `src/splats/splatBounds.js`;
  - `src/splats/splatPly.js`;
  - `src/splats/splatErrors.js`;
  - `src/splats/splatExtensions.js`;
  - `src/splats/loadSplat.js`;
  - `src/loaders/types/splatModel.js`;
  - `scripts/splatFixtureWriters.mjs`;
  - `scripts/make-splat-fixtures.mjs`;
  - `tests/fixtures/splats/{grid.splat,grid.ply,grid-sh3.ply,grid.spz,SOURCES.md}`.
- Modify: `src/pointclouds/budget.js` (factor out `deviceClass`), `src/pointclouds/readers/plyPoints.js` (`isPointCloudPly` uses `isSplatPly`), `src/loaders/types/ply.js` (route splats first)
- Test:
  - `tests/unit/splats/{splatBudget,splatBounds,splatPly,loadSplat,fixtures}.test.js`, `tests/unit/loaders/splatModel.test.js`;
  - `tests/unit/pointclouds/budget.test.js` (existing, must stay green);
  - `tests/unit/loaders/ply.test.js`.

**Interfaces:**
- Consumes: Task 1's Spark names; `plyHeader` and `isPointCloudPly` from `src/pointclouds/readers/plyPoints.js`; `abortError` from `src/pointclouds/scanFormats.js`.
- Produces:
  - `deviceClass(env): 'desktop'|'tablet'|'phone'` and `currentDeviceClass(): string`, in `src/pointclouds/budget.js`.
  - `splatBudget(): number`; `splatThinningNote(kept: number, total: number): ?string`.
  - `evenIndices(total: number, count: number): Uint32Array`. Its count is min(total, count), it is increasing, and index i = floor(i · total / count).
  - `splatBounds(packed): THREE.Box3`. The packed splats are anything with `numSplats` and `getSplat(i)`. It uses `evenIndices(numSplats, BOUNDS_SAMPLE)` and, on each axis, the `BOUNDS_PERCENTILE` and 1 − `BOUNDS_PERCENTILE` quantiles.
  - `isSplatPly(header): boolean`.
  - `SplatError`, `SplatTooLargeError(size)`, `EmptySplatError`.
  - `SPLAT_EXTENSIONS = ['splat', 'spz']`, `isSplatExtension(ext): boolean`.
  - `loadSplat(bytes: Uint8Array, { format: string, budget: number, signal?: AbortSignal }): Promise<THREE.Group>`. It returns the root described in Global Constraints. It throws `EmptySplatError` for zero splats, `SplatError` (with Spark's error as `cause`) when Spark refuses the file, and an `AbortError` when cancelled.
  - `loadSplatModel(loader, input: Blob|ArrayBuffer, context): Promise<object>`, in `src/loaders/types/splatModel.js`. It is what every splat loader shares, as `pointCloud.js` is for scans:
    - it refuses input over `SPLAT_CEILING_BYTES` with `SplatTooLargeError`;
    - it calls `loadSplat` with `context.fileExtension`, `context.thumbnail ? SPLAT_BUDGET.thumbnail : splatBudget()` and `context.abortController?.signal`;
    - it maps `EmptySplatError` and `SplatError` to the copy in Global Constraints, keeping the original as `cause`, and lets `AbortError` through;
    - it returns `loader.processModel(root, context)`.
  - The fixture grid: 1000 splats, 10 × 10 × 10, spanning x ∈ [−1, 1], y ∈ [0, 1], z ∈ [−0.25, 0.25]. Each is coloured by its position, with opacity 0.9, scale 0.02 and rotation identity. So the extent is 2 × 1 × 0.5 m, and turning it changes its height.

- [ ] **Step 1: Write the failing tests.**
  - `budget.test.js` gains "deviceClass": the same inputs that give `POINT_BUDGET.phone`, `tablet` and `desktop` today give `'phone'`, `'tablet'` and `'desktop'`; a desktop with `deviceMemory: 4` is `'tablet'`.
  - `splatBudget.test.js`:
    - `SPLAT_BUDGET[deviceClass]` for each class;
    - `splatThinningNote(1000, 4000)` is `Showing 1 in 4 splats`;
    - `splatThinningNote(3000, 4000)` is `Showing 3,000 of 4,000 splats`;
    - `splatThinningNote(10, 10)` is null.
  - `splatBounds.test.js`:
    - `evenIndices(10, 4)` is `[0, 2, 5, 7]`, and `evenIndices(3, 10)` is `[0, 1, 2]`;
    - "ignores the outer 0.5 % on each axis": 10 000 centres in [0, 1]³ plus 10 at x = 1000 give a box whose `max.x` < 2;
    - a single splat gives a box of zero size at its centre.
  - `splatPly.test.js`:
    - a 3DGS header (`f_dc_0`, `scale_0`, `rot_0`, `opacity`) is a splat;
    - a SuperSplat compressed header (`element chunk`, vertex `packed_position`) is a splat;
    - a face-less `x y z red green blue` header is not;
    - a header with `f_dc_0` but no `rot_0` is not;
    - `isPointCloudPly` is false for both splat headers.
  - `ply.test.js` "routes a splat PLY to the splat loader before the scan reader": with `./splatModel.js` mocked, `grid.ply` calls `loadSplatModel` with `fileExtension: 'ply'`, and the existing mesh and scan cases still route as before.
  - `splatModel.test.js`, with `loadSplat` mocked:
    - a 1.1 GB Blob is refused with `This splat is 1.1 GB. The viewer opens splats up to 1 GB.` before `loadSplat` is called;
    - `EmptySplatError` becomes `This file holds no splats.` and `SplatError` becomes `This splat couldn't be read.`, each with the original as `cause`;
    - `AbortError` passes through unchanged;
    - `context.thumbnail` passes `SPLAT_BUDGET.thumbnail`.
  - `loadSplat.test.js` mocks `@sparkjsdev/spark` with small classes recording their calls.
    - `format: 'splat'` passes `fileType: SplatFileType.SPLAT`; `'spz'` passes no `fileType` and `fileName: 'splat.spz'`.
    - Under budget, the `PackedSplats` is used as it is.
    - "thins to the budget": with `numSplats` 4000 and budget 1000, `extractSplats` gets `evenIndices(4000, 1000)` and `false`, the original is disposed, and `tdvSplat` is `{ format, count: 1000, total: 4000, unit: 'm', defaultUp: '+y', up: '+y' }`.
    - The root holds the `SplatMesh` and one child named `tdv-splat-bounds`, with `visible` false, layer 31 only and `userData.tdvBoundsProxy`. `new THREE.Box3().setFromObject(root)` equals `splatBounds`.
    - Zero splats throws `EmptySplatError`.
    - A rejected `initialized` throws `SplatError` whose `cause` is the rejection.
    - "abort drops a late result and disposes it": aborting before `initialized` resolves rejects with `AbortError` at once, and the `PackedSplats` is disposed when it resolves later.
  - `fixtures.test.js` reads each fixture back with a small reader in the test file (not Spark).
    - `grid.splat` is 32 000 bytes, and splat 0 is at (−1, 0, −0.25).
    - `grid.ply`'s header passes `isSplatPly` and has 1000 vertices.
    - `grid-sh3.ply` has `f_rest_0`…`f_rest_44`.
    - `grid.spz` gunzips to magic `0x5053474e`, version 2, 1000 points, SH degree 0.
- [ ] **Step 2:** Run `npx jest tests/unit/splats tests/unit/pointclouds/budget.test.js tests/unit/loaders/ply.test.js tests/unit/loaders/splatModel.test.js`. Expected: FAIL on the missing modules.
- [ ] **Step 3: Write the fixture writers in `scripts/splatFixtureWriters.mjs`.**
  - `splatFile(splats)`: 32 bytes a splat: position float32 × 3; scale float32 × 3 (linear); colour RGBA uint8, with alpha = opacity × 255; rotation uint8 × 4 (w x y z, q × 128 + 128).
  - `splatPly(splats, { sh: 0 | 3 })`: binary little-endian 3DGS layout: `x y z nx ny nz f_dc_0..2 [f_rest_0..44] opacity scale_0..2 rot_0..3`. It writes log scales, logit opacity, and `f_dc = (colour − 0.5) / 0.28209479177387814`.
  - `spzFile(splats)`: SPZ version 2, gzipped (`zlib.gzipSync`):
    - a 16-byte header: magic, version, count, SH degree 0, 12 fractional bits, flags 0, reserved 0;
    - positions as 24-bit signed fixed point;
    - alphas as uint8 sigmoid × 255;
    - colours as `dc × 0.15 × 255 + 127.5`;
    - scales as `(ln s + 10) × 16`;
    - rotations as xyz of the w ≥ 0 quaternion, `v × 127.5 + 127.5`.
  - `scripts/make-splat-fixtures.mjs` writes the four files. `SOURCES.md` says they are generated by it and names the format references: antimatter15/splat (MIT), Niantic spz (MIT) and the 3DGS PLY layout.
- [ ] **Step 4: Implement the modules to the Produces block.**
  - `loadSplat` imports Spark with `await import('@sparkjsdev/spark')`.
  - It races `initialized` against the signal.
  - Thinning: `extractSplats(evenIndices(total, budget), false)`, then dispose the original.
  - It builds the `SplatMesh` from `{ packedSplats }` and awaits its `initialized`, then adds the bounds box.
  - `ply.js` checks `isSplatPly` before `isPointCloudPly`, and hands a splat to `loadSplatModel(this, blob, { ...context, fileExtension: 'ply' })`.
- [ ] **Step 5:** Run the Step 2 command, then `npx jest`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(splats): read splats through Spark, thinned to the device`

### Task 4: Splats open in the full viewer

**Files:**
- Create: `src/splats/sparkHost.js`, `src/loaders/types/splat.js`, `src/loaders/types/spz.js`, `img/filetypes/splat.svg`, `img/filetypes/spz.svg` (follow the existing `img/filetypes/` icons' path and style), `tests/playwright/splats.spec.ts`
- Modify:
  - `src/loaders/registry.js`, `src/config/viewer-config.js` (`SUPPORTED_FORMATS`), `src/main.js` (`SUPPORTED_MIMES`);
  - `src/pointclouds/blobReader.js` (`readScanBody` option `tooLarge`), `src/composables/useModelLoading.js`;
  - `src/components/ThreeViewer.vue`;
  - `vite.config.js` (`manualChunks`), `scripts/check-bundle-size.mjs`.
- Test: `tests/unit/splats/sparkHost.test.js`, `tests/unit/pointclouds/blobReader.test.js`, `tests/playwright/splats.spec.ts`

**Interfaces:**
- Consumes: `loadSplatModel`, `isSplatExtension`, `SPLAT_CEILING_BYTES` and `SplatTooLargeError` from Task 3.
- Produces:
  - `attachSpark(scene: THREE.Scene, renderer: THREE.WebGLRenderer): { spark, prepare(camera): Promise<void>, dispose(): void }`, in `src/splats/sparkHost.js`.
    - It adds `new SparkRenderer({ renderer })` to the scene itself, never to the model root, whose box it would distort.
    - `prepare` awaits `spark.update({ scene, camera })`.
    - `dispose` removes and disposes it.
  - `readScanBody(response, { …, tooLarge = (size) => new ScanTooLargeError(size) })`.
  - ThreeViewer's model-loaded meta gains `splat: { format, count, total, defaultUp, up }` (null for anything else). ThreeViewer keeps `splatHost` while a splat is the model and disposes it when the model is replaced or the viewer unmounts.

- [ ] **Step 1: Write the failing tests.**
  - `sparkHost.test.js`, with Spark mocked:
    - the SparkRenderer is a child of the scene;
    - `prepare(camera)` resolves only after the mocked `update` resolves, and passes `{ scene, camera }`;
    - `dispose` removes and disposes it.
  - `blobReader.test.js` "a custom refusal": a content-length over the ceiling throws what `tooLarge` returns.
  - `splats.spec.ts`, in the existing Playwright harness, following `point-clouds.spec.ts`:
    - "opens a .splat, a .spz and a splat .ply": each fixture loads with `root.userData.tdvSplat.count === 1000`, a SparkRenderer in the scene, no page errors, and canvas pixels at the centre that differ from the background;
    - "the three kinds of PLY": `grid.ply` is a splat, the existing face-less fixture a point cloud and the existing mesh fixture a mesh;
    - "a damaged splat": a `.spz` of 64 random bytes shows `This splat couldn't be read.`;
    - "cancel while a splat parses": with the fixture's response delayed, Cancel loading leaves no model and no error toast, and a second file then opens.
- [ ] **Step 2:** Run `npx jest tests/unit/splats tests/unit/pointclouds/blobReader.test.js`. Expected: FAIL. Run `npm run build && npx playwright test tests/playwright/splats.spec.ts`. Expected: FAIL (format unknown).
- [ ] **Step 3: Implement.**
  - `splat.js` and `spz.js` are `BaseLoader`s whose `loadModel` is `loadSplatModel(this, input, context)`.
  - Register `splat` and `spz` in the registry, `SUPPORTED_FORMATS` (with the icons) and `SUPPORTED_MIMES`.
  - `useModelLoading` downloads `isSplatExtension(ext)` files through `readScanBody`, with `ceiling: SPLAT_CEILING_BYTES` and `tooLarge: (size) => new SplatTooLargeError(size)`.
  - ThreeViewer, after a model is added: when `root.userData.tdvSplat` is set, `splatHost = (await import('../splats/sparkHost.js')).attachSpark(scene, renderer)`. Dispose it where the previous model is cleared and in `beforeUnmount`.
- [ ] **Step 4:** Add `spark: ['@sparkjsdev/spark']` to `manualChunks`. Build and measure the Spark chunk and its thumbnail-worker copy. Add their budgets to `check-bundle-size.mjs` at measured + 5%, rounded up to 1000, and ledger the numbers. Run `node scripts/check-bundle-size.mjs`. Expected: every budget OK, the App chunk included.
- [ ] **Step 5:** Run `npx jest && npm run build && npx playwright test tests/playwright/splats.spec.ts && npm run format:check`. Expected: PASS.
- [ ] **Step 6: Commit.** `feat(splats): open splats in the viewer`

### Task 5: The tools that are off, the splat's panel section, and its statistics

**Files:**
- Create: `src/utils/offTools.js`, `src/splats/unavailable.js`, `src/components/SplatControls.vue`, `src/components/SplatStats.vue`
- Modify:
  - `src/App.vue`, `src/components/SlideOutToolPanel.vue`, `src/components/MinimalTopBar.vue` (props only);
  - `src/components/ThreeViewer.vue`, `src/composables/useModelStats.js`;
  - `src/utils/sourceUnits.js` (a splat is metres, changeable).
- Test:
  - `tests/unit/utils/offTools.test.js`, `tests/unit/components/splatControls.test.js`, `tests/unit/composables/useModelStats.test.js`, `tests/unit/utils/sourceUnits.test.js`;
  - the panel and App tests that cover point-cloud gating today (they must stay green);
  - `tests/playwright/splats.spec.ts`, `tests/playwright/point-clouds.spec.ts`.

**Interfaces:**
- Consumes: Task 4's model-loaded `splat` meta; `POINT_CLOUD_UNAVAILABLE`.
- Produces:
  - `POINT_CLOUD_OFF` (the keys of `POINT_CLOUD_UNAVAILABLE`, in order) and `SPLAT_OFF` (the Key column of the table in Global Constraints), in `src/utils/offTools.js`. They are keys only, so the App chunk carries no notes.
  - `offToolsFor(meta): readonly string[]`, also in `src/utils/offTools.js`.
  - App gains:
    - data `splat` and `offTools`, set in `onModelLoaded`;
    - method `isOff(key)`.
  - Every handler that today begins `if (this.pointCloud) return` begins `if (this.isOff('<key>')) return` instead. These handlers gain the same guard: `onToggleMeasurement` (`measure`), `onToggleAnnotation` (`notes`), `onToggleClipping` (`crossSection`), `onToggleTransformGizmo` (`transform`), `onToggleVR` (`vr`).
  - SlideOutToolPanel:
    - it gains props `offTools: Array` and `splat: Object`;
    - `unavailable(key)` reads `offTools`;
    - each gated control's click is guarded by `offTools.includes(key)`, in place of `pointCloud ||`;
    - a Splat section shows `SplatControls` while `splat` is set.
  - MinimalTopBar gets `:webxr-supported="webxrSupported && !isOff('vr')"`.
  - `useModelStats` gives a splat `isSplat`, `splatCount` and `splatTotal`, with its extent from the root's box. It skips `tdvBoundsProxy` meshes in every vertex and face count.

- [ ] **Step 1: Write the failing tests.**
  - `offTools.test.js`:
    - `POINT_CLOUD_OFF` equals `POINT_CLOUD_UNAVAILABLE.map(u => u.key)`, and `SPLAT_OFF` equals `SPLAT_UNAVAILABLE.map(u => u.key)`;
    - `offToolsFor({ pointCloud: {…} })` is `POINT_CLOUD_OFF`, `offToolsFor({ splat: {…} })` is `SPLAT_OFF`, and `offToolsFor({})` is empty.
  - `splatControls.test.js`:
    - it renders each `SPLAT_UNAVAILABLE` line with id `tdv-unavailable-{key}` under the heading `Not available for splats`;
    - with `{ count: 1000, total: 4000 }` it shows `Showing 1 in 4 splats` in a `role="status"` line;
    - it shows `FileUpControl` when given an up state.
  - The panel test "a splat turns off the tools that need a surface": with `offTools` set to `SPLAT_OFF`, each gated control is `aria-disabled="true"` with `aria-describedby="tdv-unavailable-<key>"`, and clicking it emits nothing. Bookmarks, snapshot and turntable stay enabled.
  - The existing point-cloud gating tests pass with `offTools: POINT_CLOUD_OFF` in place of the `pointCloud` checks.
  - `useModelStats.test.js`: a splat root gives `isSplat` true, `splatCount` 1000, `splatTotal` 4000 and the box's extent, and counts no vertices from the bounds box.
  - `sourceUnits.test.js`: a root with `tdvSplat` reads as metres, changeable.
  - `splats.spec.ts` "the tools that are off":
    - with `grid.splat` open, pressing each gated tool's keyboard shortcut does nothing;
    - each gated control is described by its line;
    - the top bar has no VR button even with WebXR stubbed as supported;
    - the statistics show `1,000` splats and an extent of 2 × 1 × 0.5 m.
  - `point-clouds.spec.ts` stays green.
- [ ] **Step 2:** Run `npx jest tests/unit/utils/offTools.test.js tests/unit/components tests/unit/composables/useModelStats.test.js tests/unit/utils/sourceUnits.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement to the Produces block.**
  - Load `SplatControls` and `SplatStats` with `defineAsyncComponent`, as `PointCloudControls` and `PointCloudStats` are.
  - ThreeViewer shows `SplatStats` where `PointCloudStats` shows, and hides the mesh-only rows for a splat as it does for a cloud.
- [ ] **Step 4:** Run `npx jest && npm run lint && npm run build && node scripts/check-bundle-size.mjs && npx playwright test && npm run i18n:sync && npm run i18n:check`. Expected: PASS, with the App chunk within 384000 / 108000.
- [ ] **Step 5: Commit.** `feat(splats): say which tools a splat has no use for`

### Task 6: Which way is up for a splat, and turntables that wait for the sort

**Files:**
- Modify: `src/components/ThreeViewer.vue` (`turnScan` becomes `turnModel`, reading `tdvPointCloud ?? tdvSplat`; `setUp` accepts a splat), `src/App.vue` (the splat's up state reaches `SplatControls`), `src/composables/useTurntable.js`
- Test: `tests/unit/composables/useTurntable.test.js`, `tests/playwright/splats.spec.ts`, `tests/playwright/turntable.spec.ts`

**Interfaces:**
- Consumes: `attachSpark`'s `prepare` (Task 4); `useFileUp` and `FileUpControl`.
- Produces:
  - `useTurntable({ …, prepareFrame?: () => Promise<void> | void })`. Each frame: place the camera, `beforeRender()`, `await prepareFrame()`, render, `requestFrame()`. The next frame is not scheduled until that one is drawn.
  - ThreeViewer passes `prepareFrame: () => splatHost?.prepare(camera)`.
  - ThreeViewer emits `splat-changed` with `{ upState }`, as it emits `point-cloud-changed`.

- [ ] **Step 1: Write the failing tests.**
  - `useTurntable.test.js` "awaits prepareFrame before each frame is drawn": with a `prepareFrame` resolving on a manual trigger and a fake `raf`, `renderer.render` is not called until the trigger fires. It is then called once with the camera at that frame's orbit position, and a frame count of 3 gives 3 prepares and 3 renders, alternating.
  - "without prepareFrame nothing changes": the existing cases stay green.
  - `splats.spec.ts` "which way is up":
    - an editor picks `+Z up` on `grid.splat`, and the placed height changes from 1 to 0.5;
    - a reload shows `+Z up` and the turned height;
    - a view-only user sees the control read-only.
  - `turntable.spec.ts` "records a splat": recording `grid.splat` for 4 s at 720p yields a non-empty video and, per frame, one Spark `update` before each render (counted by wrapping `prepare` in the test).
- [ ] **Step 2:** Run `npx jest tests/unit/composables/useTurntable.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. The step function becomes async. A rejected `prepareFrame` ends the recording through the existing error path.
- [ ] **Step 4:** Run `npx jest && npm run build && npx playwright test tests/playwright/splats.spec.ts tests/playwright/turntable.spec.ts tests/playwright/point-clouds.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(splats): turn a splat the right way up, and record it frame-true`

### Task 7: Public links, embeds and thumbnails

**Files:**
- Modify: `src/views/ViewerComponent.vue`, `src/thumbnails/renderThumbnail.js`
- Test: `tests/playwright/embed.spec.ts`, `tests/playwright/thumbnail-worker.spec.ts`, `tests/unit/thumbnails/renderThumbnail.test.js`

**Interfaces:**
- Consumes: `attachSpark` (Task 4); `SPLAT_BUDGET.thumbnail` through `context.thumbnail` (Task 3).
- Produces:
  - The light viewer:
    - downloads `isSplatExtension` files and PLYs as Blobs (with the splat ceiling for splats);
    - attaches Spark when a splat loads, and disposes it on model change and unmount;
    - turns the splat by the saved up, as it does a scan;
    - counts splats and size in its model info.
  - `renderThumbnail` attaches Spark to its own scene and renderer when the root has `tdvSplat`. It awaits `prepare(camera)` before its single render, and disposes it after.

- [ ] **Step 1: Write the failing tests.**
  - `renderThumbnail.test.js`, with `sparkHost` mocked: for a root with `tdvSplat`, `prepare` resolves before `renderer.render` is called, and `dispose` follows. A mesh root never attaches.
  - `embed.spec.ts` "a splat embeds": `grid.spz` on the embed page shows a SparkRenderer in the scene, 1000 splats, no page errors and no console message containing `Content Security Policy`.
  - The light viewer's public-link case does the same for `grid.splat`, with a saved `-y` up applied.
  - `thumbnail-worker.spec.ts` "a splat thumbnail": each of the three fixtures gives an `ok` PNG whose centre pixels differ from the background.
- [ ] **Step 2:** Run `npx jest tests/unit/thumbnails/renderThumbnail.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement to the Produces block.
- [ ] **Step 4:** Run `npx jest && npm run build && npx playwright test tests/playwright/embed.spec.ts tests/playwright/thumbnail-worker.spec.ts`. Expected: PASS.
  - If Spark's blob workers cannot start inside the thumbnail worker in Chromium, stop and ledger it as a ruling with the error. Splat thumbnails then use the page-side capture (`src/thumbnails/captureFromViewer.js`) instead, and the spec's "thumbnails work" is met that way.
- [ ] **Step 5: Commit.** `feat(splats): splats on public links, embeds and thumbnails`

### Task 8: Docs, and a check in a real Nextcloud

**Files:**
- Create: `scripts/live-splat-check.mjs`
- Modify: `README.md` (format list, feature bullet), `docs/TECHNICAL.md` (a "Gaussian Splats" section beside "Point Clouds"), `CHANGELOG.md` (`[Unreleased]` → Added)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1:** Write `scripts/live-splat-check.mjs` on the model of `scripts/live-pointcloud-check.mjs`: `TDV_BASE`, `TDV_USER` and `TDV_PASSWORD`, the password never printed, Node polling and not `waitForFunction` strings.
  - It uploads the four fixtures.
  - It opens each in the full viewer and expects `tdvSplat.count === 1000`.
  - It fails on any page error or on any console message containing `Content Security Policy`.
  - It saves `up: '-y'` on `grid.splat` through the file-settings route and reads it back.
  - It opens `grid.splat` through a public link, expecting the light viewer to show it turned by π about X.
  - It cleans up after itself.
- [ ] **Step 2:** Run it against the test Nextcloud, with a throwaway user made with `occ user:add --password-from-env`. Expected: `PASS`.
- [ ] **Step 3: Write the docs.**
  - The README lists `.splat`, `.spz` and splat `.ply`, with one feature bullet.
  - TECHNICAL.md covers the pipeline (Spark parse, thinning, bounds box, `attachSpark`), the blob-worker policy and why, the `tdvSplat` marker and the off-tools lists.
  - CHANGELOG adds one Added entry.
- [ ] **Step 4:** Run `npx jest && npm run lint && npm run build && node scripts/check-bundle-size.mjs && npx playwright test && npm run format:check`, and `php-unit.sh`. Expected: PASS.
- [ ] **Step 5: Commit.** `docs: describe Gaussian splats`
