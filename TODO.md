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

### 6. Cache Management & User Controls
IndexedDB dependency cache exists without UI controls.

**Action Items**:
- [ ] Add Settings panel section: show size, clear cache button
- [ ] Implement LRU enforcement (configurable max size / item count)
- [ ] Add metric to performance overlay (cache hits/misses)
- [ ] Document privacy considerations (local only)

### 6. Security Review: Slicer Temporary Files
Assess lifetime & access scope of temporary share links.

**Action Items**:
- [ ] Confirm 24h expiry enforced server-side
- [ ] Validate path sanitization & extension restrictions
- [ ] Add size limit & mime validation prior to temp copy
- [ ] Log creation/deletion events (audit trail)
- [ ] Document security posture in TECHNICAL.md

### 7. Performance Scaling for Large Models ✅ COMPLETED
Implement optional LOD / simplification strategies for very large meshes.

**Completed**:
- [x] Added configurable triangle count thresholds (warn: 500K, strong: 1M faces)
- [x] Implemented automatic performance mode suggestion toast for heavy models
- [x] Made performance mode label clickable in stats overlay to cycle modes
- [x] Made ViewerToolbar performance button cycle through modes
- [x] Added debug logging for performance scaling evaluation
- [x] Integrated with existing performance mode system (auto, low, balanced, high, ultra)

### 8. Vue 3 Migration Pre-Work (Defer Full Migration)
Lay groundwork to reduce friction later while staying on Vue 2 for now.

**Action Items**:
- [ ] Eliminate patterns incompatible with Vue 3 (implicit `$listeners`, deprecated lifecycle usage)
- [ ] Ensure all components use explicit emits declarations
- [ ] Add migration notes section to COMPOSABLES_API.md
- [ ] Audit dependencies for Vue 3 compatibility matrix

### 9. Automated Bundle Budget Enforcement
Budgets exist informally; enforce via build script.

**Action Items**:
- [ ] Add size check script (compare gzip sizes to thresholds)
- [ ] Fail CI if budget exceeded
- [ ] Record historical size trend (JSON artifact)

### 10. Simple Viewer Parity Enhancements
Bring minimal modal viewer closer (select subset) to advanced features without weight bloat.

**Action Items**:
- [ ] Add lightweight stats panel & screenshot button
- [ ] Share core loader code (avoid duplication)
- [ ] Provide quick jump to standalone view (CTA button)
- [ ] Measure added bundle impact

---

## 🔧 Medium Priority

### 11. Multi-File & Dependency Edge Case Test Suite
Core multi-file logic shipped; expand edge coverage.

**Action Items**:
- [ ] Fixtures: mixed-case extensions, missing MTL, orphaned textures
- [ ] Test fallback logic for flexible texture name matching
- [ ] Playwright scenario: cancel mid-load, then retry
- [ ] Document matrix of tested combinations in TESTING.md

### 12. Export Functionality Robustness
Current exports (GLB/STL/OBJ) need validation & error boundaries.

**Action Items**:
- [ ] Add size / vertex count warnings for STL
- [ ] Handle multi-material OBJ edge cases
- [ ] Unit tests for exporter selection & blob creation
- [ ] Verify mime types & download names

### 13. Help Panel & In-App Docs Refresh
Align text with new settings & slicer actions.

**Action Items**:
- [ ] Add section for sending to slicer
- [ ] Add section for cache management once implemented
- [ ] Link to COMPOSABLES_API.md in developer help

### 14. Internationalization Audit
Ensure new strings (settings, slicer, indexing) are translatable.

**Action Items**:
- [ ] Run extraction tool & diff
- [ ] Add missing keys (`l10n/en.json` baseline)
- [ ] Mark newly added strings in PR

### 15. Accessibility Review
Check ARIA roles / keyboard navigation for new components.

**Action Items**:
- [ ] Stats panel & slicer modal focus order
- [ ] High-contrast mode test
- [ ] Add skip-to-viewer shortcut

---

## 💡 Future Ideas (Low Priority)

### Feature Concepts
1. Cross-section plane tool (clipping)  
2. Exploded view (group separation animation)  
3. Basic transform gizmos (translate / rotate / scale)  
4. Volume & surface area measurement  
5. WebXR preview (VR mode)  
6. ZIP packaging of multi-file models (+ dependencies)  
7. Texture optimization pipeline (resample / compress)  
8. Annotation export / import JSON schema  
9. View state bookmarking (camera + toggles)  
10. Scene comparison diff overlay (bounding box / vertex count changes)

### Optimization / UX
11. Custom user color themes beyond system (schema & palette editor)  
12. Adaptive texture streaming (prioritize visible materials)  
13. Parallel decoder loading / worker pool tuning  
14. Automatic memory pressure detection & quality step-down  
15. Background indexing status indicator / progress API

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

Begin with **High Priority #1 (Standalone Advanced Viewer Wiring)** to unlock full dual-mode experience, then proceed to **#2 (ModelFileSupport/MIME Sync)** to eliminate format divergence and test gaps.

---

*Keep this file focused on actionable items. Completed items should be mirrored in CHANGELOG.md (already done for listed features).*
