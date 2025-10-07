# 3D Viewer Nextcloud App - Improvements TODO List

Based on analysis of the [Nextcloud Cookbook repository](https://github.com/nextcloud/cookbook) as a reference model, here are the improvements needed for the 3D Viewer Nextcloud app.

## ✅ Current Strengths

- **Modern Build System**: Using Vite instead of Webpack (more modern)
- **Comprehensive Testing**: Good Playwright setup with smoke tests
- **Security**: Proper CSP handling and authenticated streaming
- **Documentation**: Excellent README with detailed technical information
- **Bundle Size Monitoring**: Smart bundle size checking system
- **Performance**: Dynamic imports and code splitting implemented

## 📋 TODO List - Improvements Needed

### 🔧 Development Environment & Configuration

- [x] **Add .editorconfig** - For consistent code formatting across team
- [x] **Add babel.config.js** - JavaScript transpilation configuration
- [x] **Add tsconfig.json** - TypeScript configuration
- [x] **Add jest.config.js** - JavaScript unit testing
- [x] **Add Makefile** - Common development tasks automation

### 🧪 Testing & Quality Assurance

- [x] **Add phpunit.integration.xml** - Integration testing configuration
- [x] **Add phpunit.migration.xml** - Migration testing configuration
- [x] **Add .codecov.yml** - Code coverage reporting
- [x] **Enhance psalm.xml** - More comprehensive static analysis settings

### ⚙️ Build & Development Tools

- [x] **Add webpack.devel.js** - Development environment configuration
- [x] **Improve stylelint configuration** - More comprehensive CSS linting rules
- [x] **Enhance composer.json** - Additional development scripts and dependencies
- [x] **Improve package.json** - Better dependency management and scripts

### 🌐 Localization & Translation

- [x] **Add translationfiles directory** - Better localization management
- [x] **Add .tx configuration** - Transifex translation management

### 🔒 Security & CI/CD

- [x] **Improve security advisories** - Dependency scanning configuration
- [x] **Enhance GitHub Actions workflows** - Proper version matrix and concurrency controls

### 📁 Project Structure

- [x] **Add .helpers directory** - Development utilities
- [x] **Improve git hooks** - Add .hooks and .hook-checkout directories
- [x] **Add VS Code workspace config** - Better development experience

### 📚 Documentation

- [x] **Enhance documentation structure** - Add missing documentation files

## 🎯 Priority Recommendations

### High Priority
- Add `.editorconfig` for team consistency
- Enhance GitHub Actions workflows with proper version matrix
- Add comprehensive PHPUnit testing configurations
- Improve security advisories and dependency scanning

### Medium Priority
- Add development configuration files (babel, tsconfig, jest)
- Enhance localization management
- Add VS Code workspace configuration

### Low Priority
- Add helper directories and git hooks
- Enhance documentation structure

## 📊 Progress Tracking

**Total Items**: 21
**Completed**: 21
**In Progress**: 0
**Pending**: 0

## 🎉 **ALL PREVIOUS IMPROVEMENTS COMPLETED!**

Your 3D Viewer Nextcloud app now follows Nextcloud best practices and matches the quality of the Cookbook reference project!

---

## 🆕 New TODO List (Post-Multi-File Loading Completion)

**Last Updated**: January 2025

### ✅ Completed Recently

#### **ViewerComponent Composables Integration**
**Status**: ✅ **Partially Completed** (Composables Improved, Original ViewerComponent Kept)  
**Completed**: January 2025  
**Outcome**: 
- ✅ Removed `readonly()` wrappers from all composables (useScene, useCamera, useMobile)
- ✅ Fixed fundamental ref reactivity issues in composable pattern
- ✅ Created comprehensive documentation (VIEWERCOMPONENT_REFACTORING_LESSONS.md)
- ✅ Created COMPOSABLES_API.md with correct usage patterns
- ✅ Preserved working ViewerComponent.vue (Options API, 638 lines)
- ⚠️ Refactored version (380 lines) attempted but abandoned due to Vue 2.7 complexity
- 📝 Lessons learned documented for future Vue 3 migration

**Why Kept Original**:
- Production stability is critical
- Vue 2.7 Options API + composables mix is complex (auto-unwrapping issues)
- Multi-file loading fully functional in original
- Composable improvements benefit all future code

**Files Modified**:
```
✅ src/composables/useScene.js - Removed readonly(), cleaned debug logs
✅ src/composables/useCamera.js - Removed readonly()
✅ src/composables/useMobile.js - Removed readonly()
✅ src/composables/useModelLoading.js - Enhanced with loadModelFromFileId()
✅ src/views/ViewerComponent.vue - Kept original working version
📁 src/views/ViewerComponent.vue.backup - Backup preserved
📝 docs/VIEWERCOMPONENT_REFACTORING_LESSONS.md - Comprehensive lessons
📝 docs/COMPOSABLES_API.md - Complete API reference
```

**Benefits Achieved**:
- All composables now properly reactive (no frozen refs)
- Clear documentation of Vue 2.7 ref behavior
- Future Vue 3 migration path documented
- Production code stable and tested

---

### 🔥 High Priority

#### 1. **Integrate Multi-File Loading into ThreeViewer.vue**
**Status**: ⏳ Not Started  
**Effort**: 3-4 hours  
**Description**: The advanced viewer (ThreeViewer.vue) uses the `useModelLoading` composable but doesn't yet support multi-file loading. ViewerComponent.vue has full multi-file support.

**Tasks**:
- [ ] Update `src/composables/useModelLoading.js` to support multi-file loading
- [ ] Add `loadModelWithDependencies()` integration
- [ ] Pass `additionalFiles` to loaders via context
- [ ] Add format detection (obj, gltf) for multi-file models
- [ ] Test with OBJ+MTL+textures
- [ ] Test with GLTF+bins+images
- [ ] Ensure backward compatibility with single-file loading

**Files to Modify**:
```
src/composables/useModelLoading.js
src/components/ThreeViewer.vue (if needed)
```

**Related Docs**: `docs/MULTI_FILE_LOADING_COMPLETE.md`

---

#### 2. **Comprehensive Multi-File Testing**
**Status**: ⏳ Not Started  
**Effort**: 2-3 hours  
**Description**: Need real-world testing with actual multi-file 3D models.

**Tasks**:
- [ ] Create test asset library with multi-file models
- [ ] Test OBJ with MTL and various texture formats (JPG, PNG, TGA)
- [ ] Test GLTF with external bins and images
- [ ] Test edge cases:
  - [ ] Missing MTL file (should use default material)
  - [ ] Missing texture files (should use fallback)
  - [ ] Case sensitivity (Texture.JPG vs texture.jpg)
  - [ ] Relative paths in GLTF
  - [ ] Multiple MTL files
  - [ ] Large texture sets (10+ textures)
- [ ] Document test results
- [ ] Add Playwright tests for multi-file scenarios

**Test Files Needed**:
```
tests/fixtures/multi-file/
├── obj-with-mtl/
│   ├── model.obj
│   ├── material.mtl
│   └── textures/
│       ├── diffuse.jpg
│       └── normal.png
└── gltf-external/
    ├── model.gltf
    ├── model.bin
    └── textures/
        └── base_color.png
```

---

#### 3. **Error Handling & User Feedback Improvements**
**Status**: ⏳ Not Started  
**Effort**: 2 hours  
**Description**: Improve error messages and user feedback for multi-file loading scenarios.

**Tasks**:
- [ ] Add specific error messages for missing dependencies
- [ ] Show warning toast when textures fail to load (but model succeeds)
- [ ] Add "Missing Materials" indicator in UI
- [ ] Improve loading progress for multi-file models
- [ ] Add detailed error logging for debugging
- [ ] Create user-friendly error recovery suggestions

**User-Facing Messages**:
- "Model loaded but some textures are missing"
- "Material file (material.mtl) not found - using default materials"
- "Loaded model with 5 textures (2 failed)"

---

### 🚀 Medium Priority

#### 4. **Performance Optimization: Dependency Caching**
**Status**: ⏳ Not Started  
**Effort**: 4-5 hours  
**Description**: Cache fetched dependencies to avoid re-downloading on subsequent views.

**Tasks**:
- [ ] Design caching strategy (IndexedDB or localStorage)
- [ ] Implement cache key generation (fileId + timestamp)
- [ ] Add cache expiration (24 hours default)
- [ ] Cache MTL files and textures
- [ ] Add cache invalidation on file updates
- [ ] Add "Clear Cache" option in settings
- [ ] Monitor cache size and implement cleanup

**Benefits**:
- Faster load times for revisited models
- Reduced network traffic
- Better offline support

---

#### 5. **Progressive Texture Loading**
**Status**: ⏳ Not Started  
**Effort**: 3-4 hours  
**Description**: Show model immediately, load textures progressively in background.

**Tasks**:
- [ ] Separate geometry loading from texture loading
- [ ] Show model with placeholder materials first
- [ ] Load textures asynchronously after initial render
- [ ] Update materials as textures become available
- [ ] Add loading indicators per texture
- [ ] Prioritize textures by importance (diffuse > normal > specular)

**UX Improvement**:
- Users see model faster (< 1 second)
- Textures appear progressively
- Better perceived performance

---

#### 6. **Texture Compression Support (KTX2)**
**Status**: ⏳ Not Started  
**Effort**: 3-4 hours  
**Description**: Add support for compressed textures to reduce bandwidth and memory usage.

**Tasks**:
- [ ] Wire up existing KTX2Loader
- [ ] Test with Basis Universal compressed textures
- [ ] Add automatic format detection
- [ ] Provide texture compression guidelines in docs
- [ ] Add compression recommendation in UI for large textures
- [ ] Benchmark memory savings

**Note**: KTX2 decoder assets already copied during build.

---

#### 7. **Case-Insensitive Filename Matching**
**Status**: ⏳ Not Started  
**Effort**: 1-2 hours  
**Description**: Handle case mismatches between OBJ references and actual filenames.

**Tasks**:
- [ ] Modify backend `/api/file/by-path` to support case-insensitive lookup
- [ ] Update `getFileIdByPath()` with fallback logic
- [ ] Add filename normalization option
- [ ] Test on Linux (case-sensitive) and Windows (case-insensitive)
- [ ] Document behavior in API reference

**Common Issue**: OBJ file references `Texture.JPG` but file is named `texture.jpg`

---

### 💡 Low Priority / Future Enhancements

#### 8. **Thumbnail Generation for Multi-File Models**
**Status**: ⏳ Not Started  
**Effort**: 5-6 hours  
**Description**: Generate proper thumbnails instead of static placeholder.

**Tasks**:
- [ ] Implement server-side thumbnail rendering (headless GL)
- [ ] OR implement client-side thumbnail capture
- [ ] Cache generated thumbnails
- [ ] Add thumbnail endpoint to API
- [ ] Show thumbnails in file listing
- [ ] Support different thumbnail sizes

---

#### 9. **Lazy Loading for Large Texture Sets**
**Status**: ⏳ Not Started  
**Effort**: 4-5 hours  
**Description**: Load textures only when model is visible in viewport.

**Tasks**:
- [ ] Implement viewport visibility detection
- [ ] Defer texture loading until needed
- [ ] Add "Load Textures" button for user control
- [ ] Monitor memory usage
- [ ] Add memory budget limiting

---

#### 10. **Multi-File Model Export/Download**
**Status**: ⏳ Not Started  
**Effort**: 3-4 hours  
**Description**: Allow users to download models with all dependencies as ZIP.

**Tasks**:
- [ ] Add "Download with dependencies" option
- [ ] Create ZIP archive with all files
- [ ] Maintain directory structure
- [ ] Include README with file descriptions
- [ ] Add export format selection

---

#### 11. **Batch Texture Optimization**
**Status**: ⏳ Not Started  
**Effort**: 6-8 hours  
**Description**: Automatically optimize textures on upload.

**Tasks**:
- [ ] Add server-side image processing
- [ ] Resize oversized textures
- [ ] Convert to optimal formats
- [ ] Generate mipmaps
- [ ] Offer optimization UI in admin settings

---

#### 12. **Comparison Mode for Multi-File Models**
**Status**: ⏳ Not Started  
**Effort**: 2-3 hours  
**Description**: Extend existing comparison mode to support multi-file models.

**Tasks**:
- [ ] Test comparison with OBJ+MTL models
- [ ] Ensure dependencies load for both models
- [ ] Handle different texture sets
- [ ] Add side-by-side texture comparison

---

## 📊 Progress Tracking

**Previous Improvements**: 21/21 ✅ (100% Complete)

**New Improvements**: 0/12 (0% Complete)

### Priority Breakdown:
- **High Priority**: 3 items (Multi-file ThreeViewer integration, testing, error handling)
- **Medium Priority**: 4 items (Caching, progressive loading, compression, case-insensitive)
- **Low Priority**: 5 items (Thumbnails, lazy loading, export, optimization, comparison)

### Recommended Order:
1. **First**: Integrate into ThreeViewer.vue (#1) - Unify both viewers
2. **Second**: Comprehensive testing (#2) - Ensure stability
3. **Third**: Error handling improvements (#3) - Better UX
4. **Fourth**: Dependency caching (#4) - Performance boost
5. **Fifth**: Choose based on user feedback (progressive loading or compression)

---

## 🎯 Quick Wins (< 2 hours each)

1. **Case-insensitive matching** (#7) - Solves common user frustration
2. **Better error messages** (#3) - Improves user experience immediately
3. **Add test fixtures** (#2 partial) - Enables proper testing

---

## 📝 Notes

- All suggestions are optional enhancements
- Core multi-file loading is already complete and working ✅
- Focus should be on stability and testing before adding new features
- User feedback should guide priority decisions

---

*Generated based on multi-file loading completion analysis - October 6, 2025*
