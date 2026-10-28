# Technical Documentation

This document provides comprehensive technical information about the 3D Viewer for Nextcloud application architecture, implementation details, and advanced features.

## Table of Contents

- [System Architecture](#system-architecture)
- [Performance Monitoring](#performance-monitoring)
- [Multi-File Loading](#multi-file-loading)
- [Composables API](#composables-api)
- [Lazy Loading Implementation](#lazy-loading-implementation)
- [Model Loading Implementation](#model-loading-implementation)
- [Advanced Viewer Wiring](#advanced-viewer-wiring)
- [Thumbnail Generation System](#thumbnail-generation-system)
- [Print Check](#print-check)
- [File Versions](#file-versions)
- [View Links](#view-links)

## System Architecture

### High-Level Architecture

The 3D Viewer is a Nextcloud application that provides 3D model viewing capabilities through a modern web interface. It consists of a PHP backend integrated with Nextcloud and a Vue.js frontend with Three.js for 3D rendering.

```
┌─────────────────────────────────────────────────────────────┐
│                    Nextcloud Platform                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   Files App     │  │   Admin Panel   │  │   Other     │  │
│  │                 │  │                 │  │   Apps      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              3D Viewer Application                     │ │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐  │ │
│  │  │   Backend       │  │        Frontend             │  │ │
│  │  │   (PHP)         │  │        (Vue.js + Three.js)  │  │ │
│  │  └─────────────────┘  └─────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Architecture Principles

- **Modularity**: Clear separation of concerns between frontend and backend
- **Performance**: Optimized for large 3D models with streaming and compression
- **Security**: Permission-based access control and CSRF protection
- **Extensibility**: Easy to add new 3D formats and features
- **Accessibility**: WCAG compliant with keyboard navigation support

### Backend Architecture

#### Core Components

**Controllers:**
- **`ApiController`**: OCS endpoints (`/api`, `/api/files`, `/api/file/{id}`)
- **`FileController`**: App routes for authenticated streaming/listing (`/file/{id}`, `/files`)
- **`PublicFileController`**: Public share streaming (`/public/file/{token}/{id}`, sibling MTL)
- **`PageController`**: Frontpage route returning the app shell
- **`SettingsController`**: User settings management (`/settings`)
- **`SlicerController`**: Slicer integration and temporary file handling (`/api/slicer/temp`)
- **`ThumbnailController`**: Thumbnail status and upload (`/api/thumbnails/status`, `/api/thumbnail/{fileId}`)

**Slicer temp file security posture:**
- Temp folder: `.3dviewer_temp` under each user’s home.
- Expiry: 24h enforced on access and cleanup; public share expires at now+24h.
- Cleanup: cron every ~6h plus per-request cleanup of old files/shares.
- Limits: per-upload cap 50 MB; folder cap 200 MB; filename sanitized/forced to `.stl`.
- Validation: MIME/header check for STL; access restricted to owner; public shares deleted on removal/expiry.
- Headers: downloads served with no-cache and content-length; CORS allowed for slicers.

**Services:**
- **`FileService`**: File operations and validation
- **`ShareFileService`**: Public share file handling
- **`ModelFileSupport`**: 3D format support wrapper (delegates to `SupportedFormats`)
- **`FileIndexService`**: Database-backed file indexing for navigation
- **`ThumbnailService`**: One thumbnail per file version, stored in IAppData

**Constants:**
- **`SupportedFormats`**: Centralized format definitions and MIME type mappings (single source of truth)

**Models:**
- **`Application`**: App configuration and metadata
- **`MimeType`**: MIME type handling and registration

#### API Design

**OCS Endpoints:**
```
GET /ocs/v2.php/apps/threedviewer/api              # index (hello)
GET /ocs/v2.php/apps/threedviewer/api/files        # list files
GET /ocs/v2.php/apps/threedviewer/api/file/{id}    # stream file for current user
```

**App Routes:**
```
GET /apps/threedviewer/file/{id}                   # stream file
GET /apps/threedviewer/files                       # list files
```

**Public Share Endpoints:**
```
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{id}
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{id}/dep/{name}
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{id}/mtl/{mtlName}   # deprecated alias of /dep/
```

`/dep/{name}` serves a companion file — a material, one of its textures, or a glTF
buffer — for the model identified by `{id}`. Anonymous callers cannot reach the
file-listing API, so there is no id to fetch these by; the name is the handle instead.
A name is only served when the model itself declares it (`mtllib`, `map_*`, `bump`,
`refl`, or a glTF `buffers[].uri` / `images[].uri`), which is what stops a share link
from becoming a way to name-guess files beside the model that were never shared.

Each declared reference is reduced to a path inside the model's folder by
`ModelDependencyResolver::normalise()`, and the client asks for the names the same rules
give (`normaliseRef()` in `src/loaders/textureReferences.js`; a table both test suites read,
`tests/fixtures/texture-references.json`, holds the two to the same answers):

- **Relative paths** have `\` folded to `/` and `..` collapsed; one holding a NUL or a
  segment made only of dots and spaces (`...`, `.. `), which storage on a Windows share may
  read as `.` or `..`, is rejected, wherever that segment is. A material's maps are
  relative to the material: the map is joined to the material's folder before it is
  normalised (`mats/chair.mtl` naming `../textures/wood.png` is `textures/wood.png`, and
  naming `wood.png` is `mats/wood.png`). The client does the same join
  (`parseMtlTexturePaths()`, with `normaliseRef()`'s `directory`), in the background queue
  and the viewer; the table's `mtl` rows hold both sides to it.
- **Relative paths that climb above the model's folder** — `..\..\textures\wood.jpg`,
  `../maps/wood.png`, or `textures/../../wood.jpg`, which climbs out once collapsed — are
  how 3ds Max and other exporters write a path relative to the project rather than the
  model, while the texture is usually uploaded beside the model. Such a path falls back to
  its last segment as a bare file name, exactly as an absolute path does (below): the
  server, public shares and background thumbnails look for it in the model's own folder
  and nowhere else, and the folders it names are never followed. (The signed-in viewer
  resolves every bare name it is given through `getFileIdByPath()`, which also searches
  the model's subfolders and conventional texture folders such as `textures` and `maps`;
  that is the viewer's search, not the path's folders.) A path counts as climbing if `..` goes above the model's folder at any
  point, even if it comes back down (`../textures/wood.jpg` is `wood.jpg`, not
  `textures/wood.jpg`). A path that stays inside is unchanged (`textures/../wood.jpg` is
  `wood.jpg`, `maps/wood.jpg` is `maps/wood.jpg`). The name is rejected as an absolute
  path's is: empty (`..\..\`, `../wood.jpg/`), `.` or `..` (`../..`), or made only of dots
  and spaces; and the whole path is rejected for a NUL or a dots-and-spaces segment
  anywhere in it (`../ .. /x.png`). For a material in a subfolder, climbing is measured
  from the model's folder: `mats/chair.mtl` naming `../wood.png` means `wood.png` beside
  the model by collapsing, and `../../wood.png` means it by falling back. A climbing
  path's name is the last segment of the joined path, with only the name checks: the
  start of that path is the material's folder, so it is not read for a scheme, a drive
  letter or a `file:` URL.
- **Absolute paths and `file:` URLs** — `C:\textures\wood.jpg`, `C:/…`, `/home/…`, a UNC path
  `\\server\share\…`, `file:///C:/…` with or without a host — name a place on the author's
  machine, as SketchUp, 3ds Max and some Blender exports write. They fall back to their
  bare file name, looked for in the model's own folder (and, in the signed-in viewer,
  its subfolders, as above), whichever file declared them: the directories they name are
  never followed. A `file:` URL loses its
  query and fragment and its name is percent-decoded once. A name that is empty, made
  only of dots and spaces, or that holds a separator or NUL once decoded, is rejected.
- **Any other scheme** (`http:`, `https:`, `ftp:`, `data:`, `blob:`, …) is not a file
  beside the model and is rejected: it is never declared, looked up or served as a companion.

Only the ASCII blanks (space, tab, CR, LF, VT, FF) are trimmed, on both sides; a no-break
space or a byte-order mark is part of the name. COLLADA, X3D and glTF values are
percent-decoded first, as `decodeURIComponent()` decodes them: a stray `%` or bytes that
are not UTF-8 keep the value as written. An encoded separator divides the value like any
other once decoded, so `..%2F..%2Fmaps%2Fchecker.png` is a climb to `checker.png`, and the
loaders match the request to the companion by the decoded value's last segment. An MTL map that starts with an option
(`map_Kd -bm 0.3 file:///…`) names its path as its final token. An FBX `Video` whose
`RelativeFilename` is empty names its file by `Filename`, which is what three's FBXLoader
then asks for.

Declarations are keyed by lower-cased basename and the first one wins, so a bare name an
absolute or climbing path fell back to neither replaces nor is replaced by a relative
declaration of the same name that came before it. Every check is a fixed-length test at the start of the
reference or a single forward scan, so each is linear in the reference.

### Frontend Architecture

#### Component Structure

**Views:**
- **`ViewerComponent.vue`**: Main entry point for the viewer application. Handles routing and initialization.
- **`PersonalSettings.vue`**: User settings interface for configuring appearance, performance, and controls.

**Core Components:**
- **`ThreeViewer.vue`**: Main 3D rendering component. Handles scene setup, model loading, and interaction.
  - **`CircularController.vue`**: 3D camera navigation widget.
  - **`ViewerToolbar.vue`**: Main toolbar containing all viewer controls.
  - **`ViewCube.vue`**: Interactive 3D orientation cube.
  - **`SlicerModal.vue`**: Interface for sending models to 3D slicing software.
  - **`HelpPanel.vue`**: In-app documentation and keyboard shortcuts.
  - **`MinimalTopBar.vue`**: Minimal interface for embedded/mobile views.
  - **`SlideOutToolPanel.vue`**: Collapsible panel for advanced tools.
  - **`ToastContainer.vue`**: System for displaying notifications.

**File Management:**
- **`FileBrowser.vue`**: Integrated file browser for navigating 3D models.
  - **`FileBrowser/FolderHierarchy.vue`**: Recursive folder structure component.
- **`FileNavigation.vue`**: Navigation component for file lists.
- **`ViewerModal.vue`**: Modal wrapper for displaying the viewer in overlay mode.

#### State and Composables

- Composition API with refs/computed: All 16 composables for comprehensive state management
- Core composables: `useCamera`, `useModelLoading`, `useComparison`, `useMeasurement`, `useAnnotation`
- UI composables: `useController`, `useExport`, `useFaceLabels`, `useModelStats`, `useProgressiveTextures`, `useTheme`, `useUI`
- Utility composables: `useMobile`, `usePerformance`, `useScene`
- Emits include: `model-loaded`, `error`, `toggle-comparison`, `export-complete`, etc.

#### Three.js Integration

**Scene Management:**
```javascript
// Scene setup
this.scene = new THREE.Scene();
this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
this.renderer = new THREE.WebGLRenderer({ antialias: true });

// Lighting setup
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
```

**Model Loading:**
```javascript
// src/loaders/registry.js
const loaders = {
  gltf: () => import('./types/gltf.js'),
  glb: () => import('./types/gltf.js'),
  stl: () => import('./types/stl.js'),
  ply: () => import('./types/ply.js'),
  obj: () => import('./types/obj.js'),
  fbx: () => import('./types/fbx.js'),
  '3mf': () => import('./types/threeMF.js'),
  '3ds': () => import('./types/threeDS.js'),
  dae: () => import('./types/dae.js'),
  x3d: () => import('./types/x3d.js'),
  vrml: () => import('./types/vrml.js'),
  wrl: () => import('./types/vrml.js'),
}
```

#### Model Units

A scene unit is not always a millimetre. `src/utils/sourceUnits.js` says what it is for each format: metres for glTF, USD, COLLADA, IFC, X3D, VRML and dotbim, millimetres for STL, OBJ, PLY, OFF, 3DS, AMF, the OCCT CAD formats and G-code, and the file's own unit for Rhino (`modelUnitSystem`), 3MF (the `unit` attribute of `<model>`) and FBX (`UnitScaleFactor`, centimetres per unit; centimetres when absent). Loaders record a file's unit on the model (`userData.threeMFUnit`, `userData.unitScaleFactor`) and never rescale the scene for it, so framing and thumbnails are unaffected. Two loaders do rescale a model to fit the viewer: the FBX loader shrinks one larger than 50 units to 5, and the OBJ loader one larger than 1000 units to 1000. Each records its factor as `userData.viewerScale`, which is divided back out; a loader that adds such a rescale must record it the same way.

`ThreeViewer` calls `millimetresPerUnit(filename, root)` once per model load and hands the result to `useMeasurement.setModelScale`, `useModelStats.setModelScale` (with `millimetresPerFileUnit` too), the comparison table and the 3MF and USDZ exporters. Lengths scale by the factor, areas by its square and volumes by its cube; angles have no unit. Both unit pickers start in `defaultDisplayUnit(filename, root)`, the model's own unit, until the user picks one (`suggestUnit` versus `setUnit`); the pick lives in the composables, so it lasts as long as the `ThreeViewer` instance. In the 3D Viewer app that is until the page is reloaded: `App.vue` mounts one `ThreeViewer` (`key="three-viewer"`) and changes its `fileId` prop to open another model. It is not saved anywhere. The Files viewer (`ViewerComponent.vue`, via `ViewerWrapper.js`) has no measurement or statistics panels. "Generic Units" (`fileUnits: true` in `VIEWER_CONFIG.measurement.unitScales`) shows the file's own numbers: scene units with any `viewerScale` divided out. Shared notes and the annotations JSON store model-space points only, so they carry no unit and need no conversion.

### Data Flow

#### Model Loading Flow

```
1. User clicks 3D file
   ↓
2. FileAction triggers viewer
   ↓
3. ThreeViewer component mounts
   ↓
4. API request to /files endpoint
   ↓
5. File list returned
   ↓
6. User selects file
   ↓
7. API request to /file/{fileId}
   ↓
8. File stream begins
   ↓
9. Three.js loader processes data
   ↓
10. Model added to scene
    ↓
11. Camera positioned
    ↓
12. Grid updated
    ↓
13. Render loop starts
```

### Performance Architecture

#### Code Splitting

**Dynamic Imports:**
```javascript
// Lazy load Three.js loaders
const GLTFLoader = await import('three/examples/jsm/loaders/GLTFLoader');
const OBJLoader = await import('three/examples/jsm/loaders/OBJLoader');
const OrbitControls = await import('three/examples/jsm/controls/OrbitControls');
```

**Bundle Optimization:**
```javascript
// Vite configuration
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-loaders': ['three/examples/jsm/loaders'],
          'three-controls': ['three/examples/jsm/controls']
        }
      }
    }
  }
});
```

#### FreeCAD documents (`.fcstd`)

An FCStd file is a ZIP of `Document.xml`, `GuiDocument.xml` and one `.brp` B-Rep per shape. FreeCAD saves a shape for every feature, not only the result, so `fcstd.js` (`visibleShapeEntries`) draws only what FreeCAD shows:

- an object's `Shape` property in `Document.xml` names its file; other shape properties (`AddSubShape`, the tool a Pocket cut away, `SuppressedShape` and so on) are never drawn;
- an object is drawn when `GuiDocument.xml` does not save it hidden (`Visibility`), and neither does any container above it. A `PartDesign::Body`, an `App::Part` and an assembly hide their members (their `Group` links) without clearing the members' own flags, so a Body hidden after a Part Cut used it still has a tip flagged visible. A plain `App::DocumentObjectGroup` is not such a container: hiding one sets each member's flag;
- a Body in its default "Through" display mode draws nothing of its own (its shape is a copy of its tip); in "Tip" mode it draws its own shape and none of its members;
- everything is drawn, as before, when `GuiDocument.xml` is missing (FreeCADCmd saves none) or either document cannot be parsed, when nothing visible is in the archive, and when no visible shape can be tessellated.

The XML is read with the global `DOMParser`: the browser's on the page, the worker's own in the background (see the background thumbnails section). A document too long for the worker's parser fails the load rather than falling back to drawing everything.

#### Memory Management

**Resource Cleanup:**
```javascript
// Cleanup on component destroy
beforeDestroy() {
  // Dispose geometries
  this.scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) object.material.dispose();
  });
  
  // Dispose renderer
  this.renderer.dispose();
  
  // Remove event listeners
  this.controls.removeEventListener('change', this.onControlsChange);
}
```

## Format Parity Contract

Supported 3D format definitions are spread across five files. They **must** stay synchronized.

### Source files

| File | Role |
|------|------|
| `lib/Constants/SupportedFormats.php` | Backend single source of truth — extension-to-MIME map |
| `src/config/viewer-config.js` (`SUPPORTED_FORMATS`) | Frontend format metadata (name, MIME, features, icons) |
| `src/loaders/registry.js` | Maps each extension to its loader module |
| `src/main.js` (`SUPPORTED_MIMES`) | MIME types registered with the Nextcloud Viewer API |
| `appinfo/mimetypemapping.json` | Nextcloud's extension-to-MIME mapping for file detection |

### Rules

1. Every model extension in the PHP `EXT_MIME_MAP` must appear in `SUPPORTED_FORMATS`, `registry.js`, and `mimetypemapping.json`.
2. The primary MIME type for each extension must match across all files.
3. Every unique MIME type must be registered in `main.js` `SUPPORTED_MIMES` (except `application/octet-stream`, which is too generic).
4. Extra compatibility MIMEs (`application/sla` for STL, `model/x.ply` for PLY) may be added to `main.js` only.

### Automated enforcement

```bash
npm run format:check     # runs scripts/check-format-parity.mjs
```

This check runs in CI (`.github/workflows/node.yml`) before the build step and will fail the pipeline on any extension or MIME drift.

### Adding a new format

1. Add the extension and MIME type(s) to `SupportedFormats.php` `EXT_MIME_MAP`
2. Add the extension to `CONTENT_TYPE_MAP` in the same file
3. Add the format entry to `SUPPORTED_FORMATS` in `viewer-config.js`
4. Create or reuse a loader in `src/loaders/types/` and register it in `registry.js`
5. Add the primary MIME to `SUPPORTED_MIMES` in `main.js`
6. Add the extension to `appinfo/mimetypemapping.json`
7. Run `npm run format:check` to verify parity

## Performance Monitoring

### Overview

The ThreeDViewer includes a comprehensive performance monitoring and optimization system that automatically detects browser capabilities and adjusts rendering quality for optimal user experience.

### Key Features

- **🤖 Auto-Detection**: Automatically detects hardware capabilities and sets optimal quality
- **📊 Real-time Monitoring**: Live FPS, frame time, memory usage, draw calls, and triangle count
- **⚙️ Manual Control**: 5 quality presets (Low, Balanced, High, Ultra, Auto)
- **🎨 Visual Overlay**: Optional performance stats display (toggle with eye icon 👁️)
- **🔧 Smart Optimization**: Browser scoring system (0-100+) for quality recommendations

### Performance Modes

| Mode | Pixel Ratio | Shadows | Antialias | Target FPS | Use Case |
|------|-------------|---------|-----------|------------|----------|
| **Low** | 0.5x | ❌ | ❌ | 30 | Old hardware, mobile devices |
| **Balanced** | 1.0x | ✅ | ✅ | 60 | Mid-range systems |
| **High** | 1.5x | ✅ | ✅ | 60 | Good desktops (recommended) |
| **Ultra** | 2.0x | ✅ | ✅ | 120 | High-end gaming PCs |
| **Auto** | Detected | Detected | Detected | 60 | **Default** - Smart detection |

### Browser Capability Detection

#### Scoring System

The system scores your browser/hardware from 0-100+ based on:

| Capability | Points |
|------------|--------|
| WebGL 2.0 support | +20 |
| 16K texture support | +10 |
| 8K texture support | +15 |
| High-DPI display (2x+) | +15 |
| 8GB+ RAM | +20 |
| 4GB+ RAM | +10 |
| 8+ CPU cores | +15 |
| 4+ CPU cores | +10 |
| 2+ CPU cores | +5 |
| Mobile device | -20 |

#### Score Thresholds

| Score Range | Recommended Mode | Expected Performance |
|-------------|------------------|----------------------|
| 0-24 | Low | 30 FPS, basic quality |
| 25-54 | Balanced | 60 FPS, good quality |
| 55+ | High | 60 FPS, high quality (1.5x rendering) |

### Visual Performance Overlay

#### Enabling the Overlay

Click the **👁️ Eye Icon** button in the toolbar to toggle the performance stats panel.

#### Understanding the Stats

```
Performance    [HIGH]     ← Current mode badge
━━━━━━━━━━━━━━━━━━━━━━
FPS:        60           ← Frames per second (green if ≥60)
Frame:      16.6ms       ← Time per frame in milliseconds
Memory:     190.0MB      ← JavaScript heap memory usage
Quality:    1.50x        ← Current pixel ratio multiplier
Draws:      3            ← WebGL draw calls per frame
Triangles:  10.2K        ← Total triangles being rendered
```

**Color Indicators:**
- 🟢 **Green**: FPS ≥ 60 (excellent)
- 🟡 **Yellow**: FPS 30-59 (acceptable)
- 🔴 **Red**: FPS < 30 (poor)

### Integration Guide

#### For Developers

**1. Import the Composable:**
```javascript
import { usePerformance } from '../composables/usePerformance.js'
```

**2. Initialize in Component:**
```javascript
// In setup()
const performance = usePerformance()

// After renderer creation
performance.initPerformance(renderer.value)

// Set initial mode (auto recommended)
performance.setPerformanceMode('auto', renderer.value)
```

**3. Update in Animation Loop:**
```javascript
const animate = () => {
	requestAnimationFrame(animate)
	
	// Update performance metrics every frame
	performance.updatePerformanceMetrics(renderer.value, scene.value)
	
	// Your render code
	renderer.value.render(scene.value, camera.value)
}
```

## Multi-File Loading

### Overview

Implemented multi-file model loading support for OBJ+MTL+textures and GLTF+bins+images, adapted to work with our secure API architecture.

### What Was Implemented

#### Multi-File Helper Module (`src/loaders/multiFileHelpers.js`)

Created a comprehensive helper library for parsing and fetching multi-file 3D models:

**Core Functions:**
- **`fetchFileFromUrl(url, name, type)`**: Fetch files and convert to File objects
- **`parseObjMaterialFiles(objContent)`**: Extract MTL file references from OBJ
- **`parseMtlTextureFiles(mtlContent)`**: Extract texture references from MTL
- **`parseGltfDependencies(gltfJson)`**: Extract buffers and images from GLTF JSON
- **`fetchObjDependencies(...)`**: Fetch MTL files + textures for OBJ models
- **`fetchGltfDependencies(...)`**: Fetch bins + textures for GLTF models
- **`loadModelWithDependencies(...)`**: Main entry point for multi-file loading

**Key Features:**
- **Regex parsing** for material/texture references
- **Promise.allSettled** for robust error handling (graceful degradation)
- **Security**: All fetches go through our API endpoints
- **Logging**: Comprehensive console logging for debugging

#### Backend API Endpoint (`lib/Controller/ApiController.php`)

Added new endpoint for fetching files by path:

```php
#[ApiRoute(verb: 'GET', url: '/api/file/by-path')]
public function getFileByPath(string $path): FileDisplayResponse|DataResponse
```

**Purpose**: Fetch dependency files (MTL, textures) when only path is known (not file ID)

**Security**: 
- User authentication required
- Path normalized (no directory traversal)
- Read permission checks
- User folder scoped

**Usage**: `/apps/threedviewer/api/file/by-path?path=/models/texture.jpg`

### Multi-File Loading Flow

#### For OBJ Models:

```
1. Fetch model.obj via /api/file/{fileId}
2. Parse OBJ content for "mtllib material.mtl"
3. Fetch material.mtl via /api/file/by-path?path=/models/material.mtl
4. Parse MTL content for "map_Kd texture.jpg"
5. Fetch texture.jpg via /api/file/by-path?path=/models/texture.jpg
6. Pass all files to OBJLoader
```

#### For GLTF Models:

```
1. Fetch model.gltf via /api/file/{fileId}
2. Parse JSON for buffers[].uri and images[].uri
3. Fetch each dependency via /api/file/by-path
4. Pass all files to GLTFLoader
```

#### For GLB/STL/PLY (Single-File):

```
1. Fetch model via /api/file/{fileId}
2. Load directly (no dependencies)
```

### Security Model

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser                                                           │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ JavaScript can ONLY access:                                  │ │
│ │ - /api/file/{fileId}     (requires valid file ID)           │ │
│ │ - /api/file/by-path      (requires valid user path)         │ │
│ │                                                               │ │
│ │ ❌ Cannot access:                                             │ │
│ │ - Direct file paths                                          │ │
│ │ - Other users' files                                         │ │
│ │ - Files without read permission                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
└───────────┬──────────────────────────────────────────────────────┘
            │ HTTPS + Auth
            ▼
┌──────────────────────────────────────────────────────────────────┐
│ PHP Backend                                                       │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ For EVERY request:                                           │ │
│ │ 1. ✅ Check: User authenticated?                              │ │
│ │ 2. ✅ Normalize: Remove ../ and absolute paths               │ │
│ │ 3. ✅ Scope: Limit to user's folder                          │ │
│ │ 4. ✅ Check: File exists?                                     │ │
│ │ 5. ✅ Check: User has read permission?                        │ │
│ │ 6. ✅ Stream: Return file content                            │ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Composables API

### Overview

The ThreeDViewer composables provide reusable logic for Three.js scene management, camera controls, model loading, and mobile detection. They follow Vue 3 Composition API patterns but are compatible with Vue 2.7's backport.

**Architecture Philosophy:**
- **Composables manage state via refs** (scene, renderer, camera, etc.)
- **Methods mutate internal refs directly** (no readonly wrappers)
- **Consumers access refs via `.value`** in Composition API context
- **Options API auto-unwraps refs** (avoid `.value` there)

### Core Concepts

#### Refs vs Readonly

**After refactoring (current state):**
```javascript
// ✅ Correct: Direct ref export (mutable and reactive)
return {
  scene,       // ref<THREE.Scene>
  renderer,    // ref<THREE.WebGLRenderer>
  initScene,   // (container, options) => void
}
```

**Before refactoring (removed):**
```javascript
// ❌ Old: readonly() wrappers froze refs at initialization
return {
  scene: readonly(scene),       // Frozen at null!
  renderer: readonly(renderer), // Never updates!
}
```

#### Auto-unwrapping in Options API

Vue 2.7's Options API **automatically unwraps refs** in `data()`, `computed`, and template contexts:

```javascript
// Composition API (<script setup>)
const { scene, renderer } = useScene()
console.log(scene.value)       // ✅ Access via .value
console.log(renderer.value)    // ✅ Access via .value

// Options API (data/computed)
data() {
  return {
    sceneManager: useScene()
  }
},
computed: {
  sceneChildren() {
    return this.sceneManager.scene.children  // ✅ Auto-unwrapped (no .value)
  }
}
```

**Rule of thumb:**
- **Composition API**: Always use `.value`
- **Options API**: Never use `.value` (auto-unwrapped)

### Composables

#### useScene

**Purpose:** Manages Three.js scene, renderer, lighting, and helpers.

**API:**
```javascript
const {
  // State refs
  scene,              // ref<THREE.Scene>
  renderer,           // ref<THREE.WebGLRenderer>
  backgroundColor,    // ref<string>
  fog,                // ref<THREE.Fog | null>
  grid,               // ref<THREE.GridHelper | null>
  axes,               // ref<THREE.AxesHelper | null>
  lights,             // ref<{ ambient, directional, hemisphere }>
  helpers,            // ref<{ directional }>
  
  // Methods
  initScene,          // (container, options) => void
  setupLighting,      // (options) => void
  updateLighting,     // (options) => void
  setupHelpers,       // (options) => void
  toggleGrid,         // () => void
  toggleAxes,         // () => void
  setBackgroundColor, // (color) => void
  enableFog,          // (near, far) => void
  disableFog,         // () => void
  addObject,          // (object) => void
  removeObject,       // (object) => void
  clearScene,         // () => void
  render,             // (camera) => void
  handleResize,       // (width, height) => void
  dispose,            // () => void
} = useScene()
```

#### useCamera

**Purpose:** Manages camera and OrbitControls.

**API:**
```javascript
const {
  // State refs
  camera,        // ref<THREE.PerspectiveCamera>
  controls,      // ref<OrbitControls | null>
  isAnimating,   // ref<boolean>
  autoRotate,    // ref<boolean>
  
  // Methods
  initCamera,    // (container, options) => void
  fitCameraToObject, // (object, offset = 1.5) => void
  resetCamera,   // () => void
  startAnimation, // () => void
  stopAnimation,  // () => void
  toggleAutoRotate, // () => void
  updateControls, // (deltaTime) => void
  dispose,        // () => void
} = useCamera()
```

#### useModelLoading

**Purpose:** Load 3D models with automatic format detection and multi-file support.

**API:**
```javascript
const {
  // State refs
  isLoading,          // ref<boolean>
  loadedModel,        // ref<THREE.Object3D | null>
  loadProgress,       // ref<number> (0-100)
  loadError,          // ref<string | null>
  currentFormat,      // ref<string | null>
  
  // Methods
  loadModel,          // (url, format?) => Promise<THREE.Object3D>
  loadModelFromFileId, // (fileId, filename, context) => Promise<THREE.Object3D>
  loadModelWithDependencies, // (primaryUrl, dependencyUrls, format?) => Promise
  unloadModel,        // () => void
  getSupportedFormats, // () => string[]
} = useModelLoading()
```

#### useMobile

**Purpose:** Detect mobile devices and adjust UI/controls.

**API:**
```javascript
const {
  // State refs
  isMobile,       // ref<boolean>
  isTablet,       // ref<boolean>
  isPortrait,     // ref<boolean>
  screenSize,     // ref<{ width, height }>
  touchEnabled,   // ref<boolean>
  
  // Methods
  checkMobile,    // () => void (auto-runs on mount)
  handleResize,   // () => void (updates on resize)
} = useMobile()
```

#### useController

**Purpose:** Manage the 3D camera controller widget and navigation.

**API:**
```javascript
const {
  // State refs
  controllerVisible,    // ref<boolean>
  controllerPosition,   // ref<{ x, y }>
  controllerSize,       // ref<number>
  snapViews,           // ref<boolean>
  
  // Methods
  toggleController,     // () => void
  setControllerPosition, // (x, y) => void
  snapToView,          // (viewName) => void
  savePreferences,     // () => void
  loadPreferences,     // () => void
} = useController()
```

#### useExport

**Purpose:** Export 3D models in various formats (GLB, STL, OBJ).

**API:**
```javascript
const {
  // State refs
  isExporting,         // ref<boolean>
  exportProgress,      // ref<number>
  exportFormat,        // ref<string>
  exportError,         // ref<string | null>
  
  // Methods
  exportModel,         // (format, options) => Promise<Blob>
  getSupportedFormats, // () => string[]
  validateExport,      // (model) => boolean
} = useExport()
```

#### useFaceLabels

**Purpose:** Display orientation markers on model faces.

**API:**
```javascript
const {
  // State refs
  labelsEnabled,       // ref<boolean>
  labels,             // ref<Array>
  labelRenderer,      // ref<CSS2DRenderer>
  
  // Methods
  addFaceLabels,      // (model, scene) => void
  clearLabels,        // (scene) => void
  toggleLabels,       // (model, scene) => void
  initLabelRenderer,  // (container, width, height) => void
  renderLabels,       // (scene, camera) => void
  dispose,            // () => void
} = useFaceLabels()
```

#### useModelStats

**Purpose:** Display detailed statistics about loaded models.

**API:**
```javascript
const {
  // State refs
  modelStats,         // ref<Object>
  statsVisible,       // ref<boolean>
  
  // Methods
  calculateStats,     // (model) => Object
  toggleStats,        // () => void
  getModelInfo,       // () => Object
} = useModelStats()
```

#### useProgressiveTextures

**Purpose:** Load textures progressively for better performance.

**API:**
```javascript
const {
  // State refs
  isProgressiveLoading, // ref<boolean>
  textureProgress,      // ref<number>
  loadedTextures,       // ref<number>
  totalTextures,        // ref<number>
  
  // Methods
  loadTexturesProgressive, // (textures) => Promise<void>
  pauseLoading,           // () => void
  resumeLoading,          // () => void
  cancelLoading,          // () => void
} = useProgressiveTextures()
```

#### useTheme

**Purpose:** Manage theme switching and RTL support.

**API:**
```javascript
const {
  // State refs
  currentTheme,        // ref<string>
  isRTL,              // ref<boolean>
  customColors,       // ref<Object>
  
  // Methods
  setTheme,           // (theme) => void
  toggleRTL,          // () => void
  setCustomColor,     // (key, color) => void
  resetTheme,         // () => void
} = useTheme()
```

### Usage Patterns

#### Pattern 1: Composition API (Recommended)

**✅ Use in `<script setup>` components:**

```vue
<script setup>
import { onMounted, ref, watch } from 'vue'
import useScene from '@/composables/useScene'
import useCamera from '@/composables/useCamera'

const container = ref(null)
const { scene, renderer, initScene } = useScene()
const { camera, initCamera } = useCamera()

onMounted(() => {
  // Always access via .value in Composition API
  initScene(container.value, { backgroundColor: '#263238' })
  initCamera(container.value, { position: { x: 10, y: 10, z: 10 } })
  
  console.log('Scene children:', scene.value.children)    // ✅
  console.log('Camera position:', camera.value.position)  // ✅
})

watch(() => scene.value?.children.length, (count) => {
  console.log('Scene now has', count, 'children')
})
</script>

<template>
  <div ref="container" class="viewer"></div>
</template>
```

#### Pattern 2: Options API (Advanced)

**⚠️ Only use if necessary (see ViewerComponent.vue for example):**

```vue
<script>
import useScene from '@/composables/useScene'
import useCamera from '@/composables/useCamera'

export default {
  name: 'MyViewer',
  
  data() {
    return {
      // Store composable instances (refs auto-unwrap here!)
      sceneManager: useScene(),
      cameraManager: useCamera()
    }
  },
  
  computed: {
    sceneChildren() {
      // ✅ No .value (auto-unwrapped in Options API)
      return this.sceneManager.scene?.children || []
    },
    
    cameraPosition() {
      // ✅ No .value (auto-unwrapped)
      return this.cameraManager.camera?.position
    }
  },
  
  mounted() {
    // Initialize composables
    this.sceneManager.initScene(this.$refs.container, {
      backgroundColor: '#263238'
    })
    this.cameraManager.initCamera(this.$refs.container)
    
    // ✅ Access refs WITHOUT .value in Options API
    console.log('Scene:', this.sceneManager.scene)
    console.log('Renderer:', this.sceneManager.renderer)
  }
}
</script>
```

## Lazy Loading Implementation

### Problem Statement

When opening a 3D model file in the Nextcloud Viewer, the app was **loading ALL 3D models in the directory simultaneously**, causing:

1. **Performance Issues**
   - Multiple ViewerComponent instances mounted at once
   - Heavy CPU/GPU usage from loading multiple large 3D files
   - Excessive network bandwidth consumption
   - Browser slowdown/freezing

2. **Poor User Experience**
   - Long initial load time
   - Unnecessary resource usage for files the user might never view
   - Console flooded with loading messages

### Solution: Lazy Loading with Activation Pattern

Implemented a **wait-for-activation** pattern where:

1. ✅ **Component mounts but doesn't load** - Waits for explicit activation signal
2. ✅ **Viewer activates only the visible instance** - Calls `update()` method on active file
3. ✅ **Load cancellation support** - Can abort loading if user navigates away
4. ✅ **Gallery navigation ready** - Infrastructure for preloading adjacent files

### Implementation Details

#### Added Activation State Tracking

```javascript
data() {
	return {
		// ... existing state
		isActive: false,        // Track if this instance is the active one
		hasLoaded: false,       // Track if model has been loaded
		loadingCancelled: false, // Flag to cancel ongoing loads
	}
}
```

#### Modified `mounted()` Hook

**Before (Eager Loading):**
```javascript
mounted() {
	console.info('[ThreeDViewer] ViewerComponent mounted', {...})
	
	// ❌ Immediately start loading
	this.$emit('update:loaded', false)
	this.initViewer()
}
```

**After (Lazy Loading):**
```javascript
mounted() {
	console.info('[ThreeDViewer] ViewerComponent mounted', {...})
	
	// ✅ Don't auto-load - wait for explicit activation from Viewer
	this.isActive = false
	console.debug('[ThreeDViewer] Instance created, waiting for activation signal from Viewer')
	
	// The Viewer app will call update() on the active instance
	// No fallback timeout - we trust the Viewer API
}
```

#### Added `update()` Method (Viewer API Contract)

```javascript
/**
 * Called by Viewer app when this file becomes active/visible
 * This is when we should actually load the model
 */
update() {
	if (!this.isActive) {
		console.info('[ThreeDViewer] Instance activated, starting load:', this.filename)
		this.isActive = true
		this.loadingCancelled = false
		
		// Signal that we're handling loading
		this.$emit('update:loaded', false)
		
		// Start loading this file
		this.initViewer()
	}
}
```

### Performance Impact

#### Before (Eager Loading):
| Metric | Value |
|--------|-------|
| **Initial Load Time** | 5-10 seconds (all files) |
| **Network Usage** | 10-50+ MB (all files) |
| **CPU/GPU Usage** | High (all files parsing) |
| **Memory** | High (all models in RAM) |
| **Instances Loading** | N (all files) |

#### After (Lazy Loading):
| Metric | Value |
|--------|-------|
| **Initial Load Time** | 1-3 seconds (one file) |
| **Network Usage** | 1-10 MB (one file) |
| **CPU/GPU Usage** | Normal (one file parsing) |
| **Memory** | Normal (one model in RAM) |
| **Instances Loading** | 1 (active file only) |

**Performance Improvement:**
- ⚡ **5-10x faster initial load**
- 📉 **90% less network usage**
- 🎯 **99% less wasted resources**
- 💾 **90% less memory usage**

## Model Loading Implementation

### Overview

Implemented real 3D model loading to replace placeholder cubes in both viewer modes. The system uses the FileController API endpoint to securely stream model files and the loader registry to dynamically load format-specific parsers.

### Architecture

#### Data Flow

```
User clicks file
    ↓
Nextcloud Viewer API (Mode 1) OR Direct URL (Mode 2)
    ↓
ViewerComponent.vue OR ThreeViewer.vue
    ↓
Fetch from /apps/threedviewer/file/{fileId}
    ↓
FileController::serveFile() validates permissions
    ↓
Stream file content with proper MIME type
    ↓
ArrayBuffer received by viewer
    ↓
Loader Registry selects format-specific loader
    ↓
Dynamic import of loader module (code-splitting)
    ↓
Loader parses ArrayBuffer → Three.js Object3D
    ↓
Object added to scene, camera auto-fitted
```

#### Security

**FileController Validation Flow:**
1. Check user authentication
2. Resolve file by ID from user's folder
3. Validate file exists and is a file (not folder)
4. Check file extension is supported (ModelFileSupport)
5. Verify file size is acceptable (< 500 MB)
6. Log access for audit
7. Stream file with correct MIME type

**Key Security Features:**
- ✅ No direct filesystem access from frontend
- ✅ Permission checks via Nextcloud IRootFolder/IUserSession
- ✅ File ID validation (user can only access their own files)
- ✅ Extension whitelist (only registered 3D formats)
- ✅ File size limits
- ✅ Access logging

### Loader Registry

**Format Definitions - Single Source of Truth:**

All 3D model format definitions are centralized in `lib/Constants/SupportedFormats.php` to ensure consistency across the application:

- **Backend PHP**: `lib/Constants/SupportedFormats.php`
  - `EXT_MIME_MAP`: Extension to MIME type mappings for registration
  - `CONTENT_TYPE_MAP`: Extension to content type for file streaming
  - Used by `ModelFileSupport`, `RegisterThreeDMimeTypes`, `UnregisterThreeDMimeTypes`

- **Frontend JavaScript**: `src/config/viewer-config.js`
  - `SUPPORTED_FORMATS`: Format metadata with display names, features, icons
  - Derives `MODEL_EXTENSIONS`, `MULTI_FILE_FORMATS`, `FORMATS_DISPLAY_LIST`

- **Nextcloud Registration**: `appinfo/mimetypemapping.json`
  - Maps extensions to MIME types for Nextcloud's file system

**Supported Formats:**
- **GLTF/GLB**: glb, gltf → `types/gltf.js` (model/gltf-binary, model/gltf+json)
- **Wavefront**: obj → `types/obj.js` (model/obj)
- **STL**: stl → `types/stl.js` (model/stl)
- **PLY**: ply → `types/ply.js` (model/ply)
- **COLLADA**: dae → `types/dae.js` (model/vnd.collada+xml)
- **FBX**: fbx → `types/fbx.js` (model/x.fbx)
- **3MF**: 3mf → `types/threeMF.js` (model/3mf)
- **3DS**: 3ds → `types/threeDS.js` (application/x-3ds)
- **X3D**: x3d → `types/x3d.js` (model/x3d+xml)
- **VRML**: vrml, wrl → `types/vrml.js` (model/vrml)

**Adding a New Format:**

1. Update `lib/Constants/SupportedFormats.php`:
   ```php
   public const EXT_MIME_MAP = [
       'newext' => ['model/newext'],  // Add MIME mapping
   ];
   
   public const CONTENT_TYPE_MAP = [
       'newext' => 'model/newext',    // Add content type
   ];
   ```

2. Update `appinfo/mimetypemapping.json`:
   ```json
   {
     "mappings": {
       "newext": "model/newext"
     }
   }
   ```

3. Update `src/config/viewer-config.js`:
   ```javascript
   export const SUPPORTED_FORMATS = {
       newext: {
           name: 'NEWEXT',
           description: 'New Format Description',
           mimeType: 'model/newext',
           features: ['materials'],
           multiFile: false,
           displayOrder: 13,
           icon: '/apps/threedviewer/img/filetypes/newext.svg',
       },
   }
   ```

4. Create loader in `src/loaders/types/newext.js`

5. Run unit tests to verify synchronization:
   ```bash
   vendor/bin/phpunit tests/unit/Service/FormatSyncTest.php
   ```

6. Run repair step to register MIME types:
   ```bash
   php occ maintenance:repair
   ```

**Dynamic Import (code-splitting):**
```javascript
const loaders = {
    gltf: () => import('./types/gltf.js'),
    glb: () => import('./types/gltf.js'),
    // ... etc
}

export async function loadModelByExtension(ext, arrayBuffer, context) {
    const importer = loaders[ext]
    if (importer) {
        const mod = await importer() // Dynamic import!
        const LoaderClass = mod.default || ...
        const loaderInstance = new LoaderClass()
        return loaderInstance.loadModel(arrayBuffer, context)
    }
    throw new Error(`No loader found for extension ${ext}`)
}
```

**Benefits:**
- Only loads needed loaders (smaller initial bundle)
- Lazy loading on first use of each format
- Extensible (easy to add new formats)

## Dependency Caching System

### Overview

The 3D Viewer implements an IndexedDB-based caching system for multi-file model dependencies (MTL files, textures, binary data) to improve loading performance and reduce network requests.

### Architecture

#### Cache Storage
- **Storage Backend**: IndexedDB for persistent client-side storage
- **Cache Key**: File path + modification time for cache invalidation
- **Storage Limits**: Configurable size limits with LRU eviction
- **Expiration**: Automatic cleanup of expired entries

#### Cache Operations
```javascript
// Cache initialization
import { initCache, clearExpired, clearAll, getCacheStats } from '../utils/dependencyCache.js'

// Initialize cache with size limits
await initCache({
  maxSize: 100 * 1024 * 1024, // 100MB
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
})

// Cache operations
const cached = await getCachedFile(path, mtime)
if (cached) {
  return cached.data
}

// Store in cache after fetch
await setCachedFile(path, mtime, data)
```

### Integration with Multi-File Loading

The caching system integrates seamlessly with the multi-file loading architecture:

1. **Check Cache**: Before fetching dependencies, check if cached version exists
2. **Cache Hit**: Use cached data if available and not expired
3. **Cache Miss**: Fetch from server and store in cache
4. **Cache Update**: Update cache when files are modified

### User Configuration

Cache behavior is configurable via **Personal Settings → 3D Viewer → Dependency Cache**:

| Setting | Default | Description |
|---------|---------|-------------|
| Enable Cache | `true` | Master toggle for the caching system |
| Max Cache Size | `100 MB` | Total size limit; oldest entries are evicted (LRU) when exceeded |
| Max File Size | `10 MB` | Individual files larger than this are not cached |
| Expiration | `7 days` | Entries older than this are automatically removed |

Settings are stored server-side per user and applied when the viewer loads.

### Performance Benefits

- **Faster Loading**: Subsequent loads of the same model are significantly faster
- **Reduced Bandwidth**: Avoid re-downloading unchanged dependencies
- **Offline Support**: Cached files available when offline
- **Smart Invalidation**: Automatic cache updates when files change

### Privacy Considerations

- **Local-only storage**: All cached data is stored in the browser's IndexedDB. No cache data is sent to the server or shared with other users.
- **Per-browser**: The cache is tied to the specific browser profile. Different browsers or devices maintain independent caches.
- **User-controlled**: Users can clear the cache at any time from Personal Settings or from the viewer's Settings panel.
- **No sensitive data**: Only model dependency files (textures, materials, binary geometry) are cached — never credentials, tokens, or user metadata.
- **Automatic cleanup**: Expired entries are removed on every viewer initialization.

## Slicer Temporary Files — Security Posture

The "Send to Slicer" feature creates temporary public share links so desktop slicer applications can download exported models. This section documents the security controls in place.

### Threat model

An exported file is stored in the user's Nextcloud storage (`.3dviewer_temp/`) and a read-only public share link is created. The link is passed to the slicer via a URL scheme. The main risks are: unauthorized access to the file, path traversal, resource exhaustion, and stale shares.

### Controls

| Layer | Control | Implementation |
|-------|---------|----------------|
| **Authentication** | All API endpoints require a logged-in user | `IUserSession` check; returns 401 if absent |
| **Path traversal** | Filename sanitized with `basename()` + regex whitelist | `preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', ...)` |
| **Path containment** | Files verified inside `.3dviewer_temp/` before access | `str_starts_with($filePath, $tempFolderPath . '/')` |
| **Extension allowlist** | Only slicer-relevant formats accepted | `stl, obj, ply, gcode, gco, nc, g, gx, 3mf, amf` |
| **MIME validation** | `finfo` sniffs actual content; heuristics for STL/G-code | Rejects files that don't match expected content |
| **Per-file size limit** | 50 MB hard cap | Checked via Content-Length header and actual data length |
| **Folder quota** | 200 MB rolling cap per user | Enforced before each upload |
| **Share permissions** | Read-only public link | `Constants::PERMISSION_READ` only |
| **Share expiry** | 24 hours, enforced by Nextcloud share system | `setExpirationDate('+1 day')` |
| **File expiry** | 24 hours, checked on every access and upload | Files older than `MAX_TEMP_FILE_AGE` are deleted |
| **Background cleanup** | Cron job every 6 hours | `CleanupTempFiles` deletes expired files + shares |
| **Frontend cleanup** | Auto-delete after 2 minutes on successful send | `setTimeout(() => fetch(DELETE), 120000)` |
| **Unique filenames** | Timestamp prefix prevents collision | `time() . '_' . $filename` |
| **Logging** | All operations logged with user, size, MIME, errors | Via `LoggerInterface` |

### File lifecycle

```
Upload (POST /api/slicer/temp)
  → Authenticate → Size check → MIME/extension validate
  → Sanitize filename → Check folder quota → Save file
  → Create read-only share (24h expiry) → Return download URL

Access (GET /api/slicer/temp/{fileId})
  → Authenticate → Verify file in temp folder → Check 24h age
  → Return file with no-cache headers

Delete (DELETE /api/slicer/temp/{fileId})
  → Authenticate → Verify file in temp folder → Delete shares → Delete file

Cleanup (cron, every 6h)
  → For each user → Scan .3dviewer_temp/ → Delete files > 24h old + their shares
```

### CORS

The download endpoint returns `Access-Control-Allow-Origin: *` intentionally, because desktop slicer applications fetch files via HTTP from arbitrary origins. Share tokens are cryptographically random and not guessable.

## KTX2 Texture Compression Support

### Overview

The viewer supports KTX2/Basis Universal texture compression for improved performance and reduced bandwidth usage.

### Implementation

#### Decoder Integration
- **Basis Transcoder**: `basis_transcoder.js` and `basis_transcoder.wasm`
- **Auto-Detection**: Automatically detects KTX2 support at runtime
- **Fallback**: Graceful degradation when KTX2 not available
- **Dynamic Loading**: Transcoder loaded only when needed

#### Build Integration
```javascript
// Build script copies transcoder files
// scripts/copy-decoders.mjs
const basisFiles = [
  'basis_transcoder.js',
  'basis_transcoder.wasm'
]

// Runtime detection
const hasKTX2Support = await detectKTX2Support()
if (hasKTX2Support) {
  const KTX2Loader = await import('three/examples/jsm/loaders/KTX2Loader')
  gltfLoader.setKTX2Loader(KTX2Loader.KTX2Loader)
}
```

### Benefits

- **Smaller Files**: Up to 90% reduction in texture size
- **Faster Loading**: Reduced bandwidth and faster texture uploads
- **Better Quality**: GPU-optimized texture formats
- **Wide Support**: Works across different devices and browsers

## Advanced Viewer Wiring

### Overview

Successfully implemented **TODO #2**: Wire up the advanced viewer (App.vue) to load at a dedicated URL endpoint using a RESTful routing pattern.

### Implementation Summary

#### URL Patterns

**Primary Route (RESTful):**
- **Pattern**: `/apps/threedviewer/f/{fileId}`
- **Example**: `/apps/threedviewer/f/123`
- **Benefits**: Clean RESTful pattern, SEO-friendly, direct file access
- **Note**: Uses `/f/` prefix to avoid conflicts with static assets

**Query Parameter Fallback:**
- **Pattern**: `/apps/threedviewer/?fileId={fileId}&filename={name}&dir={path}`
- **Example**: `/apps/threedviewer/?fileId=123&filename=model.glb&dir=/models`
- **Benefits**: Flexible, supports legacy links, easy to construct programmatically

**Index Route:**
- **Pattern**: `/apps/threedviewer/`
- **Example**: `/apps/threedviewer/`
- **Benefits**: Shows file browser, allows navigation without specific file

#### Backend Changes

**PageController Implementation:**
```php
#[FrontpageRoute(verb: 'GET', url: '/f/{fileId}')]
public function viewer(string $fileId): TemplateResponse {
    $user = $this->userSession?->getUser();
    
    // Fetch file information to get filename and directory
    $filename = null;
    $dir = null;
    if ($user) {
        $userFolder = $this->rootFolder->getUserFolder($user->getUID());
        $files = $userFolder->getById((int)$fileId);
        if (!empty($files) && $files[0] instanceof \OCP\Files\File) {
            $file = $files[0];
            $filename = $file->getName();
            // Extract directory path from file path
            // ... (directory extraction logic)
        }
    }
    
    return new TemplateResponse(
        Application::APP_ID,
        'index',
        [
            'fileId' => $fileId,
            'filename' => $filename,
            'dir' => $dir,
        ]
    );
}
```

#### Frontend Changes

**Template Implementation:**
```html
<div id="threedviewer" 
     data-file-id="<?php p($_['fileId'] ?? ''); ?>" 
     data-filename="<?php p($_['filename'] ?? ''); ?>"
     data-dir="<?php p($_['dir'] ?? $_GET['dir'] ?? ''); ?>"></div>
```

**Main.js Implementation:**
```javascript
// Mode 2: Mount advanced viewer app when #threedviewer div exists (standalone page)
const appRoot = document.getElementById('threedviewer')
if (appRoot) {
    const fileId = appRoot.dataset.fileId
    const filename = appRoot.dataset.filename
    const dir = appRoot.dataset.dir

    // Dynamically import Vue and App component
    Promise.all([
        import('vue'),
        import('./App.vue'),
    ]).then(([{ default: Vue }, { default: App }]) => {
        new Vue({
            el: '#threedviewer',
            render: h => h(App, {
                props: {
                    fileId: fileId || null,
                    filename: filename || null,
                    dir: dir || null,
                },
            }),
        })
    }).catch(err => {
        console.error('Failed to mount advanced viewer:', err)
    })
}
```

**App.vue Props Declaration:**
```javascript
export default {
    props: {
        fileId: { type: [Number, String], default: null },
        filename: { type: String, default: null },
        dir: { type: String, default: null },
    },
    data() {
        // Prefer props if provided, otherwise parse from DOM/query params
        const initialFileId = this.fileId || this.parseFileId() || null
        const initialFilename = this.filename || this.parseFilename()
        const initialDir = this.dir || this.parseDir()
        return {
            fileId: initialFileId,
            filename: initialFilename,
            dir: initialDir,
            // ... other data properties
        }
    },
    mounted() {
        // If props weren't provided, try parsing from DOM now that it's ready
        if (!this.fileId) {
            const parsedFileId = this.parseFileId()
            if (parsedFileId) this.fileId = parsedFileId
        }
        // Similar for filename and dir...
    }
}
```

### Dual-Mode Architecture

The 3D Viewer supports two distinct modes of operation, each optimized for different use cases:

#### Mode 1: Simple Viewer (Viewer API / Modal Mode)
- **Entry Point**: Click file in Files app → Nextcloud Viewer API modal
- **Component**: `ViewerComponent.vue`
- **URL Pattern**: Handled by Nextcloud Viewer API (no direct URL)
- **Features**: 
  - Quick preview of 3D models
  - Basic camera controls
  - Lightweight and fast loading
  - Modal overlay interface
- **Status**: ✅ Fully functional
- **Use Case**: Quick preview when browsing files

#### Mode 2: Advanced Viewer (Standalone App Mode)
- **Entry Point**: Direct URL access
- **Component**: `App.vue` + full component ecosystem
- **URL Patterns**:
  - `/apps/threedviewer/f/{fileId}` - RESTful route with fileId in path
  - `/apps/threedviewer/?fileId={fileId}&filename={name}&dir={path}` - Query parameter fallback
- **Features**: 
  - Full-featured 3D viewer with all tools
  - File browser and navigation
  - Annotations and measurements
  - Model comparison
  - Performance monitoring
  - Export functionality
  - Slicer integration
  - Settings and preferences
- **Status**: ✅ Fully functional with complete model loading
- **Use Case**: Detailed viewing, analysis, and editing of 3D models

### Viewer Lifecycle

#### Initialization Flow

```
1. User accesses URL
   ├─ /apps/threedviewer/f/{fileId} → PageController::viewer()
   └─ /apps/threedviewer/ → PageController::index()

2. Backend Processing
   ├─ PageController extracts fileId from route
   ├─ Fetches file metadata (filename, directory path)
   └─ Passes data to template via $_ array

3. Template Rendering
   ├─ templates/index.php renders <div id="threedviewer">
   ├─ Sets data attributes: data-file-id, data-filename, data-dir
   └─ Loads main.js script

4. Frontend Mounting (main.js)
   ├─ Detects #threedviewer element
   ├─ Extracts data attributes
   ├─ Dynamically imports Vue and App.vue
   └─ Mounts App component with props

5. App.vue Initialization
   ├─ Receives props (fileId, filename, dir)
   ├─ Falls back to DOM parsing if props missing
   ├─ Loads user preferences
   └─ Initializes ThreeViewer component

6. Model Loading
   ├─ ThreeViewer receives fileId prop
   ├─ Watches for fileId changes
   ├─ Calls useModelLoading composable
   ├─ Fetches file from /apps/threedviewer/api/file/{fileId}
   └─ Loads model using appropriate format loader

7. Rendering
   ├─ Model parsed and added to Three.js scene
   ├─ Camera positioned to fit model
   ├─ Grid and axes displayed
   └─ User can interact with model
```

#### Data Flow

```
Backend (PHP)
  PageController::viewer()
    ↓
  Fetches file info from IRootFolder
    ↓
  Template (index.php)
    ↓
  Sets data attributes on #threedviewer div
    ↓
Frontend (JavaScript)
  main.js extracts data attributes
    ↓
  Passes as props to App.vue
    ↓
  App.vue receives props (preferred) or parses DOM (fallback)
    ↓
  Passes fileId to ThreeViewer component
    ↓
  ThreeViewer watches fileId prop
    ↓
  useModelLoading composable fetches and loads model
    ↓
  Model rendered in Three.js scene
```

### What's Ready

#### Backend Infrastructure ✅
- RESTful routing in PageController
- Template data injection
- MIME type registration (10 formats)
- Model file validation service

#### Frontend Infrastructure ✅
- Dual-mode mounting logic in main.js
- App.vue accepts props from main.js (preferred) with DOM parsing fallback
- Props properly declared and passed through component chain
- Complete component ecosystem:
  - ThreeViewer.vue (main 3D renderer)
  - MinimalTopBar.vue (top toolbar)
  - SlideOutToolPanel.vue (side panel with all controls)
  - ToastContainer.vue (notifications)
  - FileBrowser.vue (file navigation)
  - FileNavigation.vue (navigation sidebar)

#### Loader System ✅
- BaseLoader.js (base class)
- registry.js (dynamic loader selection)
- Format-specific loaders: gltf, obj, stl, ply, dae, fbx, 3mf, 3ds, vrml, x3d
- Multi-file support with dependency resolution
- Flexible texture matching for naming variations

#### Error Handling ✅
- User-friendly error messages for common scenarios (404, 403, 401, network errors)
- Error toasts with appropriate timeout durations
- Graceful fallback when file lookup fails
- Comprehensive error logging for debugging
- DRACO/KTX2 decoder assets in place

#### State Management ✅
- useAnnotation.js
- useCamera.js
- useComparison.js
- useMeasurement.js
- useMobile.js
- useModelLoading.js
- usePerformance.js
- useScene.js
- useUI.js

## Internationalization (i18n)

All user-visible strings must be wrapped in `t('threedviewer', '...')`. The translation baseline is `l10n/en.json`.

### Checklist for new strings

1. Wrap the string: `t('threedviewer', 'Your text here')`
2. For variables use `{key}` placeholders: `t('threedviewer', '{count} items', { count: 5 })`
3. Add the key to `l10n/en.json` in the `translations` object
4. Import: use `import { translate as t } from '@nextcloud/l10n'` in `<script setup>` or composables; use global `t` in Options API components via `app.config.globalProperties`
5. Avoid: `OC.L10N.translate` (legacy pattern, only in PersonalSettings.vue)

### Translation files

| File | Purpose |
|------|---------|
| `l10n/en.json` | English baseline (source of truth) |
| `l10n/ar.json` | Arabic |
| `l10n/de.json` | German |
| `l10n/es.json` | Spanish |

Translations are maintained manually. There is no automated extraction tool — when adding new `t()` calls, always update `l10n/en.json`.

---

## Viewer Integration and Decoders

### Viewer Integration (Three.js)

The in-browser 3D viewer is implemented with Vue 2 + Three.js with lazy-loaded official loaders.

**Supported formats (frontend & backend end-to-end):** `glb`, `gltf`, `obj` (+ `.mtl`), `stl`, `ply`, `fbx`, `3mf`, `3ds`, `dae`, `x3d`, `vrml`, `wrl`.

#### Key Implementation Points

- **Dynamic imports:** Individual Three.js loaders (`GLTFLoader`, `OBJLoader`, `MTLLoader`, `STLLoader`, `PLYLoader`, `FBXLoader`) are code-split so they only load when a matching extension is requested.

- **OBJ + MTL + textures:** After streaming an OBJ, the viewer parses its `mtllib` directive, fetches the material, then parses that material for `map_*`/`bump`/`refl` references and fetches those too. Signed in, each name is resolved to a file id through the file-listing API; on a public share that API needs a session, so the names go to `/public/file/{token}/{fileId}/dep/{name}` and the server resolves them against the model's own declarations. Missing or refused dependencies degrade to untextured materials rather than failing the model.

- **Texture URLs that match no companion:** a model names its textures with any URL it likes. Every loader that loads textures through a three.js loading manager (DAE, 3DS, FBX, OBJ/MTL, glTF, VRML) maps a request to a fetched companion by name; one that matches none never reaches the browser. `unmatchedResourceUrl()` in `BaseLoader.js` keeps the `data:` and `blob:` URLs loaders make themselves, hands anything else to three's default manager, which in the thumbnail worker carries the worker's resolver (it maps a handed file or records a refusal that fails the job), and on the page, where that manager has no resolver, returns a 1×1 white placeholder that requests nothing. So an `https://` texture, or a UNC path a browser would read as `http://host/…`, cannot make the viewer's browser contact another host, whatever the page's Content Security Policy allows. FBX keeps its own 1×1 placeholder, and the X3D loader only ever loads the companions it was handed. Decoders load their assets through their own loaders and are not affected. A glTF image in KTX2 (`KHR_texture_basisu`) goes through the KTX2 loader's own manager, which also loads the Basis transcoder from the app: that manager leaves URLs under the transcoder path alone and sends every other one through the glTF manager, so a KTX2 image URI is mapped or not requested like any other.

- **Camera framing:** On initial model load, the scene bounding box is computed and the camera + orbit controls are adjusted to frame the model (with a small margin) and set a sensible near/far range.

- **Wireframe & helpers:** Toolbar hooks are scaffolded for grid, axes, reset, wireframe. Wireframe goes through `setViewerWireframe` (`src/utils/viewerMaterialProps.js`), which sets each mesh's own materials' `wireframe` flag through the registry a thumbnail reads (see the Thumbnail Generation System), and stays on for the next model opened.

- **Background:** Respects Nextcloud light/dark theme variables by default; a custom color override toggle can be layered later.

- **Performance:** Heavy/optional decoders (DRACO, KTX2/Basis) are prepared for future activation—decoder asset folders (`/draco`, `/basis`) are copied during build.

- **Accessibility:** Toolbar buttons expose ARIA labels; further keyboard shortcuts (reset view, toggle wireframe) are candidates for a future iteration.

- **Abortable loading:** Large model fetches can be canceled mid-stream to avoid wasting bandwidth and free UI quickly.

#### Fetch & Security Behavior

- The viewer never constructs raw WebDAV URLs; it only streams through the app's controlled endpoints, ensuring permission checks and extension allow-listing.
- Failed loads surface toast notifications with concise, localizable error messages.

### Compressed Geometry & Texture Decoders

Three.js supports additional compression / texture container formats via external decoder or transcoder binaries:

- **DRACO:** Geometry compression; requires `draco_decoder.{js,wasm}`.
- **KTX2 / Basis Universal:** GPU texture compression; requires `basis_transcoder.{js,wasm}`.
- **Meshopt (optional scaffolding):** Geometry and attribute compression; expects `meshopt_decoder.wasm` (and JS wrapper when present). If you place the decoder at `/apps/threedviewer/meshopt/meshopt_decoder.wasm` it will be auto-detected and wired into `GLTFLoader`.

This app ships these binaries by copying them out of the `three` package during the build step rather than bundling them into JS. This keeps the main bundle lean and allows the browser to instantiate WebAssembly directly.

#### Build Integration

1. A prebuild script (`scripts/copy-decoders.mjs`) runs automatically before `vite build`.
2. It copies required files from `node_modules/three/examples/jsm/libs/{draco,basis}/` into top-level `draco/` and `basis/` directories in the app root.
3. At runtime the viewer points loaders to `/apps/threedviewer/draco/` and `/apps/threedviewer/basis/`.

**Files copied during build** (`npm run build` executes `scripts/copy-decoders.mjs`):

```
draco/
  draco_decoder.js
  draco_decoder.wasm         (copied from node_modules/three/)
  draco_wasm_wrapper.js
basis/
  basis_transcoder.js
  basis_transcoder.wasm      (copied from node_modules/three/)
meshopt/ (optional, not currently used)
  meshopt_decoder.wasm
```

**Note**: The `.js` files are committed to the repository, but `.wasm` binaries are copied during the build process from the `three` npm package. This keeps the repository size smaller and ensures decoder versions match the installed Three.js version.

#### Runtime Behavior

- On first glTF load the viewer probes `/apps/threedviewer/draco/draco_decoder.wasm` and `/apps/threedviewer/basis/basis_transcoder.wasm` (HEAD fallback to GET if 405) to detect decoder presence.
- If folders or files are missing the viewer silently skips enabling those compression paths; models encoded with DRACO or KTX2 will then fail to load and a user-facing error toast is shown.
- If present, the corresponding Three.js loaders (`DRACOLoader`, `KTX2Loader`) are dynamically imported and attached to `GLTFLoader` before parsing.
- If absent, parsing proceeds without compression support; DRACO / KTX2 content in models will fail gracefully (console warning) while uncompressed primitives/textures still load.

#### Packaging Considerations

- Ensure `draco/` and `basis/` directories are included in the distributed app tarball. (They are plain static assets; no build fingerprints.)
- CSP must allow compiling the Wasm modules. `lib/Listener/CspListener.php` adds `'wasm-unsafe-eval'` through `AddContentSecurityPolicyEvent`, so it applies on the Files app and public share pages as well as the app's own routes. `'unsafe-eval'` is never requested — Nextcloud 34 removed the API for it — which is why `scripts/occt-no-eval.mjs` rewrites the `occt-import-js` glue at build time to stop compiling its bindings with `new Function`. That rewrite matches the published glue exactly and fails the build when it no longer applies, so bumping `occt-import-js` may require updating it. The 3DM runtime gets the same treatment from `scripts/rhino3dm-no-eval.mjs`, applied by `scripts/copy-decoders.mjs` as it copies `rhino3dm.js` out of the `rhino3dm` package: Rhino3dmLoader fetches that glue as text into a worker, so it never passes through Vite. It too fails the build when the glue changes shape, so bumping `rhino3dm` may require updating it; keep the version on the one three's `3DMLoader` names.

#### Troubleshooting

- If the build log shows decoder files copied but runtime 404s occur, verify the deployment kept the `draco/` and `basis/` directories at the app root (same level as `appinfo/`).
- Clearing browser cache is rarely required because these are versioned implicitly by app release; still, stale caches can be invalidated via standard Nextcloud app upgrade.

### Abortable Model Loading

Large 3D assets (especially `fbx`, `3mf`, or high-poly `gltf`) can be slow to download or parse. The viewer exposes a cancel mechanism that aborts the in-flight fetch and parsing pipeline.

**Behavior overview:**

| Aspect | Detail |
|--------|--------|
| **Trigger** | User clicks the "Cancel loading" button displayed in the loading overlay. |
| **Mechanism** | An `AbortController` is attached to the streaming `fetch`; the reader loop periodically checks `aborting` and throws an `AbortError` if set. |
| **UI Feedback** | Button label changes to `Canceling…` until the abort resolves, then the overlay shows a localized "Canceled" message (short-lived until next action). |
| **Cleanup** | Partial buffers are discarded; any placeholder spinner state is cleared; the previous model (if any) remains rendered. |
| **Events** | Emits `model-aborted` with `{ fileId }`. Successful loads still emit `model-loaded`. Errors emit `error`. |
| **Camera State** | Existing saved camera state is preserved; aborted new load does not overwrite baseline or stored camera for previous model. |
| **Wireframe / Toggles** | Abort has no side effects on viewer toggles or persisted toolbar preferences. |

**Edge cases & guarantees:**

- If abort occurs after full download but before parse completion, a final abort check runs just before scene insertion, ensuring no partially parsed scene attaches.
- Parse failures unrelated to abort still emit `error` and reset progress counters.
- Multiple rapid cancels: repeated clicks while already aborting are ignored (button disabled).
- New load requests automatically cancel any prior in-flight load (programmatic preemption when `fileId` changes).

**Consuming events (example skeleton):**

```js
<ThreeViewer @model-loaded="onLoaded" @model-aborted="onAborted" @error="onError" />
```

#### Emitted Events Summary

| Event | Payload | When |
|-------|---------|------|
| `load-start` | `{ fileId }` | Emitted immediately after a new load begins (before `fetch`) so tests / external code can deterministically react (e.g. schedule an abort) |
| `model-loaded` | `{ fileId, filename }` | After successful parse, scene add, camera fit, saved camera restore attempt |
| `model-aborted` | `{ fileId }` | User or programmatic cancel mid-download or pre-parse (also proactively fired as soon as `cancelLoad()` executes to guarantee delivery) |
| `error` | `{ message, error }` | Fetch or parse failure (non-abort) |
| `reset-done` | none | After user triggers a camera reset action (toolbar integration) |

### Centralized Model File Support

Format definitions and MIME type mappings are centralized in **`lib/Constants/SupportedFormats.php`**, which serves as the single source of truth for all PHP backend format support. The `ModelFileSupport` service wraps this class and provides additional functionality like MTL sibling resolution.

**Architecture:**

```
lib/Constants/SupportedFormats.php (PHP)
    ↓ (used by)
lib/Service/ModelFileSupport.php
    ↓ (used by)
lib/Repair/RegisterThreeDMimeTypes.php
lib/Repair/UnregisterThreeDMimeTypes.php
lib/Controller/*Controller.php

src/config/viewer-config.js (JavaScript)
    ↓ (used by)
Frontend loaders and components
```

**SupportedFormats Class:**

The `SupportedFormats` constant class provides:

- `EXT_MIME_MAP` - Extension to MIME type mappings for registration
- `CONTENT_TYPE_MAP` - Extension to content type for HTTP streaming
- `getModelExtensions()` - List of 3D model formats only
- `getAllSupportedExtensions()` - All supported extensions (models + textures + dependencies)
- `isModelFormat($ext)` - Check if extension is a 3D model format
- `isSupported($ext)` - Check if extension is supported (any type)
- `getContentType($ext)` - Get content type for streaming
- `getMimeTypes($ext)` - Get MIME types for registration

**ModelFileSupport Service:**

Delegates to `SupportedFormats` and provides additional functionality:

- `getSupportedExtensions()` - Returns all supported extensions (delegates to `SupportedFormats`)
- `isSupported($extension)` - Validates if extension is supported (delegates to `SupportedFormats`)
- `mapContentType($extension)` - Maps extension to MIME type for HTTP headers (delegates to `SupportedFormats`)
- `findSiblingMtl($objFile, $mtlName)` - Finds MTL sibling for OBJ files (custom logic)

**When adding a new 3D format:**

1. Update `SupportedFormats::EXT_MIME_MAP` and `SupportedFormats::CONTENT_TYPE_MAP` in `lib/Constants/SupportedFormats.php`
2. Run unit test: `vendor-bin/phpunit/vendor/bin/phpunit tests/unit/Constants/SupportedFormatsTest.php`
3. Update frontend `SUPPORTED_FORMATS` in `src/config/viewer-config.js`
4. Add frontend loader in `src/loaders/types/`
5. Register loader in `src/loaders/registry.js`
6. Update `appinfo/mimetypemapping.json` if needed
7. Run MIME registration: `php occ maintenance:repair`

**Format Synchronization:**

The unit test `tests/unit/Constants/SupportedFormatsTest.php` validates:
- All model extensions have MIME types
- All supported extensions have content types
- Critical formats (glb, gltf, obj, stl, etc.) are present
- Dependency files (mtl, bin) and textures are supported
- MIME type mappings are valid
- Case-insensitive handling works correctly
- EXT_MIME_MAP and CONTENT_TYPE_MAP are synchronized

### Personal Settings Implementation

The application provides a comprehensive user-specific configuration system that allows users to customize their viewing experience.

**Backend Storage:**
- Settings are stored in the `oc_preferences` table using Nextcloud's `IConfig` service.
- The `SettingsController` handles `GET`, `PUT`, and `DELETE` requests to `/settings`.
- Settings are stored as a JSON blob under the `user_preferences` key to support complex nested structures.

**Frontend Integration:**
- `PersonalSettings.vue` provides the UI for modifying settings.
- Configuration defaults are defined in `src/config/viewer-config.js`.
- The frontend merges user preferences with default settings at runtime.
- Settings are applied reactively to the `ThreeViewer` component using composables (e.g., `useCamera`, `useTheme`).

### Thumbnail Generation System

Nextcloud cannot render 3D models on the server, so the browser renders them and uploads a PNG that the app's preview provider then serves to the Files app. There are two producers: the open viewer, and a background queue on the Files page that works through the folder being browsed. Both render with the same fixed look (512x512, transparent background, default lighting and camera framing), so a thumbnail does not depend on who made it or how the viewer was set up.

**Storage and the version rule:**

- One PNG per file version, shared by every reader, in the app data (`IAppData`), never in user files: `thumbnails-v2/<fileId>/<sha1(etag)>.png`.
- The ETag identifies the version. The first thumbnail stored for a version is kept; a later upload for it gets 409.
- An upload names the ETag of the version that was rendered. The server compares it with the file's current ETag and answers 412 (`stale`) when they differ, so a thumbnail of old bytes is never filed under a newer version. The storage key is always the server's ETag.
- `ThumbnailInvalidationListener` deletes a file's folder on `NodeWrittenEvent` and `NodeDeletedEvent`, alongside Nextcloud clearing its own preview cache.
- The `RemoveLegacyThumbnails` repair step removes the per-user store (`thumbnails/<userId>/`) that earlier versions used.
- Accepted images: PNG, 16 to 1024 px per side, at most 1 MB (`ThumbnailService::MAX_BYTES`).

**Endpoints** (`ThumbnailController`; both need a logged-in user and the request token):

- `GET /api/thumbnails/status?ids=1,2,3`: up to 200 ids. For each model file the user can read it returns `name`, `dir`, `size`, `etag`, `canEdit` and `hasThumbnail` (for that ETag). Folders, other files and unreadable ids are left out.
- `POST /api/thumbnail/{fileId}?etag=<etag>`: the body is the raw PNG. 201 stored, 409 exists, 412 stale, 403 without edit rights (`NoteAccess::forUser(...)->canEdit`), 404 for a file the user cannot read or that is not a model, 400 for a missing ETag or an image that is not accepted.

**Preview provider** (`ModelPreviewProvider`, registered with `SupportedFormats::getPreviewMimeRegex()`, which covers every thumbnail format's MIME type, including `application/x-step`, `application/x-fcstd` and `text/x-gcode`): `isAvailable()` is true only when a thumbnail exists for the file's current ETag, and `getThumbnail()` returns it, scaled down to the requested size. It does not depend on the session, so share recipients and public links get the same image. Files without one fall back to the MIME icon.

**From the viewer:**

```
Model load begins → GET /api/thumbnails/status (startStatusFetch, before the download)
    ↓
Model loaded, 500 ms later → captureForCurrentVersion (src/thumbnails/captureFromViewer.js)
    ↓
Skipped unless the user can edit the file and this version has no thumbnail; never on public shares
    ↓
renderThumbnail: fixed look on a detached canvas → POST /api/thumbnail/{fileId}?etag=<etag from the status>
```

`ThreeViewer.vue` and `ViewerComponent.vue` wait for the status (`awaitStatusBeforeDownload`) before they start the model download, and capture after the model loads, when "Enable Thumbnail Generation" (`thumbnails.enabled`) is on. The ETag therefore comes from a status that has arrived before the first byte of the download was requested; a request merely sent first would not do, as the server may read the file for the download before it reads it for the status. The wait is that one request: if it fails, or has no answer within 10 seconds, the model loads anyway and this open makes no thumbnail. A load that took a material or texture from the dependency cache (`_fromCache` on the file, set by `fetchFileFromUrl`) is not captured either, since that cache is keyed by file id and name rather than version and a thumbnail is permanent; the next open or the Files page makes it from fresh files.

**The model as it is, not as the viewer shows it.** The capture renders the live model object, moved into a scene of its own for the one render, not a copy of it, and viewer tools change that object. A thumbnail is shared with everyone who can see the file, so no tool's state may reach it: each tool records what it changes in a small registry, a plain module with no Vue or DOM, and `renderThumbnail` frames and draws the model inside `withOwnDisplayState(root, fn)` (`src/utils/ownDisplayState.js`), which puts the model's own state back for that synchronous call and the viewer's state back in a `finally`, before the PNG is encoded, so the viewer never draws a wrong frame and a render that throws changes nothing. In the background worker no tool runs, every registry is empty, and the helper does nothing.

| Registry | Records | Tools |
|---|---|---|
| `materialStandIns.js` | each mesh's own material, while a stand-in shows | Clay, Normals and X-ray (`useRenderMode`) |
| `viewerMaterialProps.js` | each material's own value of a property a tool changed, from before the first change | Wireframe (`wireframe`), an open clipping plane or box (`side`), G-code Single colour (`color`, `vertexColors`) |
| `viewerHidden.js` | what a tool hid, as against what the file hides | G-code layer slider (`useGcodeLayers`) |
| `viewerTransforms.js` | each object's own position, rotation, scale and morph weights, from before a tool first moved it, and which tools (`MOVED_BY`) recorded it | Exploded view's parts (`useExplodedView`), the transform gizmo's root (`useTransformGizmo`, also what Reset returns to), every node of an animated model (`useAnimation`) |

A shared material is changed once, and multi-material meshes are covered. Switching Wireframe off gives a material its own value back, so a material a file ships as wireframe stays one. An animated model is drawn in the pose it loads in, as a background thumbnail is, not at whatever frame its clip has reached. G-code is always loaded in its own gradient, which the background worker draws too, and Single colour is shown over it. The camera fit is made inside the helper, so exploded parts and a model the gizmo turned are framed as the model puts them. The clipping planes themselves are on the viewer's renderer and never reach the thumbnail's, and measurements, annotations, face labels and the gizmo's handles are in the viewer's scene, not under the model. A tool that changes the live model must register in one of these registries, or in a new one composed into `withOwnDisplayState`.

Exports follow one rule in every format, set out in `withExportState(root, fn)` beside it: the model's own materials and its parts together, but placed where the user put it with the gizmo and in the pose its animation is in, so it undoes only what Exploded view moved (`withPartsTogether`). STL, OBJ and PLY, and Send to Slicer's copies of them, are written inside it. GLB, USDZ and 3MF are written asynchronously and cannot be wrapped in one call: for those the viewer sets the explosion aside for the export, and for GLB and USDZ the render mode as well. `suspend()` returns a token for the model it was made on and `resume(token)` ends that suspension; the suspensions are counted, so two exports at once both finish first, and a token from an earlier model does nothing, so an export still writing the last model cannot end one on the next. Setting the explosion aside moves the parts only while they are apart, so a paused animation keeps its pose, and brings their matrices up to date at once, since USDZ reads them as it starts.

The model statistics are measured inside `withPartsTogether` too, so a model that opens in Exploded view (it carries on from the last model, as Wireframe and the render mode do) has the sizes of the assembled model. Its camera is fitted again to the parts as shown, unless a shared link's `cam=` parameter chose the view.

**From the Files page** (background):

```
main.js on /apps/files (not on public shares) → import('./thumbnails/filesPage.js') → startFilesThumbnails()
    ↓
MutationObserver (500 ms debounce, 2 s at most) + popstate → read the URL and the rendered rows
    ↓
First eligible view with a model row → import('./filesQueue.js'): logged-in user and
"Create thumbnails while browsing Files" (thumbnails.background) on, else stop watching the page
    ↓
Eligible view → queue.setFolder(folderKey, model ids, visible ids); recent, trash bin, search or ?query= → queue.stop()
    ↓
backgroundQueue: status → limits → wait for idle and a visible tab → download → render in a worker → upload
    ↓
Stored → the row's icon is replaced at once (swapRowIcon); after a reload the Files app shows the preview
```

- `filesPage.js` loads on every Files page, so it imports only the format list (about 15 KB with its chunks); the user, the settings, the API, the loader, the worker host and the queue live in `filesQueue.js` and its chunks (about 230 KB), loaded once per page and only when a folder shows a model. It reads the Files app's rows by their `data-cy-files-list-row-fileid` and `data-cy-files-list-row-name` attributes and passes on only rows whose extension the worker can render, so a folder without models costs no request. Rows on screen go first. The folder key is `<view>:<dir param or route file id>`.
- The thumbnail is put in the row as an extra `<img class="threedviewer-thumbnail">`; the Files app's own icon is hidden, not removed, since its list reuses row elements as it scrolls and patches the nodes it owns. Thumbnails made on the page are remembered (up to 200) and put back when their row is rendered again, and taken out of a row that now shows another file.
- In views other than `files` (favorites, shares, tags), work starts only inside a folder, a `dir` other than the root: their top-level lists are flat and can span the whole library. In the tags view a `dir` whose first segment is a tag id is the flat list of that tag, so it does not count.
- `backgroundQueue.js` does one file at a time. Before downloading anything it skips files it cannot render in a worker, files the user cannot edit, versions that already have a thumbnail, files on the skip list and files over "Skip files larger than". `.nc` and `.g` are never rendered in the background (`AMBIGUOUS_FORMATS` in `formats.js`): other software uses them too, NetCDF for `.nc`, so only opening one in the viewer says it is a model. A file larger than what is left of "Download at most, per folder visit" ends the visit without being skipped, so the next visit's fresh budget tries it; one larger than the whole budget can never fit, so it is skipped and the visit goes on with the next file. A new folder, or `stop()`, aborts the current job, its download included, without skipping its file, and starts a fresh budget.
- Downloads use `loadModelForBackground` (`backgroundLoad.js`), not the viewer's `loadModelWithDependencies`. It fetches only the companions the model declares (the OBJ's `mtllib` and the maps its MTL names, each relative to the MTL's folder as the server reads it, glTF buffers and images, FBX and 3DS texture names, the file each COLLADA `<image>` names in its `<init_from>` (not an effect's `<surface><init_from>`, which holds an image's id), and the `url` of each X3D `<ImageTexture>` (not an Anchor, Inline, AudioClip or Script `url`), entity-decoded; an FBX texture whose image is embedded in its `Video` node's `Content` is not a companion and is not looked up, in the viewer either), each found through `/api/files/find` at the path the model declares or by its name beside the model, and never lists or scans a folder. A companion named by an absolute path, a `file:` URL or a relative path that climbs above the model's folder is looked for by its name beside the model only (see the public share endpoints above for how a reference becomes a name), and the loaders map the URL they ask for, `C:\textures\wood.jpg`, a percent-encoded `file:` URL, or `../../maps/wood.jpg` as written or resolved against the model's URL, to the fetched file by its bare, decoded name; one the job was not handed is still refused. The viewer's loader does both: an FBX or 3DS that declares no texture it can resolve makes it list the model's folder tree and download every image in it, which is fine for one model someone chose to open and not for every model in a folder, unattended. The lookup reports each companion's size, which is checked against what is left of the budget before the companion is fetched; one of unknown size is not fetched. Once one declared companion cannot be had, no more are fetched, and the load reports `missingFiles`, `budgetReached` and `bytesNeeded` (everything downloaded plus the companion that did not fit). The queue never renders such a load, because a thumbnail is written once per version and a degraded one would stay: when the budget was the reason, the visit ends with nothing rendered, uploaded or skipped, and the next visit's fresh budget tries again, unless `bytesNeeded` is more than a whole folder budget, in which case the file is skipped so it is not downloaded on every visit; when a companion was not found (or was refused with a 4xx), the file is skipped and the viewer, whose search also covers subfolders, makes the first thumbnail. So a glTF whose `.bin` did not fit never reaches the worker and does not count toward the breaker. A model that declares no companions, such as an FBX without textures, renders as it is, so a model whose textures are not declared gets an untextured thumbnail. One `AbortSignal` goes to every request of the load; it fires at "Give up on a file after", counted from the start of the download, and when the visit ends. Bytes are counted as they arrive, so a download stopped midway still counts against the budget. The dependency cache is not used.
- A file goes on the skip list, `localStorage['threedviewer:thumbnailSkips']`, keyed by file id and ETag (at most 2000 entries), when:
  - it runs past "Give up on a file after", while downloading or rendering;
  - it has nothing to draw;
  - the server refuses it (4xx);
  - the worker refuses it, because the model names a file it was not handed;
  - its loader cannot parse it;
  - a companion it declares is not found. An FBX with embedded textures declares none for them and renders with them; one that references external textures that are not found is skipped;
  - it is larger than a whole folder budget, or needs more than one with its companions.

  A changed file is tried again; "Retry skipped files" clears the list. Failures of the browser or the network never skip a file (`ThumbnailEnvironmentError`): a worker that will not load or crashes, a message that cannot be read, a failure while drawing (WebGL), a loader chunk that cannot be fetched, a network error or a 5xx. Before the first download on a page the queue asks the worker once whether it can create a WebGL 2 context on an `OffscreenCanvas` (`probeWorkerRendering`); if it cannot, nothing is downloaded on that page. After three failures in a row that are neither a timeout, an empty model nor a refusal by the worker, background work stops for the page too. A refusal (the model named a URL outside the files it was handed, `ThumbnailRefusedError`) skips the file but is not counted and does not reset the count, so a folder of crafted models cannot stop background work for everyone who browses it.
- Work waits for `requestIdleCallback` (a 200 ms timer where there is none) and pauses while the tab is hidden, Save-Data is on, or the viewer is open over the list (the Files app's `openfile=true` URL parameter, or the Viewer app's `#viewer` modal). A job already running when the viewer opens finishes, within its time limit. Waiting callbacks share one `visibilitychange` and one `navigator.connection` listener; closing the viewer is noticed through the page's MutationObserver.

**The worker** (`workerRenderer.js`, `thumbnail.worker.js`): every render gets a fresh dedicated module worker, loaded from the app's own URL, which is terminated as soon as the job settles, times out or is aborted. Terminating is the only way to stop a parse running inside WebAssembly (OCCT, web-ifc), and it frees the parse's memory before the next file. The time limit covers the download and the render together: the download is aborted when it runs out, and the render gets whatever time is left. Every format the viewer opens renders in the worker; only `.nc` and `.g`, which may not be G-code at all (`AMBIGUOUS_FORMATS` in `formats.js`), are left to the viewer.

**XML in the worker** (`workerDomParser.js`): the 3MF, AMF, COLLADA, X3D and FreeCAD loaders parse XML with `new DOMParser()`, which workers lack. For those formats the worker imports `@xmldom/xmldom` (a lazily loaded chunk of the worker's own bundle, about 90 KB, which no other job and no page entry loads) and installs it as `self.DOMParser`; the viewer on the page keeps the browser's parser. What the loaders use and xmldom lacks is added to xmldom's prototypes: `querySelector`/`querySelectorAll` for type selectors (matched by local name in any namespace, as a browser does in XML), attribute selectors and the descendant combinator, which is all three's 3MF and COLLADA loaders and the X3D loader write, and any other selector throws a `SyntaxError`; `firstElementChild`, `nextElementSibling` and the rest of element traversal (the AMF loader); and the attributes the AMF loader reads by name on `element.attributes` (`id`, `type`, `unit`, `materialid`), as getters on xmldom's `NamedNodeMap` prototype, which cost nothing per element; a test checks the list against the loader's source. Malformed XML gives a document with a `<parsererror>` root, as in a browser, and xmldom's recoverable errors (an undefined entity, for one) count as malformed, as they do in a browser. xmldom never fetches anything, so an external DTD or entity is never loaded, and it expands no entity a document declares, so a billion-laughs document fails at its first entity reference. What it cannot avoid is memory in proportion to the document: measured under Node, mesh-like XML (a 3MF's vertices and triangles) holds about 31 bytes of heap per character once parsed. A worker that runs out of memory crashes, which the host reads as a broken browser: never skipped, downloaded again on every visit, and counted toward the breaker. So the parser refuses text longer than `MAX_XML_LENGTH`, 16 Mi characters (about 500 MB parsed, or a 250,000-triangle 3MF), before parsing it. The cap applies to each document as the loader hands it over, so a 3MF's model is measured inflated. The worker posts `tooLarge`, even when a loader wrapped the error in its own, and the host rejects with `ThumbnailTooLargeError`, which, like a timeout, skips the file for its version without counting toward the breaker; the viewer still makes its thumbnail. The time limit stops anything else that runs long. The COLLADA and 3MF textures go through three's `TextureLoader`, so through the image loader below and the URL guard: a COLLADA image the job was not handed fails the job as a refusal, and a 3MF texture is the `blob:` URL the loader made from its own archive. The X3D loader maps only the images it was handed and requests nothing. So the two treat an image named only by a remote URL differently, on purpose: COLLADA's loader requests whatever its `<image>` names, so in the worker a remote image is a refusal and the file is skipped; the X3D loader never loads a remote image, on the page or in the worker, so such an X3D is drawn without it in the viewer and in its thumbnail alike, and the thumbnail shows what the viewer shows. A relative image either one names is a declared companion, and a missing one skips the file.

**What the worker may load** (`workerResources.js`): the worker renders models from shared folders for someone who is only browsing them, and may run without the page's CSP, so it loads nothing a model merely names. It resolves only the files the job was handed (matched by name, as `blob:` URLs it makes), `data:` URLs, `blob:` URLs it made itself (embedded GLB images, decoder workers), and the decoder assets under the app's web root (`draco/`, `basis/`, `rhino3dm/`, `occt/`, `web-ifc/`) on its own origin; a handed file never stands in for a decoder, and a decoder path with a `%` below its folder is refused, since URL parsing leaves an encoded slash or backslash (`%2F`, `%5C`) in place and a server that decodes it would read `draco/..%2F..%2Fremote.php` as a climb out of the folder. `guardWorkerRequests` makes `fetch()` and `XMLHttpRequest` refuse anything else before a request is sent, the default `LoadingManager`'s URL modifier and the worker's image loader resolve through the same rules, and the glTF and 3DS loaders pass a URL they cannot map to one of their files to the default manager (on a page it has no modifier, so the viewer is unchanged). Every refusal is recorded, and a job with one fails at the `load` stage with `Refused to load …: not one of the model's files`, even when the loader would have carried on without the texture, so the file is skipped rather than given a degraded thumbnail. Loaders that fetch by URL in the worker, and how each is covered: glTF/GLB buffers and images (the glTF manager, then the default one), the Draco decoder (`DRACOLoader`'s `FileLoader`, a decoder asset), OBJ/MTL textures (decoded from the handed files directly; the native `MTLLoader` path goes through the default manager), FBX textures (its own manager, which never returns a network URL; an embedded image is the `blob:` or `data:` URL FBXLoader made from it), 3DS, VRML and COLLADA textures (the default manager, or for COLLADA its own manager mapping handed images to `data:` URIs and passing anything else through), 3MF textures (`blob:` URLs the loader made from its archive), X3D textures (`data:` URIs of handed files only), 3DM (`rhino3dm.js` and `.wasm` through the default manager; embedded textures are `data:` URLs), STEP, IGES, BREP and FCSTD (the OCCT `.wasm` via `locateFile`) and IFC (`web-ifc.wasm` via `SetWasmPath`). STL, PLY, OFF, BIM, AMF and G-code parse the bytes they are given and request nothing. Loader chunks come in through `import()`, from the app's `js/`, which no model controls.

The worker script is a static file served without a CSP header, so the Files page's `worker-src 'self'` allows it, and the Draco decoder worker it starts from a `blob:` URL is allowed by the worker's own (empty) policy.

**Settings** (Personal Settings → 3D Viewer → Thumbnails; `THUMBNAIL_SETTINGS` in `src/config/viewer-config.js`, read by `loadThumbnailSettings()`, which falls back to the default for anything missing or out of range):

| Setting | Key | Default | Range |
|---|---|---|---|
| Enable Thumbnail Generation (viewer) | `thumbnails.enabled` | on | |
| Create thumbnails while browsing Files | `thumbnails.background` | on | |
| Skip files larger than | `thumbnails.maxFileSizeMB` | 50 MB | 1 to 2048 |
| Give up on a file after | `thumbnails.timeoutSeconds` | 30 s | 5 to 300 |
| Download at most, per folder visit | `thumbnails.folderBudgetMB` | 500 MB | 50 to 10000 |

The two switches are independent. "Retry skipped files" clears this browser's skip list.

### File Browser Implementation

The integrated File Browser allows users to navigate and manage 3D models directly within the viewer application, providing a specialized interface optimized for 3D content.

**Architecture:**
- **Frontend**: `FileBrowser.vue` serves as the main container, managing state for current path, filter mode (folder, type, date), and selection.
- **Backend**: `FileController` provides specialized endpoints:
  - `GET /api/files/list`: Returns files and folders for a specific path or filter.
  - `GET /api/files/find`: Searches for files based on criteria.
- **Navigation**: Implements a breadcrumb-based navigation system similar to Nextcloud Files.
- **Filtering**:
  - **Folders**: Hierarchical navigation.
  - **Types**: Groups files by extension (e.g., all .obj files).
  - **Dates**: Groups files by year and month.
- **Performance**: Uses lazy loading to fetch folder contents only when requested, ensuring scalability with large file sets.

## Print Check

Print check (the tools panel's Analyze section) answers four questions about the open model without changing it: does it fit a printer, where does it overhang, roughly how much filament does it take, and how thick are its walls. For a G-code file it shows the numbers the slicer wrote instead. The code is in `src/printCheck/` and `src/composables/usePrintCheck.js`. The composable and the card are only loaded the first time someone opens Print check.

- **What it measures.** The model as an export writes it: its parts together however Exploded view has moved them, and placed as the user placed it with the transform gizmo (`withPartsTogether`). Clipping is ignored. Lengths are in millimetres, using the same millimetres-per-unit as measurements (`utils/sourceUnits.js`). For STL, OBJ, PLY, OFF, 3DS and G-code, which record no unit, the card says sizes assume millimetres.
- **Which way is up.** Up is the viewer's +Y. **Z up** treats the scene's +Z as up instead, for a file drawn Z-up that lies on its side. It turns the camera and the build box, never the model: `camera.up` changes, and so does OrbitControls' orbit basis (`_quat`), which OrbitControls only works out from `camera.up` when it is created. The choice lasts for the session, per file.
- **Fit.** The model's extent along the bed's width, depth and up axes, against the printer's build volume (`printCheck/printers.js`, the makers' published print areas). It reports how far each side sticks out, and whether the model would fit turned 90° on the bed.
- **Overhangs.** A triangle overhangs when its flat normal leans past the chosen angle from vertical toward facing down: 0° is a wall and 90° a ceiling. The default is 45°, adjustable from 20° to 80°. Triangles no higher than 0.05 mm above the model's lowest point rest on the bed and are left out. The share is overhang area over total area (`overhangShare`). The shading is a shader that applies the same rule on the GPU, using a flat normal from `dFdx`/`dFdy`, so smooth normals don't change it.
- **Closed or not.** A part is closed when every edge is shared by exactly two triangles. Vertices within 1e-6 of the part's largest extent are welded first, since an STL stores each triangle with its own three vertices. This runs in the print-check worker on every part, with no size cap (`closedMesh.edgeReport`), unlike the stats panel's check, which stops at 500,000 triangles on indexed meshes.
- **Filament estimate.** Only for a closed model. The walls and the top and bottom count as solid to 1.2 mm, and the inside is filled at the infill percentage:

  ```
  shell    = min(volume, area × 1.2 mm)
  material = shell + (volume − shell) × infill / 100
  grams    = material / 1000 × density        (g/cm³: PLA 1.24, PETG 1.27, ABS 1.04, ASA 1.07, TPU 1.21)
  metres   = material / (π × (1.75 mm / 2)²) / 1000
  ```

  Volume and area are measured in the world (`modelVolumeAndArea`). The result is labelled as an estimate: a slicer's figure depends on settings this doesn't know.
- **Wall thickness.** In the print-check worker, using `three-mesh-bvh`. From each triangle's centre, a ray goes inward along the triangle's normal, and the distance to the first surface it meets is the wall's thickness there (`thickness.measurePartThickness`). Rays start at centres because a vertex is often a corner, where an inward ray grazes the faces beside it. Each vertex takes the thinnest triangle around it. Above 300,000 triangles per part an even sample is measured, and the rest take the value of the measured triangle before them; the card says when that happened, and gives the thickness under the pointer as "about". Progress counts every triangle of the part either way. Where a ray meets no wall, the colour data holds a large finite number rather than Infinity, which the GPU would turn into NaN along edges. Colours: red below the minimum (0.8 mm by default), yellow below 1.5 × the minimum.
- **G-code.** `slicerSummary.parseSlicerSummary` reads the first and last 512 KiB of the file, and only comment lines up to 512 characters. It reads the comments of PrusaSlicer, SuperSlicer, OrcaSlicer, Bambu Studio and Cura: print time ("total estimated time" first), filament length and weight (added up over extruders when a multi-material print lists one value each), and which slicer wrote it.
- **Nothing reaches an export or a thumbnail.** The box, the bed and both kinds of shading are objects added to the scene beside the model (`surfaceOverlay.js`). Each shading overlay shares its part's geometry and copies its world matrix every frame. Exports read the model, thumbnails render the model in a scene of their own, and render modes swap the model's materials, so none of them meets an overlay. An overlay takes its part's matrix again just before it is drawn (`onBeforeRender`), so it doesn't lag a frame behind a drag, and it is cut by an open cross-section like the model: the cross-section clips with the renderer's planes, which a `ShaderMaterial` only receives with `clipping: true`. Closing an overlay frees only what it made: the attributes it shares come off its geometry first, since disposing a geometry frees the GPU buffer of every attribute still on it.
- **Remembered settings.** The printer (or custom size), angle, infill, material and minimum thickness are saved under `printCheck` in the viewer's preferences (`/apps/threedviewer/settings`), held to the same ranges whether typed or read back. A change waiting for its half-second debounce is sent when Print check closes or the viewer goes. On a public link they're kept in that browser's `localStorage`.

## File Versions

Version comparison lists and downloads a file's earlier versions straight from Nextcloud's `versions` WebDAV collection, so Nextcloud's own permission checks apply. The app adds no route of its own. This is what the collection returns. It was checked on a Nextcloud 34 server; the code that builds the list (`VersionCollection::getChildren` and `LegacyVersionsBackend::getVersionsForFile`) is the same on `stable31` and `stable35`.

- **Where:** `PROPFIND /remote.php/dav/versions/<user>/versions/<fileId>` with `Depth: 1`, where `<user>` is the **logged-in** user. A share recipient lists and downloads through their own collection (`versions/bob/versions/<fileId>`). The owner's collection answers them with 403.
- **What comes back:** one response for the collection itself, with no props, then one per version. Each version's href ends in its id, which is the version's timestamp in Unix seconds. A version is downloaded with a `GET` on its href.
- **The current version is listed too.** Its id equals the file's modified time, so a file that was never edited lists exactly one version. Version comparison leaves that entry out. When the file's modified time isn't known, it leaves out the newest entry, which is the current version on 31–35.
- **Props:** `d:getlastmodified`, `d:getcontentlength` and `d:getcontenttype` are always present, and `nc:version-author` is the user id of whoever made the version. `nc:version-label` is in a separate `404` propstat when the version has no label, and is read as no label.
- **Errors:** an unknown file id gives 404. With the `files_versions` app disabled, the whole `versions` root gives 404 (`File not found: versions in 'root'`). Version comparison treats both as "no earlier versions".

The captured responses are in `tests/fixtures/versions/`.

## Turntable Video

**Record turntable** (the tools panel's Export section) records one full turn of the camera around what it looks at, for someone who won't open a viewer. The recording is `src/composables/useTurntable.js`, the helpers are `src/utils/turntable.js`, and the dialog is `src/components/TurntableDialog.vue`, which is only loaded the first time someone opens it.

- **Format.** `MediaRecorder` on the canvas's stream, in the first format the browser can record: WebM (VP9, then VP8), as Chrome, Firefox and Edge do, and otherwise MP4 (H.264), as older Safari does. The file's extension matches what was made. The button is disabled, with a title that says why, where there's no `MediaRecorder`, no format it can record, or no `canvas.captureStream` (`canRecordVideo`).
- **The turn.** It starts from the current view and zoom, and the camera turns about the camera's up axis through the orbit target, which is the model's centre unless the view was panned, and then keeps the framing chosen. The direction is the model's, as on a turntable: for the model to turn clockwise seen from above, the camera goes counter-clockwise round it. Lengths run from 4 to 15 s at 30 fps; the default is 8 s. Sizes are 720p, 1080p or the window's size, rounded to even pixels, which video encoders need. A perspective camera takes the video's aspect; an orthographic one keeps the height of the scene it shows and is widened or narrowed to the video's shape.
- **Frame timing.** The viewer's own render loop pauses for the recording (`renderPaused`), so nothing else moves the camera or draws in between. Each frame is drawn once and sent explicitly (`captureStream(0)` and `requestFrame()`), so a slow frame arrives late rather than going missing. Before each frame, labels are turned to face the camera, as the viewer's own loop does. A hidden tab throttles timers, so hiding the page ends the recording and keeps what was recorded; the dialog says it stopped early, and why.
- **Put back afterwards.** The renderer's size and pixel ratio, the camera's position and aspect, and the orbit controls' target and enabled state are restored whether the recording finished, was stopped or failed. The canvas keeps its place on the page throughout: only its drawing buffer changes size. Changing the buffer can change the page's layout, and the window can be resized meanwhile; the viewer's resize handling waits for the recording to end and then runs once, so the video keeps its size and the viewer fits the window afterwards. A recorder that stops on its own, when its encoder fails, ends the recording with an error, and everything is put back as above.
- **What's in the video.** Whatever the renderer draws: render mode, wireframe, lighting, background, grid and axes, annotations, measurements and Print check's colours if they're showing. Face labels aren't in it, because they're HTML on top of the canvas, not part of the scene. While it records, the dialog covers the viewer and the orbit controls are off. While any modal dialog is open, the tool shortcuts and the tools panel's Escape are left to the dialog, wherever the focus is; a dialog can name, in `data-shortcut`, the one shortcut that closes it, as Help does with `?`. Focus moves to Stop when recording starts and to Download when the video is ready.
- **Saving.** **Download** saves `<model name>-turntable.<ext>`. **Save next to the model** writes the file into the model's folder through WebDAV (`utils/davFiles.js`). It's offered only to a logged-in user whose folder permissions include `C` (create), checked with a `PROPFIND` for `oc:permissions`. A name that's taken gets " (2)", " (3)" and so on, from a listing of the folder made just before the `PUT`. The `PUT` sends `If-None-Match: *`, so it never replaces a file; if one took the name since the listing, the server answers 412 and the folder is listed again, up to three times. A model at the root of the user's files comes with no folder, and is saved at the root (`saveFolder`). The dialog stays open while it saves, so the result is always shown. On a public link, only Download is offered.


## View Links

A view link reopens a model as its sender saw it. Everything is in the link; nothing is stored on the server, and the link opens only for people who could open the file anyway. The format and its checks are `src/utils/viewLink.js`; clipboard writes go through `src/utils/clipboard.js`, and the user's link shares come from `src/utils/linkShares.js`.

- **Format.** `?view=1.<base64url JSON>`. The leading `1` is the format's version, so links made today keep opening after it changes. The JSON uses one-letter keys and rounded numbers (4 decimals for positions, 3 for factors) to stay short: `c` camera (`p` position, `t` target, `z` zoom, `o` 1 for orthographic), held relative to the model's root object rather than a viewer's scene, because the two viewers place a model differently (the full viewer stands it on the floor, the light viewer centres it in height too), `r` render mode, `w` wireframe, `l` lighting preset, `k` cut (`{m:'p', a, s, f}` for a plane, `{m:'b', o:[xMin, xMax, yMin, yMax, zMin, zMax]}` for a box), `e` exploded factor, `n` a shared note's id. The older `?cam=px,py,pz,tx,ty,tz,zoom` links (`cameraUrlState.js`) are still read, as positions in the full viewer's scene (`inScene`), and `view` wins when both are present.
- **Checks.** Nothing in a link is trusted. A camera with a non-finite coordinate, or one past 10⁷, rejects the whole view; zoom is clamped to 0.01–100. Every other field is checked against what the viewer accepts and dropped when it fails: a render mode in `RENDER_MODES`, a lighting preset that is an own key of `LIGHTING_PRESETS`, a known axis or box face, a note id that is a positive integer. Cut positions and factors are clamped to their ranges. A broken view is ignored, never an error.
- **The full viewer** (`App.vue`, `ThreeViewer.vue`) applies a link once, to the first model the page shows (`takeViewFromUrl` hands it out once per page, so a retry, the next file or a second viewer frames as usual): the projection first (switching it later would recompute the zoom), then the camera after the usual fit, then shading, lighting, the cut and the exploded view once those tools have taken the model. A camera whose target lies outside the model's box grown by its own size, or that is nearer than a hundredth or further than a hundred times the model's size from it, as a link made for an older version of the file can be, is skipped for the usual framing (`isUsableCamera`); a camera that is used gets a clipping range for its own distance. The app mirrors what was applied for the tools panel (`view-applied`), and saves none of it as the user's preference: `savePrefs` writes the wireframe the user chose (`ownWireframe`), not one a link showed. A link with a note opens Annotations on that note, highlighted and focused, once the shared notes have loaded, for reading: a click on the model places nothing until the user presses **Add notes**. The highlight ends when the panel closes or another model opens. A note that has been deleted, or isn't shared, is skipped.
- **Copying.** "Copy link to this view" in the tools panel (L) captures the camera always, and the cut and exploded view only while they are on, so a link never switches on a tool its sender had off. Each saved, shared note has "Copy link to this note", and each bookmark "Copy link", with the bookmark's camera. Logged-in links point at the file in the full viewer, `/apps/threedviewer/f/{fileId}`, so Nextcloud's own access rules decide who opens them.
- **Public links.** Public share pages, and the viewer opened from Files, use the light viewer (`ViewerComponent.vue`), which has no shading modes, cut, exploded view or annotations. It applies a link's camera and nothing else, and draws in perspective only, so an orthographic link's zoom is left out. Its own "Copy link to this view" copies the page's link with the camera: the share link for a visitor, the full viewer for a logged-in user (`viewerLinkBase`). In the full viewer, a user who manages a link share of the file (the shares the sharing API returns with `reshares=false`) also gets "Copy public link to this view", the share's URL with the camera; with several unexpired shares they choose, newest first. The shares are read when the tools panel opens for a model, never on load.

---

This technical documentation provides comprehensive information about the 3D Viewer's architecture, performance monitoring, multi-file loading capabilities, composables API, lazy loading implementation, model loading system, advanced viewer wiring, and decoder integration. For user-facing documentation, see the main [README.md](../README.md). For implementation history and lessons learned, see [IMPLEMENTATION.md](IMPLEMENTATION.md). For testing information, see [TESTING.md](TESTING.md).