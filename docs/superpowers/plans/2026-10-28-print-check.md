# Print Check and Wall Thickness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Print check card that shows whether a model fits a chosen printer, where it overhangs, roughly how much filament it needs, the slicer's own numbers for G-code files, and, on request, which walls are too thin.

**Architecture:**
- Pure modules in `src/printCheck/` do the maths: fit, overhang, filament, closed-mesh test, G-code comments and thickness, each unit-tested.
- A worker runs the two heavy jobs off the main thread: the uncapped closed-mesh test, and thickness with `three-mesh-bvh`.
- Colours are drawn by **overlay meshes added to the scene, not under `modelRoot`**. Each one shares its source mesh's geometry and copies its world matrix. So exports (which read `modelRoot`), thumbnails (which render `modelRoot` in their own scene) and render modes (which swap `modelRoot`'s materials) are all untouched by construction.
- A composable, `usePrintCheck`, owns the state, and an async card component shows it.

**Tech Stack:** Vue 3, three.js r186, `three-mesh-bvh` 0.9.16, Vite module workers, `@nextcloud/axios`, Jest (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-viewer-tools-design.md` (sections "2. Print check" and "3. Wall thickness check", plus Goals, Non-goals, Anti-goals)

## Global Constraints

- Nextcloud 31–35: `appinfo/info.xml` keeps `<nextcloud min-version="31" max-version="35"/>`.
- **Strings:** every one goes through `t('threedviewer', …)`, or `n()` for plurals. Then run `npm run i18n:sync`; `npm run i18n:check` must report no ERROR.
- **Accessibility:** every new control is a native `button`, `input` or `select` with a name, toggles carry `aria-pressed`, and result lines sit in `aria-live="polite"` regions. This is the standard of `tests/playwright/tool-panel-keyboard.spec.ts`.
- **Nothing new loads until it's used:**
  - the card is a `defineAsyncComponent`;
  - `three-mesh-bvh` is imported only inside the worker;
  - opening a model does no print-check work.
- **`npm run build` passes `size:check`:** existing budgets stay unchanged, and new chunks get their own entry in `scripts/check-bundle-size.mjs`, sized at measured + 10%, with a comment.
- **Overlays stay out of exports and thumbnails.** Overhang shading, thickness colours, the build box and the bed are scene objects marked `userData.viewerOverlay = true`, never descendants of `modelRoot`. An STL export with print check on is byte-identical to one with it off.
- **Lengths are in millimetres:**
  - the viewer's mm-per-scene-unit is `modelMillimetresPerUnit` (`ThreeViewer.vue`, `applySourceUnits` ~line 990);
  - when the format records no unit (`stl obj ply off 3ds gcode`), the card says sizes assume millimetres.
- **Numbers use the model the way an export does,** with `withExportState` / `withPartsTogether` from `src/utils/ownDisplayState.js` and `viewerTransforms.js`:
  - they follow the move/rotate tool;
  - exploded view and clipping are ignored.
- **Print check never changes `modelRoot`'s transform or materials.**
- **Dependency:** add `three-mesh-bvh@0.9.16` with **npm 10**, not the machine's npm 11:

  ```bash
  npm i --prefix /tmp/npm10 npm@10
  /tmp/npm10/node_modules/.bin/npm install three-mesh-bvh@0.9.16 --save --package-lock-only
  /tmp/npm10/node_modules/.bin/npm ci
  ```

  Then confirm that the `rollup-(linux|darwin|win32)` key counts in `package-lock.json` match `main`.
- **Commits:**
  - conventional types, scope `print-check`;
  - **no `Co-Authored-By` trailer**;
  - don't push, and don't open a PR.
- **CHANGELOG:** entries go under `## [Unreleased]` → `### Added`.
- **Containers:** never bind-mount the repo or a worktree into a Nextcloud container; copy files in with `docker cp`.
- **Before each commit,** run `npm run lint`, `npm run stylelint`, and the task's tests.

## Review Focus

1. **STL files have no shared vertices.** The closed-mesh test must weld coincident vertices first, or every STL reads as open. (Task 3: `a non-indexed cube is closed`.)
2. **Degenerate triangles or NaN positions** (from a broken exporter) must not crash anything, and they add nothing to areas. (Tasks 2 and 3: `degenerate and NaN triangles are skipped`.)
3. **Changing model or closing the viewer while the worker runs:**
   - the worker is terminated;
   - no overlay appears on the next model;
   - no stale result is shown.

   (Task 7: `switching model cancels the running check`.)
4. **Units:**
   - A glTF cube 0.01 m wide is a 10 mm cube for fit and thickness. (Task 1: `extent honours millimetres per unit`.)
   - The card says sizes assume millimetres only for formats that record no unit. (Task 8.)
5. **Overhang shading respects an open cross-section.** Overlay materials copy `clippingPlanes` from the source material, so the shading doesn't paint through a cut. (Task 2: `overlay copies the source's clipping planes`.)

---

### Task 1: Printers, materials, defaults and fit

**Files:**
- Create: `src/printCheck/printers.js`, `src/printCheck/buildVolume.js`
- Test: `tests/unit/printCheck/buildVolume.test.js`

**Interfaces:**
- **`PRINTERS`** (`printers.js`): `Array<{ id: string, name: string, width: number, depth: number, height: number }>`, in millimetres.

  Check each size against the maker's published spec, and correct any that differ:

  | id | name | W × D × H (mm) |
  |---|---|---|
  | `prusa-mk4` | Prusa MK4S | 250 × 210 × 220 |
  | `prusa-core-one` | Prusa CORE One | 250 × 220 × 270 |
  | `prusa-mini` | Prusa MINI+ | 180 × 180 × 180 |
  | `bambu-x1` | Bambu Lab X1 / P1 series | 256 × 256 × 256 |
  | `bambu-a1` | Bambu Lab A1 | 256 × 256 × 256 |
  | `bambu-a1-mini` | Bambu Lab A1 mini | 180 × 180 × 180 |
  | `creality-ender3-v3` | Creality Ender-3 V3 | 220 × 220 × 250 |
  | `creality-k1` | Creality K1 | 220 × 220 × 250 |
  | `anycubic-kobra3` | Anycubic Kobra 3 | 250 × 250 × 260 |
  | `elegoo-neptune4-pro` | Elegoo Neptune 4 Pro | 225 × 225 × 265 |

- **`MATERIALS`** (`printers.js`), in g/cm³: `pla` 1.24, `petg` 1.27, `abs` 1.04, `asa` 1.07, `tpu` 1.21.
- **`PRINT_CHECK_DEFAULTS`** (`printers.js`): `Object.freeze({ printerId: 'prusa-mk4', custom: { width: 220, depth: 220, height: 250 }, overhangAngle: 45, infill: 20, material: 'pla', minThickness: 0.8 })`
- **Constants** (`printers.js`):
  - `OVERHANG_ANGLE_RANGE = { min: 20, max: 80 }`
  - `NEAR_THIN_FACTOR = 1.5`
  - `SHELL_DEPTH_MM = 1.2`
  - `FILAMENT_DIAMETER_MM = 1.75`
  - `BED_EPSILON_MM = 0.05`
- **`bedAxes(up: 'y'|'z')`** (`buildVolume.js`): returns `{ up: Vector3, width: Vector3, depth: Vector3 }`. `'y'` gives up +Y, width +X, depth +Z; `'z'` gives up +Z, width +X, depth +Y.
- **`modelExtentMm(root, axes, mmPerUnit)`** (`buildVolume.js`): returns `{ width, depth, height, min: Vector3, max: Vector3 }`. It uses world-space vertices along the three axes, measured inside `withPartsTogether`.
- **`fitReport(size, volume)`** (`buildVolume.js`): takes two `{width, depth, height}` objects and returns `{ fits: boolean, over: {width, depth, height}, fitsTurned: boolean }`. `over` is how far each side sticks out, 0 when inside. `fitsTurned` is true when swapping width and depth would fit.

- [ ] **Step 1: Write the failing tests:**
  - `fits when equal to the volume`
  - `reports 12.4 mm too wide`: 262.4 against 250.
  - `fitsTurned when width and depth swap`: 215 × 245 against 250 × 210.
  - `extent honours millimetres per unit`: a 0.01 cube with `mmPerUnit` 1000 gives 10 × 10 × 10.
  - `extent ignores exploded view`: a part moved with `rememberOwnTransform(part, MOVED_BY.exploded)` gives the assembled size.
  - `extent follows the move/rotate tool`: root scaled ×2 under `MOVED_BY.gizmo` gives 20.
  - `z-up axes put the file's Z as height`
- [ ] **Step 2:** Run `npx jest tests/unit/printCheck/buildVolume.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(print-check): printer volumes and the fit check`

### Task 2: Overhangs and scene overlays

**Files:**
- Create: `src/printCheck/overhang.js`, `src/printCheck/surfaceOverlay.js`
- Test: `tests/unit/printCheck/overhang.test.js`, `tests/unit/printCheck/surfaceOverlay.test.js`

**Interfaces:**
- **`overhangAngleDeg(normal: Vector3, up: Vector3)`**: returns `number|null`. It's `null` when `normal·up ≥ 0` (the face doesn't face down), otherwise `asin(-normal·up)` in degrees, where 0 is a vertical wall and 90 a flat ceiling.
- **`overhangShare(meshes: Mesh[], up: Vector3, thresholdDeg, bedHeight, bedEpsilon)`**: returns `{ overhangArea, totalArea }`. It works per triangle in world space, from the triangle's own flat normal:
  - A triangle counts when its angle is above the threshold.
  - Triangles whose highest vertex along `up` is at most `bedHeight + bedEpsilon` are on the bed and don't count as overhang, but do count in the total.
  - Degenerate (zero-area) and non-finite triangles are skipped entirely.
- **`createOverhangMaterial({ up, thresholdDeg, bedHeight, bedEpsilon, clippingPlanes = null })`**: returns a `THREE.ShaderMaterial` with uniforms `uUp`, `uCosLimit`, `uBedHeight`, `uBedEpsilon`.
  - It computes a flat world normal from `dFdx`/`dFdy` of the world position, so it agrees with `overhangShare` whatever the mesh's smooth normals are.
  - It `discard`s fragments that aren't overhang.
  - It draws `#e53935` at 0.6 opacity, with `polygonOffset` (-1, -1) and `depthWrite: false`.
  - Changing the threshold only updates a uniform.
- **`createSurfaceOverlay(scene, source: Mesh, material, extraAttributes = {})`**: returns `{ object: Mesh, sync(): void, dispose(): void }`.
  - The overlay shares `source.geometry`'s `position`, `normal` and `index`, and adds `extraAttributes`.
  - It sets `matrixAutoUpdate = false`, `userData.viewerOverlay = true` and `renderOrder = source.renderOrder + 1`.
  - `sync()` copies `source.matrixWorld` and the source's visibility in the world.
  - `dispose()` removes the overlay and disposes only what it created.
- **`createOverlaySet(scene, root, makeMaterial: (mesh) => Material, attributesFor = () => ({}))`**: returns `{ sync(), dispose(), overlays: Array }`. It covers every visible `Mesh` under `root`, skipping `Points` and `Line`.

- [ ] **Step 1: Write the failing tests:**
  - `vertical wall is 0°, ceiling 90°, upward face null`
  - `45° chamfer under the default threshold is not overhang, 50° is`
  - `cube on the bed has no overhang`, with share 0.
  - `a T shape's arm undersides are overhang`: the share equals the undersides' area over the total, within 1e-9.
  - `degenerate and NaN triangles are skipped`
  - `overlay is not under the model root, follows its matrixWorld and leaves the source geometry usable after dispose`
  - `overlay copies the source's clipping planes`
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(print-check): overhang share and scene overlays that follow the model`

### Task 3: Closed-mesh test and filament estimate

**Files:**
- Create: `src/printCheck/closedMesh.js`, `src/printCheck/filament.js`
- Test: `tests/unit/printCheck/closedMesh.test.js`, `tests/unit/printCheck/filament.test.js`

**Interfaces:**
- **`edgeReport({ positions: Float32Array, index: ?(Uint16Array|Uint32Array), tolerance = 1e-6 })`**: returns `{ boundaryEdges, nonManifoldEdges, closed }`.
  - It welds vertices whose positions agree within `tolerance × the largest bounding-box extent`, by quantised integer keys, not string keys.
  - It counts edges by welded vertex pairs and runs in O(n).
  - Degenerate triangles are skipped.
- **`modelClosed(reports)`**: returns `{ closed: boolean, openParts: number }`.
- **`estimateFilament({ volumeMm3, areaMm2, infillPercent, density, shellDepthMm = SHELL_DEPTH_MM, diameterMm = FILAMENT_DIAMETER_MM })`**: returns `{ grams, metres }`.
  - `shell = min(volume, area × shellDepth)`
  - `material = shell + (volume − shell) × infill / 100`
  - `grams = material / 1000 × density`
  - `metres = material / (π (d/2)²) / 1000`

- [ ] **Step 1: Write the failing tests:**
  - `a non-indexed cube is closed`: 36 vertices, as an STL loads.
  - `an indexed tetrahedron is closed`
  - `a cube missing one triangle has 3 boundary edges and is open`
  - `two cubes sharing one edge are non-manifold`
  - `float drift of 1e-7 still welds`
  - `degenerate and NaN triangles are skipped`
  - `modelClosed counts open parts`
  - `10 mm cube at 20% PLA`: V 1000, A 600, shell 720, material 776 mm³, so `grams` is 0.96224 and `metres` is 0.32262, both within 1e-4.
  - `100% infill uses the whole volume`: 1.24 g.
  - `0% infill uses only the shell`: 0.8928 g.
  - `a part thinner than the shell is solid`: area × shell > volume, so material = volume.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(print-check): closed-model test that welds STL vertices, and the filament estimate`

### Task 4: Slicer numbers from G-code comments

**Files:**
- Create: `src/printCheck/slicerSummary.js`
- Modify: `src/loaders/types/gcode.js`. In `loadModel` (~line 51, before `processModel`), set `gcodeGroup.userData.slicerSummary = parseSlicerSummary(text)`.
- Test: `tests/unit/printCheck/slicerSummary.test.js`, and a loader test in `tests/unit/loaders/` checking that the summary survives `processModel`.

**Interfaces:**
- **`parseSlicerSummary(text)`**: returns `{ slicer: ?string, printSeconds: ?number, filamentMm: ?number, filamentGrams: ?number }`.
  - It reads only the first and last 512 KiB of `text`, with linear-time per-line patterns.
  - Where both are present, "total estimated time" beats "model printing time".
- **`parseDuration(text)`**: returns `?number`, in seconds, from forms like `1d 2h 3m 4s`.
- **`findSlicerSummary(root)`**: returns the first `userData.slicerSummary` found under `root`, or `null`.
- **`formatDuration(seconds)`**: returns a string such as `"1 h 2 min"`, through `t()`.

- [ ] **Step 1: Write the failing tests.** Each case uses these lines; if a real file from the slicer differs, the real file wins and the fixture changes:
  - **PrusaSlicer.**
    - First line: `; generated by PrusaSlicer 2.8.1+win64 on 2024-09-30 at 10:00:00 UTC`
    - Footer: `; filament used [mm] = 1520.35`, `; filament used [g] = 4.54`, `; estimated printing time (normal mode) = 1h 2m 3s`
    - Result: `{ slicer: 'PrusaSlicer 2.8.1', printSeconds: 3723, filamentMm: 1520.35, filamentGrams: 4.54 }`
  - **SuperSlicer.** The same footer under `; generated by SuperSlicer 2.5.59.13 on …`, giving slicer `'SuperSlicer 2.5.59.13'`.
  - **OrcaSlicer.**
    - Header: `; generated by OrcaSlicer 2.1.1 on …`, `; model printing time: 52m 10s; total estimated time: 58m 41s`, `; total filament length [mm] : 1520.35`, `; total filament weight [g] : 4.54`
    - Result: `printSeconds` 3521.
  - **Bambu Studio.**
    - Header block: `; HEADER_BLOCK_START`, `; BambuStudio 01.09.07.52`, `; model printing time: 1h 2m 3s; total estimated time: 1h 8m 9s`, `; total filament length [mm] : 1520.35`, `; total filament weight [g] : 4.54`, `; HEADER_BLOCK_END`
    - Result: slicer `'BambuStudio 01.09.07.52'`, `printSeconds` 4089.
  - **Cura.**
    - Lines: `;FLAVOR:Marlin`, `;TIME:3723`, `;Filament used: 1.52035m`, `;Generated with Cura_SteamEngine 5.7.1`
    - Result: slicer `'Cura 5.7.1'`, `printSeconds` 3723, `filamentMm` 1520.35, `filamentGrams` null.
  - **No comments:** every field is null.
  - **Footer only:** a 2 MB file with the PrusaSlicer footer at the very end is still found.
- [ ] **Step 2:** Run `npx jest tests/unit/printCheck/slicerSummary.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement, and add the loader line.
- [ ] **Step 4:** Run the tests and `npx jest tests/unit/loaders`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(print-check): read the slicer's print time and filament from G-code`

### Task 5: Print-check worker: uncapped closed test and wall thickness

**Files:**
- Create:
  - `src/printCheck/thickness.js`
  - `src/printCheck/printCheck.worker.js`
  - `src/printCheck/createPrintCheckWorker.js`, on its own like `src/thumbnails/createThumbnailWorker.js`, so Jest never parses `import.meta.url`
  - `src/printCheck/printCheckClient.js`
- Modify:
  - `package.json` and `package-lock.json`: add `three-mesh-bvh@0.9.16`, using npm 10 per Global Constraints.
  - `vite.config.js`: worker output names. The thumbnail worker keeps `js/thumbnail-worker-[hash].mjs` and its chunks, so `WORKER_FILE` still matches it. The print-check worker emits `js/print-check-worker-[hash].mjs`, plus chunks matching `^js\/print-check-worker-`. Treat that pattern everywhere `WORKER_FILE` is used.
  - `scripts/check-bundle-size.mjs`: a budget for the print-check worker.
- Test: `tests/unit/printCheck/thickness.test.js`, `tests/unit/printCheck/printCheckClient.test.js`

**Interfaces:**
- **`measurePartThickness({ positions, index, normals }, { budget = 300000, onProgress })`**: returns `{ thickness: Float32Array, sampled: boolean }`.
  - **What `thickness` holds:** one value per vertex, in scene units: the distance along the inward normal to the first surface hit, built on a `MeshBVH`. `Infinity` means nothing was hit.
  - **Above the budget:** when the vertex count exceeds `budget`, an evenly spaced subset is measured. Every other vertex takes the value of a measured vertex from one of its triangles, and `sampled` is `true`.
  - **Progress:** `onProgress(done, total)` is called at most every 2% of the work.
- **Worker messages:**
  - in: `{ id, type: 'closed', parts: [{ positions, index }] }`, or `{ id, type: 'thickness', parts: [{ positions, index, normals }], budget }`
  - out: `{ id, type: 'progress', done, total }`, `{ id, type: 'result', result }` or `{ id, type: 'error', message }`
  - typed arrays are transferred as copies, never the live model's buffers
- **Client:**
  - `checkClosed(parts, { signal })` returns `Promise<Array<edgeReport>>`.
  - `measureThickness(parts, { budget, onProgress, signal })` returns `Promise<Array<{ thickness, sampled }>>`.
  - Aborting `signal` terminates the worker and rejects with an `AbortError`.
  - Each call gets its own worker, which ends when the call settles.

- [ ] **Step 1:** Add the dependency (npm 10) and confirm the lockfile's platform-entry counts match `main`.
- [ ] **Step 2: Write the failing tests.** They run `measurePartThickness` on the main thread in Jest, and `printCheckClient` with a fake worker:
  - `a 0.5 mm slab measures 0.5 on its big faces`: within 1e-6, in mm.
  - `a 10 mm cube measures 10`
  - `an open mesh returns numbers, not a throw`: missing hits are `Infinity`.
  - `over the budget, sampled is true and every vertex has a value`
  - `progress reaches total`
  - `abort terminates the worker and rejects with AbortError`
  - `worker error rejects with its message`
- [ ] **Step 3:** Run both test files. Expected: FAIL.
- [ ] **Step 4:** Implement. The worker imports `three-mesh-bvh`, `thickness.js` and `closedMesh.js` only.
- [ ] **Step 5:** Run the tests, then run `npm run build`:
  - the build emits `js/print-check-worker-*.mjs`;
  - the main chunks don't contain `three-mesh-bvh`, which you can check by grepping `js/` outside the worker files;
  - `size:check` passes with the new budget.
- [ ] **Step 6: Commit.** Message: `feat(print-check): measure wall thickness and closedness in a worker`

### Task 6: Remember the print-check choices

**Files:**
- Create: `src/printCheck/printCheckSettings.js`
- Modify: `src/views/PersonalSettings.vue`. Saving (~line 761) must keep keys it doesn't manage (`printCheck`) in the blob it PUTs. Read it first, and fix it only if it drops them.
- Test: `tests/unit/printCheck/printCheckSettings.test.js`, plus a test that `PersonalSettings` keeps `printCheck` on save.

**Interfaces:**
- **`sanitizePrintCheckSettings(raw)`**: returns a complete `Settings` object. It falls back to `PRINT_CHECK_DEFAULTS` per field, and clamps:
  - angle to 20–80;
  - infill to 0–100;
  - `minThickness` to 0.1–10;
  - each custom size to 10–2000.

  An unknown `printerId` becomes the default printer, and an unknown `material` becomes `pla`.
- **`loadPrintCheckSettings()`**: returns `Settings`.
  - Logged in: it reads `VIEWER_CONFIG.printCheck`, which `App.vue` (~line 553) deep-merges from `/apps/threedviewer/settings`.
  - On a public share: it reads `localStorage['threedviewer.printCheck']`, inside `try/catch`.
- **`savePrintCheckSettings(settings)`**: returns `Promise<void>`.
  - Logged in: GET `/apps/threedviewer/settings`, set `settings.printCheck`, PUT `{ settings }`, then update `VIEWER_CONFIG.printCheck`.
  - On a public share: `localStorage`.
  - Calls are debounced by 500 ms, and failures are logged without being thrown.

- [ ] **Step 1: Write the failing tests:**
  - `sanitize clamps and falls back`
  - `logged-in save keeps the other preferences`: the GET returns `{ grid: {...} }`, and the PUT body contains `grid` and `printCheck`.
  - `public share uses localStorage and survives it throwing`
  - `PersonalSettings save keeps printCheck`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(print-check): remember the printer and settings per user`

### Task 7: The print-check composable

**Files:**
- Create: `src/composables/usePrintCheck.js`
- Modify: `src/utils/sourceUnits.js`, adding `assumesMillimetres(filename)`. It's true for `stl obj ply off 3ds gcode`.
- Test: `tests/unit/composables/usePrintCheck.test.js`

**Interfaces:**
- Consumes Tasks 1–6.
- **`usePrintCheck({ scene, modelRoot, camera, controls, mmPerUnit, filename })`**: the arguments are refs or getters. It returns:
  - **State:**
    - `active`, `settings`, `up: 'y'|'z'`;
    - `fit`: the `fitReport` plus a `size`;
    - `overhang: { share }`;
    - `closed: 'checking'|'closed'|'open'|null`, `openParts`;
    - `estimate: ?{ grams, metres }`;
    - `slicerSummary`;
    - `thickness: { state: 'idle'|'running'|'done'|'cancelled'|'error', progress, share, sampled, warnOpen }`;
    - `kind: 'mesh'|'points'|'gcode'`.
  - **Methods:** `open()`, `close()`, `setPrinter(id)`, `setCustom(size)`, `setUp(axis)`, `setOverhangAngle(deg)`, `setInfill(pct)`, `setMaterial(id)`, `setMinThickness(mm)`, `runThickness()`, `cancelThickness()`, `thicknessAt(intersection) → ?number` (in mm), and `onFrame()`.

Behaviour:
- **`open()`:**
  - For `mesh` it draws the build box (12 edges, `LineBasicMaterial`) and a translucent bed plane, both in the scene with `userData.viewerOverlay`. The box's bottom sits at the model's lowest point along `up`, and it's centred on the model's footprint.
  - It adds the overhang overlay set.
  - It starts `checkClosed` for every part whose `useModelStats` result isn't a known `true`.
  - It computes the fit and the overhang share.
  - For `gcode` it only reads `findSlicerSummary`.
  - For `points` it shows fit only.
- **Box colour:** red (`#e53935`) when `!fit.fits`, otherwise the theme's neutral line colour.
- **`setUp('z')`:**
  - It sets `camera.up` to +Z, and makes `controls` orbit about it. Check that r186 `OrbitControls` picks up a changed `camera.up`; if it doesn't, rebuild its orbit basis.
  - Then it recomputes. `close()` restores `camera.up` and the controls.
- **Remembering the Up choice:** it's kept per file for the session, in a module-level `Map` keyed by the file name and id, and is never saved. Reopening Print check on the same file starts from the remembered axis; a new file starts at `'y'`. Test: `the up choice is remembered per file for the session`.
- **Recomputing:**
  - The fit and the overhang share are recomputed on open, on setting changes, and after a `change` from the move/rotate tool, debounced by 200 ms. Never per frame.
  - The overhang shader follows live through `onFrame()`, which syncs the overlays and is called from `ThreeViewer`'s `animate`.
- **The estimate:** it's computed only when `closed === 'closed'`, from the parts' volume and area in mm³ and mm² (`computeMeshStats`-equivalent world-space sums).
- **Thickness:**
  - `runThickness` measures in a worker. Its results become a second overlay set, whose material colours `thickness × mmPerUnit < min` red and `< min × NEAR_THIN_FACTOR` yellow, and `discard`s everything else.
  - `share` is the red area over the total area.
  - `warnOpen` is true when `closed === 'open'`.
- **Teardown:**
  - `close()`, a model change (a `modelRoot` watch) or unmount aborts any running worker call, disposes every overlay and helper, and resets the state.
  - A result that arrives after teardown is ignored.

- [ ] **Step 1: Write the failing tests.** Use a fake scene and model, with the worker client mocked:
  - `open adds overlays to the scene, none under the model root`
  - `a cube that doesn't fit turns the box red`
  - `z-up changes camera.up and close restores it`
  - `estimate waits for the closed check`: the state goes `'checking'`, then `'closed'`, then an estimate appears.
  - `open model gives no estimate and counts open parts`
  - `switching model cancels the running check`: the client's signal is aborted, there are no overlays, and the state resets.
  - `a late worker result after close is ignored`
  - `gizmo change recomputes the fit, debounced`
  - `gcode shows only the slicer summary`
  - `assumesMillimetres is true for stl and false for glb`
- [ ] **Step 2:** Run `npx jest tests/unit/composables/usePrintCheck.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(print-check): the print-check state, overlays and build box`

### Task 8: Card, panel button and wiring

**Files:**
- Create: `src/components/PrintCheckCard.vue`; `tests/playwright/print-check.spec.ts`
- Modify:
  - `src/components/SlideOutToolPanel.vue`: Analyze section, after Cross-Section;
  - `src/App.vue`: an `@toggle-print-check` handler and the `print-check-active` state;
  - `src/components/ThreeViewer.vue`:
    - wire `usePrintCheck` with `camera.camera`, `camera.controls`, `modelMillimetresPerUnit` and the filename;
    - call `printCheck.onFrame()` in `animate` (~line 2026);
    - close print check when comparison mode turns on;
    - forward pointer hover to `thicknessAt`;
    - expose `togglePrintCheck()`;
    - emit `print-check-active`;
  - `src/config/icon-paths.js`: a `printer3d` icon;
  - `l10n/en.json` (via `npm run i18n:sync`);
  - `docs/TECHNICAL.md`: a "Print check" section with the filament formula from Task 3, the overhang angle definition, the welding tolerance and the thickness method.
- Test: `tests/unit/printCheckCard.test.js`

**Interfaces:**
- **Panel button:** label `'Print check'` with `aria-pressed`. It emits `toggle-print-check`, and is disabled while `!modelLoaded || comparisonMode`.
- **Card layout:** it sits where the stats panel does, and its sections appear in this order:
  1. a units note, when `assumesMillimetres`;
  2. Printer: a `select` of `PRINTERS` plus `'Custom'`, with three number inputs in mm when Custom is chosen;
  3. the Up switch: two `aria-pressed` buttons, `'Y up'` and `'Z up'`;
  4. the fit line;
  5. Overhangs: a range input from 20 to 80, step 1, with its value in degrees and a share line;
  6. Filament: the closed state, an infill number input (0–100 %), a material `select`, and the estimate line;
  7. Wall thickness: a minimum input in mm (step 0.1), a `'Check wall thickness'` button, `NcProgressBar` with `'Cancel'` while running, a legend (red `'Thinner than {min} mm'`, yellow `'Under {near} mm'`), the share line, the sampled note and the open warning.
- **G-code files:** the card shows only the slicer lines and the missing-estimates message.
- **Point clouds and toolpaths:** no thickness block.

Exact copy:
- units note: `'Sizes assume millimetres, because this file doesn't record a unit.'`
- fit: `'Fits the build volume'`; `'{amount} mm too wide'`, `'{amount} mm too deep'`, `'{amount} mm too tall'`; `'Fits if turned 90°'`
- overhang share: `'{percent} % of the surface overhangs'`
- closed check:
  - `'Checking…'`
  - `n('threedviewer', 'Needs a closed model: %n part has holes', 'Needs a closed model: %n parts have holes', openParts)`
- estimate: `'About {grams} g · {metres} m of filament (estimate)'`
- G-code:
  - `'Print time: {time}'`, `'Filament: {metres} m'`, `'Filament: {grams} g'`, `'Sliced with {slicer}'`
  - `"This file doesn't include the slicer's estimates"`
- thickness:
  - `'{percent} % of the surface is thinner than {min} mm'`
  - `'Checked a sample of points on this large model'`
  - `'This model has holes, so the thickness may be wrong'`
- hover readout: `'{mm} mm thick'`

- [ ] **Step 1: Write the failing component test:**
  - `shows the units note only for formats without a unit`
  - `gcode shows only slicer lines`
  - `custom printer shows three inputs`
  - `thickness block hidden for points`
  - `controls have names and toggles aria-pressed`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the card, the button, the wiring and the icon, then run `npm run i18n:sync`.
- [ ] **Step 4:** Run the component test. Expected: PASS.
- [ ] **Step 5: Write the Playwright spec.** Serve the app the way `tests/playwright/inspection-tools.spec.ts` does, and check:
  - `a 10 mm cube fits, and a 5 mm custom printer reports 5 mm too wide, deep and tall`
  - `a cube has 0 % overhang and a T shape more than 0 %`
  - `a closed STL cube gets a filament estimate`
  - `a PrusaSlicer G-code shows print time 1 h 2 min`
  - `a 0.5 mm slab is flagged thin`
  - `cancelling a check on a large generated mesh stops it`
  - `STL export with print check on is byte-identical to export with it off`
  - `turning on comparison closes print check`
  - `keyboard: every card control works with Tab, Enter and the arrow keys`
- [ ] **Step 6:** Run `npm run build && npx playwright test tests/playwright/print-check.spec.ts`. Expected: PASS.
- [ ] **Step 7: Commit.** Message: `feat(print-check): the Print check card in the tools panel`

### Task 9: Changelog

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1:** Under `## [Unreleased]` → `### Added`, add:

  "Print check, in the tools panel's Analyze section: see whether a model fits your printer's build volume (pick from common printers or enter your own size), which surfaces overhang past an angle you choose, and roughly how much filament it needs. For G-code files it shows the print time and filament the slicer worked out. A wall thickness check colours walls thinner than a minimum you set."

- [ ] **Step 2: Commit.** Message: `docs(print-check): changelog for the print check`
