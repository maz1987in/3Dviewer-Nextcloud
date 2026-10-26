# Background Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 3D model in Files gets a thumbnail without anyone opening it, made in the browser of whoever views the folder, stored once per file version and shown to everyone who can read the file.

**Architecture:** The server keeps one PNG per file version in app data (`thumbnails-v2/<fileId>/<sha1(etag)>.png`), accepts uploads only from users who can update the file for its current ETag, and serves them through a user-independent preview provider. The browser renders every thumbnail through one fixed-look renderer. On Files pages it runs a lazily loaded queue that downloads eligible models within the user's limits and renders them in a disposable Web Worker that is terminated at the time limit. The viewer path uses the same renderer on the model it already loaded.

**Tech Stack:** PHP 8.1+ (OCP, Nextcloud 31–35), PHPUnit; Vue 3, three.js r186, Vite (`@nextcloud/vite-config`), Jest, Playwright (Chromium + SwiftShader).

**Spec:** `docs/superpowers/specs/2026-10-26-background-thumbnails-design.md`

## Global Constraints

- Nextcloud 31–35 (`appinfo/info.xml` `min-version="31" max-version="35"`); PHP `^8.1` (`config.platform.php` 8.1).
- No private server API: `tests/unit/NoPrivateServerApiTest.php` must stay green (no `\OC\…`, no `OC_*`).
- A thumbnail is written once per file version and never replaced; a second write for the same version gets 409.
- Thumbnails are PNG only. The spec allowed PNG or JPEG, but JPEG can't carry the transparent background the fixed look needs.
- Thumbnail look is fixed: transparent background, `default` lighting preset, no wireframe, no custom palette, the viewer's default camera fit; 512×512 PNG.
- Defaults: background generation **on**; **50 MB** per-file size limit; **30 seconds** per file for load + render; **500 MB** download budget per folder visit.
- Background work runs only in ordinary Files folder views; never in Recent, search, trash, or the app's own file browser; never on public share pages.
- Background work pauses while `document.hidden` or `navigator.connection?.saveData` is true.
- No new npm or composer dependencies. Background code is reached through a dynamic `import()`, so the `main` chunk stays inside its budget (`npm run size:check`).
- All user-visible strings go through `t('threedviewer', …)`; run `npm run i18n:sync` after adding strings.
- CHANGELOG entries go under `## [Unreleased]`. Commit messages use conventional types (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`). No `Co-Authored-By` trailer.
- PHP tests run in Docker, never by mounting the repo into a `nextcloud` image: `docker run --rm -v "$PWD":/app -w /app php:8.3-cli vendor/bin/phpunit -c tests/phpunit.xml --filter <Name>`.
- JS tests: `npx jest <path>`; Playwright: `npm run build && npx playwright test <spec>`.

## Review Focus

1. **The model is edited while its thumbnail renders.** The upload carries the old ETag; the server answers 412 and stores nothing. The queue treats 412 as "not now" and does not mark the file skipped. Pinned in Task 3 (`testStaleEtagIsRejected`) and Task 10 (`stale upload neither stores nor skips`).
2. **The user leaves the folder mid-render.** The in-flight worker is terminated, nothing is uploaded, the file is not marked skipped, and the next folder starts with a fresh budget. Pinned in Task 10 (`leaving the folder aborts the current job without skipping it`).
3. **The status endpoint gets more than 200 IDs, non-numeric IDs, or IDs the user cannot read.** 400 for the first two; unreadable IDs are left out of the response with no hint they exist. Pinned in Task 3.
4. **A model with nothing to frame** (empty OBJ, G-code with no moves) must not produce a blank uploaded image. `computeCameraFit` returns `null`, `renderThumbnail` rejects with `EmptyModelError`, and the queue marks the file skipped. Pinned in Task 6 and Task 10.
5. **Storage is unavailable** (private window, blocked site data). The skip list degrades to a no-op and background work still runs. Pinned in Task 9 (`skip list survives a throwing localStorage`).

---

### Task 1: One thumbnail format list on the server

**Files:**
- Modify: `lib/Constants/SupportedFormats.php`
- Modify: `scripts/check-format-parity.mjs`
- Test: `tests/unit/Constants/SupportedFormatsTest.php`

**Interfaces:**
- Produces: `SupportedFormats::getThumbnailExtensions(): list<string>` (every model extension; no dependency formats such as `mtl`) and `SupportedFormats::getPreviewMimeRegex(): string` (a PHP regex matching the first MIME type of every model extension in `EXT_MIME_MAP`, anchored, with `/` escaped; `application/octet-stream` is never part of it).

- [ ] **Step 1: Write the failing tests** in `SupportedFormatsTest.php`:
  - `testThumbnailExtensionsAreTheModelExtensions`: `assertSame(SupportedFormats::getModelExtensions(), SupportedFormats::getThumbnailExtensions())`, and `assertNotContains('mtl', …)`.
  - `testPreviewRegexMatchesEveryModelPrimaryMime`: for each model extension, `assertSame(1, preg_match(SupportedFormats::getPreviewMimeRegex(), SupportedFormats::EXT_MIME_MAP[$ext][0]))`. This covers `application/x-step` (ifc), `application/x-fcstd`, and `text/x-gcode`.
  - `testPreviewRegexIgnoresGenericTypes`: `assertSame(0, preg_match($regex, 'application/octet-stream'))`, `assertSame(0, preg_match($regex, 'text/plain'))`, `assertSame(0, preg_match($regex, 'image/png'))`.
- [ ] **Step 2: Run them and confirm they fail.** Command: `docker run --rm -v "$PWD":/app -w /app php:8.3-cli vendor/bin/phpunit -c tests/phpunit.xml --filter SupportedFormatsTest`. Expected: FAIL, because `getThumbnailExtensions` is undefined.
- [ ] **Step 3: Implement both static methods** in `SupportedFormats.php`. Build the regex as `'/^(' . implode('|', array_map(fn($m) => preg_quote($m, '/'), $unique)) . ')$/'`.
- [ ] **Step 4: Extend `scripts/check-format-parity.mjs`.** For every model extension in `appinfo/mimetypemapping.json`, the mapped MIME must be one of that extension's `EXT_MIME_MAP` entries, and its first entry must be what `getPreviewMimeRegex()` matches. Parse it the same way the script already parses the PHP map; fail with `error()` naming the extension.
- [ ] **Step 5: Run the checks.** Run the Step 2 command, then `npm run format:check`. Expected: both PASS.
- [ ] **Step 6: Commit** with message `feat(thumbnails): derive thumbnail formats and preview MIME regex from SupportedFormats`.

### Task 2: Versioned, per-file thumbnail store

**Files:**
- Modify (rewrite): `lib/Service/ThumbnailService.php`
- Create: `lib/Service/ThumbnailStoreResult.php`
- Test: `tests/unit/Service/ThumbnailServiceTest.php` (new)

**Interfaces:**
- Produces:
  - `enum ThumbnailStoreResult: string { case Stored = 'stored'; case Exists = 'exists'; case InvalidImage = 'invalid'; }`
  - `ThumbnailService::store(int $fileId, string $etag, string $png): ThumbnailStoreResult`
  - `ThumbnailService::has(int $fileId, string $etag): bool`
  - `ThumbnailService::get(int $fileId, string $etag): ?string`
  - `ThumbnailService::deleteAll(int $fileId): void`
  - `public const MAX_BYTES = 1048576`. Layout: app-data folder `thumbnails-v2`, subfolder `(string)$fileId`, file `sha1($etag) . '.png'`.
- The old per-user methods (`storeThumbnail`, `getThumbnailContent`, `getThumbnailPath`, `hasThumbnail`, `deleteThumbnail`, `clearAllThumbnails`) are removed. Tasks 3–5 replace every caller.

- [ ] **Step 1: Write the failing tests.** Use an in-memory `IAppData` fake built from PHPUnit mocks of `ISimpleFolder`/`ISimpleFile` (a helper in the test class that keeps an array of folder name → files):
  - `testStoresAValidPng`: a 64×64 PNG made with `imagepng` gives `Stored`, then `has(7, '"abc"')` is true and `get` returns the same bytes.
  - `testSecondWriteForSameVersionIsRejected`: the second `store(7, '"abc"', $otherPng)` gives `Exists`, and `get` still returns the first bytes.
  - `testDifferentVersionIsIndependent`: after storing for `'"abc"'`, `has(7, '"def"')` is false.
  - `testRejectsNonPng`: a JPEG (`imagejpeg`), the string `'not an image'`, and a PNG of 8×8 or of 2048×2048 each give `InvalidImage`. Accepted size is 16–1024 px per side.
  - `testRejectsOversizedPayload`: `str_repeat('a', MAX_BYTES + 1)` gives `InvalidImage`.
  - `testDeleteAllRemovesEveryVersion`: store for two ETags, then `deleteAll(7)`, then both `has` calls are false.
  - `testEtagIsHashedForTheFileName`: an ETag containing `"` and `/` is stored under `sha1($etag) . '.png'`.
- [ ] **Step 2: Run them and confirm they fail.** Command: `… --filter ThumbnailServiceTest`. Expected: FAIL.
- [ ] **Step 3: Implement.** Validate with `getimagesizefromstring()`: require `IMAGETYPE_PNG`, each side 16–1024 px, and length ≤ `MAX_BYTES`. Treat `NotFoundException` as absent. Keep the existing `LoggerInterface` logging style.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with message `refactor(thumbnails): store one thumbnail per file version instead of per user`.

### Task 3: Upload and status endpoints

**Files:**
- Modify: `lib/Controller/ThumbnailController.php`
- Test: `tests/unit/Controller/ThumbnailControllerTest.php` (new; follow `NotesControllerTest.php` for request/session mocking)

**Interfaces:**
- Consumes: Task 2's `ThumbnailService`, `ThumbnailStoreResult`; `NoteAccess::forUser(int $fileId, string $uid): ?NoteAccessResult` (its `canEdit` is the permission rule); `SupportedFormats::getThumbnailExtensions()`.
- Produces:
  - `POST /api/thumbnail/{fileId}?etag=<etag>`. Body: raw PNG bytes. **CSRF required** (delete `#[NoCSRFRequired]`); `#[NoAdminRequired]` stays. Responses: 201 `{"status":"stored"}` · 409 `{"status":"exists"}` · 412 `{"status":"stale"}` (the `etag` query parameter ≠ the file's current `getEtag()`) · 403 (cannot update) · 404 (not found, folder, or not a thumbnail format) · 400 (invalid image, too large, missing `etag`) · 401 (no session).
  - `GET /api/thumbnails/status?ids=1,2,3`. Responses: 400 when there are more than 200 IDs or any ID is not a positive integer. 200 `{"files":{"<id>":{"name":string,"dir":string,"size":int,"etag":string,"canEdit":bool,"hasThumbnail":bool}}}`, containing only IDs that resolve to a readable file with a thumbnail extension. `dir` is the parent path relative to the user's home, as `loadModelWithDependencies` expects (for example `/models`). `hasThumbnail` is `ThumbnailService::has($id, $file->getEtag())`.
  - The `DELETE /api/thumbnails` route and its method are removed.

- [ ] **Step 1: Write the failing tests:**
  - `testStoresForCurrentVersion` expects 201, and that `store` was called with `(7, '"e1"', $body)`.
  - `testStaleEtagIsRejected`: the file's ETag is `'"e2"'` and the query has `'"e1"'`. Expect 412 and that `store` was never called.
  - `testReadOnlyUserIsForbidden`: `canEdit=false` → 403.
  - `testExistingVersionGives409`.
  - `testInvalidImageGives400`.
  - `testUnsupportedExtensionGives404` using `notes.txt`.
  - `testUploadRouteRequiresCsrf`: by reflection, `storeThumbnail` has no `NoCSRFRequired` attribute.
  - `testStatusReportsEachReadableModel`: the response shape is exactly as above.
  - `testStatusOmitsUnreadableAndNonModelIds`.
  - `testStatusRejectsMoreThan200Ids` → 400.
  - `testStatusRejectsNonNumericIds`, using `ids=1,abc` → 400.
- [ ] **Step 2: Run them and confirm they fail.** Command: `… --filter ThumbnailControllerTest`. Expected: FAIL.
- [ ] **Step 3: Implement** `storeThumbnail(int $fileId, string $etag = ''): JSONResponse` and `status(string $ids = ''): JSONResponse`, using `#[FrontpageRoute]` attributes like the existing ones. Replace `SUPPORTED_FORMATS` with `SupportedFormats::getThumbnailExtensions()`.
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then run the full unit suite (drop `--filter`); expected: PASS.
- [ ] **Step 5: Commit** with message `fix(thumbnails): require CSRF and edit rights, and add a batch status endpoint`.

### Task 4: User-independent preview provider

**Files:**
- Modify: `lib/Preview/ModelPreviewProvider.php`
- Modify: `lib/AppInfo/Application.php:73-76`
- Test: `tests/unit/Preview/ModelPreviewProviderTest.php` (new)

**Interfaces:**
- Consumes: `ThumbnailService::has/get`, `SupportedFormats::getThumbnailExtensions()`, `SupportedFormats::getPreviewMimeRegex()`.
- Produces: `getMimeType()` returns `SupportedFormats::getPreviewMimeRegex()`. `isAvailable(FileInfo)` and `getThumbnail(File, int, int)` no longer take `IUserSession`. They look up `($file->getId(), $file->getEtag())`. `protected function createImage(string $data): ?IImage` is the test seam (the same pattern as `LoadPublicShareListener`'s seam) and wraps `new \OCP\Image()` + `loadFromData`.

- [ ] **Step 1: Write the failing tests:**
  - `testAvailableOnlyForCurrentVersion`: a thumbnail exists for `'"e1"'` and the file's ETag is `'"e2"'`, so `isAvailable` is false; with ETag `'"e1"'` it is true.
  - `testAvailableWithoutASession`: no `IUserSession` dependency is in the constructor at all (assert through `ReflectionClass` that no constructor parameter is typed `IUserSession`).
  - `testCoversNonModelMimeFormats`: `step.ifc`, `part.fcstd` and `print.gcode` are available when a thumbnail exists.
  - `testGetThumbnailReturnsNullWithoutStoredImage`.
  - `testGetThumbnailUsesStoredBytes`: a subclass overrides `createImage` and records the bytes it receives.
- [ ] **Step 2: Run them and confirm they fail.** Command: `… --filter ModelPreviewProviderTest`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `Application.php`, register with `SupportedFormats::getPreviewMimeRegex()` and replace the comment that names `'/^model\/.*/'`.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with message `fix(thumbnails): serve thumbnails to every reader and every viewable format`.

### Task 5: Invalidation on write/delete and legacy cleanup

**Files:**
- Create: `lib/Listener/ThumbnailInvalidationListener.php`
- Create: `lib/Repair/RemoveLegacyThumbnails.php`
- Modify: `lib/AppInfo/Application.php` (register the listener for `NodeWrittenEvent` and `NodeDeletedEvent`)
- Modify: `appinfo/info.xml` (add a `<post-migration>` block with `<step>OCA\ThreeDViewer\Repair\RemoveLegacyThumbnails</step>` inside `<repair-steps>`)
- Test: `tests/unit/Listener/ThumbnailInvalidationListenerTest.php`, `tests/unit/Repair/RemoveLegacyThumbnailsTest.php` (new directory)

**Interfaces:**
- Consumes: `ThumbnailService::deleteAll(int $fileId)`.
- Produces: `ThumbnailInvalidationListener implements IEventListener<Event>`. On either event for a `File` node, it calls `deleteAll($node->getId())`; it ignores folders and null IDs. A write needs nothing more than `deleteAll`, because the event fires before any client can see the new ETag. `RemoveLegacyThumbnails implements IRepairStep`, with `getName()` returning `'Remove per-user 3D model thumbnails'`. `run()` deletes the app-data folder `thumbnails` when it exists and never touches `thumbnails-v2`.

- [ ] **Step 1: Write the failing tests:**
  - `testWriteDeletesAllVersions`
  - `testDeleteDeletesAllVersions`
  - `testFoldersAreIgnored`
  - `testRemovesLegacyFolder`
  - `testLeavesV2Alone`
  - `testMissingLegacyFolderIsFine`
- [ ] **Step 2: Run them and confirm they fail.** Command: `… --filter 'ThumbnailInvalidationListenerTest|RemoveLegacyThumbnailsTest'`. Expected: FAIL.
- [ ] **Step 3: Implement both classes and the registrations.**
- [ ] **Step 4: Run the tests again.** Expected: PASS. Then run the full unit suite, including `NoPrivateServerApiTest`; expected: PASS.
- [ ] **Step 5: Commit** with message `feat(thumbnails): drop a file's thumbnails when it changes, and remove per-user ones`.

> The repair step runs on upgrade only when `info.xml`'s `<version>` moves. That happens at release time and is not part of this plan.

### Task 6: Fixed-look renderer and shared camera fit

**Files:**
- Create: `src/thumbnails/cameraFit.js`
- Create: `src/thumbnails/renderThumbnail.js`
- Modify: `src/composables/useLightingPresets.js` (export `PRESETS` as `LIGHTING_PRESETS`; keep the internal name working)
- Modify: `src/views/ViewerComponent.vue:1064-1100` (`fitCameraToModel` uses `computeCameraFit`)
- Test: `tests/unit/thumbnails/cameraFit.test.js`, `tests/unit/thumbnails/renderThumbnail.test.js`

**Interfaces:**
- Produces:
  - `computeCameraFit(box: THREE.Box3, fovDegrees: number): { position: [number, number, number], target: [number, number, number] } | null`. This is the current `fitCameraToModel` math: `distance = |maxDim / sin(fov/2)| * 0.75`, `position = center + (0.5d, 0.5d, d)`. It returns `null` for an empty box or non-finite values.
  - `class EmptyModelError extends Error`
  - `renderThumbnail(object3D: THREE.Object3D, { canvas: HTMLCanvasElement | OffscreenCanvas, size?: number = 512, fovDegrees?: number }): Promise<Blob>`. It renders with its own `WebGLRenderer({ canvas, alpha: true, preserveDrawingBuffer: true, antialias: true })`, calls `setClearColor(0x000000, 0)`, and adds lights from `LIGHTING_PRESETS.default` (ambient, directional at its x/y/z, point). The camera is `PerspectiveCamera(fovDegrees ?? the viewer's default FOV constant in src/config/viewer-config.js, 1, …)`, placed by `computeCameraFit`. It produces `image/png` through `convertToBlob` (OffscreenCanvas) or `toBlob`. It rejects with `EmptyModelError` when `computeCameraFit` returns `null`. It always calls `renderer.dispose()` and `renderer.forceContextLoss()` and removes the lights it added. It never changes `object3D`'s materials or transforms.

- [ ] **Step 1: Write the failing tests:**
  - In `cameraFit.test.js`, a unit cube centred at the origin (`maxDim = 1`) with fov 75 gives `target` `[0,0,0]` and `position` within 1e-6 of `[0.5d, 0.5d, d]`, where `d = 1 / Math.sin(37.5 * Math.PI / 180) * 0.75`. A box from (1,1,1) to (3,3,3) gives `target` `[2,2,2]`. An empty `new THREE.Box3()` gives `null`.
  - In `renderThumbnail.test.js`, mock `three`'s `WebGLRenderer` as the existing `tests/unit/__mocks__` setup does. Assert `setClearColor` was called with `(0x000000, 0)`, that `dispose` and `forceContextLoss` are called on both success and failure, that an empty `Group` rejects with `EmptyModelError`, and that the model's `position` and `material` are unchanged afterwards.
- [ ] **Step 2: Run them and confirm they fail.** Command: `npx jest tests/unit/thumbnails`. Expected: FAIL.
- [ ] **Step 3: Implement both modules, and switch `ViewerComponent.fitCameraToModel` to `computeCameraFit`.** Keep its existing logging and controls update.
- [ ] **Step 4: Run the checks.** Run the Step 2 command and `npx jest`. Expected: PASS, and the existing viewer tests are unchanged.
- [ ] **Step 5: Commit** with message `feat(thumbnails): add a fixed-look offscreen renderer sharing the viewer's camera fit`.

### Task 7: Disposable worker with a hard time limit

**Files:**
- Create: `src/thumbnails/thumbnail.worker.js`
- Create: `src/thumbnails/workerRenderer.js`
- Create: `src/thumbnails/formats.js`
- Modify: `src/main.js` (test hook only, see Step 5)
- Test: `tests/unit/thumbnails/workerRenderer.test.js`, `tests/playwright/thumbnail-worker.spec.ts`

**Interfaces:**
- Consumes: `renderThumbnail` (Task 6); `loadModelByExtension(ext, arrayBuffer, context)` from `src/loaders/registry.js`; `isSupportedExtension(ext)`.
- Produces:
  - Worker protocol. In: `{ extension: string, buffer: ArrayBuffer, additionalFiles: File[] }`, with `buffer` transferred. Out: `{ ok: true, blob: Blob }` or `{ ok: false, error: string, empty?: boolean }`. The worker builds the loader context with `additionalFiles` and `fileExtension`, and passes no scene, so the loader returns `object3D` without adding it anywhere. It renders onto `new OffscreenCanvas(512, 512)`.
  - `class ThumbnailTimeoutError extends Error`
  - `renderInWorker(job, { timeoutMs: number, signal?: AbortSignal }): Promise<Blob>`. It creates `new Worker(new URL('./thumbnail.worker.js', import.meta.url), { type: 'module' })` per job and always calls `terminate()` when the job settles, times out or aborts. On timeout it rejects with `ThumbnailTimeoutError`; on abort, with `DOMException('Aborted', 'AbortError')`; on `{empty:true}`, with `EmptyModelError`.
  - `isThumbnailFormat(ext): boolean`, which is `isSupportedExtension(ext)`.
  - `WORKER_UNSAFE_FORMATS: ReadonlySet<string>`, the formats whose loader cannot run in a worker (filled in Step 6).
  - `canRenderInBackground(ext): boolean`, which is `isThumbnailFormat(ext) && !WORKER_UNSAFE_FORMATS.has(ext)`.

- [ ] **Step 1: Write the failing Jest tests,** using a fake `Worker` class installed on `global`. The fake records `postMessage` and `terminate` and lets the test emit messages:
  - `resolves with the worker's blob and terminates it`
  - `times out, rejects with ThumbnailTimeoutError, and terminates` (use fake timers; `timeoutMs: 30000`; advance 30000)
  - `abort terminates and rejects with AbortError`
  - `empty result rejects with EmptyModelError`
  - `a worker error event rejects and terminates`
  - `canRenderInBackground excludes WORKER_UNSAFE_FORMATS and non-model extensions` (`'mtl'` is false)
- [ ] **Step 2: Run them and confirm they fail.** Command: `npx jest tests/unit/thumbnails/workerRenderer.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Add the test hook in `src/main.js`.** When `window.__THREEDVIEWER_TEST__ === true`, set `window.__threedviewerThumbnails = { renderInWorker, canRenderInBackground }` through a dynamic `import('./thumbnails/workerRenderer.js')`. This follows the existing `window.__LOAD_COMPLETE` hooks; production never takes this branch.
- [ ] **Step 6: Write the Playwright matrix.** In `tests/playwright/thumbnail-worker.spec.ts`, serve the built bundle the way `obj-mtl.spec.ts` does and set the test flag. For each fixture in `tests/fixtures` that has a model extension (`triangle.stl`, `triangle.obj` + `triangle.mtl`, `triangle.ply`, `triangle.gltf`, `triangle-draco.gltf`, `tetrahedron.off`, `quad.bim`, `shapes.3dm`, `textured.obj` + `textured.mtl` + `checker.png`), call `renderInWorker` with a 30000 ms limit. Draw the blob into a 2D canvas and assert that at least one pixel has alpha > 0 and that pixel (0,0) has alpha 0 (the background is transparent). Run `npm run build && npx playwright test tests/playwright/thumbnail-worker.spec.ts`. Add every format that fails *because its loader needs the DOM* to `WORKER_UNSAFE_FORMATS`, with a one-line comment on each saying why, and assert in the spec that those formats are excluded by `canRenderInBackground`. STEP/IGES/BREP/FCSTD/IFC have no fixtures. Check each with any small sample and record the result in the same constant. If you can't check one, put it in `WORKER_UNSAFE_FORMATS` with the comment `unverified in a worker`.
- [ ] **Step 7: Run the matrix again.** Expected: PASS.
- [ ] **Step 8: Commit** with message `feat(thumbnails): render in a disposable worker terminated at the time limit`.

### Task 8: Viewer capture goes through the shared path

**Files:**
- Create: `src/thumbnails/thumbnailApi.js`
- Create: `src/thumbnails/captureFromViewer.js`
- Modify: `src/views/ViewerComponent.vue` (`captureThumbnail`, around :441, and its `useThumbnailCapture` import and setup at :198)
- Modify: `src/components/ThreeViewer.vue` (the capture block around :1600-1615, and its setup at :895)
- Delete: `src/composables/useThumbnailCapture.js`
- Modify: `docs/COMPOSABLES_API.md` (remove `useThumbnailCapture`)
- Test: `tests/unit/thumbnails/thumbnailApi.test.js`, `tests/unit/thumbnails/captureFromViewer.test.js`

**Interfaces:**
- Consumes: the Task 3 endpoints, `renderThumbnail` (Task 6) and `isThumbnailFormat` (Task 7).
- Produces:
  - `fetchStatus(fileIds: number[]): Promise<Map<number, { name, dir, size, etag, canEdit, hasThumbnail }>>`. It sends chunks of at most 200 IDs, one `GET` per chunk, through `@nextcloud/axios` and `generateUrl('/apps/threedviewer/api/thumbnails/status')`.
  - `uploadThumbnail(fileId: number, etag: string, blob: Blob): Promise<'stored' | 'exists' | 'stale' | 'forbidden' | 'error'>`. It maps 201 to stored, 409 to exists, 412 to stale and 403 to forbidden; anything else is error. It sends `Content-Type: image/png`.
  - `captureForCurrentVersion({ fileId: number, extension: string, object3D: THREE.Object3D }): Promise<'stored' | 'exists' | 'skipped'>`. It skips when the format isn't a thumbnail format, the status is missing, `canEdit` is false or `hasThumbnail` is true. It renders on a detached `document.createElement('canvas')` and uploads with the status's `etag`.

- [ ] **Step 1: Write the failing tests:**
  - `fetchStatus splits 450 ids into 3 requests and merges the results`
  - `uploadThumbnail maps 201/409/412/403/500`
  - `captureForCurrentVersion skips read-only files without rendering`
  - `skips when a thumbnail exists for this version`
  - `renders and uploads with the status etag`
  - `skips non-model extensions without a request`
- [ ] **Step 2: Run them and confirm they fail.** Command: `npx jest tests/unit/thumbnails/thumbnailApi.test.js tests/unit/thumbnails/captureFromViewer.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement both modules, then update the two viewer components.** In `ViewerComponent` and `ThreeViewer`, call `captureForCurrentVersion` once after the model loads. Keep the existing `enableThumbnails` gate and the 500 ms delay. Remove both hard-coded `supportedFormats` arrays. Delete `useThumbnailCapture.js`.
- [ ] **Step 4: Run the checks.** Run the Step 2 command, `npx jest` and `npm run lint`. Expected: PASS. `grep -rn "supportedFormats = \['glb'" src` returns nothing.
- [ ] **Step 5: Commit** with message `refactor(thumbnails): capture from the viewer with the fixed look, once per version`.

### Task 9: Settings and the skip list

**Files:**
- Modify: `src/config/viewer-config.js` (`THUMBNAIL_SETTINGS`)
- Create: `src/thumbnails/skipList.js`
- Create: `src/thumbnails/thumbnailSettings.js`
- Modify: `src/views/PersonalSettings.vue` (the thumbnails section around :314-330; the `custom-clear-thumbnails` row at :190; the `clearThumbnails` method around :784)
- Modify: `l10n/en.json` (through `npm run i18n:sync`)
- Test: `tests/unit/thumbnails/skipList.test.js`, `tests/unit/thumbnails/thumbnailSettings.test.js`

**Interfaces:**
- Produces:
  - `THUMBNAIL_SETTINGS` gains `background: true`, `maxFileSizeMB: 50`, `timeoutSeconds: 30` and `folderBudgetMB: 500`.
  - `loadThumbnailSettings(): Promise<{ enabled, background, maxFileSizeMB, timeoutSeconds, folderBudgetMB }>`. It calls `GET generateUrl('/apps/threedviewer/settings')` and merges `settings.thumbnails` over `THUMBNAIL_SETTINGS`. On any error it returns the defaults. Values outside these ranges fall back to the default: size 1–2048, time 5–300, budget 50–10000.
  - `isSkipped(fileId: number, etag: string): boolean`, `markSkipped(fileId: number, etag: string): void` and `clearSkips(): void`. They use the localStorage key `threedviewer:thumbnailSkips`, holding a JSON object of `"<fileId>:<etag>" → epoch ms`. At most 2000 entries are kept, dropping the oldest first. Every access is wrapped in try/catch.
  - In `PersonalSettings.vue`, the fields after `'thumbnails.enabled'`, in this order and with this exact copy:
    - `'thumbnails.background'`: boolean, label "Create thumbnails while browsing Files", description "Make thumbnails for models in the folder you are viewing, one at a time while the browser is idle."
    - `'thumbnails.maxFileSizeMB'`: number, label "Skip files larger than", description "In MB. Larger files get a thumbnail when opened in the viewer."
    - `'thumbnails.timeoutSeconds'`: number, label "Give up on a file after", description "In seconds, for downloading and rendering one file."
    - `'thumbnails.folderBudgetMB'`: number, label "Download at most, per folder visit", description "In MB. Background work stops for that visit once this much has been downloaded."
    - `'thumbnails.retrySkipped'`: type `custom-retry-skipped`, label "Retry skipped files", description "Try again the files this browser gave up on." Clicking it calls `clearSkips()` and shows the existing success toast pattern.
  - `'thumbnails.clear'`, its `custom-clear-thumbnails` row and `clearThumbnails` are removed.

- [ ] **Step 1: Write the failing tests:**
  - `markSkipped then isSkipped is true for that version only`
  - `clearSkips empties the list`
  - `keeps at most 2000 entries, dropping the oldest`
  - `skip list survives a throwing localStorage` (replace `localStorage` with an object whose methods throw; every call returns without throwing, and `isSkipped` is false)
  - `loadThumbnailSettings merges saved values over defaults`
  - `falls back to defaults on request failure`
  - `rejects out-of-range numbers`
  - `defaults are background on, 50 MB, 30 s, 500 MB`
- [ ] **Step 2: Run them and confirm they fail.** Command: `npx jest tests/unit/thumbnails/skipList.test.js tests/unit/thumbnails/thumbnailSettings.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement the modules and the settings UI,** then run `npm run i18n:sync`.
- [ ] **Step 4: Run the checks.** Run the Step 2 command, `npx jest`, `npm run lint` and `npm run i18n:check`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(thumbnails): add background thumbnail settings and a per-browser skip list`.

### Task 10: The background queue

**Files:**
- Create: `src/thumbnails/backgroundQueue.js`
- Test: `tests/unit/thumbnails/backgroundQueue.test.js`

**Interfaces:**
- Consumes: `fetchStatus` and `uploadThumbnail` (Task 8); `renderInWorker`, `ThumbnailTimeoutError`, `canRenderInBackground` (Task 7); `EmptyModelError` (Task 6); `isSkipped`/`markSkipped` (Task 9); `loadModelWithDependencies(fileId, filename, extension, dirPath)` from `src/loaders/multiFileHelpers.js`, which resolves `{ mainFile: File, dependencies: File[] }`.
- Produces: `createBackgroundQueue(deps): { setFolder(folderKey: string, fileIds: number[], visibleIds: Set<number>): void, stop(): void, idle(): Promise<void> }`.
  - `deps` is `{ settings, api: { fetchStatus, uploadThumbnail }, load: loadModelWithDependencies, render: renderInWorker, skips: { isSkipped, markSkipped }, env: { isPaused(): boolean, onResume(cb): void, whenIdle(): Promise<void> }, onThumbnail?(fileId, blob) }`. Every dependency is injected so the tests need no DOM.
  - `idle()` resolves when the current folder's work is done or stopped; it exists for tests.
- Behaviour, in order, for each folder:
  1. `setFolder` with a new `folderKey` aborts any in-flight job without marking it skipped, and resets the budget to `folderBudgetMB × 1048576` bytes. The same key with new IDs only appends the new ones.
  2. Fetch the status of every ID once. Process `visibleIds` first, then the rest in the given order, one at a time, awaiting `env.whenIdle()` before each and waiting for `onResume` while `env.isPaused()`.
  3. Before downloading, a file is eligible only when all of these hold:
     - `canRenderInBackground(ext of name)`
     - `canEdit`
     - `!hasThumbnail`
     - `!isSkipped(id, etag)`
     - `size ≤ maxFileSizeMB × 1048576`

     If `size` is larger than the remaining budget, stop the folder: no further downloads, and nothing is marked skipped.
  4. The deadline is `timeoutSeconds × 1000` from the start of `load`. If `load` finishes past the deadline, mark the file skipped. Otherwise subtract `mainFile.size + Σ dependencies.size` from the budget and call `render({ extension, buffer: await mainFile.arrayBuffer(), additionalFiles: dependencies }, { timeoutMs: remaining, signal })`.
  5. On `ThumbnailTimeoutError` or `EmptyModelError`, mark the file skipped. On any other render or load error, mark it skipped too: it would fail the same way next visit, and "Retry skipped files" clears it.
  6. Upload with the status `etag`. `stored` calls `onThumbnail(id, blob)`; `exists` and `stale` move on without skipping; `forbidden` and `error` move on.

- [ ] **Step 1: Write the failing tests,** each a named `it` with fakes:
  - `visible files go first`
  - `only one job runs at a time`
  - `skips read-only, existing, skipped, oversized and worker-unsafe files without loading them`
  - `stops the folder when the next file exceeds the budget, without skipping it` (budget 500 MB; files of 300, 300 MB → only one loaded)
  - `counts dependency bytes against the budget`
  - `a timeout marks the file skipped for that etag`
  - `an empty model is skipped, not uploaded`
  - `stale upload neither stores nor skips`
  - `leaving the folder aborts the current job without skipping it`
  - `a new folder visit gets a fresh budget`
  - `waits while paused and resumes`
  - `calls onThumbnail after a stored upload`
- [ ] **Step 2: Run them and confirm they fail.** Command: `npx jest tests/unit/thumbnails/backgroundQueue.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `createBackgroundQueue`.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(thumbnails): queue background thumbnails within size, time and folder budgets`.

### Task 11: Wire it into the Files app

**Files:**
- Create: `src/thumbnails/filesPage.js`
- Modify: `src/main.js` (lazy start)
- Modify: `CHANGELOG.md` (`## [Unreleased]`)
- Modify: `docs/TECHNICAL.md` (the thumbnails section: storage layout, version rule, endpoints, worker, limits)
- Test: `tests/unit/thumbnails/filesPage.test.js`

**Interfaces:**
- Consumes: `createBackgroundQueue` (Task 10), `loadThumbnailSettings` (Task 9), `fetchStatus`/`uploadThumbnail` (Task 8), `renderInWorker` (Task 7), `loadModelWithDependencies`.
- Produces:
  - `isEligibleFilesView(url: URL): boolean` is true when the path contains `/apps/files`, the view segment after it (or `files` when absent) is not one of `recent`, `trashbin` or `search`, and the `query` search parameter is empty.
  - `folderKey(url: URL): string` is `<view>:<dir param or route fileid>`.
  - `readRows(root: ParentNode): { ids: number[], visible: Set<number> }`. It reads `[data-cy-files-list-row-fileid]`; a row is visible when its `getBoundingClientRect()` intersects the viewport.
  - `swapRowIcon(root: ParentNode, fileId: number, blob: Blob): boolean`. Inside that row's `.files-list__row-icon`, it replaces the children with `<img class="threedviewer-thumbnail" alt="">` set to an object URL. It returns false when the row or icon isn't there; this is best effort.
  - `startFilesThumbnails(): Promise<void>`. It returns immediately without a logged-in user (`getCurrentUser()` from `@nextcloud/auth`) or when `background` is off. Otherwise it creates the queue with `env.isPaused = () => document.hidden || navigator.connection?.saveData === true`, `onResume` on `visibilitychange`, and `whenIdle` from `requestIdleCallback`, falling back to `setTimeout(…, 200)`. It re-reads rows and the URL on a 500 ms debounced `MutationObserver` over `document.body` and on `popstate`. It calls `queue.setFolder` while the view is eligible and `queue.stop()` while it isn't, and its `onThumbnail` calls `swapRowIcon`.
  - In `src/main.js`: when `location.pathname` contains `/apps/files` and the page is not a public share, call `import('./thumbnails/filesPage.js').then(m => m.startFilesThumbnails())`.

- [ ] **Step 1: Write the failing tests,** using jsdom fixtures with rows carrying `data-cy-files-list-row-fileid`:
  - `eligible: /apps/files/files?dir=/models`
  - `eligible: /apps/files/favorites?dir=/a`
  - `not eligible: recent, trashbin, search, or ?query=x`
  - `folderKey differs per dir`
  - `readRows reads ids and visibility`
  - `swapRowIcon replaces the icon and returns false for a missing row`
  - `does nothing without a user or with background off`
  - `moving to a non-eligible view stops the queue`
- [ ] **Step 2: Run them and confirm they fail.** Command: `npx jest tests/unit/thumbnails/filesPage.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement `filesPage.js` and the `main.js` hook.**
- [ ] **Step 4: Run the full check.** Run `npm run validate`, then `npm run build`. Expected: PASS, and `size:check` reports the `main` chunk within budget, with the thumbnail code in its own chunk.
- [ ] **Step 5: Check it by hand in the dev container** (Nextcloud 34, `http://localhost:8080`):
  1. Upload three fixtures (`triangle.stl`, `triangle.ply`, `tetrahedron.off`) into a new folder and open it in Files. Within a minute each row shows a rendered thumbnail, and a reload still shows them.
  2. Share the folder read-only with a second user. Logged in as that user, the thumbnails show and the browser makes no `api/thumbnail` POST.
  3. Open a public link to one of the files. The preview shows.
  4. Edit one file (upload a new version). Its old thumbnail is gone, and a new one appears on the next folder visit.
  5. Set "Give up on a file after" to 5 seconds and open a folder holding a large STEP file. After 5 seconds the row keeps its icon, and the worker shows as terminated in DevTools.
  6. Turn "Create thumbnails while browsing Files" off and open a new folder. No model downloads happen.
- [ ] **Step 6: Update the docs.** Add the CHANGELOG entries under `## [Unreleased]`: `### Added` for background thumbnails; `### Changed` for one shared thumbnail per file version, the fixed look, and "Retry skipped files" replacing "Clear thumbnails"; `### Fixed` for previews for IFC, FCSTD and G-code, and for thumbnails that never showed to share recipients or public links; `### Security` for CSRF on the upload route and edit rights required. Update the thumbnails section of `docs/TECHNICAL.md`.
- [ ] **Step 7: Commit** with message `feat(thumbnails): create thumbnails while browsing Files`.
