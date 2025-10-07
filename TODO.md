# TODO - 3D Viewer Next Steps

**Last Updated**: October 6, 2025  
**Current Status**: Multi-file loading complete (ViewerComponent.vue) ✅

---

## 🔥 Current Sprint (Next Actions)

### 1. Integrate Multi-File Loading into ThreeViewer.vue ⏳
**Priority**: HIGH | **Effort**: 3-4h

The advanced viewer needs multi-file support to match ViewerComponent.vue functionality.

**Action Items**:
- [ ] Update `src/composables/useModelLoading.js`
- [ ] Add `loadModelWithDependencies()` integration  
- [ ] Pass `additionalFiles` to loaders
- [ ] Test OBJ+MTL and GLTF+bins

**Files**: 
```
src/composables/useModelLoading.js
src/components/ThreeViewer.vue
```

---

### 2. Comprehensive Multi-File Testing ⏳
**Priority**: HIGH | **Effort**: 2-3h

Need real-world test files to validate implementation.

**Action Items**:
- [ ] Create test fixtures (OBJ+MTL+textures, GLTF+bins)
- [ ] Test edge cases (missing files, case sensitivity)
- [ ] Add Playwright tests
- [ ] Document test results

**Test Directory**: `tests/fixtures/multi-file/`

---

### 3. Error Handling & UX Improvements ⏳
**Priority**: HIGH | **Effort**: 2h

Better feedback when dependencies fail to load.

**Action Items**:
- [ ] Add specific error messages for missing deps
- [ ] Show warning toast for partial failures
- [ ] Add "Missing Materials" UI indicator
- [ ] Improve loading progress display

---

## 🚀 Backlog (Medium Priority)

### 4. Dependency Caching
Cache MTL/textures to avoid re-downloading.
- **Effort**: 4-5h
- **Tech**: IndexedDB or localStorage
- **Benefit**: Faster loads, less bandwidth

### 5. Progressive Texture Loading
Show model immediately, load textures after.
- **Effort**: 3-4h
- **Benefit**: Better perceived performance
- **UX**: Model visible in < 1 second

### 6. KTX2 Texture Compression
Support compressed textures.
- **Effort**: 3-4h
- **Benefit**: Reduced memory, faster loading
- **Note**: Decoder assets already available

### 7. Case-Insensitive Filename Matching
Handle Texture.JPG vs texture.jpg mismatches.
- **Effort**: 1-2h
- **Priority**: Quick win!

---

## 💡 Future Ideas (Low Priority)

8. Thumbnail generation for multi-file models
9. Lazy loading for large texture sets
10. Multi-file export/download as ZIP
11. Batch texture optimization on upload
12. Comparison mode for multi-file models

---

## ✅ Recently Completed

- [x] Multi-file loading infrastructure (Phase 1)
- [x] OBJ+MTL+textures support (Phase 2)
- [x] GLTF+bins+images support (Phase 2)
- [x] Backend API endpoint `/api/file/by-path`
- [x] ViewerComponent.vue integration
- [x] Security & authentication
- [x] Graceful error handling
- [x] Documentation (MULTI_FILE_LOADING_COMPLETE.md)

---

## 📝 Quick Reference

**Main TODO Doc**: `IMPROVEMENTS_TODO.md` (detailed breakdown)  
**Multi-File Docs**: `docs/MULTI_FILE_LOADING_COMPLETE.md`  
**Architecture**: `docs/TECHNICAL_ARCHITECTURE.md`  
**Test Plan**: `TEST_CHECKLIST.md`

---

## 🎯 Recommended Next Action

Start with **#1: Integrate into ThreeViewer.vue** to unify both viewers, then move to **#2: Testing** to ensure stability.

After that, **#7: Case-insensitive matching** is a quick win that solves common user issues!

---

*This is a quick reference. See IMPROVEMENTS_TODO.md for full details.*
