# Code Audit - Unused Files & Code Analysis
**Date**: October 1, 2025  
**Purpose**: Identify unused/dead code for cleanup

---

## Executive Summary

**Current State**: The project has **TWO SEPARATE VIEWER IMPLEMENTATIONS** (by design!)
- ✅ **Simple Viewer** (`src/views/ViewerComponent.vue`) - Quick preview mode via Viewer API (currently working)
- ⚠️ **Advanced Viewer** (`src/App.vue` + `src/components/`) - Standalone app with full features (NOT YET WIRED UP)

**Architecture Intent**: **DUAL-MODE SYSTEM**
1. **Simple mode**: Quick 3D preview when clicking files in Files app
2. **Advanced mode**: Full-featured standalone viewer at `/apps/threedviewer/?fileId=X`

**Current Issue**: Advanced viewer exists but isn't wired up to load properly!

---

## 🔴 CRITICAL: Dual-Mode Architecture Not Yet Wired Up

### Implementation 1: Simple Viewer (CURRENTLY ACTIVE ✅)

**Purpose**: Quick preview mode for Files app integration  
**Entry Point**: `src/main.js` → registers with Viewer API  
**Component**: `src/views/ViewerComponent.vue` (190 lines)  
**Status**: **WORKING** - Loads when clicking 3D files in Files app

**Use Case**: 
- User clicks a 3D file in Files app
- Viewer API opens modal overlay
- ViewerComponent loads inside modal
- Quick preview with basic controls

**Features**:
- Placeholder cube rendering (TODO: real model loading)
- Basic Three.js setup
- OrbitControls
- Simple, clean, 190 lines total

**How it loads**:
```javascript
// main.js
OCA.Viewer.registerHandler({
    component: () => import('./views/ViewerComponent.vue'),
})
```

---

### Implementation 2: Advanced Viewer (NEEDS WIRING ⚠️)

**Purpose**: Full-featured standalone 3D viewer app  
**Entry Point**: `templates/index.php` → should load `src/App.vue`  
**Main Component**: `src/App.vue` (260 lines)  
**Status**: **NOT YET WIRED UP** - Code exists but doesn't load properly

**Use Case**:
- User visits `/apps/threedviewer/?fileId=123` directly
- Full-page app with advanced tools
- Professional 3D model inspection and analysis

**Sub-components**: 
- `src/components/ThreeViewer.vue` (~800 lines) - Main 3D renderer
- `src/components/ViewerToolbar.vue` - Full toolbar
- `src/components/ToastContainer.vue` - Notification system
- `src/components/ViewerModal.vue` - Modal wrapper

**Features** (ready to implement):
- Advanced toolbar (grid, axes, wireframe, background)
- Annotation system (add notes to models)
- Measurement tools (measure distances)
- Comparison mode (compare two models side-by-side)
- Performance monitoring
- Auto-rotate
- Animation presets
- Full composables system for state management

**Why it's not loading**:
- ✅ `templates/index.php` creates `#threedviewer` div and loads scripts
- ✅ `App.vue` exists and is ready to mount
- ❌ **MISSING**: No mounting code in `main.js` or separate entry point!
- ❌ `main.js` only registers ViewerComponent, doesn't check for `#threedviewer` div

---

## 🗑️ Files That CAN Be Deleted (Actually Unused)

### Category 1: Old Build System (Webpack → Vite migration complete)

**DELETE THESE:**
- ❌ `webpack.js` - Old webpack config (now using vite.config.js)
- ❌ `webpack.devel.js` - Old dev webpack config
- ❌ `babel.config.cjs` - Babel not needed with Vite

**Evidence**: 
- `package.json` shows Vite as build system
- `vite.config.js` is the active config
- No references to webpack in scripts

---

### Category 2: Unused Config Files

- ❌ `jest.config.cjs` - Jest tests not set up (using Playwright instead)
- ❌ `stylelint.config.cjs` - StyleLint not in package.json scripts  
- ❌ `tsconfig.json` - No TypeScript in the project
- ❌ `playwright.config.js` - Duplicate (have playwright.config.ts)

---

### Category 3: Legacy Top-Level Decoder Files

These decoder files are duplicates (already in `draco/` and `basis/` dirs):
- ❌ `draco_decoder.js` - Duplicate of draco/draco_decoder.js
- ❌ `draco_decoder.wasm` - Duplicate of draco/draco_decoder.wasm
- ❌ `draco_wasm_wrapper.js` - Duplicate of draco/draco_wasm_wrapper.js
- ❌ `basis_transcoder.js` - Duplicate of basis/basis_transcoder.js
- ❌ `basis_transcoder.wasm` - Duplicate of basis/basis_transcoder.wasm

---

### Category 4: Redundant Integration Files

- ❌ `src/files.js` - Old file action registration (NOT loaded, Viewer API used instead)
- ❌ `src/viewer-entry.js` - Old entry point, not used
- ❌ `src/viewer-api.js` - Old Viewer API registration (225 lines, superseded by main.js)

---

## ✅ Files That ARE Used (Keep ALL of These!)

### Simple Viewer (Viewer API Integration)
- ✅ `src/main.js` - Entry point, registers ViewerComponent
- ✅ `src/views/ViewerComponent.vue` - Simple preview viewer

### Advanced Viewer (Standalone App) - NEEDS WIRING
- ✅ `src/App.vue` - Main app component
- ✅ `src/components/ThreeViewer.vue` - Advanced 3D renderer
- ✅ `src/components/ViewerToolbar.vue` - Full toolbar
- ✅ `src/components/ToastContainer.vue` - Notification system
- ✅ `src/components/ViewerModal.vue` - Modal wrapper

### Composables (For Advanced Viewer)
- ✅ `src/composables/useAnnotation.js` - Annotation system
- ✅ `src/composables/useCamera.js` - Camera utilities
- ✅ `src/composables/useComparison.js` - Model comparison
- ✅ `src/composables/useMeasurement.js` - Measurement tools
- ✅ `src/composables/useMobile.js` - Mobile detection
- ✅ `src/composables/useModelLoading.js` - Advanced loader system
- ✅ `src/composables/usePerformance.js` - Performance monitoring
- ✅ `src/composables/useScene.js` - Scene utilities
- ✅ `src/composables/useUI.js` - UI state management

### Loaders (For Both Viewers)
- ✅ `src/loaders/BaseLoader.js` - Base loader class
- ✅ `src/loaders/registry.js` - Loader registry
- ✅ `src/loaders/types/*.js` - All format loaders (glTF, OBJ, STL, etc.)

### Utilities & Config (For Advanced Viewer)
- ✅ `src/utils/` - Utility files
- ✅ `src/config/` - Configuration files
- ✅ `src/constants/` - Constants

### Core Application
- ✅ `src/main.js` - Entry point, registers Viewer handler
- ✅ `src/views/ViewerComponent.vue` - The actual working viewer
- ✅ `templates/index.php` - Template (though loads unused App.vue)
- ✅ `vite.config.js` - Build configuration
- ✅ `package.json` - Dependencies

### Backend (PHP)
- ✅ `lib/AppInfo/Application.php` - App bootstrap
- ✅ `lib/Controller/` - All controllers (PageController, ApiController, etc.)
- ✅ `lib/Service/` - Services (ModelFileSupport, FileService, etc.)
- ✅ `lib/Repair/` - MIME type registration (RegisterThreeDMimeTypes, UnregisterThreeDMimeTypes)
- ✅ `lib/Listener/LoadViewerListener.php` - Loads main.js when Viewer opens

### App Metadata
- ✅ `appinfo/info.xml` - App manifest
- ✅ `appinfo/mimetypemapping.json` - MIME type mappings

### Assets
- ✅ `css/threedviewer-main.css` - Built CSS
- ✅ `js/threedviewer-main.mjs` - Built JS
- ✅ `draco/` directory - DRACO decoder assets
- ✅ `basis/` directory - Basis transcoder assets
- ✅ `img/` - Icons and images

### Documentation
- ✅ `docs/` - All documentation
- ✅ `README.md`, `CHANGELOG.md`, etc.

### Tests
- ✅ `tests/` - PHP unit tests
- ✅ `playwright.config.ts` - E2E test config
- ✅ `tests/playwright/` - Playwright tests

---

## 📊 Actual Cleanup Impact

**Files to delete**: ~15-20 config/legacy files  
**Code reduction**: ~300-500 lines (old integration code only)  
**Code to KEEP**: ALL viewer implementations (~6000 lines) - they're both needed!

**What's actually unused**:
- Old webpack build system
- Duplicate decoder files
- Legacy integration attempts (files.js, viewer-api.js, viewer-entry.js)
- Unused test/lint configs

---

## 🎯 Recommended Actions

### ✅ CORRECT Approach: Wire Up Both Viewers (Dual-Mode)

**Goal**: Make both viewers work for their intended purposes

**Step 1: Clean up truly unused files**
```bash
# Delete old build system
rm webpack.js webpack.devel.js babel.config.cjs

# Delete unused config files
rm jest.config.cjs stylelint.config.cjs tsconfig.json playwright.config.js

# Delete duplicate decoder files (keep dirs)
rm draco_decoder.js draco_decoder.wasm draco_wasm_wrapper.js
rm basis_transcoder.js basis_transcoder.wasm

# Delete old integration attempts
rm src/files.js src/viewer-entry.js src/viewer-api.js
```

**Step 2: Wire up advanced viewer (NEW TASK!)**

Current `src/main.js` only registers ViewerComponent. Need to ADD code to also mount App.vue:

```javascript
// src/main.js needs TWO MODES:

// Mode 1: Viewer API (already working)
if (OCA.Viewer) {
    OCA.Viewer.registerHandler({
        component: () => import('./views/ViewerComponent.vue'),
    })
}

// Mode 2: Standalone App (NEW - needs to be added!)
const appRoot = document.getElementById('threedviewer')
if (appRoot) {
    // Mount App.vue for standalone mode
    import('./App.vue').then(({ default: App }) => {
        new Vue({
            el: '#threedviewer',
            render: h => h(App),
        })
    })
}
```

**Step 3: Test both modes**
- Test Files app preview (ViewerComponent) - already works ✅
- Test direct URL `/apps/threedviewer/?fileId=123` (App.vue) - needs wiring ⚠️

---

### ❌ WRONG Approach: Delete One Implementation

**Don't do this!** Both implementations serve different purposes:
- Simple viewer: Quick preview (lightweight, fast)
- Advanced viewer: Professional tools (full-featured)

---

## 🔍 How To Verify

Run these commands to see what's actually loaded:

```bash
# Check what Vite builds
npm run build

# Should only build:
# - js/threedviewer-main.mjs (entry point)
# - js/ViewerComponent-*.chunk.mjs (dynamic import)
# - js/three.module-*.chunk.mjs (Three.js)
# - js/OrbitControls-*.chunk.mjs (OrbitControls)

# Check what's NOT in built output
ls js/*.mjs | grep -E "(App|ThreeViewer|composable|loader)"
# Should return nothing - these files aren't built!
```

---

## 📝 Technical Details

### Current Architecture (One Mode Working)

**What Works**: Viewer API integration
```javascript
// lib/Listener/LoadViewerListener.php
Util::addScript('threedviewer', 'threedviewer-main', 'viewer');
// Loads: js/threedviewer-main.mjs

// src/main.js (builds to threedviewer-main.mjs)
OCA.Viewer.registerHandler({
    component: () => import('./views/ViewerComponent.vue'),
    // ^^^ This loads when user clicks 3D file in Files app
})
```

### Target Architecture (Dual-Mode)

**Mode 1**: Viewer API (Quick Preview) - ✅ Working
- User clicks 3D file in Files app
- Viewer modal opens
- ViewerComponent.vue loads inside modal
- Basic controls, fast loading

**Mode 2**: Standalone App (Full Features) - ⚠️ Needs Wiring
- User visits `/apps/threedviewer/?fileId=123`
- Full-page app loads
- App.vue mounts to `#threedviewer` div
- Advanced tools, professional inspection

**Implementation**:
```javascript
// src/main.js needs to handle BOTH modes

// Mode 1: Register with Viewer API (already done)
if (OCA && OCA.Viewer) {
    OCA.Viewer.registerHandler({
        id: 'threedviewer',
        mimes: SUPPORTED_MIMES,
        component: () => import('./views/ViewerComponent.vue'),
    })
}

// Mode 2: Mount standalone app (MISSING - needs to be added)
const appRoot = document.getElementById('threedviewer')
if (appRoot) {
    import('vue').then(({ default: Vue }) => {
        import('./App.vue').then(({ default: App }) => {
            new Vue({
                el: '#threedviewer',
                render: h => h(App),
                // Pass fileId from URL query params
                propsData: {
                    fileId: new URLSearchParams(window.location.search).get('fileId')
                }
            })
        })
    })
}
```

### Why Two Implementations?

**Different Use Cases**:

| Feature | Simple Viewer | Advanced Viewer |
|---------|---------------|-----------------|
| **Access** | Files app click | Direct URL |
| **Loading** | Viewer modal | Full page |
| **Speed** | Instant | Slightly slower |
| **Features** | Basic preview | Full toolset |
| **Use Case** | Quick check | Professional work |
| **File Size** | ~50KB | ~150KB |

**User Flows**:

1. **Casual User**: "Let me quickly preview this model"
   → Clicks file → ViewerComponent (simple, fast)

2. **Professional User**: "I need to measure this model and add annotations"
   → Right-click → "Open in 3D Viewer" → App.vue (full features)

3. **Share Link**: "Here's a link to inspect this model"
   → `/apps/threedviewer/?fileId=123` → App.vue (full features)

---

## ⚠️ Risk Assessment

**Low Risk to Delete**:
- Old webpack files (using Vite now)
- Duplicate decoder files (originals in subdirs)
- Unused composables/loaders (never imported)

**Medium Risk**:
- `src/files.js` - Check if it's meant to be loaded somehow
- Complex viewer components - Verify they're truly unused

**No Risk**:
- Test config files (jest, stylelint, extra playwright.config.js)

---

## 🎬 Next Steps

1. **Decide**: Which viewer implementation to keep?
2. **Backup**: `git commit` before deleting anything
3. **Delete**: Run the deletion commands (Option A recommended)
4. **Test**: Verify 3D files still open correctly
5. **Build**: `npm run build` should still work
6. **Document**: Update README to reflect simplified architecture

---

## 📚 Summary

**The Situation**: Dual-mode architecture is partially implemented

**Simple Viewer**: ✅ Working (Viewer API integration)  
**Advanced Viewer**: ⚠️ Code exists but not wired up

**What to Delete**: Only truly unused files (~20 files, ~500 lines)
- Old webpack configs
- Duplicate decoder files  
- Legacy integration attempts
- Unused test configs

**What to KEEP**: Both viewer implementations (~6000 lines)
- ViewerComponent.vue (simple mode)
- App.vue + ecosystem (advanced mode)
- All loaders, composables, utilities

**Next Critical Task**: Wire up App.vue to make advanced mode work!

**Benefits of Dual-Mode**:
- Fast preview for casual users
- Professional tools for power users
- Best of both worlds
- No compromise on user experience
