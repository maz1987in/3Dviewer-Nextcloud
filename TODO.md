# TODO - 3D Viewer Next Steps

**Last Updated**: 2025-12-06  
**Current Status**: Core feature set (settings, slicer, indexing, export, performance tooling) implemented. Focus shifts to consolidation, quality, and forward-looking migration.

---

## 🎯 High Priority

### 1. Standalone Advanced Viewer Wiring ✅ COMPLETED
The advanced (App.vue-driven) standalone mode is now fully functional when visiting `/apps/threedviewer/f/{fileId}`.

**Completed**:
- [x] Added conditional mount in `src/main.js` for `#threedviewer` root
- [x] Pass `fileId`, `filename`, & `dir` via data attributes from template to App.vue props
- [x] Implemented loader-driven model pipeline in both simple (ViewerComponent) and advanced (App.vue) modes
- [x] Added loading / error states harmonized between modes with user-friendly messages
- [x] Documented dual-mode flow in TECHNICAL.md with viewer lifecycle diagram
- [x] Updated PageController to fetch filename and dir from fileId for robustness
- [x] Enhanced error handling with specific messages for 404, 403, network, and parsing errors

### 2. ModelFileSupport / MIME Sync ✅ COMPLETED
Format definitions now centralized in `lib/Constants/SupportedFormats.php`.

**Completed**:
- [x] Created `lib/Constants/SupportedFormats.php` as single source of truth
- [x] Updated `ModelFileSupport` to use centralized constants
- [x] Updated `RegisterThreeDMimeTypes` to use centralized constants
- [x] Updated `UnregisterThreeDMimeTypes` to use centralized constants
- [x] Created unit test (`tests/unit/Constants/SupportedFormatsTest.php`) asserting MIME ↔ validation parity
- [x] All formats synchronized (glb, gltf, obj, stl, ply, dae, fbx, 3mf, 3ds, x3d, vrml, wrl, mtl)

**Note**: Frontend formats in `src/config/viewer-config.js::SUPPORTED_FORMATS` should still be manually verified for consistency.

### 3. Controller & Service Test Expansion ✅ COMPLETED
New controllers (`SettingsController`, `SlicerController`) and services (`FileIndexService`) now have dedicated tests.

**Completed**:
- [x] Unit tests: happy path + error cases for SettingsController
- [x] Unit tests: happy path + error cases for SlicerController (saveTempFile, getTempFile, deleteTempFile)
- [x] Unit tests: happy path + error cases for FileIndexService (indexFile, removeFile, reindexUser)
- [x] Settings round-trip persistence test (getSettings, saveSettings, resetSettings)
- [x] Slicer temp lifecycle test structure (authentication, file validation, share management)
- [x] File index tests (insert, update, folder path extraction, format filtering)

**Note**: Tests created but may need refinement based on actual runtime behavior. Some tests use mocks that may need adjustment for full integration testing.

### 4. Composables Documentation & Cleanup ✅ COMPLETED
Refactored composables lack a consolidated API reference.

**Completed**:
- [x] Created `docs/COMPOSABLES_API.md` with comprehensive API reference
- [x] Verified no residual debug logging (no `console.` statements found in composables)
- [x] Added usage examples (Options API vs Composition API)
- [x] Documented Vue 3 migration considerations and checklist
- [x] Documented all 17 composables with state, computed properties, and methods
- [x] Added best practices and debugging sections

### 5. File Browser List View ✅ COMPLETED
File browser currently only supports grid view.

**Completed**:
- [x] Added list/grid toggle button to FileBrowser component header
- [x] Implemented list view layout with compact rows showing thumbnail, name, size, and date
- [x] Persist view preference in localStorage (`threedviewer:fileBrowserView`)
- [x] Ensured consistent styling between list and grid views using Nextcloud CSS variables
- [x] Added keyboard navigation for list view (Arrow Up/Down, Home, End, Enter, Space)
- [x] View toggle only appears when viewing files (not folders/types/dates overview)
- [x] Added default view setting in Personal Settings (File Browser → Default View)
- [x] FileBrowser now loads and respects default view from user settings
- [x] Updated file grid padding to consistent 20px on all sides

### 6. Cache Management & User Controls ✅ COMPLETED
IndexedDB dependency cache now has full UI controls.

**Completed**:
- [x] Added Personal Settings section: max cache size, max file size, expiration days, enable/disable toggle, clear cache button with live size/count display
- [x] LRU enforcement configurable via user settings (max size merged into VIEWER_CONFIG at runtime)
- [x] Cache hits/misses counts added to performance overlay alongside hit rate
- [x] Privacy considerations documented in TECHNICAL.md (local-only, per-browser, user-controlled)

### 6b. Frontend Format Parity Guard ✅ COMPLETED
Backend and frontend format definitions are now automatically validated.

**Completed**:
- [x] Created `scripts/check-format-parity.mjs` — validates PHP, JS, loader registry, main.js MIMEs, and mimetypemapping.json stay in sync
- [x] Added `npm run format:check` script, integrated into CI (node.yml) and `validate` script
- [x] Fixed missing X3D/VRML MIME registrations in main.js
- [x] Documented the format parity contract and "adding a new format" checklist in TECHNICAL.md

### 6. Security Review: Slicer Temporary Files ✅ COMPLETED
Security audit of slicer temporary file system completed.

**Completed**:
- [x] Confirmed 24h expiry enforced server-side (share expiration + file age check + 6h cron cleanup)
- [x] Validated path sanitization (basename + regex whitelist + path containment check)
- [x] Size limits already enforced: 50 MB per file, 200 MB folder cap, Content-Length pre-check
- [x] MIME validation via finfo sniffing + extension allowlist + heuristic fallbacks
- [x] Comprehensive logging of all operations (user, size, MIME, errors) already in place
- [x] Documented full security posture in TECHNICAL.md
- [x] Fixed OBJ/PLY missing from upload extension allowlist

### 7. Performance Scaling for Large Models ✅ COMPLETED
Implement optional LOD / simplification strategies for very large meshes.

**Completed**:
- [x] Added configurable triangle count thresholds (warn: 500K, strong: 1M faces)
- [x] Implemented automatic performance mode suggestion toast for heavy models
- [x] Made performance mode label clickable in stats overlay to cycle modes
- [x] Made ViewerToolbar performance button cycle through modes
- [x] Added debug logging for performance scaling evaluation
- [x] Integrated with existing performance mode system (auto, low, balanced, high, ultra)

### 8. Vue 3 Migration Pre-Work (Defer Full Migration) ✅ COMPLETED
Lay groundwork to reduce friction later while staying on Vue 2 for now.

**Completed**:
- [x] Eliminated deprecated lifecycle hooks (`beforeDestroy` → `beforeUnmount` in 4 files)
- [x] Added explicit `emits` declarations to all components (ViewerToolbar, ToastContainer, ViewerComponent, ViewerModal, FileNavigation, FileBrowser)
- [x] Verified no implicit `$listeners` usage (none found)
- [x] Added comprehensive migration notes section to COMPOSABLES_API.md with dependency compatibility matrix
- [x] Audited dependencies for Vue 3 compatibility:
  - `vue`: `^2.7.16` → `^3.x` (API compatible, no code changes needed)
  - `@nextcloud/vue`: `^8.33.0` → `^9.x` (requires Nextcloud 30+)
  - Other dependencies: Already compatible or framework-agnostic

### 9. Automated Bundle Budget Enforcement ✅ COMPLETED
Budgets exist informally; enforce via build script.

**Completed**:
- [x] Enhanced size check script with comprehensive budget thresholds for all major bundles
- [x] Script fails CI if budget exceeded (with environment variable overrides)
- [x] Historical size trend tracking (JSON artifact with last 50 entries)
- [x] CI workflow uploads bundle-sizes.json as artifact (90-day retention)
- [x] Size trend comparison shows changes vs previous build
- [x] Improved error reporting with formatted bytes and clear failure messages

### 10. Simple Viewer Parity Enhancements ✅ COMPLETED
Modal viewer now has stats panel, screenshot, and standalone jump.

**Completed**:
- [x] Added lightweight stats panel (meshes, vertices, faces, dimensions) toggle via bottom-right button
- [x] Added screenshot button — downloads PNG of current view
- [x] "Open in 3D Viewer" CTA button already existed (top-right)
- [x] Core loader code already shared via `loadModelByExtension` and `loadModelWithDependencies`

---

## 🔧 Medium Priority

### 11. Multi-File & Dependency Edge Case Test Suite ✅ COMPLETED
Extracted matching logic, wrote 48 unit tests, added edge case fixtures.

**Completed**:
- [x] Extracted pure matching functions into `src/loaders/matchHelpers.js` (texture + file matching)
- [x] 48-test suite covering all 6 texture strategies + 3 file strategies + edge cases (`npm run test:match`)
- [x] Fixtures: mixed-case extensions (`mixed-case.OBJ`), missing MTL (`no-mtl.obj`), orphaned textures (`orphan-texture.obj`)
- [x] Documented matching strategies and fixture matrix in TESTING.md
- [ ] Future: Playwright cancel mid-load, retry, network drop scenarios (requires mock server)

### 12. Export Functionality Robustness ✅ COMPLETED
Added pre-export validation and corrected MIME types.

**Completed**:
- [x] Added `getGeometryStats()` helper to count vertices/triangles before export
- [x] Toast warnings for large models: >500K triangles (info), >2M triangles (warning)
- [x] Fixed STL MIME type: `application/octet-stream` → `model/stl`
- [x] Fixed OBJ MIME type: `text/plain` → `model/obj`
- [ ] Future: multi-material OBJ edge cases, unit tests for blob creation

### 13. Help Panel & In-App Docs Refresh ✅ COMPLETED
Updated help panel with all new features.

**Completed**:
- [x] Added Slicer & Export section (Send to Slicer, Export Model, Screenshot)
- [x] Added cross-section and exploded view to Tools section
- [x] Added lighting presets, bookmarks, dependency cache to Settings section
- [x] Updated tips with slicer share link and cache config notes

### 14. Internationalization Audit
Ensure new strings (settings, slicer, indexing) are translatable.

**Action Items**:
- [ ] Run extraction tool & diff
- [ ] Add missing keys (`l10n/en.json` baseline)
- [ ] Mark newly added strings in PR
- [ ] Add a short i18n checklist reference in docs/README.md or TECHNICAL.md

### 15. Accessibility Review
Check ARIA roles / keyboard navigation for new components.

**Action Items**:
- [ ] Stats panel & slicer modal focus order
- [ ] High-contrast mode test
- [ ] Add skip-to-viewer shortcut

---

## 💡 Future Ideas (Low Priority)

### Feature Concepts
1. ~~Clipping Plane / Cross-section~~ ✅ Implemented
2. ~~Exploded View~~ ✅ Implemented
3. ~~Animation Timeline Scrubber~~ ✅ Implemented
4. ~~View State Bookmarks~~ ✅ Implemented
5. ~~Lighting Presets~~ ✅ Implemented
6. Basic transform gizmos (translate / rotate / scale)
7. Volume & surface area measurement
8. WebXR preview (VR mode) — Three.js has built-in WebXR support
9. ZIP packaging of multi-file models (+ dependencies)
10. Texture optimization pipeline (resample / compress)
11. Annotation export / import JSON schema
12. Scene comparison diff overlay (bounding box / vertex count changes)
13. Annotations Persistence — Save to Nextcloud backend per-file JSON
14. Advanced File Search & Filters — Search box + filters in file browser
15. Clipping Box / Section Analysis — Draggable bounding box (extends clipping plane to 6 planes)
16. Collaborative Viewing Sessions — Share live camera view via WebSocket

### Optimization / UX
17. Custom user color themes beyond system (schema & palette editor)  
18. Adaptive texture streaming (prioritize visible materials)  
19. Parallel decoder loading / worker pool tuning  
20. Automatic memory pressure detection & quality step-down  
21. Background indexing status indicator / progress API

---

## ✅ Recently Completed (Already in CHANGELOG)

### November–December 2025
- [x] Personal Settings system (controller + persistence + UI)
- [x] Slicer integration (temp files + protocol handler logic)
- [x] DB-backed file indexing (folder/type/date/favorites navigation)
- [x] Temp file cleanup cron job
- [x] Folder exclusion via `.no3d` marker & hidden folder skip logic
- [x] Preview provider registration & error fixes
- [x] File logo asset path & toolbar refinements
- [x] Documentation overhaul (technical, implementation, troubleshooting, testing)

### October 2025 Core Feature Wave
- [x] 3D Camera Controller & face labels
- [x] Export functionality (GLB/STL/OBJ)
- [x] Camera projection toggle
- [x] Progressive texture loading
- [x] Dependency caching system (IndexedDB)
- [x] Model statistics panel & help panel
- [x] Theme customization (light/dark/RTL) & performance overlay
- [x] KTX2 texture support & flexible texture matching

### December 2025
- [x] File Browser default view setting (user preference for Grid/List view)
- [x] File Browser grid padding improvements (20px consistent spacing)

### January 2025
- [x] Standalone Advanced Viewer Wiring (dual-mode architecture)
- [x] CSP texture warning banner for modal viewer
- [x] Enhanced error handling and user messaging

### Early 2025
- [x] MTL file matching improvements
- [x] FBX 6.1 compatibility attempt
- [x] Model positioning fixes across formats

---

## 📝 Documentation Updates

For detailed information, see:
- **[User Guide](docs/README.md)** - Installation, usage, features
- **[Technical Documentation](docs/TECHNICAL.md)** - Architecture and API
- **[Testing Guide](docs/TESTING.md)** - Testing procedures
- **[Standalone Viewer Testing](docs/TESTING_STANDALONE_VIEWER.md)** - Standalone viewer verification guide
- **[Implementation Guide](docs/IMPLEMENTATION.md)** - Lessons learned
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues

---

## 🎯 Recommended Immediate Next Action

Begin with **Future Ideas → Quick Wins** (Clipping Plane, Animation Timeline, View Bookmarks, Lighting Presets) to deliver high-value features with minimal effort, then proceed to **Medium Effort** items (Exploded View, Annotation Persistence, File Search).

---

*Keep this file focused on actionable items. Completed items should be mirrored in CHANGELOG.md (already done for listed features).*
