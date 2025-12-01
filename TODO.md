# TODO - 3D Viewer Next Steps

**Last Updated**: January 2025  
**Current Status**: All major features implemented ✅

---

## 🎯 High Priority

### 1. Vue 3 Migration Planning ⏳

**Priority**: HIGH | **Effort**: 2-3 weeks

Plan migration from Vue 2.7 to Vue 3 to enable dependency updates.

**Action Items**:
- [ ] Create migration branch
- [ ] Update Vue core and dependencies
- [ ] Migrate all 15 composables
- [ ] Update all 11 components
- [ ] Test compatibility
- [ ] Update build configuration

**See**: [VUE3_MIGRATION_GUIDE.md](VUE3_MIGRATION_GUIDE.md)

---

## 🔧 Medium Priority

### 2. Comprehensive Multi-File Testing ⏳

**Priority**: MEDIUM | **Effort**: 2-3h

Need real-world test files to validate implementation.

**Action Items**:
- [ ] Create test fixtures (OBJ+MTL+textures, GLTF+bins)
- [ ] Test edge cases (missing files, case sensitivity)
- [ ] Add Playwright tests
- [ ] Document test results

**Test Directory**: `tests/fixtures/multi-file/`

### 3. Cache Management UI

**Priority**: MEDIUM | **Effort**: 1-2h

Add user interface for cache management.

**Action Items**:
- [ ] Add cache size limits and LRU eviction
- [ ] Add cache clearing UI
- [ ] Test cache persistence
- [ ] Add cache statistics display

---

## 💡 Future Ideas (Low Priority)

### New Features
1. **Screenshot/Thumbnail Generation** - Capture current view as image
2. **Enhanced Annotation System** - Add notes/labels to model points
3. **Advanced Comparison Mode** - Side-by-side view with diff highlighting
4. **Animation Timeline** - Better controls for animated models
5. **Model Transformation Tools** - Scale, rotate, translate
6. **Measurement Enhancements** - Area calculation, volume estimation
7. **Cross-section View** - Cut plane visualization
8. **Exploded View** - Separate parts visualization
9. **VR/AR Preview** - WebXR integration

### Performance & Optimization
10. **Custom Color Schemes** - Beyond light/dark themes
11. **Lazy Loading for Large Texture Sets** - On-demand texture loading
12. **Multi-file Export/Download as ZIP** - Bundle all related files
13. **Batch Texture Optimization** - Optimize textures on upload

---

## ✅ Recently Completed

- [x] **3D Camera Controller** (Oct 28, 2025) - Circular controller interface for intuitive navigation
- [x] **Face Labels** (Oct 28, 2025) - Orientation markers on model faces
- [x] **Export Functionality** (Oct 28, 2025) - GLB, STL, OBJ export capabilities
- [x] **Camera Projection Toggle** (Oct 28, 2025) - Perspective ↔ Orthographic views
- [x] **Progressive Texture Loading** (Oct 28, 2025) - Background texture loading
- [x] **Dependency Caching System** (Oct 28, 2025) - IndexedDB caching for performance
- [x] **Model Statistics Panel** (Oct 28, 2025) - Detailed model information display
- [x] **Help Panel** (Oct 28, 2025) - Comprehensive in-app documentation
- [x] **Theme Customization with RTL Support** (Oct 28, 2025)
- [x] **KTX2 Texture Compression Support** (Oct 28, 2025)
- [x] **Performance Monitoring System with Overlay** (Oct 28, 2025)
- [x] **Documentation Consolidation** (Oct 28, 2025) - Updated all documentation
- [x] **Flexible Texture Matching** (Jan 2025) - Generic matching logic for FBX and OBJ textures with space/underscore normalization, prefix removal, singular/plural handling, and color/body mapping
- [x] **MTL File Matching Improvements** (Jan 2025) - Flexible matching for OBJ MTL files to handle naming variations (e.g., "Wolf_done_obj.mtl" → "Wolf_obj.mtl")
- [x] **FBX 6.1 Compatibility Attempt** (Jan 2025) - Version patching for FBX 6.1 files (6100 → 7000/6400) with clear error messages for structural incompatibilities
- [x] **Model Positioning Fixes** (Jan 2025) - Ensured all models (OBJ, FBX, DAE, X3D, VRML, demo scene) sit correctly on grid with bottom at y=0 using proper `updateMatrixWorld(true)` calls

---

## 📝 Documentation Updates

For detailed information, see:
- **[User Guide](docs/README.md)** - Installation, usage, features
- **[Technical Documentation](docs/TECHNICAL.md)** - Architecture and API
- **[Testing Guide](docs/TESTING.md)** - Testing procedures
- **[Implementation Guide](docs/IMPLEMENTATION.md)** - Lessons learned
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues

---

## 🎯 Recommended Next Action

**Start with #1: Comprehensive Multi-File Testing** to ensure robustness of the current implementation.

After testing is solid, move to **#2: Dependency Caching Enhancement** for better performance.

---

*Keep this file focused on actionable items. Move completed items to CHANGELOG.md.*
