# Three D Viewer

A template to get started with Nextcloud app development.

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

Supported formats (frontend & backend end-to-end): `glb`, `gltf`, `obj` (+ `.mtl`), `stl`, `ply`, `fbx`.

Key implementation points:
* Dynamic imports: Individual Three.js loaders (`GLTFLoader`, `OBJLoader`, `MTLLoader`, `STLLoader`, `PLYLoader`, `FBXLoader`) are code‑split so they only load when a matching extension is requested.
* OBJ + MTL: After streaming an OBJ the viewer parses its `mtllib` directive and performs a second request to `/file/{fileId}/mtl/{mtlName}` (or the public variant) to load materials when present. Missing or invalid MTL files gracefully degrade to untextured materials.
* Camera framing: On initial model load the scene bounding box is computed and the camera + orbit controls are adjusted to frame the model (with a small margin) and set a sensible near/far range.
* Wireframe & helpers (planned toggles): Toolbar hooks are scaffolded for grid, axes, reset, wireframe; wireframe application iterates mesh materials updating their `wireframe` flag.
* Background: Respects Nextcloud light/dark theme variables by default; a custom color override toggle can be layered later.
* Performance: Heavy/optional decoders (DRACO, KTX2/Basis) are prepared for future activation—decoder asset folders (`/draco`, `/basis`) will be copied during build once compression use cases arise.
* Accessibility: Toolbar buttons expose ARIA labels; further keyboard shortcuts (reset view, toggle wireframe) are candidates for a future iteration.

Fetch & security behavior:
* The viewer never constructs raw WebDAV URLs; it only streams through the app's controlled endpoints, ensuring permission checks and extension allow‑listing.
* Failed loads surface toast notifications with concise, localizable error messages.

Future enhancements under consideration:
1. DRACO + KTX2 decoder asset shipping and automatic loader wiring when compressed buffers/ textures detected.
2. Thumbnail generation service (server-side or cached client render) for quick previews in the Files app.
3. Drag & drop local (unsaved) model preview for rapid inspection without uploading.
4. Persisting last camera state per file (localStorage) to restore view on revisit.
5. Progressive / streamed parsing feedback for very large meshes.

Development notes:
* The entry bundle is currently ~700 kB (pre-gzip) due largely to core Three.js; dynamic imports mitigate initial parse cost for format-specific code. Additional manual chunking or vendor splitting can be evaluated if size becomes a concern.
* Adding a new format requires: (a) backend allow‑list update in `ModelFileSupport`, (b) loader dynamic import block in `ThreeViewer.vue`, and (c) optional MIME mapping addition if a specific type is desirable.

See `src/components/ThreeViewer.vue` for the main viewer logic.

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

### Compressed Geometry & Texture Decoders (DRACO / KTX2 Basis)

Three.js supports additional compression / texture container formats via external decoder or transcoder binaries:

* DRACO + KTX2 decoder asset shipping and automatic loader wiring (now conditionally enabled after runtime asset detection).
* KTX2 / Basis Universal (GPU texture compression) – requires `basis_transcoder.{js,wasm}`.

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
