# Changelog

All notable changes to the 3D Viewer Nextcloud app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Unblocked dependency updates and refreshed the lockfile**, superseding ten stalled dependabot PRs (#104–#114) in one pass. `npm update` had been failing outright with `ERESOLVE`: `package.json` allowed `@nextcloud/stylelint-config: ^3.1.1`, and while the installed 3.1.1 peers on `stylelint@^16.13.2`, every 3.2.x peers on stylelint 17 — so any re-resolution collided with the pinned `stylelint@^16.26.1`. `npm install` survived only because the lockfile already encoded a working tree. Clearing it needed a coordinated four-package bump — `stylelint` 16→17, `@nextcloud/stylelint-config` 3.1.1→3.2.2, `stylelint-config-standard-scss` 14→17, `stylelint-scss` 6→7 — because the plugins' installed versions all peered on stylelint 16. With that resolved the lockfile refresh lands every stalled bump at or above what its PR asked for (six of which had gone stale while waiting: dialogs 7.4.1 over 7.4.0, playwright 1.62.0 over 1.60.0, vue 3.5.40 over 3.5.34, and so on).
- **stylelint 17 rule fallout, all resolved.** The new `color-function-alias-notation` rule rewrote 30 `rgba()` calls to `rgb()` across four components — CSS Color 4 syntax, where `rgb()` takes an optional alpha. `property-no-deprecated` also flagged the deprecated `clip` property in the `.visually-hidden` and `.sr-only` helpers; both now use `clip-path: inset(50%)`, which keeps the elements in the accessibility tree while hiding them visually. `npm run stylelint` passes clean; build, bundle budgets and the Jest suite are unchanged.
- **The 3D navigation controller is now a "Split console": a steering annulus with the buttons on an attached rail.** Previously the mode toggle, both zoom buttons and the recentre button were docked on the ring itself, overhanging its edge — so reaching for zoom sat on top of the surface that steers the camera, and the ring's decorative backdrop stopped short of the buttons, leaving them with nothing behind them. The buttons now live in a vertical rail beside the ring, where they read as an ordinary Nextcloud button group.

  The eight directional arrows are gone. They were `aria-hidden` glyphs that never did anything — the ring has always been one continuous control whose direction comes from the angle to your pointer and whose speed comes from how far out you are. In their place the ring paints a live wedge on the angle you are steering, with its opacity carrying the strength, plus a dot that travels from the dead-zone edge to the rim. A readout under the console names the same numbers (`orbit · 63° · strength 77%`). The twelve decorative tick marks become four cardinal notches. The single rotate/pan toggle becomes two explicit buttons, and recentre now sits permanently in the rail — disabled rather than hidden outside pan mode, so nothing below it shifts when the mode changes.

  Every colour is a Nextcloud token (`--color-main-background`, `--color-border`, `--color-primary-element`, `--color-primary-element-text`, `--color-text-maxcontrast`), so light, dark and custom accents follow the server theme instead of the hard-coded near-black gradient the old dial used. Forced-colors and reduced-motion blocks are included.

  The behaviour contract is unchanged: the same 15% dead zone, 110%-of-radius hit slop, hold-to-repeat zoom, target-only recentre that preserves zoom and angle, live Three.js cube with drag-to-orbit and double-click-to-snap, and the same emit-only surface (`camera-rotate`, `camera-zoom`, `snap-to-view`, `cameraPan`, `nudge-camera`, `position-changed`). The steering maths moved out of the component into `src/utils/controllerSteering.js` so the wedge, the dot and the camera all read the same vector; 16 unit tests pin the dead zone, the linear ramp, the slop band and the bearing normalisation.

  The wedge is centred with `wedgeFromAngle()` rather than an inline offset. The design's own snippet carries an extra -90° there, which rotates the arc a quarter turn off the pointer — pressing at six o'clock lit the ring at three. A CSS `conic-gradient` measures clockwise from twelve o'clock, the same origin as these bearings, so the arc only needs shifting back by half its own width; three tests pin that, including the specific six-to-three regression.

  Two additions on top of the layout. **Arrow keys now steer a focused ring** — the ring previously had no keyboard path at all, since the arrows that looked like controls were decoration. And the controller **fades to 40% after 2.5s untouched** and restores on pointer-enter, so it stops competing with the model. Both are asserted live in `scripts/live-viewer-overlay-check.mjs`.

  The rail is laid out two-up rather than as the mock's single stack. Stacked, seven controls at 38px made it ~310px tall beside a 150px ring — taller than the dial it replaced, which defeats the point. In two columns at 32px the rail is 79×187px and the whole console 239×204px, against the 250×250 dial. Desktop buttons are 32px, comfortably past the 24px WCAG 2.5.8 minimum; the mobile rail is deliberately *larger* at 40px, since touch needs a bigger target than a mouse and the previous sheet had that the wrong way round. The design's stated "~210 wide / 150 tall" describes the gizmo, not the assembly; its own markup produces the tall version.

### Security
- **Resolved four npm advisories in production dependencies** via `npm audit fix` — lockfile only, no `package.json` ranges changed: `form-data` CRLF injection via unescaped multipart field names ([GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx), high), `postcss` path traversal in source-map auto-loading ([GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), high), `fast-xml-builder` attribute/comment sanitisation bypasses (high), and nine `dompurify` sanitisation bypasses (moderate). Build and the Jest suite pass unchanged; all five bundles remain within budget.
- **Cleared the `brace-expansion` DoS from the production dependency graph ([GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg) / CVE-2026-14257, high).** `expand()` caps the *number* of results it produces but not their *length*, so a chained brace pattern grows every result until the process dies of an uncatchable V8 out-of-memory error. Only `brace-expansion@5.0.8` is patched — the whole `1.x`–`4.x` history shares the affected combine logic — and 5.x moved from a default export to a named `expand`, so forcing it globally breaks `minimatch@3`/`9`, which both import the default. The lever that does work is one level up: `overrides.webdav.minimatch` (and the yarn `resolutions` twin) pins `^10.2.3`, and `minimatch@10` depends on `brace-expansion@^5.0.2` while keeping the named `minimatch` export and `matchBase` option that `webdav`'s `processGlobFilter` actually uses. `npm audit --omit=dev --audit-level=moderate` — the gating step in `security.yml` — goes from 7 high to 0. Verified behaviourally, not just by the audit number: seven glob cases through `processGlobFilter` (including `*.{obj,mtl}` and `a-{1,2}.stl` brace expansion) return identical results before and after, and the advisory's own proof of concept, `'{a,b}'.repeat(1500)`, fatally OOMs under `minimatch@9` at a 512 MB heap but returns a bounded result in ~0.4 s under `minimatch@10`. Build, all 36 Jest tests and lint pass; bundle sizes unchanged. Confirmed against the Nextcloud 34 dev container by the new `scripts/live-filepicker-check.mjs`, which drives the one place `webdav` is reachable from the browser — the tools panel's Comparison button — and asserts the lazily-loaded FilePicker chunk is served, the picker's `PROPFIND` returns 207, the listing contains the uploaded models, and picking one loads it as a comparison model: 10/10 checks, no console errors beyond a `/core/preview` 404 that Nextcloud returns for any format it cannot thumbnail.
- **Residual, deliberately not worked around: the shipped browser chunk still carries the unpatched copy.** Vite resolves `webdav` through its `browser` export condition to `dist/web/index.js`, a webpack bundle with `minimatch` and `brace-expansion` inlined at publish time — confirmed by the rebuilt `FilePicker` chunk's sourcemap naming `node_modules/webdav/dist/web/index.js` as its only webdav source, and by the absence of the 5.0.8 `maxLength` bound in that chunk. No override can reach vendored code; that clears when `webdav` republishes against `minimatch@10`. It is also unreachable in practice: `processGlobFilter` only runs when a caller passes a `glob` to `getDirectoryContents`, and neither this app, `@nextcloud/files` nor `@nextcloud/dialogs` ever does. The dev tree still reports the advisory through `eslint@8` and `jest`, both of which reach it via `minimatch@3` and so need the default-callable export `minimatch@10` dropped; that audit step is already informational (`continue-on-error`) and clears with an eslint 9 / jest dependency bump.

### Fixed
- **"Reset" and "Fit" could not be clicked.** The viewer's top bar is `position: absolute`, but `#viewer-wrapper` had no `position`, so it established no containing block and the bar resolved against a far wider ancestor — stretching from x=8 to x=1432 on a 1440px window while the viewer itself begins at x=309. Its left end, which is where Reset and Fit live, therefore sat underneath Nextcloud's docked navigation, and the navigation is `z-index: 1800` against the bar's `100`, so it swallowed the clicks: `elementFromPoint` at each button's own centre returned an `app-navigation-entry`, not the button. The bar's dark background also painted over the first two navigation entries. `#viewer-wrapper` is now `position: relative`, which fixes every absolutely-positioned overlay it hosts at once — a sweep for descendants escaping the wrapper's bounds now returns none.

- **The circular navigation controller was hidden behind the app navigation.** `.circular-controller` was `position: fixed` with a 20px left offset, which anchors to the viewport rather than to the 3D scene — so on an ordinary desktop, where Nextcloud docks its navigation and it owns the left 300px, the controller sat entirely inside that column. Measured on a 1440px window: the controller occupied x=28–278 while the viewer began at x=309. It did not disappear, because the navigation has been frosted glass since Nextcloud 28 (`rgba(255,255,255,.8)` plus `backdrop-filter: blur(25px)`), so the cube, the arrows and the zoom controls showed through it washed out — which reads as a rendering fault rather than a placement one. Clicks landed on the navigation, so none of its buttons worked either.

  It is now `position: absolute`, anchored to `.three-viewer`, which was already `position: relative`. The mouse and touch drag paths each carried their own copy of the placement arithmetic clamped against `window.innerWidth`/`innerHeight`; both now share `clampToContainer()` in `src/utils/controllerPosition.js`, clamped against the container, so the controller cannot be dragged back underneath the navigation. Positions persisted by earlier versions were viewport offsets and any saved position can outlive the window it was saved at, so restores pass through `clampWithinContainer()` rather than being trusted as-is. Ten unit tests cover the placement maths; `scripts/live-viewer-overlay-check.mjs` asserts against a running container that the controller clears the docked navigation, is the element you actually hit at its own centre, stays inside the scene, and stops at the scene edge when dragged towards the navigation — all five of which fail on the previous build.
- **The 3D file browser invented folders that do not exist.** `FileIndexMapper::getFolders()` stripped the parent prefix with `str_replace()`, which removes *every* occurrence rather than the leading one. With no parent — the default listing — the prefix was a bare `/`, so every separator was deleted and `models/textures` was reported as the folder `modelstextures`; `getFilesByFolder()` then hashed that name, matched nothing, and returned an empty list. With a parent, a child repeating its parent's name was mislabelled: `models/models/v2` under `models` listed as `models/v2`. `FileController::buildFolderStructureForPath()` repeated the same `str_replace` on the mapper's output. Both now strip only the leading prefix. Covered by `tests/unit/Db/FileIndexMapperFolderTest.php`, which fails on the old code with exactly those two wrong values and was re-checked by reverting the fix.
- **`FileIndexMapper` called `escapeLikeParameter()` on the query builder, where it is not declared.** The method lives on `IDBConnection`; `IQueryBuilder` has never exposed it, so the call only worked because the server's concrete builder happens to carry it — the same bet on non-public API that fataled the Nextcloud 34 upgrade in [#116](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/116). Psalm had been reporting it as `UndefinedInterfaceMethod` all along, at info level among 529 other info issues, which is why it went unnoticed. It now goes through `$this->db`. Found by writing the first test that mocks `IQueryBuilder`: the method cannot be stubbed, because it is not on the interface.
- **Every viewer session logged `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`** Three.js r184 deprecated the constant: `WebGLShadowMap.render()` now warns and reassigns `this.type = PCFShadowMap` on the first shadow pass, so the app was already rendering `PCFShadowMap` and paying a console warning for the privilege. The three assignments — `useScene.js`, `ThreeViewer.vue` and `usePerformance.js` — now set `PCFShadowMap` directly, which is a no-op visually. `tests/unit/composables/shadowMapType.test.js` covers it two ways, because only one of the three paths is reachable under jsdom: it drives `applyPerformanceSettings` with a stub renderer and asserts the type it selects, and scans `src/` for the constant with comments blanked first, mirroring `NoPrivateServerApiTest.php` so a note explaining the avoidance does not read as a use of it. The scan was checked to still bite by reintroducing the assignment. Verified live against the dev container in both directions: rebuilding with the old constant reproduces the warning, and the fix silences it — an absence alone would also be what a session with shadows disabled looks like.

### Added
- **Tests for both database migrations, which had none.** 11 tests across `Version010902Date20251116061241` (creates `tv_file_index`) and `Version010903Date20251121000000` (replaces the `folder_path` index with a hash of it). The one with real teeth pins a contract spread across three files: the `sha256` digest is computed independently in the migration's backfill, in `FileIndexService::hashFolderPath` when a row is written, and inline in `FileIndexMapper::getFilesByFolder` when one is read back. If any drifts, the migration backfills values no query will ever match and `getFilesByFolder` returns an empty array instead of an error — a silent failure. The rest cover the missing-table guard, re-run safety (no duplicate column, no dropping an absent index), the drop-then-add ordering that the shared `tv_uf` name requires, cursor closing, and that every field `FileIndex` maps has a column to land in. Each assertion was verified to fail by mutating the production code — nine probes, one per behaviour, each breaking exactly the test that covers it.
- **Doctrine DBAL stubs in `tests/bootstrap.php`.** `OCP\DB\QueryBuilder\IQueryBuilder` derives its `PARAM_*` constants from Doctrine, but `nextcloud/ocp` does not require `doctrine/dbal` — a real server provides it. Without those classes, merely creating a mock of `IDBConnection` died with `Class Doctrine\DBAL\ParameterType not found`, which is why nothing in this suite had ever exercised a database-facing class. The stubs follow DBAL 3 values and are each guarded by `class_exists`, so a real `doctrine/dbal` or a full Nextcloud tree always wins.

### Removed
- **Retired the "Integration Tests" workflow, which reported coverage it did not have.** `composer test:integration` and `test:migration` both passed a positional `tests` path to phpunit, and that argument overrides the `<testsuite>` configured in the file named by `-c`. Their configs pointed at `./integration` and `./migration`, neither of which exists — so both commands silently ran the unit suite instead and reported success. Measured rather than inferred: `test:integration` and `test:unit` each report `Tests: 127, Assertions: 947, Skipped: 4`, the same suite under three names. The workflow could not have run integration tests in any case, because it installed only PHP, composer and the OCP stubs — there was no Nextcloud server to integrate against, making its environment identical to `test-phpunit.yml`'s. Between them the two jobs ran the same 127 tests eight extra times per pull request, across the four-version matrix. Removed `.github/workflows/test-integration.yml`, `tests/phpunit.integration.xml`, `tests/phpunit.migration.xml`, both composer scripts, and the stale `docs/README.md` snippet that told contributors to run one of them. Nothing is lost: `test-phpunit.yml` runs those tests across the same OCP 31–34 matrix, derived from `info.xml` by the same version-matrix action. Real integration coverage needs a Nextcloud server stood up in CI and deserves scoping as its own piece of work rather than being implied by a check name.

## [3.3.2] - 2026-07-27

Security release. Upgrade immediately if you use password-protected link shares containing 3D models.

### Security
- **Share passwords were not enforced on the public 3D file endpoint.** `PublicFileController` extended plain `Controller` with `#[PublicPage]`, and `PublicShareMiddleware` returns early for anything that is not a `PublicShareController` — so no share authorisation ran at all. Combined with `ShareFileService::loadLinkShare()`, which only checked that `getShareByToken()` matched, anyone holding a share token could read the file regardless of its password. The token is the part of the URL people paste into chats and emails; the password exists precisely for when the token alone should not be enough. `PublicFileController` now extends `PublicShareController` and implements `isValidToken()`, `isPasswordProtected()` and `getPasswordHash()`, delegating password and token validation to the framework and picking up brute-force throttling with it. `findValidLinkShare()` additionally rejects non-link/email share types and expired shares, and treats a `ShareNotFound` from the share manager as "no share" rather than letting it escape as a 500. Present since the controller was added in `1b0ca86` (2025-09-15), so every release from v1.7.9 through v3.3.1 is affected. Verified on Nextcloud 34.0.2.1: a password-protected share now returns 404 without the password and 200 with it, ordinary public shares are unaffected, and expired shares return 404 instead of 500.

## [3.3.1] - 2026-07-27

Hotfix for Nextcloud 34. 3.3.0 is unusable on NC 34 — both the viewer page and every model download return HTTP 500, and the app cannot be upgraded or enabled. Nothing else changed.

### Added
- **Regression tests for both fatals.** `tests/unit/Service/ResponseBuilderCspTest.php` drives `addCspHeaders()` against a policy double that mirrors the NC 34 API surface with no `__call()` fallback, so it raises the same `Error` production did. `tests/unit/NoPrivateServerApiTest.php` scans `lib/` for any use of the private `\OC` container or the legacy `OC_*` static classes, stripping comments via `token_get_all()` first so documentation *about* a removed API isn't mistaken for a call to it. Both fail on the pre-fix code. Note that `composer test:unit` is not currently run by any CI workflow — `test-integration.yml` runs only `test:integration` and `test:migration` — so these are verified locally until that gap is closed.

### Changed
- **`nextcloud/ocp` dev dependency moved from `dev-stable30` to `dev-stable31`**, to match the `min-version="31"` declared in `appinfo/info.xml`; the weekly `update-nextcloud-ocp-matrix.yml` job, which had `target: ['stable30']` hardcoded and kept re-pinning it, now tracks `stable31` too. The pin deliberately follows *min*-version, not max: pinning to the oldest supported server is what stops us using APIs that don't exist there yet, and `ocp` stable33+ requires php `~8.2`, which cannot coexist with the `config.platform` php 8.1 that NC 31 support demands. Verifying against the newest branch is `psalm-matrix.yml`'s job — it already builds an ocp matrix across the full min..max range from `info.xml`. Psalm run manually against stable34 for this release confirms no further removed-API calls in `lib/` beyond the two fixed below, and flags ten `DeprecatedMethod` notices worth scheduling: `IConfig::getUserValue`/`setUserValue`/`deleteUserValue` in `PageController`, `SettingsController` and `ConfigController`, plus `IContainer::query` in `Application`. None break on 34.

### Fixed
- **App upgrade fataled on Nextcloud 34** ([#116](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/116)) with `Call to undefined method OC\Server::getDatabaseConnection()`. The `Version010903Date20251121000000` migration reached into the private `\OC` server container in its constructor; NC 34 stripped `getDatabaseConnection()` from that class, which now exposes only `getUserFolder()`, `getWebRoot()` and `getL10N()`. It now resolves the connection through the public `OCP\Server::get(IDBConnection::class)` locator. Deliberately not constructor injection: `MigrationService::createInstance()` falls back to `new $class()` when the container cannot resolve a step, and an injected dependency would turn that fallback into an `ArgumentCountError`. The stale `use OC;` import is gone and `$connection` is now typed. Reported with a patch by [@EX0l0N](https://github.com/EX0l0N); same fix independently submitted as [#117](https://github.com/maz1987in/3Dviewer-Nextcloud/pull/117) by [@coverslide](https://github.com/coverslide).
- **Every model download and viewer page render fataled on Nextcloud 34** with `Call to undefined method OCP\AppFramework\Http\EmptyContentSecurityPolicy::addAllowedChildSrcDomain()`. Nextcloud removed the legacy `child-src` helper from its public CSP class (deprecated years ago in favour of the split `worker-src`/`frame-src` directives), so the call added in commit 4e0a532 ("fix CSP") became a hard error the moment the app ran on 34 — taking down `FileController::serveFile` and both `PageController` entry points, not just the worker policy. `ResponseBuilder::addCspHeaders` now calls `addAllowedWorkerSrcDomain('blob:')`, which is the correct directive for the blob-URL Web Workers that DRACO, KTX2 and web-ifc spin up, and has existed since NC 17 — safe across the whole declared 31–34 range. Reported in [#116](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/116). The new `tests/unit/Service/ResponseBuilderCspTest.php` drives `addCspHeaders()` against a policy double that mirrors the NC 34 API surface exactly, so it reproduces the production `Error` on the old code regardless of which OCP branch happens to be vendored.

## [3.3.0] - 2026-04-20

### Fixed
- **3DS files loaded tipped on their side** when the exporter used Y-up instead of the 3ds-Max Z-up default. The loader had been hard-coded to rotate every 3DS model -90° around X (commit d8117a0, "fix: add coordinate system rotation corrections for Z-up formats"), which helped CAD-style Z-up files but silently broke Y-up exports — Cottage_FREE.3DS for example rendered with its long axis as the vertical. Dropped the unconditional rotation; 3DS files now pass through at their authored orientation. Most modern 3DS exporters (Blender, recent Maya) are already Y-up, and Z-up outliers can be fixed by orbiting or — if this becomes common — by a future user-facing orientation toggle. Other Z-up-rotating loaders (STL, PLY, 3MF, DAE) are unchanged because those formats have stronger Z-up conventions that are not affected by this fix. Reproduced and verified in the live Nextcloud container by downloading the user's 3DS via WebDAV, inspecting bbox dimensions with a new `scripts/inspect-3ds.mjs` harness (raw X=1243, Y=675, Z=1465 — Y is the height), and hard-refreshing the viewer page.
- **Standalone viewer: KTX2 loader threw on init** with `Cannot read properties of undefined (reading 'isWebGPURenderer')`, so models with Basis/KTX2-compressed textures silently fell back to placeholder textures. Root cause: the standalone `ThreeViewer.vue` never forwarded the live `WebGLRenderer` into the loading context, and Three.js r182's `KTX2Loader.detectSupport(renderer)` dereferences `renderer.isWebGPURenderer` before checking anything else. Fix: pass `renderer: renderer.value` in the context, plus a defensive guard in `gltf.js` that skips KTX2 entirely (with a warning) when no renderer is available instead of throwing. The modal viewer was unaffected — it already forwarded `this.renderer`. Live-E2E harness now also watches for KTX2/WebGPU console complaints so the regression can't sneak back in.
- **Standalone viewer: glTF models with embedded `data:` buffers failed to load** under Nextcloud's Content Security Policy. The app CSP allowed `data:` for `img-src` but not `connect-src`, so GLTFLoader's fetch() of embedded base64 buffers (the default export shape of many gltf files) was blocked by the browser. `ResponseBuilder::addCspHeaders` now also adds `data:` to connect-src. Caught end-to-end by driving Playwright against the real dev container (`scripts/live-e2e-check.mjs`).
- **Skip-to-viewer link wasn't in a usable tab position** — it was rendered inside `<NcContent>` → `<NcAppContent>`, which put it ~9 tabs deep behind Nextcloud's header, nav sidebar, and file list. Wrapped in `<Teleport to="body">` so the anchor lives at the body level regardless of where Nextcloud's chrome wraps us. DOM-verified focusable in the live container; clicking it moves focus to `#viewer-wrapper`. The CHANGELOG entry below that claims "first tab stop" was aspirational — Nextcloud's own `Skip to main content` / `Skip to navigation` links always win the first two positions, which is correct behavior we can't (and shouldn't) override.

### Added
- **Four more CAD formats via OpenCascade — STEP, IGES, BREP, FCSTD** (closes [#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97)): All four formats come from the OCCT family of NURBS/B-Rep CAD files and share one WASM integration. Uses `occt-import-js` (Viktor Kovacs's purpose-built emscripten port of OpenCascade's import + tessellation) — much smaller than vanilla `opencascade.js` (~7 MB WASM vs 10+) and with a JSON-based mesh output that's a clean fit for Three.js. Architecture: one shared `src/loaders/occt-runtime.js` exposes `getOcct()` (memoized module promise so the 7 MB WASM downloads once across all 4 loaders) and `buildGroupFromOccResult()` (walks the assembly hierarchy preserving node names, transforms are already baked into tessellated vertices so we don't reapply matrices). Each format gets a thin ~25-line loader: **STEP** (`.step`, `.stp`) → `ReadStepFile`, **IGES** (`.iges`, `.igs`) → `ReadIgesFile`, **BREP** (`.brep`, `.brp`) → `ReadBrepFile`, **FCSTD** (FreeCAD document) → unzip via fflate, filter for `.brep` entries, feed each to `ReadBrepFile` — per-body failures don't take out the whole document. The resulting bundle shape: four 1 KB loader chunks + one 725 KB shared `occt-runtime-*.chunk.mjs` + 7.3 MB WASM served separately from `/apps/threedviewer/occt/`. Main/app bundles unchanged (0 B trend). Not unit-tested because the whole pipeline needs live WASM + real CAD fixtures to exercise meaningfully; covered by the existing smoke suite pattern.
- **Fifth new format — IFC (`.ifc`)** ([#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97)): Industry Foundation Classes, the de-facto BIM interchange standard. Loader in `src/loaders/types/ifc.js` uses ThatOpen's `web-ifc` WASM (~5 MB, lazy-loaded on first `.ifc` open) and a hand-written Three.js bridge — `web-ifc-three` has been deprecated and its modern replacement (`@thatopen/components`) is a heavy framework we don't need just for file loading. Bridge logic: `StreamAllMeshes` walks the IFC element graph, each `FlatMesh`'s `PlacedGeometry` entries yield tessellated vertex data in interleaved `[px,py,pz,nx,ny,nz]` layout which we deinterleave into separate position/normal attributes, then apply `flatTransformation` (column-major 4×4) and per-geometry color. Express IDs (`expressID`, `geometryExpressID`) are preserved on `mesh.userData.ifc` for future property-panel tooling. Memory is carefully managed — `geometry.delete()` in a finally block releases the WASM-side handle per mesh, and `CloseModel` runs unconditionally so parse errors don't leak the full IFC model. WASM copies ship via `scripts/copy-decoders.mjs` to `/apps/threedviewer/web-ifc/` (both single-threaded `web-ifc.wasm` and multi-threaded `web-ifc-mt.wasm` — IfcAPI picks the variant based on runtime feature detection) so air-gapped Nextcloud deploys don't need CDN reachability. JS glue is lazy-chunked into a 3.4 MB `ifc-*.chunk.mjs` that only loads when a user opens a `.ifc` file; main/app bundle impact is minimal. Not unit-tested because the whole pipeline requires live WASM + real IFC fixtures; covered by the smoke spec suite instead.
- **Fourth new format — dotbim (`.bim`)** ([#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97)): JSON-based BIM format from dotbim.net — simple schema (meshes + elements with `{ mesh_id, vector, rotation, guid, type, color, info, face_colors? }`). Loader in `src/loaders/types/dotbim.js` handles mesh instancing (multiple elements sharing a `mesh_id` each get their own cloned geometry), element transforms (translation vector + unit quaternion rotation), RGBA byte colors, optional per-face colors (v1.1.0 schema — unindexes geometry so each triangle's 3 verts carry the face color), and tolerates legacy exporter quirks (missing/null `rotation`, mismatched `face_colors` length). Element metadata (`guid`, `type`, `info`) is stashed on `mesh.userData.dotbim` for future inspection tooling. 10 Jest specs in `tests/unit/loaders/dotbim-parser.test.js` cover instancing, transforms, color handling, transparency, legacy-rotation fallback, orphan elements, metadata, and JSON/schema validation error paths. Zero WASM, zero external deps, ~180 lines. Like the other new loaders it's lazy-chunked via the registry's dynamic imports — 0 B impact on the main/app bundles.
- **Three new 3D formats — OFF, AMF, 3DM** (closes [#97](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/97) partially): (1) **`.off`** (Geomview Object File Format) — hand-rolled plain-text parser in `src/loaders/types/off.js` covering OFF, COFF (per-vertex colors, float or 0–255 int), N-gon fan triangulation, inline `#` comments, and binary-OFF rejection. 9-test Jest suite exercises the parse path end-to-end (tetrahedron, n-gon, comments, COFF float/int colors, degenerate inputs). (2) **`.amf`** (Additive Manufacturing Format) — wraps three.js's bundled `AMFLoader`, handles both XML and ZIP-compressed variants. (3) **`.3dm`** (Rhinoceros) — wraps `Rhino3dmLoader`, loads `rhino3dm.js` + `rhino3dm.wasm` (~4 MB) on first use from the app's bundled copy at `/apps/threedviewer/rhino3dm/` so air-gapped Nextcloud deployments don't need CDN reachability. `scripts/copy-decoders.mjs` now copies the rhino3dm assets alongside DRACO/Basis. All three formats are registered across the 5 sync points (`lib/Constants/SupportedFormats.php`, `src/config/viewer-config.js`, `src/loaders/registry.js`, `src/main.js::SUPPORTED_MIMES`, `appinfo/mimetypemapping.json`); `npm run format:check` PASS. Each loader is lazy-chunked via the registry's dynamic imports, so the main/app bundle size is unchanged (only users who open the new format pay the download cost). The 6 remaining formats from #97 (step, iges, brep, fcstd, ifc, bim) all require OpenCascade.js or web-ifc WASM (~5–10 MB each) and are deferred until demand justifies the bundle hit.
- **Forced-colors (Windows High Contrast) CSS hardening**: New central override sheet (`src/css/forced-colors.css`, imported from `main.js`) scoped entirely to `@media (forced-colors: active)` — no effect on default rendering. Addresses three patterns the a11y audit found: (1) custom badges (`.stats-badge`, `.fps-badge`, `.active-badge`, `.last-used-badge`) that rely on background-color + text-color alone collapsed into the surrounding surface once the UA repainted both with system colors; they now get a 1px `CanvasText` border so they stay visible. (2) `.filter-format-chip.active` lost its visual distinction from the inactive state because both backgrounds became `Canvas`; the active variant now uses `Highlight` / `HighlightText` with `forced-color-adjust: none` so selection state survives. (3) Focus states that suppressed `outline` and relied on `box-shadow` or colored `border-color` (`.export-select:focus`, `.annotation-text-input:focus`, `.skip-to-viewer:focus`) had no visible focus indicator; they now re-enable a 2px `Highlight` outline. Verified by a new Playwright spec (`tests/playwright/a11y-forced-colors.spec.ts`, 5 tests) that loads the real CSS file into static fixtures mirroring each component shape and asserts border/outline width > 0 under `emulateMedia({ forcedColors: 'active' })`. Caveat: Playwright's forced-colors emulation uses a neutral palette — this closes the keyboard/CSS correctness gap but an interactive Windows HC walkthrough is still the final source of truth for theme-specific contrast issues.
- **i18n parity tooling (`scripts/check-i18n.mjs`)**: Walks `src/` (`.vue`/`.js`/`.ts`) and `lib/` (`.php`) and extracts every `t('threedviewer', 'string')`, `this.t(...)`, and `->t(...)` call via regex. Diffs the extracted set against `l10n/en.json`: ERROR on source strings missing from en.json, WARN on orphan keys no source uses, per-locale coverage summary that reports missing, passthrough (value === key), and orphan counts. `--sync-en` auto-adds missing keys (value = key); `--prune` removes orphans. Wired as `npm run i18n:check` / `npm run i18n:sync`; `i18n:check` is now part of the `validate` chain. First sync closed 329 missing keys and pruned 87 orphans in en.json — ar/de/es coverage now reports accurately at ~27% (previously looked higher only because en.json itself was incomplete).
- **Export pipeline unit tests + MIME consistency fix**: Nine Jest specs in `tests/unit/composables/useExport.test.js` cover `getGeometryStats` (indexed, non-indexed, multi-mesh groups, non-geometry descendants) and `exportAsSTL`/`exportAsOBJ`/`exportAsGLB` (correct MIME — `model/stl`, `model/obj`, `model/gltf-binary` — correct byte length, null-object guards, and a multi-material OBJ scene that passes through the exporter with its material array and geometry groups intact instead of being flattened). Three.js exporters are mocked so the test runs deterministically in jsdom without pulling in Three's ESM-only subpath imports; the real exporter output remains covered by the Playwright smoke suite. Shipped alongside a MIME consistency fix in SlicerModal.vue — the slicer-export fallback path was still using `application/octet-stream` for STL and `text/plain` for OBJ even though the main Export Model path had been updated to `model/stl` / `model/obj`; both paths now agree.
- **Loader smoke-test coverage for cancel/retry/network-drop**: Two new Playwright specs in `tests/smoke/viewer.spec.ts` use `page.route()` to deterministically simulate (a) a user cancelling a hanging load and then retrying — the second fetch is fulfilled with a fixture and the viewer reaches `__LOAD_COMPLETE`, and (b) a network failure (`route.abort('failed')`) that must surface via `__LOAD_ERROR` without being misclassified as a user abort. ThreeViewer grew two tiny test hooks (`window.__LOAD_COMPLETE` on successful `model-loaded`, `window.__LOAD_ERROR` on non-abort errors) to give tests a DOM-independent signal — production code is unchanged in behavior.
- **Accessibility follow-ups**: Keyboard users now get a "Skip to 3D viewer" link as the first tab stop (visually hidden until focused, slides into view on focus) that jumps focus past the navigation directly to `#viewer-wrapper`. Both modals (SlicerModal, HelpPanel) now trap Tab/Shift+Tab inside the dialog while open and restore focus to the element that opened them on close — implemented via a dependency-free `useFocusTrap` composable. Modals also gained `aria-modal="true"` and `tabindex="-1"` on the dialog surface. Covered by a new Jest unit suite (`tests/unit/composables/useFocusTrap.test.js`) and a Playwright a11y spec (`tests/playwright/a11y-skip-link.spec.ts`) that verifies skip-link behavior under `forced-colors: active` (Windows High Contrast).
- **Transform Gizmo**: Translate, rotate, and scale models interactively with Three.js TransformControls. Mode selector (Move/Rotate/Scale) and reset button in the Analyze section. Disables orbit controls while dragging.
- **Animation clip selector**: Dropdown in the Animation panel to switch between individual animation clips (e.g., Run, Walk, Idle) for models with multiple animations
- **Texture optimization pipeline**: Quality presets (Original/High/Medium/Low) with Canvas 2D downscaling, memory tracking, and configurable setting in Personal Settings
- **X3D parser**: Full XML-based parser replacing placeholder cube — supports IndexedFaceSet geometry, materials, textures, transforms, and DEF/USE references
- **Volume & surface area measurement**: Model statistics panel now shows actual mesh surface area (sum of triangle areas) and mesh volume (signed tetrahedra method, accurate for watertight meshes), in addition to bounding box volume
- **Custom color palette editor**: Personal Settings → SlideOutToolPanel now exposes four user-overridable scene/chrome colors on top of the base light/dark theme: **background**, **grid**, **toolbar bg**, and **toolbar text**. Each has a native `<input type="color">` picker plus a per-key "×" clear button; a single "Reset all palette colors" button clears everything at once. Overrides persist to `localStorage['threedviewer:customPalette']` and are merged on top of whichever base theme (auto/light/dark) is active, so switching themes leaves your palette alone. The viewer rebuilds its `THREE.GridHelper` in place when `gridColor` changes and swaps `scene.background` when `background` changes — no reload required.
- **Decoder worker pool tuning (parallel decoding)**: `GLTFLoader`'s DRACO and KTX2 sub-loaders now call `setWorkerLimit(n)` with `n = min(hardwareConcurrency - 1, 4)` (floor 2), so GLB textures and compressed meshes decode in parallel across multiple Web Workers instead of serializing on one. Defensive feature-detection — falls through when the Three.js version doesn't expose `setWorkerLimit`. Result: GLBs with multiple KTX2 textures load noticeably faster on 4+ core machines without starving the main thread or flooding it with workers on 1-core devices.
- **Memory pressure auto-step-down**: The performance composable now samples `performance.memory.usedJSHeapSize` each frame and, when usage crosses 85 % of the configured `maxMemoryUsage` cap (default 500 MB), auto-switches to the **Low** performance mode — reducing pixel ratio, disabling shadows, and applying LOD. A one-time warning toast ("Auto-reduced quality — memory pressure") surfaces what happened; the flag clears once memory drops back below 70 % so the user can re-raise quality manually. 5-second cooldown prevents thrashing, and the check gracefully skips browsers without the non-standard `performance.memory` API (Firefox, Safari).
- **Background indexing status API + progress bar**: New `GET /api/files/index-status` endpoint backed by `ICacheFactory::createDistributed` returns `{ active, processed, total, percent, startedAt, updatedAt }` for the authenticated user. `FileIndexService.reindexUser` now pre-counts supported files (respecting `.no3d` and hidden-folder skip rules), then bumps the processed counter after each file. The Personal Settings "Re-index now" button starts a 750 ms poll in parallel with the blocking POST request and renders a live `NcProgressBar` ("142 / 284 (50 %)"), falling back to "Scanning…" until the pre-scan completes. Status TTL is 1 hour.
- **Adaptive texture streaming (visibility-aware queue)**: `useProgressiveTextures` now accepts a `(camera, scene)` streaming context and sorts its pending queue by frustum visibility before each batch — textures on meshes currently in view load first, off-screen ones are deferred. When the camera moves, the very next batch picks up the new viewpoint. `queueTexture` has a new optional `mesh` argument for visibility scoring; the signature stays backward-compatible, so existing callers are unaffected. ThreeViewer auto-registers the context on init so future loader pipelines that opt into progressive loading get adaptive scheduling for free.
- **Measurement suite upgrades**: The Statistics panel's measurement section is now a full measurement tool:
  - **Unit picker**: Choose mm / cm / m / in / ft / generic units from a dropdown; bounding box, surface area, and volume values re-render instantly with the right suffix (`mm`, `mm²`, `mm³`, etc.). Defaults to the project's configured `VIEWER_CONFIG.measurement.defaultUnit` so it matches the existing ruler tool.
  - **Per-mesh breakdown**: When a model has more than one mesh, a scrollable list shows each mesh's surface area and volume in the selected unit. Clicking a row focuses the panel on that mesh — the Width/Height/Depth/Area/Volume rows switch to its numbers and a "Focused: `mesh name`" header with a Show-all link appears. Helper meshes (transform-gizmo pickers, annotation markers) are excluded.
  - **Pick mesh in viewport**: A one-shot button arms a raycasting click handler on the canvas; the next click on a mesh focuses it in the stats panel. Works with any mesh in the loaded model, respects visibility, and skips gizmo helpers.
  - **Watertightness badge**: The section header flags each mesh as Watertight (all edges shared by exactly two triangles — volume is reliable), Not watertight (open or non-manifold edges detected — volume should be treated as approximate), or Unknown (non-indexed geometry, or >500k triangles so we skip the edge-map check for performance). Aggregated badge appears at the top of the section; per-mesh flags appear next to each row in the breakdown.
  - **Copy measurements**: A button copies a plain-text report of the current values (bounding box, surface area, mesh volume, bbox volume, watertight status, per-mesh table) to the clipboard in the selected unit. Uses `navigator.clipboard.writeText` on secure contexts with the textarea + `execCommand` fallback for legacy browsers. Success/error toast via the existing push-toast channel.
- **WebXR / VR mode**: Enter immersive VR via the 🥽 button in the top bar (only shown when the browser advertises `immersive-vr` support). Animation loop swaps to `renderer.setAnimationLoop` during XR sessions, and FPS throttling is bypassed since the headset enforces its own cadence. Testable without a headset using the Chrome WebXR API Emulator extension.
- **Annotation JSON export/import**: Save annotations as a versioned JSON document and re-import them later. The schema includes `format`, `version`, `exportedAt`, `modelFilename`, and an `annotations` array of `{ id, point, text, timestamp }`. Import/Export buttons appear in the Annotations overlay when annotation mode is active.
- **Scene comparison diff overlay**: When two models are loaded side-by-side via Comparison mode, a "Scene Diff" panel auto-appears showing original vs. comparison stats (vertex count, face count, mesh count, bounding box X/Y/Z, diagonal length) with color-coded deltas (green = increase, red = decrease). Helper meshes (transform gizmo pickers, axes/grid helpers) are excluded from stats so the diff reflects only the loaded geometry. The overlay is dismissable via × and re-openable from a "Diff" button in the comparison controls.
- **Annotations persistence (per-file backend save)**: Annotations now save automatically to your Nextcloud account, keyed by file ID, so they reappear next time you open the same model. Backed by a new `AnnotationsService` that stores one JSON document per (user, file) under app data (`appdata_*/threedviewer/annotations/{userId}/{fileId}.json`), with `GET`/`PUT`/`DELETE` routes at `/api/annotations/{fileId}` validating that you have access to the underlying file before reading or writing. Saves are debounced 600 ms after each change; clearing all annotations issues a `DELETE` so the backend doc is removed instead of storing an empty list. A small status pill ("Loading… / Saving… / Saved / Save failed") in the annotation overlay header surfaces sync state. 256 KB cap per document.
- **Shareable view link**: New "Copy View Link" button in the View section copies a URL that encodes the current camera viewpoint (position, target, zoom) as a compact `cam=px,py,pz,tx,ty,tz,z` query parameter. Opening the link reloads the model and restores the exact same angle after auto-fit runs, so you can send collaborators a link and say "check out this corner of the model" without needing a live session. Toast feedback on copy success/failure; button disabled until a model is loaded. Works on any secure context (HTTPS or localhost) via `navigator.clipboard`, with an offscreen-textarea + `execCommand` fallback for legacy environments. No backend — pure URL round-trip.
- **Clipping box (6-plane section analysis)**: The existing Cross-Section tool now has a Plane / Box mode switch. Plane mode is unchanged (single cross-section plane with axis + position slider). Box mode enables six axis-aligned clipping planes, one per face of the model's bounding box, each with an independent 0–1 offset slider that moves that face inward toward the opposite side. Setting `xMin=0.35` and `zMax=0.35`, for example, slices the leftmost 35% off along X and the nearest 35% off along Z, leaving the intersection slab visible with interior surfaces rendered via `DoubleSide`. A "Reset box" button returns all six offsets to 0. Plane and box state are kept independently so toggling between modes is non-destructive, and box offsets auto-remap when a new model is loaded.
- **File browser search & filters**: New filter toolbar in the file browser. At the Folders/Types/Dates **overview level** the search box runs a global recursive search that walks every folder, type, and date bucket and surfaces matching files as a flat results grid (each card showing its full path) — so searching `wolf` from the Folders root finds `Wolf-Blender-2.82a.glb` two folders deep without manual drilling. Inside **leaf views** (drilled into a folder, type, or month) the search filters both subfolder cards and file cards together, and unlocks two extra controls: multi-select format chips (one per extension actually present in the current view) and a size bucket dropdown (Any / < 1 MB / 1–10 MB / > 10 MB). Filters compose with AND between categories and OR within format chips, and a "Clear filters" button appears as soon as any filter is active. Filters auto-reset when navigating between folders/types/dates so a stale query never makes the next view look empty.

### Fixed
- **FBX taillight/lens transparency**: FBX post-processing was force-overriding every material to `opacity = 1.0; transparent = false`, which made authored translucent lens shells (taillights, headlights, glass) opaque and hid the coloured mesh inside — the Mercedes GLS rear lights rendered as a solid grey slab with the red only visible if the camera was pushed inside the body. Now preserves the FBX-authored opacity: materials with `0 < opacity < 1` are left transparent with `depthWrite = false` so inner meshes show through; only materials with `opacity <= 0` (which would render invisible) are still forced opaque.
- **Stats panel — File size on multi-file loads**: File Size showed "0.00 MB" for formats that come with sidecar assets (OBJ+MTL, FBX with textures, GLTF+BIN). The stats panel was reading `modelLoading.progress.value.total`, but multi-file loaders report progress as a percentage (max 100) rather than bytes, so the resulting "100 B → 0.00 MB" rounded to zero. Now reads the actual byte count from `modelSourceFiles.value[].size` (matching main filename first, else first file), with the progress-total value only used as a fallback when it looks like real byte counts (> 1 KB).
- **Stats panel — Texture memory accounting**: Textures section reported "Memory: 0.00 MB" while textures were still loading, because the loaded-image check used a 512×512 fallback that happened to resolve before decode — making tiny placeholders look real. Now distinguishes three states: loaded (dimensions ≥ 4×4 contribute to memory), pending (flagged separately so the UI can show "loading…"), and missing (1×1 placeholder or HTML `img` with empty `src` / zero `naturalWidth`). ThreeViewer polls analyzeModel once a second for up to 8 seconds after load when any texture is pending, so async decodes get picked up without the user needing to reopen the panel.
- **FBX dark rendering without textures**: When an FBX referenced textures (e.g. `texture.png`) that weren't shipped alongside the model, the loader substituted a 1×1 base64 placeholder into `mat.map`. `final = color × placeholder` then multiplied every surface down toward near-black, producing a silhouette-dark render where the Mercedes GLS looked like a blob. The loader now detects its own placeholder (1×1 image size) and nulls out `mat.map`; a new "clay mode" kicks in when *zero* textures resolved from dependencies, brightening near-greyscale dark material colours to a pleasant 0.75 clay-grey while hue-preserving the brightening on coloured materials (green license plate, red brake lights) so they still read as coloured instead of washing out to clay.
- **ZIP export — main file path**: The main model file is now packed under its basename (e.g. `eyeball.obj`) instead of its full Nextcloud path (e.g. `/3D files/Eyeball/eyeball.obj`). The leading slash is invalid in ZIP archives and broke extraction on some platforms.
- **ZIP export — preserved subdirectory layout**: Textures discovered in subdirectories (e.g. `textures/`) are now packed under their original relative paths in the ZIP instead of being flattened to the root, so the unzipped folder mirrors the original Nextcloud layout and re-imports cleanly.
- **Comparison mode loading 400 error**: `loadComparisonModelFromPath` was passing the `{ id, subdir }` object returned by `getFileIdByPath` directly into URL templates, producing `[object Object]` and a 400 from the file API. Now destructures `id` before use. (Latent regression from the earlier `getFileIdByPath` return-shape change.)

### Fixed
- **Animation playback**: Previously all animation clips played simultaneously, causing blended/static poses. Now only one clip plays at a time
- **Animation timeline seek**: Slider scrubber now correctly updates the model pose when dragged (replaced `mixer.setTime()` with `action.time` + `mixer.update(0)`)
- **Animation loop toggle**: Toggling Loop off and back on no longer leaves the animation stuck; finished LoopOnce actions properly restart
- **FBX rendering**: Fixed dark/black eyeball — upgraded Lambert to Phong materials, added SRGBColorSpace, normalized scale, detected transparent shells
- **PLY loader**: Preserved original vertex normals from file instead of always recomputing them

## [3.2.0] - 2026-04-05

### Added
- **Cross-Section tool**: Interactive clipping plane to slice models along X/Y/Z axes with position slider, flip direction, and DoubleSide rendering for visible interiors
- **Animation Timeline Scrubber**: Seek to any point in animated models with a slider, step forward/backward frame-by-frame
- **View Bookmarks**: Save and restore camera positions with display toggles (grid, axes, wireframe, background), persisted in localStorage
- **Lighting Presets**: Quick-switch between 5 lighting setups (Default, Studio, Outdoor, Dramatic, Flat) affecting ambient, directional, and point lights

- **Exploded View**: For multi-mesh models, animate parts outward from centroid with adjustable explosion factor slider
- **Slicer: Export format selector**: Choose STL, OBJ, or PLY before sending to slicer (non-passthrough formats)
- **Slicer: Upload progress bar**: Real-time progress indicator when uploading to server (XMLHttpRequest with progress events, 2-min timeout)
- **Slicer: Copy share link**: Copy the temporary Nextcloud share URL to clipboard for manual use
- **Slicer: Size validation**: Warns and blocks uploads exceeding 50MB before attempting server transfer
- **Slicer: Upload size display**: Shows file size in MB during upload for files >5MB
- **Modal viewer stats panel**: Lightweight model info overlay (meshes, vertices, faces, dimensions) accessible via bottom-right button
- **Modal viewer screenshot**: Download a PNG screenshot of the current view from the modal preview
- **Cache settings in Personal Settings**: Configurable max cache size, max file size, expiration days, enable/disable toggle, and clear cache button
- **Cache hits/misses in performance overlay**: Shows individual hit and miss counts alongside hit rate percentage
- **Cache privacy documentation**: Documented local-only storage, per-browser isolation, and user control in TECHNICAL.md
- **Multi-file matching test suite**: 48 tests covering texture/MTL name matching strategies (space normalization, prefix removal, plural handling, color/body mapping, partial matching)
- **Edge case fixtures**: mixed-case extensions, missing MTL, orphaned textures for multi-file loading tests
- **Export triangle count warnings**: Toast notifications for large models (>500K info, >2M warning) before export starts
- **Export MIME type fix**: STL exports use `model/stl`, OBJ exports use `model/obj` instead of generic types
- **Help panel refresh**: Added Slicer & Export section, cross-section, exploded view, lighting presets, bookmarks, dependency cache documentation
- **i18n audit**: Wrapped hardcoded export/error toast strings in `t()`, added 31 new keys to `l10n/en.json`, documented i18n checklist in TECHNICAL.md
- **Accessibility review**: Added `role="dialog"` + `aria-labelledby` to SlicerModal, `aria-controls` on all 6 panel section headers, `aria-label` on emoji-only buttons, `role="alert"` on texture warning, `role="region"` on stats panel
- **Format parity guard**: Build-time script (`npm run format:check`) validates that PHP, JS, loader registry, Viewer MIME list, and mimetypemapping.json stay synchronized
- **X3D/VRML MIME registration**: Added `model/x3d+xml` and `model/vrml` to Nextcloud Viewer MIME list so these formats open in the viewer
- **Slicer security documentation**: Documented full security posture — authentication, path traversal prevention, MIME validation, size limits, share expiry, and file lifecycle in TECHNICAL.md

### Fixed
- **Slicer OBJ/PLY upload**: Added `obj` and `ply` to backend upload allowlist — OBJ/PLY format selector was added to frontend but backend rejected these formats
- **EufyStudio URL parsing**: Replaced fragile regex filename extraction with proper URL parsing
- **Slicer upload timeout**: Added 2-minute timeout to XMLHttpRequest (previously no timeout — could hang forever)

### Changed
- **Tools panel redesign**: Reorganized from 4 sections to 6 (View, Scene, Analyze, Animation, Export, Settings) for clearer grouping
- **Toggle switches**: Replaced text checkmarks with custom CSS toggle switches for Grid, Axes, Wireframe, and Loop controls
- **Export section**: Screenshot, Export Model, and Send to Slicer moved from Settings to dedicated Export section
- **Animation section**: Elevated from nested group to its own collapsible section (conditional, only shown for animated models)
- **Model Statistics**: Moved from Settings to Analyze section alongside Measurement, Annotation, and Cross-Section

### Fixed
- **Theme consistency**: Unified `--color-primary-element` fallback values across all components to `#0082c9` (Nextcloud default), replacing inconsistent `#4287f5`, `#1976d2` fallbacks
- **MinimalTopBar hardcoded colors**: Replaced 7 instances of hardcoded `rgb(0 130 201)` with `var(--color-primary-element)` and related NC variables
- **Dark theme hack removed**: Deleted ~130 lines of `.dark-theme` CSS overrides (46 `!important` declarations) from SlideOutToolPanel — dark mode now works automatically via Nextcloud CSS variables
- **Cache stat colors**: Replaced hardcoded Material Design hex colors with NC semantic variables (`--color-success-text`, `--color-warning-text`, `--color-error-text`)
- **Missing panel props**: Added `wireframe`, `background-color`, `performance-mode`, `theme-mode`, `has-animations`, `is-animation-playing` props to SlideOutToolPanel binding in App.vue
- **Clipping plane Z-fighting**: Added 5% margin beyond model bounds so the slider at extremes doesn't cause Z-fighting artifacts
- **Bundle budget**: Updated app chunk thresholds for new features (+12KB raw)

## [3.0.0] - 2026-04-02

### Changed
- **Dependencies**: Updated development dependencies
  - `@babel/core`: ^7.28.6 → ^7.29.0
  - `@babel/plugin-transform-runtime`: ^7.28.5 → ^7.29.0
  - `@babel/preset-env`: ^7.28.6 → ^7.29.0
  - `@playwright/test`: ^1.56.1 → ^1.58.2
  - `jest-environment-jsdom`: ^29.7.0 → ^30.3.0
  - `vue`: ^2.7.16 → ^3.5.0
  - `@nextcloud/vue`: ^8.33.0 → ^9.5.0
  - `@nextcloud/vite-config`: ^1.7.1 → ^2.5.0
- **Vue 3 migration**: Migrated app from Vue 2 to Vue 3
  - `main.js`: `new Vue()` + `Vue.mixin()` → `createApp()` + `globalProperties`
  - `settings-personal.js`: `Vue.extend()` → `createApp()`
  - `viewer-api.js`: `new Vue()` / `$mount()` / `$destroy()` → `createApp()` / `app.mount()` / `app.unmount()`
  - `ViewerWrapper.js`: New Vue 2 bridge component — Nextcloud Viewer bundles Vue 2 internally, so a plain JS wrapper renders in Vue 2 and creates an isolated Vue 3 `createApp()` inside for the real ViewerComponent
  - Removed `@vue/vue2-jest` (Vue 2 specific)
- **Nextcloud 34 compatibility**: `min-version` 31, `max-version` 34 (`@nextcloud/vue` v9.x requires NC 31+)
- **Vue component imports**: Migrated deep imports (`@nextcloud/vue/dist/Components/...`) to barrel imports (`@nextcloud/vue`) for forward compatibility with `@nextcloud/vue` v9
- **Template modifiers**: Removed deprecated `.native` event modifiers from Vue components (compatible with Vue 2.7+, required for Vue 3)
- **@nextcloud/vue v9 API migration**: Updated all form component bindings to Vue 3 API
  - `NcCheckboxRadioSwitch`: `:checked` → `:model-value`, `@update:checked` → `@update:model-value`
  - `NcTextField`: `:value` → `:model-value`, `@update:value` → `@update:model-value`
  - `NcSelect`: `:value` → `:model-value`, `@input` → `@update:model-value`
  - `NcSettingsSelectGroup`: `:value` → `:model-value`, `@update:value` → `@update:model-value`
- **Bundle budget**: Updated index chunk thresholds in bundle size checker

### Fixed
- **npm audit**: Resolved dependency vulnerabilities via `npm audit fix` ([#77](https://github.com/maz1987in/3Dviewer-Nextcloud/pull/77))
- **npm audit**: Applied non-breaking security patches, reducing vulnerabilities from 43 to 25 (42% reduction)
- **Lint**: Fixed `one-var` error in `useThumbnailCapture.js`
- **Animation loop toggle broken**: `AnimationMixer.LoopRepeat`/`LoopOnce` are module-level constants, not static properties — `setLoop(undefined)` made loop toggling non-functional. Imported `LoopRepeat`/`LoopOnce` directly from `'three'` (`useAnimation.js`, `useComparison.js`)
- **Model load errors invisible to user**: Variable shadowing in `handleLoadError` — parameter `error` shadowed the `error` ref, so `error.value = error` was a no-op. Renamed parameter to `loadError`, fixed logger level from `info` to `error` (`useModelLoading.js`)
- **Lights leak on re-setup**: Vue 3 proxy wraps items in `ref([])` arrays — `scene.remove(proxy)` doesn't match raw Three.js objects via `indexOf`. Added `toRaw()` for light/helper removal and `instanceof` checks (`useScene.js`)
- **Toast auto-dismiss broken**: `ToastContainer` was mutating the `toasts` prop directly (setting `progress`/`paused` on prop objects), which triggers Vue 3 warnings and breaks in strict mode. Moved progress and paused state to local `data()` (`ToastContainer.vue`)
- **Mobile touch listener leak**: `setupPinchZoom()` and `setupDoubleTapReset()` added document event listeners but never stored references for cleanup. Stored refs in `eventListeners` and added removal in `dispose()` (`useMobile.js`)
- **Settings page form controls not responding**: `@nextcloud/vue` 9.x changed all form component props from `checked`/`value` to `modelValue`. Updated all bindings in `PersonalSettings.vue`
- **CSS nesting bug**: `.select-group-row` rule was nested inside `.setting-row` braces — silently dropped in browsers without CSS Nesting support. Moved to separate rule block (`PersonalSettings.vue`)
- **Viewer registration errors silent**: Both `registerViewerHandler` and `registerViewerHandlerLegacy` had empty catch blocks — any registration failure was invisible. Added `logger.error()` calls (`viewer-api.js`)
- **Loader errors invisible**: All `BaseLoader` logging methods (`logInfo`, `logWarning`, `logError`) had empty bodies. Delegated to project logger (`BaseLoader.js`)

### Technical
- PHP CS Fixer: Blank lines before returns, doc comment whitespace, type-cast spacing, removed unused imports
- OpenAPI spec: Regenerated with slicer and thumbnail controller tags and updated description
- Three.js + Vue 3 pattern: `shallowRef` for single Three.js objects, `ref` for arrays, `toRaw()` when passing proxied objects to Three.js APIs
- Vue 3 Maps pattern: Maps moved to `created()` hook as non-reactive instance properties (`this._timers`) to avoid Vue 3 proxy breaking `Map.has()`/`Map.get()`

## [2.3.4] - 2026-01-18

### Changed
- **Dependencies**: Updated development dependencies
  - `@babel/core`: ^7.28.5 → ^7.28.6
  - `@babel/preset-env`: ^7.28.5 → ^7.28.6
  - `postcss-html`: ^1.7.0 → ^1.8.1
  - `vite`: ^7.2.7 → ^7.3.1

### Fixed
- **Nextcloud Subfolder Compatibility** ([#74](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/74))
  - Fixed app not working when Nextcloud is installed in a subfolder (e.g., `https://example.com/nextcloud/`)
  - Replaced all hardcoded `/apps/threedviewer/...` paths with Nextcloud's `generateUrl()` and `imagePath()` functions
  - API endpoints, decoder paths, and static assets now correctly respect the configured webroot
  - Affected files: multiFileHelpers.js, useModelLoading.js, useComparison.js, gltf.js, ViewerComponent.vue, SlicerModal.vue, App.vue, viewer-config.js

## [2.3.3] - 2026-01-15

### Added
- **Automatic Thumbnail Generation**: 3D model thumbnails are now automatically generated when viewing files
  - Thumbnails are captured with smart cropping to focus on model content
  - Grid and axes are hidden during capture for clean previews
  - Thumbnails stored in Nextcloud app data (not in user files) to avoid cluttering recent files
  - User setting to enable/disable thumbnail generation in Personal Settings → 3D Viewer → Thumbnails
  - "Clear thumbnails" button in settings to delete all stored thumbnails
  - Works in both standalone viewer and Nextcloud Files integration modal
- **Thumbnail Settings**: New Thumbnails section in Personal Settings
  - Toggle to enable/disable automatic thumbnail generation
  - Clear thumbnails button with confirmation dialog and count of deleted files

### Changed
- Thumbnails are now stored in Nextcloud's internal app data folder instead of user folder
  - Prevents thumbnails from appearing in "Recommended files" and recent files lists
  - Improved privacy and cleaner user file space

### Technical
- New `ThumbnailService` using `IAppData` for app-internal storage
- New `ThumbnailController` with endpoints for storing and clearing thumbnails
- `useThumbnailCapture` composable with smart content-aware cropping
- Thumbnail capture integrated into both `ThreeViewer.vue` and `ViewerComponent.vue`

## [2.3.2] - 2026-01-07

### Changed
- **Dependencies**: Updated development dependencies
  - `stylelint-scss`: ^6.13.0 → ^6.14.0 (dev)
    - Enhanced `dollar-variable-no-missing-interpolation` to flag namespaced variables in custom properties
    - Extended `function-disallowed-list` to detect disallowed functions within `@return` expressions
    - Fixed false positives in `dollar-variable-no-missing-interpolation` when variables already exist inside interpolation

## [2.3.1] - 2026-01-07

### Fixed
- **"Send to Slicer" Button Always Disabled**
  - Fixed missing `modelLoaded` prop binding in SlideOutToolPanel component
  - Button now correctly enables when a model is loaded
  - Affects STL and all other 3D model formats

- **CRITICAL: Cron Job Fatal Error** ([#65](https://github.com/maz1987in/3Dviewer-Nextcloud/issues/65))
  - Fixed `foreach() argument must be of type array|object, null given` error in CleanupTempFiles cron job
  - Removed incorrect `foreach` wrapper around `callForAllUsers()` method

- **CRITICAL: Missing Exception Method**
  - Added missing `getExtension()` method to `UnsupportedFileTypeException` class
  - Fixed fatal error when attempting to access extension information from unsupported file type exceptions
  - Updated all exception throw sites to include extension parameter

- **CRITICAL: Insecure Rate Limiting**
  - Replaced insecure session-based rate limiting with distributed cache implementation
  - Uses `ICacheFactory` for thread-safe, multi-server compatible rate limiting
  - Prevents rate limit bypass by session clearing
  - Improved scalability for large installations

- **HIGH: IP Address Spoofing Vulnerability**
  - Replaced custom IP detection with Nextcloud's secure `$request->getRemoteAddress()` method
  - Prevents IP spoofing via forged X-Forwarded-For headers
  - Properly respects trusted proxy configuration

- **HIGH: Path Traversal Vulnerability**
  - Fixed path traversal vulnerability in temp folder verification (SlicerController)
  - Replaced insecure `strpos()` checks with proper `str_starts_with()` path validation
  - Prevents unauthorized file access via path traversal attacks

- **MEDIUM: HTTP Header Injection**
  - Fixed potential header injection in Content-Disposition header (PublicFileController)
  - Replaced `addslashes()` with proper RFC 2231 encoding using `rawurlencode()`
  - Prevents header injection via malicious filenames

### Improved
- **Temp File Cleanup Enhancements**
  - Added comprehensive logging for NotFoundException cases
  - Implemented cleanup statistics tracking (files deleted, shares deleted, users processed, errors)
  - Improved share deletion error handling with separate method and individual error logging
  - Added file type validation to skip directories during cleanup
  - Added progress logging every 100 users for large instances
  - Added stack traces to error logs for better debugging

## [2.3.0] - 2025-12-28

### Added
- **G-code Visualization Enhancements**
  - Smooth rainbow spectrum gradient coloring across entire model
  - Intelligent filtering of travel moves, retractions, and parking movements
  - Skip movements exceeding 50mm in XY plane to remove edge artifacts
  - Fixed vertex color handling for proper gradient display when toggling modes

- **Mobile View Optimizations**
  - Responsive MinimalTopBar with all icons visible on small screens
  - Help panel displays full-screen with sticky header on mobile
  - Smooth scrolling support for iOS devices
  - Performance stats overlay hidden by default on mobile and screens ≤768px

- **G-code Toolpath Visualization**: Added support for G-code files used in 3D printing and CNC machining
  - New G-code parser supporting G0/G1 movement commands
  - Automatic layer detection based on Z-height changes
  - Color-coded visualization with different colors per layer using HSL gradient
  - Support for multiple file extensions: `.gcode`, `.gco`, `.nc`, `.acode` (AnkerMake)
  - MIME type registration: `text/x-gcode`
  - Custom file type icon for G-code files
  - Toolpath rendered as 3D line segments with configurable transparency

- **Extended G-code Ecosystem Support**
  - Additional extensions recognized and routed to the G-code loader: `.g`, `.gx` (FlashForge), `.g3drem` (Dremel), `.makerbot`, `.thing`
  - MIME mappings added for container variants: `application/x-gcode` for `.gx`, `.g3drem`, `.makerbot`, `.thing`
  - Viewer “By Type” browser now lists these extensions via `SUPPORTED_FORMATS` config

### Changed
- **Backend Listing Filters**: Updated `FileController` filters to include G‑code-related extensions in Folders, Type, and Date views so these files surface across all navigation modes
  - Applies to folder-scoped listing, type grouping, date grouping, nested folder inclusion checks, and descendant checks
- **Slicer Handoff Options**: Simplified send-to-slicer flow by letting users pick passthrough extensions; all other formats now auto-convert to STL by default (export-format selector removed)
- **G-code Visualization Default**: Default toolpath color mode is now gradient instead of single-color orange for clearer multi-layer contrast

### Dependencies
- Updated @nextcloud/dialogs from 7.1.0 to 7.2.0

## [2.2.0] - 2025-12-17

### Added
- **Measurement & Annotation Visual Sizing Controls**: Added per-user sliders to control measurement and annotation visuals
  - New Personal Settings section for adjusting measurement point size, line thickness, and label width
  - New Personal Settings sliders for annotation point size and label width
  - Settings are stored per user via `SettingsController` and merged into `VIEWER_CONFIG.visualSizing`
  - Measurement and annotation composables (`useMeasurement.js`, `useAnnotation.js`) now derive sizes from configurable percentages of the model size
- **Animation Controls in UI**: Added animation play/pause controls to viewer interface
  - Animation play/pause button in MinimalTopBar component
  - Animation controls section in SlideOutToolPanel with play/pause and loop toggle
  - Animation state props passed through App.vue to child components
  - Integration of useAnimation composable in ThreeViewer component
  - Improved directory path extraction for multi-file model loading
- **Dependency Cache Insights**: Added live cache statistics (size, entries, hit rate) to the viewer and slide-out tools
  - Viewer performance panel now shows cache size and hit rate
  - Slide-out tools panel displays cache stats and clear-cache control with status
  - Cache stats refresh automatically during use and after model loads or cache clears
  - Cache hit/miss tracking with reset when clearing the cache
- **Performance Scaling for Large Models**: Automatic performance mode suggestions and easy mode switching
  - Configurable triangle count thresholds (warn: 500K, strong: 1M faces) for detecting heavy models
  - Automatic toast notification suggesting performance mode for models exceeding thresholds
  - Clickable performance mode label in stats overlay to cycle through modes (Auto → Low → Balanced → High → Ultra)
  - ViewerToolbar performance button now cycles through modes instead of toggling stats
  - Performance mode changes apply immediately with visual feedback
- **Slicer Temp File Security Hardening**: Enhanced security for temporary file uploads
  - File size validation: 50MB per file limit, 200MB rolling folder cap
  - MIME type validation for STL files with header checking
  - Rolling 24-hour expiration enforced on file access
  - Increased cleanup frequency from 24h to 6h for faster expiry enforcement
  - Comprehensive audit logging for creation, access, and deletion events
  - Security posture documented in TECHNICAL.md
- **Automated Bundle Budget Enforcement**: Enhanced bundle size checking with historical tracking
  - Comprehensive budget thresholds for all major bundles (main, loaders, app, three-core, index, nc-select)
  - Historical size trend tracking in bundle-sizes.json (last 50 builds)
  - CI workflow uploads bundle size history as artifact (90-day retention)
  - Size trend comparison shows changes vs previous build
  - Improved error reporting with formatted bytes and clear failure messages
  - Fails CI builds when budgets are exceeded (with environment variable overrides)
- **Vue 3 Migration Pre-Work**: Eliminated Vue 3 incompatible patterns to prepare for future migration
  - Replaced deprecated lifecycle hooks (`beforeDestroy` → `beforeUnmount` in ViewerToolbar, ToastContainer, ViewerComponent, viewer-api.js)
  - Added explicit `emits` declarations to all components (ViewerToolbar, ToastContainer, ViewerComponent, ViewerModal, FileNavigation, FileBrowser)
  - Verified no implicit `$listeners` usage (removed in Vue 3)
  - Added comprehensive migration notes to COMPOSABLES_API.md with dependency compatibility matrix
  - Audited dependencies: `vue` 2.7 → 3.x (API compatible), `@nextcloud/vue` 8.x → 9.x (requires Nextcloud 30+)

### Changed
- **Cache Statistics Updates**: Improved cache stats refresh frequency from 5 seconds to 2 seconds for more responsive UI
- **Performance Mode Controls**: Enhanced performance mode switching with clickable controls
  - Performance mode label in stats overlay is now clickable to cycle modes
  - ViewerToolbar performance button cycles modes (preserves MinimalTopBar toggle behavior)
  - All mode changes apply immediately with proper event propagation
 - **Dependencies**: Updated core runtime and build tooling
   - `three`: ^0.181.2 → ^0.182.0 (patch update)
   - `vite`: ^7.2.6 → ^7.2.7 (dev, patch update)
 - **Security Workflow**: Updated GitHub Actions CodeQL workflow to use `github/codeql-action` v4 in preparation for the v3 deprecation in December 2026

### Fixed
- **Toast Event Handling**: Fixed missing `push-toast` event handler in App.vue preventing performance suggestion toasts from displaying
- **ViewerModal Performance Mode**: Fixed performance mode cycling in ViewerModal component by adding proper prop passing and event handling
- **Model Comparison Positioning**: Fixed comparison model positioning issues where the second model's position was immutable
  - Wrapped comparison model in a Group to neutralize baked position offset from loading
  - Fixed parent-child relationship handling by using toRaw() to get actual Three.js objects instead of Vue proxies
  - Ensured matrixAutoUpdate is enabled for wrapper and all children for proper render loop updates
  - Fixed matrix validation order: validate parent matrices before child objects to prevent "Cannot read properties of undefined" errors
  - Improved scene hierarchy validation to include all objects (grid, axes, lights) not just models
  - Fixed matrix update sequence: call updateMatrix() on all objects before updateMatrixWorld() to ensure proper transformations
  - Comparison models now position correctly side-by-side with proper spacing and alignment
- **CSP Compliance for Texture Loading**: Fixed Content Security Policy violations when loading GLB/GLTF models with embedded textures in Nextcloud modal viewer
  - Patched `Image.prototype.src` setter to automatically convert blob URLs to data URIs for texture loading
  - Patched `URL.createObjectURL` to track blob-to-URL mappings for later conversion
  - Patched `fetch()` and `XMLHttpRequest` to intercept blob URLs and convert them to data URIs
  - Patched `THREE.FileLoader` to handle blob URL conversion for texture resources
  - Automatic detection of modal viewer context (iframe or Nextcloud viewer) to apply CSP workarounds only when needed
  - All patches are automatically restored after model loading completes
- **CSP Compliance for Buffer Loading**: Fixed CSP violations when loading GLTF files with external `.bin` buffer files
  - Updated `setupResourceManager` to use data URIs for buffers in modal context (instead of blob URLs)
  - Patched `fetch()` to intercept data URI requests and decode them manually, bypassing CSP restrictions
  - Supports both base64 and URL-encoded data URIs for maximum compatibility
- **Animation Support for Multi-File GLTF**: Fixed missing animation initialization for GLTF files loaded with external dependencies
  - Added animation detection and initialization to `loadModelWithFiles` function
  - Animations now properly initialize when loading GLTF files with external `.bin` files
  - Animation controls now appear correctly for animated multi-file GLTF models
- **False Texture Warning**: Removed automatic texture warning banner that was incorrectly showing for all GLB/GLTF files
  - Warning now only appears when actual CSP errors or texture loading failures are detected
  - Improved user experience by eliminating false warnings when textures load successfully
- **Slicer Upload Safety**: Hardened temporary STL upload handling with size and MIME validation
  - Reject uploads over 50 MB per file and enforce a 200 MB rolling temp folder cap
  - Validate STL MIME/header before accepting; reject invalid content
  - Enforce rolling 24h expiration on access and clean up expired shares/files
  - Use rolling +1 day expiration for generated share links
- **OBJ Texture Loading Robustness**: Improved OBJ/MTL parsing and texture handling
  - Preserve texture/MTL paths with spaces and mark materials for update after textures load
  - Use existing blob File objects for texture URLs and tighten loader logging
  - Handle texture load failures gracefully and ensure needsUpdate flags are set
- **Texture Dependency Lookup**: Skip direct “find by path” lookups for image textures to avoid unnecessary 404s; rely on directory listings for textures commonly stored in subfolders

## [2.1.0] - 2025-12-06

### Added
- **File Browser Default View Setting**: Added user preference for default file browser view mode (Grid or List)
  - New setting in Personal Settings → File Browser → Default View
  - FileBrowser component now loads and respects the default view from user settings
  - Setting takes precedence over localStorage, ensuring consistent default behavior
  - Manual view changes are still saved to localStorage for session persistence
- **Format Sync Test Suite**: Created comprehensive unit tests (`tests/unit/Service/FormatSyncTest.php`) to ensure format definitions stay synchronized across:
  - Backend PHP constants (`lib/Constants/SupportedFormats.php`)
  - Frontend configuration (`src/config/viewer-config.js`)
  - Nextcloud MIME registration (`appinfo/mimetypemapping.json`)
- **File Browser List View**: Added ability to toggle between grid and list views in file browser

### Changed
- **Format Definitions Centralized**: Consolidated all 3D model format definitions into `lib/Constants/SupportedFormats.php` as single source of truth
  - `EXT_MIME_MAP` for extension to MIME type mappings
  - `CONTENT_TYPE_MAP` for file streaming content types
  - All repair steps and services now reference centralized constants
  - Eliminates format definition divergence between components
- **File Browser Grid Padding**: Updated file grid padding to consistent 20px on all sides for better visual spacing

### Documentation
- Corrected repository URLs and upstream fork instructions in `CONTRIBUTING.md` (replaced placeholders with `maz1987in/3Dviewer-Nextcloud`).
- Updated `TECHNICAL.md` with new controllers (`SettingsController`, `SlicerController`), components (`PersonalSettings.vue`, `SlicerModal.vue`), and detailed Personal Settings + File Browser implementation sections.
- Added comprehensive "Adding a New Format" guide in `TECHNICAL.md` with step-by-step instructions and code examples
- Expanded `IMPLEMENTATION.md`: added Slicer Integration & Personal Settings System sections; reorganized and deduplicated legacy "Code Audit and Cleanup" content; refreshed Table of Contents.
- Updated `README.md` (docs version) advanced features list to include Slicer Integration and Personal Settings.
- Added troubleshooting sections for Slicer Integration and Personal Settings in `TROUBLESHOOTING.md`.
- Expanded test coverage notes in `TESTING.md` to include new controllers (Settings/Slicer) and components (PersonalSettings/SlicerModal).
- Normalized wording and removed outdated dual-mode duplication in implementation documentation.
- Documented dual-mode viewer architecture in `TECHNICAL.md` with viewer lifecycle diagram (standalone vs modal modes).

### Fixed
- Settings page image/logo path resolution: replaced hardcoded asset URL with `imagePath()` helper in `PersonalSettings.vue` to ensure correct loading under all deployment paths.
- **VRML preprocessing duplication**: Removed duplicate preprocessing code in `preprocessVrmlText()` that was applying BOM removal, line ending normalization, and null byte removal twice, causing inconsistent preprocessing behavior.
- **Flexible texture matching loop control**: Fixed nested loop control flow in texture matching logic (`multiFileHelpers.js`) by adding `foundMatch` flag to properly exit outer loop when match is found in inner loop, preventing valid texture matches from being skipped.
- **Premature texture issue check**: Moved `checkForTextureIssues()` setTimeout call in `ViewerComponent.vue` to execute after model successfully loads and is added to scene, ensuring accurate texture loading status assessment.
- **Debug logging cleanup**: Removed `console.log` statements from `FileBrowser.vue` component (viewMode watcher and setViewMode method) to improve production code quality.

## [2.0.0] - 2025-12-01

### Added
- **Standalone Advanced Viewer**: Full-featured standalone viewer mode accessible via `/apps/threedviewer/f/{fileId}`
  - Dual-mode architecture: simple modal viewer (ViewerComponent) and advanced standalone viewer (App.vue)
  - Conditional mounting in `src/main.js` for `#threedviewer` root element
  - Props-based data flow: `fileId`, `filename`, and `dir` passed via data attributes from template to App.vue
  - Loader-driven model pipeline works in both simple and advanced modes
  - Enhanced error handling with specific messages for 404, 403, network, and parsing errors
  - PageController automatically fetches filename and directory from fileId for robustness
  - User-friendly loading and error states harmonized between both viewer modes
- **Personal Settings**: Added personal settings page for user-specific preferences
  - SettingsController and PersonalSettings view for managing user preferences
  - Settings routes and configuration updates
- **Enhanced File Loaders**: Significantly improved loader capabilities
  - Enhanced FBX loader with additional features and better support
  - Improved VRML loader with expanded capabilities
  - Updated DAE loader for better compatibility
  - Enhanced multi-file loading helpers for improved dependency resolution

### Changed
- **Viewer Enhancements**: Enhanced ThreeViewer component with improved controls and features
- **Camera Improvements**: Updated camera composable with additional functionality
- **Circular Controller**: Enhanced circular controller with better user experience
- **Theme and Performance**: Updated theme and performance composables
- **Major Version Bump**: Version 2.0.0 introduces significant improvements and new features

### Technical
- Updated GitHub workflows with improved condition syntax
- Updated Dependabot timezone to Asia/Muscat
- Added change detection to prevent unnecessary PRs in workflows
- Updated stylelint to 16.26.1

## [1.9.8] - 2025-11-28

### Changed
- **Dependencies**: Updated development and runtime dependencies
  - `three`: ^0.181.1 → ^0.181.2 (patch update)
  - `stylelint`: ^16.25.0 → ^16.26.0 (dev)
  - `vite`: ^7.2.2 → ^7.2.4 (dev)

## [1.9.7] - 2025-11-27

### Added
- **Folder Exclusion**: Added support for `.no3d` marker file to exclude specific folders from 3D file scanning.
- **Hidden Folder Exclusion**: Automatically exclude hidden folders (starting with `.`) from the file index.
- **Temp File Cleanup**: Implemented background job to automatically clean up `.3dviewer_temp` files older than 24 hours.

### Fixed
- **Layout Issue**: Fixed white empty space when hiding the navigation sidebar by ensuring correct flexbox behavior and explicit slot usage.
- **Viewer Resizing**: Fixed 3D canvas visual resizing issue by syncing internal resolution with CSS dimensions (`width: 100%`).
- **App Logo**: Fixed broken app logo in demo scene by using correct asset path helper.
- **Slicer Icons**: Fixed missing slicer icons by using the correct `imagePath` helper for asset URLs.
- **"By Folder" Navigation**: improved folder indexing logic to correctly build hierarchy and handle edge cases.
- **Server Error**: Resolved persistent `preg_match` error in `PreviewManager` by disabling unused app preview provider registration.

## [1.9.6] - 2025-11-21

### Fixed
- **Preview Provider Registration**: Fixed `ArgumentCountError` during app service registration
  - `registerPreviewProvider()` requires 2 arguments (MIME type and provider class)
  - Now registers `ModelPreviewProvider` for each supported MIME type individually
  - Resolves error: "Too few arguments to function registerPreviewProvider(), 1 passed and exactly 2 expected"
- **Migration Class Declaration**: Fixed missing class declaration in migration file
  - Added `class Version010902Date20251116061241 extends SimpleMigrationStep` declaration
  - Resolves syntax error: "unexpected token \"public\", expecting end of file"
- **Folder Path Length**: Removed the 512-character limit by hashing folder paths for indexing
  - Restored `folder_path` to `TEXT` and added a `folder_path_hash` column with a new migration
  - Existing rows are backfilled automatically so deep folder structures continue to work

## [1.9.2] - 2025-11-19

### Added
- **Database-Backed File Indexing**: New `tv_file_index` database table for fast folder, type, date, and favorites navigation
  - Automatic indexing via filesystem event listeners (`NodeCreated`, `NodeWritten`, `NodeDeleted`)
  - Manual reindexing via `php occ threedviewer:index-files [userId]` command or `/apps/threedviewer/api/files/index` endpoint
  - Migration automatically creates the index table on upgrade
- **Smart File Browser**: Complete file navigation system with multiple view modes
  - Viewer mode: Opens 3D viewer by default on app load
  - Folders mode: Hierarchical folder navigation with recursive folder structure
  - Type mode: Browse files grouped by extension (GLB, GLTF, OBJ, etc.)
  - Date mode: Browse files organized by year and month
  - Favorites mode: View all favorited 3D files using Nextcloud system tags
  - Breadcrumb navigation for easy navigation back through folder/type/date hierarchies
  - Consistent card-based UI for folders, types, dates, and files
- **Per-User Configuration**: Remembers user preferences via `ConfigController`
  - Saves preferred sort mode (viewer/folders/type/date/favorites)
  - Remembers last opened file ID for session persistence
- Mobile experience: automatically hides the circular 3D controller when the viewer detects a small/mobile viewport, preventing overlap with the canvas controls.

### Changed
- Viewer opens by default on app load; the file browser now appears only when a user explicitly selects a navigation mode.
- `GET /apps/threedviewer/api/files/list` now serves hierarchical payloads from the database index (folders, types, dates, favorites) instead of scanning filesystem
  - Supports `includeDependencies=1` parameter to return all files including textures and nested subfolders for multi-file model loading
  - Dramatically reduces filesystem scans and improves performance
- Navigation data is loaded lazily per sort mode and cached so switching between viewer and browser modes no longer blocks on loading every file upfront.
- File browser UI refinements:
  - File cards now share the same compact layout as folder cards (consistent padding, thumbnail sizing, fonts, and grid spacing).
  - Type view heading and breadcrumbs no longer show a leading dot (e.g. `GLB` instead of `.GLB`).
  - Breadcrumb component now handles clicks directly via `NcBreadcrumb` to improve reliability.
- Remembered folder/type state is cleared when returning to the root via breadcrumbs to ensure a fresh reload.

### Fixed
- Newly uploaded, edited, or deleted 3D files (and favorites) appear instantly in every navigation mode because the indexing listener reacts to filesystem events instead of relying on manual rescans.
- Root breadcrumb ("Home") navigation restores the folder list correctly, even after drilling into nested folders.
- Multi-file dependency loading:
  - Backend `listFiles` now supports `includeDependencies=1` to return every file (including textures) and nested subfolders.
  - The dependency crawler recursively searches texture subdirectories so 3DS/FBX models with textured assets load successfully.
- Texture search now uses the updated backend response structure to avoid missing files and 404 fetches.

### Technical
- Created `lib/Db/FileIndex.php` and `lib/Db/FileIndexMapper.php` for database operations
- Created `lib/Service/FileIndexService.php` for indexing logic
- Created `lib/Listener/FileIndexListener.php` for automatic index updates
- Created `lib/Command/IndexFiles.php` for manual reindexing command
- Created `lib/Controller/ConfigController.php` for user preference storage
- Created `lib/Migration/Version010902Date20251116061241.php` for database schema migration
- Created `src/components/FileNavigation.vue` and `src/components/FileBrowser.vue` for new navigation UI
- Updated `lib/Controller/FileController.php` with new `listFiles()` and `indexFiles()` endpoints

## [1.9.1] - 2025-11-15

### Added
- **Preview Provider Implementation**: Implemented Nextcloud `IPreviewProvider` interface for 3D model previews
  - Admins can enable/disable via `enabledPreviewProviders` config in `config/config.php`
  - Integrates with Nextcloud's native preview system
  - When enabled, provider is registered and ready for future preview rendering implementation
  - When disabled, Nextcloud automatically uses custom filetype SVG icons

### Changed
- Updated dependencies:
  - `three`: ^0.181.0 → ^0.181.1 (patch update)
  - `@nextcloud/router`: ^3.0.1 → ^3.1.0 (minor update)
  - `vite`: ^7.1.12 → ^7.2.2 (patch update)
  - `@nextcloud/browserslist-config`: ^3.1.1 → ^3.1.2 (patch update)
- Improved duplicate registration prevention:
  - Added guards to prevent duplicate file action registration
  - Added guards to prevent duplicate viewer handler registration
  - Enhanced error handling with try-catch blocks

### Removed
- **ThumbnailController**: Removed custom thumbnail controller endpoint
  - Replaced by proper Nextcloud `IPreviewProvider` implementation
  - No longer needed as Nextcloud handles previews natively
- **Thumbnail Placeholder**: Removed dependency on `thumbnail-placeholder.png`
  - Nextcloud automatically uses custom filetype icons when previews are disabled
  - Custom icons already registered via `mimetypemapping.json`
- **CSS Thumbnail Overrides**: Removed CSS rules that forced `app.svg` background on thumbnails
  - Allows Nextcloud's preview system to work properly
  - Custom filetype icons display correctly when previews are unavailable

### Fixed
- **Duplicate Registration Warnings**: Fixed console warnings about duplicate settings/registrations
  - Added registration guards using window/globalThis flags
  - Improved handler registration checks
  - Better error handling for duplicate registrations

### Technical
- Created `lib/Preview/ModelPreviewProvider.php` implementing `IPreviewProvider`
- Registered preview provider in `Application.php` bootstrap
- Removed `THUMBNAIL` endpoint from constants and API documentation
- Updated `openapi.json` with preview provider documentation

## [1.9.0] - 2025-11-10

### Added
- **🖨️ Slicer Integration**: Send 3D models directly to slicer applications for 3D printing
  - Support for PrusaSlicer, UltiMaker Cura, BambuStudio, OrcaSlicer, Simplify3D, and Eufy Studio
  - One-click export with URL scheme integration
  - Automatic STL conversion and temporary share link creation
  - Professional slicer logos with brand-matched colors
  - Last used slicer appears first for quick access
  - Smart detection of uninstalled slicers with user-friendly error messages
  - Auto-download fallback when slicer app is not registered
  - Temporary file cleanup after 2 minutes
  - Share links expire after 24 hours for security
- **SlicerController API**: Backend controller for handling slicer exports
  - POST `/api/slicer/temp` - Upload STL and create temporary share link
  - GET `/api/slicer/temp/{fileId}` - Download temporary file
  - DELETE `/api/slicer/temp/{fileId}` - Delete temporary file and share
  - Automatic cleanup of old temporary files
  - Proper filename sanitization for paths and special characters
  - CORS headers for slicer application compatibility

### Changed
- Updated app version to 1.9.0
- Enhanced toolbar with "Send to Slicer" button
- Added slicer integration to slide-out tools panel
- Improved error handling with toast notifications
- Updated translations for all supported languages

### Technical
- Created `appinfo/routes.php` for route registration
- Added `@NoCSRFRequired` annotations for API endpoints
- Implemented Nextcloud native share system for temporary URLs
- Fixed filename handling for files with paths and special characters
- Added proper authentication and cleanup mechanisms

## [1.8.0] - 2025-01-05

### Added
- **Screenshot Feature**: Capture high-quality screenshots of 3D models directly from the viewer
  - PNG and JPEG format support with configurable quality
  - Automatic filename generation with timestamp
  - Accessible from toolbar and tools panel
  - Download screenshots directly to local device
  - Fixed WebGL renderer configuration to enable screenshot capture (`preserveDrawingBuffer: true`)
- **Billboard Text Labels**: Annotation and measurement text now always faces the camera
  - Text remains readable from any viewing angle
  - No more reversed/mirrored text when viewing from behind
  - Smooth rotation as camera moves around the model
  - Improved user experience for annotations and measurements

### Changed
- Updated app version to 1.8.0
- Enhanced info.xml with new feature descriptions
- Updated English translations for screenshot and billboard features

## [1.7.13] - 2025-01-05

### Fixed
- **CSP Conflicts**: Removed global CSP listener that was breaking other Nextcloud apps (Memories, etc.)
- **File Icons**: Fixed custom file type icons not displaying by copying them to correct location
- **App Compatibility**: CSP modifications now only apply to 3D viewer routes, allowing other apps to function normally

### Changed
- CSP headers now scoped to specific 3D viewer routes instead of globally
- Added automatic icon copying during build process (scripts/copy-icons.mjs)
- Removed `lib/Listener/CspListener.php` (no longer needed)

## [1.7.12] - 2025-01-04

### Fixed
- **Viewer Integration**: Fixed `files()` method not storing files list, causing "No files provided, skipping update" error
- **File Loading**: Fixed `TypeError: Cannot read properties of undefined (reading 'filename')` when opening 3D files
- **Static Assets**: Fixed 500 error when loading app-color.svg due to route conflicts
- **Route Structure**: Changed viewer route from `/{fileId}` to `/f/{fileId}` to prevent conflicts with static assets
- **Axes Positioning**: Axes helper now positioned at bottom center of models, aligned with grid
- **Axes Scaling**: Made axes size dynamic (25% of model's largest dimension, minimum 5 units)
- **Logo Loading**: Fixed app logo path in demo scene to use generateUrl() for correct URL resolution

### Changed
- Enhanced `files()` method in ViewerComponent with fallback logic to create synthetic file from props
- Simplified PageController by removing unnecessary `is_numeric()` checks
- Updated URL structure for better RESTful design: `/apps/threedviewer/f/{fileId}`
- Axes now recreate on model load to ensure proper sizing and positioning

## [1.7.11] - 2025-01-04

### Fixed
- **Dark Theme Support**: Fixed slide-out toolbar panel not responding to theme changes
- **Theme Switching**: Implemented reactive theme binding using Vue computed properties
- **CSS Integration**: Converted base styles to use Nextcloud CSS variables for better theme integration
- **UI Consistency**: Toolbar panel now properly switches between Light, Dark, and Auto themes

### Changed
- Improved maintainability by using Nextcloud's standard color system throughout the toolbar
- Enhanced theme responsiveness with component-level class binding

## [1.7.10] - 2025-11-04

### Fixed
- **Dark Theme Support**: Fixed slide-out toolbar panel not responding to theme changes
- **Theme Switching**: Implemented reactive theme binding using Vue computed properties
- **CSS Integration**: Converted base styles to use Nextcloud CSS variables for better theme integration
- **UI Consistency**: Toolbar panel now properly switches between Light, Dark, and Auto themes

### Changed
- Improved maintainability by using Nextcloud's standard color system throughout the toolbar
- Enhanced theme responsiveness with component-level class binding

## [1.7.9] - 2025-10-28

### Added
- **3D Camera Controller**: New circular controller interface for intuitive 3D model navigation
- **Camera Control Methods**: Advanced camera manipulation including rotation, zoom, and directional nudging
- **View Snapping**: Animated camera transitions to predefined views (Front, Back, Left, Right, Top, Bottom)
- **Controller Persistence**: Save and restore controller position and visibility preferences
- **Smooth Animations**: Eased camera transitions with customizable duration and easing functions
- **Face Labels**: Orientation markers (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT) on model faces
- **Export Functionality**: Export models to GLB, STL, and OBJ formats
- **Camera Projection Toggle**: Switch between perspective and orthographic views
- **Progressive Texture Loading**: Background texture loading for improved performance
- **Dependency Caching**: IndexedDB caching system for faster multi-file model loading
- **Model Statistics Panel**: Detailed information about loaded models
- **Help Panel**: Comprehensive in-app documentation and controls guide
- **Theme Customization**: Enhanced theme switching with RTL support
- **Performance Overlay**: Visual performance stats display with real-time monitoring
- **KTX2 Texture Support**: GPU texture compression for better performance

## [1.7.7] - 2025-10-11

### Added
- Comprehensive development tooling and configuration
- Jest testing framework for JavaScript unit tests
- Enhanced GitHub Actions workflows with security scanning
- Improved code quality tools (Stylelint, Psalm enhancements)
- Development documentation and contribution guidelines
- Git hooks for automated code quality checks
- VS Code workspace configuration
- Makefile for common development tasks
- App store marketing materials and screenshots

### Changed
- Enhanced package.json with additional scripts and dependencies
- Improved composer.json with security auditing and additional test configurations
- Updated stylelint configuration with comprehensive CSS/SCSS rules
- Enhanced psalm.xml with better static analysis settings
- Updated app metadata for Nextcloud app store publication

### Security
- Added security scanning workflows (CodeQL, npm audit, composer audit)
- Enhanced dependency vulnerability scanning
- Added security advisories configuration

## [1.0.0] - 2024-01-XX

### Added
- Initial release of 3D Viewer Nextcloud app
- Support for multiple 3D file formats (GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, 3DS)
- Dynamic grid system that adapts to model size
- Model comparison functionality with synchronized controls
- Real-time streaming with authentication
- Performance optimizations with code splitting and dynamic imports
- Theme integration respecting Nextcloud light/dark themes
- Accessibility features with ARIA labels and keyboard navigation
- Bundle size monitoring and optimization
- Comprehensive documentation and user guides
- PHPUnit testing for backend components
- Playwright testing for end-to-end scenarios
- Smoke tests for critical functionality

### Technical Features
- Vue.js 2 + Three.js frontend implementation
- Secure file streaming endpoints
- Dynamic loader imports for format-specific code
- DRACO and KTX2/Basis decoder support (with asset copying)
- Abortable model loading with progress feedback
- Camera state persistence and restoration
- Error handling with user-friendly notifications
- Public share support for anonymous access
- MIME type registration and cleanup
- Centralized model file support logic

### API Endpoints
- `GET /apps/threedviewer/file/{fileId}` - Stream authenticated model files
- `GET /apps/threedviewer/file/{fileId}/mtl/{mtlName}` - Stream MTL files for OBJ models
- `GET /apps/threedviewer/public/file/{token}/{fileId}` - Stream public share model files
- `GET /apps/threedviewer/asset/{type}/{filename}` - Serve static assets
- `GET /apps/threedviewer/decoder/{filename}` - Serve decoder files

### Supported Formats
- **Frontend & Backend**: GLB, GLTF, OBJ (+ MTL), STL, PLY, FBX, 3MF, 3DS
- **Compression**: DRACO (geometry), KTX2/Basis (textures)
- **Materials**: Full MTL support for OBJ files with automatic sibling resolution

### Performance
- Bundle size budget enforcement (950KB main, 120KB chunks)
- Dynamic imports for format-specific loaders
- Code splitting for optimal loading
- Abortable loading for large files
- Progress feedback during model loading

### Testing
- PHPUnit unit tests for controllers and services
- Playwright end-to-end tests
- Smoke tests for critical functionality
- Bundle size monitoring
- Abort behavior testing

### Documentation
- Comprehensive README with technical details
- Installation and user guides
- Developer documentation
- API reference
- Troubleshooting guide
- Technical architecture documentation

---

## Version History

### Development Milestones

- **v0.1.0** - Initial prototype with basic GLTF support
- **v0.5.0** - Added multiple format support and streaming
- **v0.8.0** - Performance optimizations and accessibility features
- **v0.9.0** - Public share support and enhanced error handling
- **v1.0.0** - Production-ready release with comprehensive testing

### Breaking Changes

None in v1.0.0 (initial release)

### Migration Notes

For users upgrading from development versions:

1. **Decoder Assets**: Ensure `draco/` and `basis/` directories are present
2. **MIME Types**: Run the repair step to register missing MIME mappings
3. **Browser Compatibility**: Requires modern browser with WebGL 2.0 support
4. **Nextcloud Version**: Requires Nextcloud 30+ for optimal compatibility

---

## Legend

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

## Links

- [GitHub Repository](https://github.com/your-username/3Dviewer-Nextcloud)
- [Nextcloud App Store](https://apps.nextcloud.com/apps/threedviewer)
- [Documentation](docs/)
- [Issue Tracker](https://github.com/your-username/3Dviewer-Nextcloud/issues)