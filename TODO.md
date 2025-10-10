# TODO - ThreeDViewer# TODO - 3D Viewer Next Steps



**Last Updated**: October 9, 2025  **Last Updated**: October 6, 2025  

**Status**: Performance monitoring complete ✅, Ready for next features**Current Status**: Multi-file loading complete (ViewerComponent.vue) ✅



------



## 🎯 High Priority## 🔥 Current Sprint (Next Actions)



### 1. Fix Auto-Rotate + Zoom Interaction### 1. Integrate Multi-File Loading into ThreeViewer.vue ⏳

**Issue**: Mouse wheel zoom doesn't work when auto-rotate is enabled  **Priority**: HIGH | **Effort**: 3-4h

**Status**: ⏳ In Progress  

**Files**: `src/components/ThreeViewer.vue`, `src/composables/useControls.js`The advanced viewer needs multi-file support to match ViewerComponent.vue functionality.



**Details**:**Action Items**:

- Auto-rotate OFF → Zoom works ✅- [ ] Update `src/composables/useModelLoading.js`

- Auto-rotate ON → Zoom broken ❌- [ ] Add `loadModelWithDependencies()` integration  

- Wheel events are received, OrbitControls settings correct- [ ] Pass `additionalFiles` to loaders

- See: `docs/archived/TODO_AUTO_ROTATE_ZOOM.md` for investigation notes- [ ] Test OBJ+MTL and GLTF+bins



---**Files**: 

```

### 2. Export Functionalitysrc/composables/useModelLoading.js

**Feature**: Multi-format model export (GLB, STL, OBJ)  src/components/ThreeViewer.vue

**Priority**: ⭐⭐⭐ HIGH  ```

**Effort**: 4-6h

---

**Action Items**:

- [ ] Add export button to toolbar### 2. Comprehensive Multi-File Testing ⏳

- [ ] Implement GLB export (preferred format)**Priority**: HIGH | **Effort**: 2-3h

- [ ] Implement STL export (3D printing)

- [ ] Implement OBJ export (compatibility)Need real-world test files to validate implementation.

- [ ] Handle materials/textures export

- [ ] Add download trigger with proper filename**Action Items**:

- [ ] Create test fixtures (OBJ+MTL+textures, GLTF+bins)

---- [ ] Test edge cases (missing files, case sensitivity)

- [ ] Add Playwright tests

### 3. Camera Projection Toggle- [ ] Document test results

**Feature**: Switch between Perspective and Orthographic cameras  

**Priority**: ⭐⭐⭐ HIGH  **Test Directory**: `tests/fixtures/multi-file/`

**Effort**: 2-3h (Quick win!)

---

**Action Items**:

- [ ] Add camera projection toggle button### 3. Error Handling & UX Improvements ⏳

- [ ] Switch between PerspectiveCamera and OrthographicCamera**Priority**: HIGH | **Effort**: 2h

- [ ] Preserve camera position/zoom on switch

- [ ] Update OrbitControls for orthographic modeBetter feedback when dependencies fail to load.

- [ ] Professional UI feedback

**Action Items**:

---- [ ] Add specific error messages for missing deps

- [ ] Show warning toast for partial failures

## 🔧 Medium Priority- [ ] Add "Missing Materials" UI indicator

- [ ] Improve loading progress display

### 4. Model Statistics Panel

**Enhancement**: Expand current basic stats  ---

**Effort**: 2-3h

## 🚀 Backlog (Medium Priority)

**Add**:

- Total vertices count### 4. Dependency Caching

- Materials count with namesCache MTL/textures to avoid re-downloading.

- Texture count and memory usage- **Effort**: 4-5h

- Bounding box dimensions- **Tech**: IndexedDB or localStorage

- File size- **Benefit**: Faster loads, less bandwidth



---

### 5. Improved Error Handling

**Enhancement**: Better user feedback for loading failures  

**Effort**: 2-3h



**Action Items**:### 6. KTX2 Texture Compression

- [ ] Specific error messages per failure typeSupport compressed textures.

- [ ] Retry mechanism for network errors- **Effort**: 3-4h

- [ ] Progressive error recovery (load partial model)- **Benefit**: Reduced memory, faster loading

- [ ] User-friendly error descriptions- **Note**: Decoder assets already available



---### 7. Case-Insensitive Filename Matching

Handle Texture.JPG vs texture.jpg mismatches.

### 6. Theme Customization- **Effort**: 1-2h

**Enhancement**: Extend current CSS-based theme support  - **Priority**: Quick win!

**Effort**: 3-4h

---

**Action Items**:

- [ ] Theme picker UI (light/dark/auto)## 💡 Future Ideas (Low Priority)

- [ ] Custom color schemes

- [ ] Save theme preference8. Thumbnail generation for multi-file models

- [ ] Sync with Nextcloud theme9. Lazy loading for large texture sets

10. Multi-file export/download as ZIP

---11. Batch texture optimization on upload

12. Comparison mode for multi-file models

## 💡 Future Ideas

---

### Low Priority (Nice to Have)

## ✅ Recently Completed

7. **Screenshot/Thumbnail Generation** - Capture current view as image

8. **Annotation System** - Add notes/labels to model points- [x] Multi-file loading infrastructure (Phase 1)

9. **Comparison Mode Improvements** - Side-by-side view, diff highlighting- [x] OBJ+MTL+textures support (Phase 2)

10. **Animation Timeline** - Better controls for animated models- [x] GLTF+bins+images support (Phase 2)

11. **Model Transformation** - Scale, rotate, translate tools- [x] Backend API endpoint `/api/file/by-path`

12. **Measurement Enhancements** - Area calculation, volume estimation- [x] ViewerComponent.vue integration

13. **Cross-section View** - Cut plane visualization- [x] Security & authentication

14. **Exploded View** - Separate parts visualization- [x] Graceful error handling

15. **VR/AR Preview** - WebXR integration- [x] Documentation (MULTI_FILE_LOADING_COMPLETE.md)



------



## ✅ Recently Completed (October 2025)

- [x] **Progressive Texture Loading + Subdirectory Support** (October 10, 2025) - Instant geometry display with background texture loading
  - Model geometry visible in <1 second with placeholder colors
  - Textures load asynchronously in background (non-blocking)
  - Materials auto-update as textures finish loading
  - Visual progress indicator in bottom-right corner
  - Batch loading (3 textures at a time) prevents system overload
  - 100ms delay between batches for smooth loading
  - Automatic subdirectory search for textures (Texture/, textures/, etc.)
  - Added 3DS and DAE multi-file format support
  - LoadingManager URL modifier for 3DS external textures
  - Dramatically improved UX and perceived performance
- [x] **Dependency Caching System** (October 10, 2025) - IndexedDB caching for MTL/textures
  - Persistent cache across sessions using IndexedDB
  - Smart file size limits (10MB per file, 100MB total)
  - LRU eviction and 7-day auto-expiration
  - Clear Cache button in SETTINGS section
  - Prevents out-of-memory errors with large files
  - Dramatically faster reloads for models with dependencies
- [x] **Enhanced Model Statistics Panel** (October 10, 2025) - Comprehensive model information display
  - Statistics panel on left side with detailed model info
  - Geometry stats: Vertices, faces, meshes count
  - Materials list with names and types (first 10 shown)
  - Texture count and memory usage in MB
  - Bounding box dimensions (X, Y, Z) and volume
  - File size and format display
  - Auto-analysis on model load
- [x] **Multi-Format Export Functionality** (October 10, 2025) - Export models as GLB, STL, or OBJ
  - Export dropdown in SlideOutToolPanel (SETTINGS section)
  - GLB export with embedded textures and materials (recommended)
  - STL export for 3D printing (geometry only)
  - OBJ export for universal compatibility
  - Visual progress overlay with animated stages
  - Smart filename extraction and toast notifications
- [x] **Camera Projection Toggle** (October 10, 2025) - Perspective ↔ Orthographic switching
  - Toggle button in SlideOutToolPanel (VIEW section)
  - Smooth camera state preservation during switch
  - Proper zoom translation between projection modes
  - OrbitControls update and window resize handling
- [x] **Performance Monitoring System** - Full integration with auto-detection
- [x] **Browser Capability Detection** - Smart quality mode selection
- [x] **Performance Overlay** - Real-time FPS/memory/quality stats
- [x] **5 Quality Modes** - Low, Balanced, High, Ultra, Auto
- [x] **Auto-Optimizer Fix** - Disabled in auto mode to trust detection
- [x] **Pixel Ratio Supersampling** - 1.5x rendering for high mode
- [x] **Documentation Cleanup** - Consolidated performance docs
- [x] **Code Cleanup** - Removed debug console.logs
- [x] **Multi-File Loading** - OBJ+MTL, GLTF+dependencies support
- [x] **Measurement Tool** - Distance, angles, professional UI
- [x] **KTX2 Compression** - Compressed texture support
- [x] **DRACO Compression** - Compressed geometry support
- [x] **Case-Insensitive Matching** - Robust filename handling

---

## 📝 Quick Reference

**Main TODO Doc**: `IMPROVEMENTS_TODO.md` (detailed breakdown)  
**Multi-File Docs**: `docs/MULTI_FILE_LOADING_COMPLETE.md`  
**Architecture**: `docs/TECHNICAL_ARCHITECTURE.md`  
**Test Plan**: `TEST_CHECKLIST.md`

- [x] **Auto-Optimizer Fix** - Disabled in auto mode to trust detection

- [x] **Pixel Ratio Supersampling** - 1.5x rendering for high mode---

- [x] **Documentation Cleanup** - Consolidated performance docs

- [x] **Code Cleanup** - Removed debug console.logs## 🎯 Recommended Next Action

- [x] **Multi-File Loading** - OBJ+MTL, GLTF+dependencies support

- [x] **Measurement Tool** - Distance, angles, professional UIStart with **#1: Integrate into ThreeViewer.vue** to unify both viewers, then move to **#2: Testing** to ensure stability.

- [x] **KTX2 Compression** - Compressed texture support

- [x] **DRACO Compression** - Compressed geometry supportAfter that, **#7: Case-insensitive matching** is a quick win that solves common user issues!

- [x] **Case-Insensitive Matching** - Robust filename handling

---

---

*This is a quick reference. See IMPROVEMENTS_TODO.md for full details.*

## 📚 Documentation Reference

- **Main README**: [`README.md`](README.md) - Project overview, installation, features
- **Development Guide**: [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) - Setup, build, architecture
- **Performance Guide**: [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) - Quality modes, optimization
- **Testing**: [`docs/testing/TEST_CHECKLIST.md`](docs/testing/TEST_CHECKLIST.md) - Test procedures
- **API Reference**: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) - Composables, utilities
- **Archived Notes**: [`docs/archived/`](docs/archived/) - Historical investigation notes

---

## 🎯 Recommended Next Steps

1. **Quick Win**: Fix auto-rotate zoom bug (#1) - Test thoroughly
2. **High Value**: Add camera projection toggle (#3) - Professional feature
3. **User Request**: Implement export functionality (#2) - Most requested

**For detailed historical context**, see archived files in `docs/archived/IMPROVEMENTS_TODO.md`

---

*Keep this file focused on actionable items. Move completed items to CHANGELOG.md.*
