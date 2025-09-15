# AI Coding Agent Instructions (Project: ThreeDViewer)

Purpose: Nextcloud app (internal App ID: `threedviewer`) that mounts a Vue 2 front-end (Vite built) inside `templates/index.php`. Planned evolution: 3D model viewing (Three.js). The user request text mentions the name "Three3dviewer"; keep using the existing canonical APP_ID (`threedviewer`) unless a deliberate migration is performed (would require renaming directories, namespaces, `info.xml`, and DB tables if any are added later).

## Project Vision & MVP Roadmap
Role (you): Act as a senior full‑stack engineer for Nextcloud (OCP PHP + modern JS + Three.js) producing production‑ready code.

Goal: Provide an in-browser 3D model viewer integrated with Nextcloud Files offering rotate / zoom / pan interaction.

MVP Feature Targets (implement iteratively, smallest vertical slices first):
1. Supported formats: `.glb`, `.gltf`, `.obj` (+`.mtl`), `.stl`, `.ply` via official Three.js loaders (lazy-load loaders per format to keep bundle lean).
2. Viewer basics: OrbitControls (mouse & touch), auto-fit model (frame once after load), grid + axes (toggle), view reset, optional wireframe toggle, adjustable background (respect dark/light theme vars first, then custom color override).
3. Files integration: Add a Files app file action "View 3D" for supported mime/types that opens `/apps/threedviewer/view?fileId=<id>`; mirror for public shares `/s/<token>?fileId=<id>`.
4. Secure streaming: Backend controller streams file content after permission check (for public shares validate token; for logged-in users use Node API from `\OCP\Files` to resolve by fileId). No direct WebDAV URL exposure.
5. Public share support: Same viewer page adaptive path; if unauthenticated but token valid, allow read-only.
6. CSP & security: Strict CSP (self, blob: for object URLs, no `*` wildcards). If WASM needed later, scope to required mime. Use Nextcloud CSP manager (avoid manual headers) and nonces if inline fallback ever required (prefer none).
7. UI/UX: Toolbar (Reset, Grid, Axes, Wireframe, Background); loading spinner while parsing; toast errors (use `@nextcloud/vue` components). Keyboard focus order & ARIA labels for buttons.
8. Localization: Provide English base strings; use `t('threedviewer', '...')` pattern.
9. Build: Vite bundles Three.js + loaders; outputs still named `threedviewer-main.*`. Consider code-splitting per loader.
10. Testing: Add Playwright smoke test (build + open `/apps/threedviewer/` or `/view?fileId=<mock>` with stub server if feasible) verifying `<canvas>` present. Maintain PHP unit tests for new controllers/services.

Stretch (optional placeholders acceptable initially):
- Thumbnail provider for 3D types (can return static placeholder). 
- Drag-and-drop local file into viewer (dev-only flag) without uploading first.

Reference example app for format handling ideas: https://github.com/WARP-LAB/files_3dmodelviewer (do not copy proprietary code; adapt patterns only).

Nextcloud app dev guide: https://docs.nextcloud.com/server/latest/developer_manual/app_development/index.html

## Architecture & Key Files
- Backend (PHP, OCP AppFramework)
  - `lib/AppInfo/Application.php`: Declares APP_ID and bootstrap hooks (currently empty). Register event listeners/services here when needed.
  - Controllers:
    - `lib/Controller/PageController.php`: Frontpage route `/apps/threedviewer/` returning `templates/index.php` (no auth required, CSRF exempt). Keep UI entrypoint logic minimal.
    - `lib/Controller/ApiController.php`: Example OCS endpoint (`GET /ocs/v2.php/apps/threedviewer/api`). Use attributes (`#[ApiRoute]`, `#[NoAdminRequired]`) for new API endpoints. Return typed `DataResponse`.
  - Templates: `templates/index.php` injects built assets using `Util::addScript/AddStyle` with naming convention `${APP_ID}-main`.
- Frontend (Vue 2 + @nextcloud/vue components)
  - Entry: `src/main.js` mounts `App.vue` to `#threedviewer`.
  - Root component: `src/App.vue` uses `NcAppContent`. Future 3D canvas should live inside its template.
  - Build outputs (after Vite) must produce `js/threedviewer-main.js` (implicit by Util calls) and matching CSS; respect naming to avoid template edits.

## Build & Dev Workflows
- PHP deps: composer install (root + composer-bin-plugin manages tool bins under `vendor-bin/*`).
  - Code quality scripts (see `composer.json`):
    - `composer lint` (syntax), `composer cs:check|cs:fix`, `composer psalm`, `composer rector`.
    - `composer test:unit` runs phpunit with config `tests/phpunit.xml`.
- Frontend:
  - `npm install`
  - `npm run build` (prod), `npm run dev` or `npm run watch` (development builds; currently still builds not serves). Adjust if adding dev server—ensure CSP compliance.
  - DRACO / KTX2: Decoder & transcoder assets are copied at build time by a custom Vite plugin (`decoderAssetsPlugin` in `vite.config.js`) into top‑level `draco/` and `basis/` directories. Runtime loader code points to `/apps/threedviewer/draco/` and `/apps/threedviewer/basis/`. If adding new compressed assets ensure these directories are shipped with the app release tarball.
- Keep Node target consistent with `engines` (Node 22) unless app store constraints require lowering.

## Patterns & Conventions
- Namespace: `OCA\ThreeDViewer\...` aligned with PSR-4 in `composer.json`.
- Use PHP 8.1 features (attributes, typed returns). Prefer attribute routing (`#[ApiRoute]`, `#[FrontpageRoute]`). Ignore OpenAPI generation for frontpage with `#[OpenAPI(OpenAPI::SCOPE_IGNORE)]`.
- Response pattern: return `DataResponse([...])` with explicit array shapes where practical; maintain psalm annotations for static analysis.
- Add new scripts via `Util::addScript(APP_ID, APP_ID . '-<name>')`; ensure Vite outputs match `threedviewer-<name>.js` file naming.
- Frontend localization: existing mixin expects global `t`/`n` translation helpers (Nextcloud core injects). Use them instead of custom i18n until needed.

## Testing
- PHP unit tests live under `tests/unit`. Follow existing test naming (`*Test.php`). Example: `ApiTest` mocks `IRequest` to test controller output.
- When adding controllers, create corresponding focused unit tests asserting status/data shapes.
- (Future) For JS/3D logic, add lightweight smoke tests (e.g., check viewer root element) if Playwright is introduced—ensure they run after build.
 - Playwright: Basic config `playwright.config.js` with tests under `tests/playwright`. Current smoke test loads built bundle in a data URL and asserts `#threedviewer` mounts. Future enhancement: spin up a minimal Nextcloud test instance or static server serving `templates/index.php` and mock OCS endpoints for file streaming.

## Adding Three.js Viewer (Guidance)
- Install `three` and specific loaders only when needed. Loaders can be tree-shaken by Vite.
- Create a dedicated component (e.g., `components/ThreeViewer.vue`) and mount a `<canvas>` inside `App.vue`.
- Keep viewer initialization inside `mounted()` and clean up WebGL context on `beforeDestroy`.
- Avoid global side effects; pass file URLs (to be implemented via new backend endpoint serving file contents with permission checks).
 - Minimum loading flow: show spinner -> fetch & stream file (ArrayBuffer) -> choose loader by extension -> center + scale (compute bounding box; fit camera) -> hide spinner -> enable controls.
 - For large models: consider `requestIdleCallback` or chunked parsing (some loaders async already). Defer adding heavy optimizations until baseline works.
 - DRACO / KTX2 support: `loadGltf` dynamically imports `DRACOLoader` and `KTX2Loader` and wires them if available. Decoder path assumptions:
   - DRACO: expects decoder JS/WASM in `/apps/threedviewer/draco/` (copied from `node_modules/three/examples/jsm/libs/draco/`).
   - KTX2 (Basis): expects transcoder binaries in `/apps/threedviewer/basis/` (copied from `node_modules/three/examples/jsm/libs/basis/`).
   If paths change, update both the Vite plugin copy destinations and the `setDecoderPath` / `setTranscoderPath` calls.

## Security & CSP
- Avoid inline scripts; current template relies on built assets only. If dynamic nonce becomes necessary, use Nextcloud utilities rather than hardcoding.
- All new routes must apply proper auth attributes (`#[NoAdminRequired]` only when needed). For file-serving routes, enforce permission checks via `
OCP\Files` APIs.
 - Stream endpoint: prefer returning a streamed `Http::STATUS_OK` response with proper `Content-Type` (e.g., `model/gltf-binary`, `model/obj`, fallback `application/octet-stream`). Deny if file extension unsupported (prevent arbitrary file reads) and log attempts.
 - Do not trust `fileId` blindly—resolve node, ensure user (or share token) has READ permission; for share token, load share via `\OCP\Share\IManager`.

## Static Analysis & Refactoring
- Run `composer psalm` after adding PHP types; keep psalm annotations accurate.
- Use `composer rector` for automated upgrades; commit changes after confirming style pass.

## Commit Scope Examples
- feat(viewer): add Three.js canvas component and orbit controls
- feat(api): add file streaming endpoint for model files
- chore(ci): add psalm to GitHub workflow (if workflows added)

## When Unsure
- Prefer mirroring existing minimal style; centralize complex logic in new service classes under `lib/Service/` (create directory) and inject via DI (register in `Application::register`).
- Document any new environment variables or build steps directly in this file for future agents.

## Immediate Next Implementation Steps (suggested order)
1. Add dependency: `three` (and initially only `GLTFLoader`, add others later).
2. Create `components/ThreeViewer.vue` with canvas + basic scene (cube placeholder) + OrbitControls.
3. Add toolbar component skeleton (`components/ViewerToolbar.vue`).
4. Add service class `lib/Service/FileService.php` to encapsulate fileId / share token resolution (unit test it).
5. Add controller endpoint `FileController::stream(int $fileId)` + public share variant (token param) returning streamed body.
6. Wire viewer route `/view` (and share context) returning same template but passing initial file metadata via script config (non-inline if possible; otherwise data attribute and DOM read).
7. Integrate loader selection + auto-fit logic.
8. Add Playwright scaffold (optional if CI not set yet; at least prepare directory + minimal test).
9. Iterate adding remaining loaders + toggles.

(End of updated instructions – provide feedback if any roadmap item should be reprioritized or clarified.)

(End of instructions – request feedback if viewer-specific expectations or deployment targets need clarification.)
