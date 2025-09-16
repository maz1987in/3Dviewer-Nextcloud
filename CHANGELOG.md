# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial 3D viewer foundation (Vue 2 + Three.js) with lazy-loaded loaders.
- Supported model formats: glb, gltf, obj (+ mtl), stl, ply, fbx, 3mf, 3ds.
- Secure authenticated streaming endpoints: `/file/{fileId}` and `/file/{fileId}/mtl/{mtlName}`.
- Public share streaming endpoints: `/public/file/{token}/{fileId}` and sibling MTL path.
- Centralized model support service (`ModelFileSupport`) for extension allow‑list & MIME mapping.
- File & share resolution services (`FileService`, `ShareFileService`) with permission & extension validation.
- Controller layer (`FileController`, `PublicFileController`) returning streamed responses with strict status codes (401/404/415/500 handling).
- Decoder asset copy script (`scripts/copy-decoders.mjs`) provisioning DRACO and KTX2/Basis binaries into `/draco` and `/basis` prior to build.
- Conditional CSP relaxation (adds `blob:` only when decoder assets detected) to support future wasm decoder loading.
- Viewer UI: toolbar (reset, grid, axes, wireframe toggle stubs, background color), orbit controls, auto camera framing, wireframe mode.
- Toast notifications for load success/failure.
- Localization infrastructure with English (`en`) and Arabic (`ar`) translations.
- PHPUnit test coverage for streaming controllers (authenticated + public) including success, not found, unauthorized, unsupported type, and sibling MTL cases.
- FBX loader integration via dynamic import and object URL handling.
- Files app integration: custom file action enabling click-to-open viewer for supported 3D model files.
- Conditional DRACO & KTX2 decoder runtime detection and loader wiring (GLTFLoader now probes for decoder assets before enabling compressed geometry/texture support).
- Repair step to register missing MIME types (ply, fbx, mtl) without overwriting existing mappings.
- Cleanup repair step to remove previously added 3D MIME mappings on admin repair/uninstall (best-effort, conservative).
- Placeholder thumbnail endpoint `/thumb/{fileId}` serving static PNG for supported 3D model files and Files app integration to display it.
- Toolbar preferences persistence (grid, axes, wireframe, background color) via localStorage.
- Progressive loading feedback: streaming download progress bar, per-loader progress events (3MF/FBX/3DS), and parse-phase messaging for synchronous loaders (OBJ/STL/PLY) with normalized state reset.
- Camera state persistence per file (position & target stored in localStorage, restored on reopen) plus baseline framed view used for Reset.
- Bundle size budget script (`scripts/check-bundle-size.mjs`) with postbuild size check and documented thresholds in README.
- Abortable model loading (cancel button & AbortController integration with streaming progress and graceful cleanup).

### Changed

- Removed prior experimental Vite plugin approach for decoder copying in favor of deterministic prebuild script.
- Refactored frontend loaders into modular registry (`src/loaders/`) replacing monolithic conditional logic in `ThreeViewer.vue` for improved maintainability and tree‑shaking.

### Security

- Enforced extension allow‑list to prevent arbitrary file reads through streaming endpoints.
- Added conditional CSP logic—`blob:` sources only allowed when decoder assets exist (defense-in-depth for wasm scenario).

### Documentation

- Expanded README with streaming API details and decoder asset handling section.
