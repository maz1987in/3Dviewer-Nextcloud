# 3D Viewer for Nextcloud

A comprehensive 3D model viewer application for Nextcloud that supports multiple 3D file formats with advanced features like dynamic grid sizing, model comparison, and real-time streaming.

## 📚 Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Step-by-step installation instructions
- **[User Guide](docs/USER_GUIDE.md)** - How to use the 3D viewer features
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Development setup and contribution guidelines
- **[API Reference](docs/API_REFERENCE.md)** - Complete API documentation
- **[Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)** - System design and architecture
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## 🚀 Quick Start

1. **Install the app** from the Nextcloud App Store or manually
2. **Upload 3D files** to your Nextcloud Files
3. **Click on any 3D file** to open the viewer
4. **Navigate** using mouse/touch controls

## ✨ Features

- **Multi-format Support**: GLB, GLTF, OBJ (+ MTL), STL, PLY, FBX, 3MF, 3DS, VRML, X3D
- **Dynamic Grid System**: Automatically adapts to model size and position
- **Model Comparison**: Side-by-side model viewing with synchronized controls
- **Real-time Streaming**: Secure file streaming with authentication
- **Performance Optimized**: Code splitting and dynamic imports
- **Theme Integration**: Respects Nextcloud light/dark themes
- **Accessibility**: ARIA labels and keyboard navigation

## Usage

- To get started easily use the [Appstore App generator](https://apps.nextcloud.com/developer/apps/generate) to
  dynamically generate an App based on this repository with all the constants prefilled.
- Alternatively you can use the "Use this template" button on the top of this page to create a new repository based on
  this repository. Afterwards adjust all the necessary constants like App ID, namespace, descriptions etc.

Once your app is ready follow the [instructions](https://nextcloudappstore.readthedocs.io/en/latest/developer.html) to
upload it to the Appstore.

## Resources

### Documentation for developers:

- General documentation and tutorials: https://nextcloud.com/developer
- Technical documentation: https://docs.nextcloud.com/server/latest/developer_manual

### Help for developers:

- Official community chat: https://cloud.nextcloud.com/call/xs25tz5y
- Official community forum: https://help.nextcloud.com/c/dev/11

## 3D File Streaming API

This app (work in progress) now provides authenticated streaming endpoints for supported 3D model formats. These will be consumed by the Vue/Three.js frontend.

Endpoints (base path: `/apps/threedviewer`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/file/{fileId}` | Stream a model file (`glb`, `gltf`, `obj`, `stl`, `ply`, `mtl`). |
| GET | `/file/{fileId}/mtl/{mtlName}` | Stream a sibling MTL file for an OBJ (exact filename match, case-insensitive). |

Status codes:
* 200: Stream begins (no caching, `no-store`).
* 401: No authenticated user.
* 404: File / sibling not found or not accessible.
* 415: Unsupported extension or invalid usage (e.g. MTL requested for non-OBJ parent / wrong auxiliary type).
* 500: Unexpected IO failure (could not open file stream).

Notes / roadmap:
* Public share token support: planned.
* Range / partial requests: not yet; can be added if large file seeking needed.
* MIME types are heuristically inferred when generic.
* Security: only allow listed extensions to avoid arbitrary file reads.

Supported extensions: `glb, gltf, obj, stl, ply, mtl, fbx`.

Frontend integration (loader selection & streaming fetch) will follow in a subsequent iteration.

### Viewer Integration (Three.js)

The in-browser 3D viewer is implemented with Vue 2 + Three.js and currently supports the following formats via lazy‑loaded official loaders:

Supported formats (frontend & backend end-to-end): `glb`, `gltf`, `obj` (+ `.mtl`), `stl`, `ply`, `fbx`, `3mf`, `3ds`.

Key implementation points:
* Dynamic imports: Individual Three.js loaders (`GLTFLoader`, `OBJLoader`, `MTLLoader`, `STLLoader`, `PLYLoader`, `FBXLoader`) are code‑split so they only load when a matching extension is requested.
* OBJ + MTL: After streaming an OBJ the viewer parses its `mtllib` directive and performs a second request to `/file/{fileId}/mtl/{mtlName}` (or the public variant) to load materials when present. Missing or invalid MTL files gracefully degrade to untextured materials.
* Camera framing: On initial model load the scene bounding box is computed and the camera + orbit controls are adjusted to frame the model (with a small margin) and set a sensible near/far range.
* Wireframe & helpers (planned toggles): Toolbar hooks are scaffolded for grid, axes, reset, wireframe; wireframe application iterates mesh materials updating their `wireframe` flag.
* Background: Respects Nextcloud light/dark theme variables by default; a custom color override toggle can be layered later.
* Performance: Heavy/optional decoders (DRACO, KTX2/Basis) are prepared for future activation—decoder asset folders (`/draco`, `/basis`) will be copied during build once compression use cases arise.
* Accessibility: Toolbar buttons expose ARIA labels; further keyboard shortcuts (reset view, toggle wireframe) are candidates for a future iteration.
* Abortable loading: Large model fetches can be canceled mid‑stream (see below) to avoid wasting bandwidth and free UI quickly.

Fetch & security behavior:
* The viewer never constructs raw WebDAV URLs; it only streams through the app's controlled endpoints, ensuring permission checks and extension allow‑listing.
* Failed loads surface toast notifications with concise, localizable error messages.

Future enhancements under consideration:
1. DRACO + KTX2 decoder asset shipping and automatic loader wiring when compressed buffers/ textures detected.
2. (In progress) Thumbnail service: currently a static placeholder PNG is provided via `/thumb/{fileId}`; future work may render real previews.
3. Drag & drop local (unsaved) model preview for rapid inspection without uploading.
4. Persisting last camera state per file (localStorage) to restore view on revisit.
5. Progressive / streamed parsing feedback for very large meshes.
6. Improved abort UX (e.g. toast on cancel vs silent message overlay) once broader UX pattern decided.

Development notes:
* The entry bundle is currently ~700 kB (pre-gzip) due largely to core Three.js; dynamic imports mitigate initial parse cost for format-specific code. Additional manual chunking or vendor splitting can be evaluated if size becomes a concern.
* Adding a new format requires: (a) backend allow‑list update in `ModelFileSupport`, (b) loader dynamic import block in `ThreeViewer.vue`, and (c) optional MIME mapping addition if a specific type is desirable.

### Bundle Size Budget & Monitoring

To keep the viewer performant inside the broader Nextcloud UI, a lightweight bundle size budget is enforced via `scripts/check-bundle-size.mjs` (invoked automatically after `npm run build`).

Current thresholds (raw / gzip):

| Bundle Pattern | Raw (bytes) | Gzip (bytes) |
|----------------|------------:|-------------:|
| `threedviewer-main.mjs` | 950000 | 260000 |
| `gltf-*.chunk.mjs` | 120000 | 40000 |
| `FBXLoader-*.chunk.mjs` | 120000 | 50000 |

These are soft guardrails targeted at early development; adjust consciously if you add major features:

1. Update the corresponding entry in `TARGETS` inside `scripts/check-bundle-size.mjs`.
2. Justify the increase in the CHANGELOG ("Changed" section) with rationale (e.g. new feature, unavoidable dependency).
3. Consider alternatives first: further code‑splitting, conditional dynamic imports, removing unused exports, replacing heavy utilities.

Run manually:

```
npm run size:check
```

If a bundle exceeds limits the script exits non‑zero and prints which limit was violated. The `postbuild` hook currently echoes a warning without failing the build; this can be tightened later (e.g. in CI) by removing the `|| echo` fallback in the `postbuild` script.

Recommended next optimizations:
* Replace `import * as THREE` with selective imports if future Three.js packaging allows deeper tree‑shaking.
* Lazy‑load OrbitControls only once a model (not placeholder cube) is present.
* Extract rarely used UI panels or experimental tools behind dynamic import flows.

See `src/components/ThreeViewer.vue` for the main viewer logic.

### Abortable Model Loading

Large 3D assets (especially `fbx`, `3mf`, or high‑poly `gltf`) can be slow to download or parse. The viewer now exposes a cancel mechanism that aborts the in‑flight fetch and parsing pipeline.

Behavior overview:

| Aspect | Detail |
|--------|--------|
| Trigger | User clicks the "Cancel loading" button displayed in the loading overlay. |
| Mechanism | An `AbortController` is attached to the streaming `fetch`; the reader loop periodically checks `aborting` and throws an `AbortError` if set. |
| UI Feedback | Button label changes to `Canceling…` until the abort resolves, then the overlay shows a localized "Canceled" message (short‑lived until next action). |
| Cleanup | Partial buffers are discarded; any placeholder spinner state is cleared; the previous model (if any) remains rendered. |
| Events | Emits `model-aborted` with `{ fileId }`. Successful loads still emit `model-loaded`. Errors emit `error`. |
| Camera State | Existing saved camera state is preserved; aborted new load does not overwrite baseline or stored camera for previous model. |
| Wireframe / Toggles | Abort has no side effects on viewer toggles or persisted toolbar preferences. |

Edge cases & guarantees:
* If abort occurs after full download but before parse completion, a final abort check runs just before scene insertion, ensuring no partially parsed scene attaches.
* Parse failures unrelated to abort still emit `error` and reset progress counters.
* Multiple rapid cancels: repeated clicks while already aborting are ignored (button disabled).
* New load requests automatically cancel any prior in‑flight load (programmatic preemption when `fileId` changes).

Consuming events (example skeleton):

```js
<ThreeViewer @model-loaded="onLoaded" @model-aborted="onAborted" @error="onError" />
```

### Emitted Events Summary

| Event | Payload | When |
|-------|---------|------|
| `load-start` | `{ fileId }` | Emitted immediately after a new load begins (before `fetch`) so tests / external code can deterministically react (e.g. schedule an abort) |
| `model-loaded` | `{ fileId, filename }` | After successful parse, scene add, camera fit, saved camera restore attempt |
| `model-aborted` | `{ fileId }` | User or programmatic cancel mid‑download or pre‑parse (also proactively fired as soon as `cancelLoad()` executes to guarantee delivery) |
| `error` | `{ message, error }` | Fetch or parse failure (non‑abort) |
| `reset-done` | none | After user triggers a camera reset action (toolbar integration) |

### Testing Abort Behavior

Playwright smoke coverage includes a deterministic abort scenario using a synthetic slow streaming endpoint. Sequence under test:
1. Page listens for `threedviewer:load-start` (bubbling DOM CustomEvent) to know the viewer initiated fetch.
2. Test triggers `cancelLoad()` almost immediately.
3. Viewer proactively emits `model-aborted` (both Vue event & bubbling DOM event) when cancellation requested, and again defensively inside the `AbortError` catch path if not yet emitted.
4. Assertion waits for a global flag set by the event listener.

This dual (early + fallback) emission strategy eliminates race conditions where the network aborts before the code path that would normally dispatch the event executes.

### Upcoming Test & Fixture Section (Preview)

Fixtures (to be added under `tests/fixtures`):
* Tiny minimal geometry for each supported format (kept < 5–10 KB where practical) to keep CI fast.
* A deliberately larger (~1–2 MB) glTF or FBX to exercise progress + abort path.

Smoke Tests:
* Will rely on Playwright launching the app page and asserting presence of `<canvas>` and event emission.
* Abort test will simulate clicking Cancel mid-stream (using network throttling or artificial delay server side if needed).

Interpreting Bundle Size Output:
* The postbuild script prints lines like `OK` or `FAIL`; in CI we will tighten to fail on `FAIL`.
* If a legitimate increase is expected (e.g. adding a new loader) update the CHANGELOG and threshold before merging.

### Centralized Model File Support

Supported extension logic, MIME type mapping, and OBJ→MTL sibling resolution are now centralized in `ModelFileSupport`. Both authenticated and public share services (`FileService`, `ShareFileService`) delegate to this class to avoid duplication and ensure consistent behavior. If you add a new 3D format later (e.g. `fbx`), update it in exactly one place (`ModelFileSupport::getSupportedExtensions()` / `mapContentType()`).

### Public Share Streaming

Anonymous (public link) access to supported 3D files is provided via:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/file/{token}/{fileId}` | Stream a file that exists within the public share identified by `{token}`. |
| GET | `/public/file/{token}/{fileId}/mtl/{mtlName}` | Stream sibling MTL for an OBJ within the same folder. |

Status codes mirror the authenticated endpoints (200, 404, 415, 500). `401` is not used for public shares; a missing or invalid token yields `404` to avoid token enumeration.

Notes:
* Traversal is limited to the nodes contained in the share; file id lookups perform a bounded DFS.
* Unsupported extensions return `415`.
* The same extension allow‑list applies.

### Compressed Geometry & Texture Decoders (DRACO / KTX2 / Meshopt)

Three.js supports additional compression / texture container formats via external decoder or transcoder binaries:

* DRACO: geometry compression; requires `draco_decoder.{js,wasm}`.
* KTX2 / Basis Universal: GPU texture compression; requires `basis_transcoder.{js,wasm}`.
* Meshopt (optional scaffolding added): geometry and attribute compression; expects `meshopt_decoder.wasm` (and JS wrapper when present). If you place the decoder at `/apps/threedviewer/meshopt/meshopt_decoder.wasm` it will be auto‑detected and wired into `GLTFLoader`.

This app ships these binaries by copying them out of the `three` package during the build step rather than bundling them into JS. This keeps the main bundle lean and allows the browser to instantiate WebAssembly directly.

Build integration:
1. A prebuild script (`scripts/copy-decoders.mjs`) runs automatically before `vite build`.
2. It copies required files from `node_modules/three/examples/jsm/libs/{draco,basis}/` into top‑level `draco/` and `basis/` directories in the app root.
3. At runtime the viewer points loaders to `/apps/threedviewer/draco/` and `/apps/threedviewer/basis/`.

Resulting expected files (depending on the Three.js version):

```
draco/
  draco_decoder.js
  draco_decoder.wasm
  draco_wasm_wrapper.js   (optional)
basis/
  basis_transcoder.js
  basis_transcoder.wasm
meshopt/ (optional)
  meshopt_decoder.wasm
```

If an optional variant (e.g. `basis_transcoder.wasm.wasm`) is absent the script logs it as "missing" but does not fail the build.

Runtime behavior:
* Runtime behavior:
* On first glTF load the viewer probes `/apps/threedviewer/draco/draco_decoder.wasm` and `/apps/threedviewer/basis/basis_transcoder.wasm` (HEAD fallback to GET if 405) to detect decoder presence.
* If folders or files are missing the viewer silently skips enabling those compression paths; models encoded with DRACO or KTX2 will then fail to load and a user‑facing error toast is shown.
* If present, the corresponding Three.js loaders (`DRACOLoader`, `KTX2Loader`) are dynamically imported and attached to `GLTFLoader` before parsing.
* If absent, parsing proceeds without compression support; DRACO / KTX2 content in models will fail gracefully (console warning) while uncompressed primitives/textures still load.

Packaging considerations:
* Ensure `draco/` and `basis/` directories are included in the distributed app tarball. (They are plain static assets; no build fingerprints.)
* CSP must allow loading the Wasm modules. A future CSP rule adjustment will add the required `wasm-unsafe-eval` or appropriate `script-src`/`worker-src` allowances (see roadmap item "Adjust CSP for wasm/blob").

Adding new compression tech:
* Extend the copy script with any additional decoder assets (e.g. meshopt) and update loader initialization code in `ThreeViewer.vue`.

Troubleshooting:
* If the build log shows decoder files copied but runtime 404s occur, verify the deployment kept the `draco/` and `basis/` directories at the app root (same level as `appinfo/`).
* Clearing browser cache is rarely required because these are versioned implicitly by app release; still, stale caches can be invalidated via standard Nextcloud app upgrade.

---

### Roadmap / TODO (Live Snapshot)

This section mirrors the current internal engineering TODO list for transparency. Items are intentionally incremental to keep vertical slices shippable.

| Status | Task | Summary |
|--------|------|---------|
| ⏳ | Playwright smoke test | Add minimal Playwright config & test asserting `#viewer-wrapper` and a rendering `<canvas>` after build. Provides CI smoke coverage for frontend mount. |
| ⏳ | DRACO/KTX2 runtime wiring | Detect presence of `/draco` & `/basis` decoder assets and conditionally initialize `DRACOLoader` / `KTX2Loader` (currently silently attempted). Update README to mark compression officially supported once verified. |
| ⏳ | Thumbnail placeholder service | Backend service + endpoint returning a static PNG placeholder for supported model types (`/thumbnail/{fileId}`); sets groundwork for future real rendered thumbnails. |
| ⏳ | MIME registration migration | Add an `IRepairStep` to register missing MIME mappings (e.g. `mtl` → `text/plain`, `ply` → `model/ply`, `fbx` → `application/octet-stream` if absent) without overriding existing core mappings. |

Legend: ⏳ pending / planned, ✅ completed in repository history.

Completed notable milestones (already implemented):
* Secure authenticated & public share streaming endpoints
* Model format support: glb, gltf, obj(+mtl), stl, ply, fbx
* Conditional CSP tightening (blob only when decoders present)
* Decoder asset prebuild copy script (DRACO / Basis placeholders)
* Localization (en, ar)
* PHPUnit streaming controller tests
* FBX dynamic loader integration
* Files app integration: click supported 3D file opens viewer (custom file action)
* MIME repair step registering missing mappings (ply, fbx, mtl) when absent
* MIME cleanup repair step (best-effort removal on repair/uninstall)

Future (not yet queued—candidates after above):
* Multi-file glTF external resource resolution (URL-based) & robust multi-MTL + texture discovery for OBJ
* Environment map support & camera state persistence
* Optional orthographic camera + edge overlay toggle
* Mesh compression enhancements (meshopt) once baseline DRACO/KTX2 validated

> Note: This list reflects current development intentions and may evolve; check commit history / CHANGELOG for authoritative progress.

## Testing & Tooling

### Smoke Tests (Playwright)

The repository includes a minimal Playwright smoke test to ensure the viewer bundle mounts and a `<canvas>` is rendered.

Run all PHP + JS build + smoke tests locally:

```
composer install
npm install
npm run build
npm run test:smoke
```

Current smoke coverage:
* Mount test: Verifies viewer root + WebGL canvas appears.
* DRACO compressed glTF test (soft): Exercises conditional decoder wiring when DRACO assets present.
* Abort test: Deterministic slow stream + cancel mid‑download asserting `model-aborted` event.

Adding new smoke tests:
1. Place additional tiny fixtures under `tests/fixtures` (keep each <10 KB if possible to keep CI quick).
2. Add a new spec inside `tests/smoke/` (TypeScript or JS) and assert emitted DOM events (`threedviewer:model-loaded`, etc.).
3. If you need network throttling or artificial delay, extend the internal static server in the existing smoke test file rather than introducing an external dependency.

### Bundle Size Check

After every `npm run build`, `scripts/check-bundle-size.mjs` evaluates specific bundle targets and fails (in CI) if thresholds are exceeded.

Manual run:
```
npm run size:check
```

Environment overrides:
| Var | Effect |
|-----|--------|
| `SKIP_SIZE_CHECK=1` | Completely bypass the size check (avoid using in CI unless debugging). |
| `SIZE_CHECK_SOFT=1` | Always exit 0 but still print failures (soft mode / exploratory). |

Typical workflow when a legitimate increase occurs:
1. Confirm the diff meaningfully justifies added bytes.
2. Update thresholds inside `TARGETS` in `scripts/check-bundle-size.mjs` with a modest headroom margin.
3. Add a CHANGELOG entry explaining the increase.

### Dynamic Chunk Refinement

`OrbitControls` is now lazy‑loaded via a dynamic `import()` so the initial `threedviewer-main.mjs` shrinks (controls code only loads once the viewer initializes). Additional candidates for future splitting:
* Heavy optional loaders (already split)
* Rare UI panels / experimental tool overlays
* DRACO / KTX2 initialization path (already conditional)

To inspect the current chunk map after a build, view the printed size table or run a local analyzer (can be added later if needed).

### PHP Unit Tests

Run backend unit tests (controllers + services):
```
composer test:unit
```

Tests are intentionally narrow: each controller/service test focuses on success + key failure modes (not exhaustive integration). Add new tests under `tests/unit/<Domain>` following existing naming patterns (e.g. `FileControllerTest.php`).

### Debugging Tips
* If viewer fails to mount, open devtools console and look for dynamic import errors (e.g. controls chunk 404). Ensure the built `js/` assets deployed fully.
* Streaming 404 / 415 errors: validate the extension exists in `ModelFileSupport` and the backend route path matches the request (`/ocs/v2.php/apps/threedviewer/file/{fileId}`).
* Decoder issues: Confirm presence of `draco/` and `basis/` directories at the app root in deployment.

