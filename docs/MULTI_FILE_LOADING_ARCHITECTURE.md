# Multi-File Loading Architecture Diagram

## Current Architecture (After Phase 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Vue Component)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ViewerComponent.vue                                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ async loadModel(THREE) {                                       │ │
│  │   1. Detect format: 'obj', 'gltf', 'glb', 'stl'...            │ │
│  │   2. Fetch main file from API                                  │ │
│  │   3. [TODO Phase 2] Fetch dependencies if multi-file          │ │
│  │   4. Load via registry.loadModelByExtension()                 │ │
│  │ }                                                              │ │
│  └────────────────────────────────────────────────────────────────┘ │
│           │                                                           │
│           │ fetch()                                                   │
│           ▼                                                           │
└───────────┼───────────────────────────────────────────────────────────┘
            │
            │ HTTP GET
            │
┌───────────▼───────────────────────────────────────────────────────────┐
│                    Nextcloud Server (PHP)                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ApiController.php                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ ✅ #[GET /api/file/{fileId}]                                     │ │
│  │    - Fetch file by ID                                            │ │
│  │    - Check permissions                                           │ │
│  │    - Stream file content                                         │ │
│  │                                                                  │ │
│  │ ✅ #[GET /api/file/by-path?path={path}]  [NEW]                  │ │
│  │    - Fetch file by path (for dependencies)                      │ │
│  │    - Normalize path (security)                                  │ │
│  │    - Check permissions                                           │ │
│  │    - Stream file content                                         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│           │                                                            │
│           │ File API                                                   │
│           ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Files / Storage                                                  │ │
│  │   /models/                                                       │ │
│  │      model.obj      ← Main file                                 │ │
│  │      model.mtl      ← Material definition                       │ │
│  │      texture.jpg    ← Texture image                             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Multi-File Loading Flow (Phase 2 - TODO)

### Example: Loading OBJ with Materials and Textures

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: User clicks on model.obj                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2: ViewerComponent.loadModel()                                 │
│   const isMultiFile = extension === 'obj'                           │
│   if (isMultiFile) {                                                │
│     loadModelWithDependencies(fileId, filename, extension, dirPath) │
│   }                                                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3: multiFileHelpers.loadModelWithDependencies()                │
│   1. Fetch main file: GET /api/file/124                             │
│   2. Parse: "mtllib model.mtl"                                      │
│   3. fetchObjDependencies(objContent, ...)                          │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 4: fetchObjDependencies()                                       │
│   For each MTL file:                                                │
│     1. Fetch: GET /api/file/by-path?path=/models/model.mtl         │
│     2. Parse: "map_Kd texture.jpg"                                  │
│     3. Fetch: GET /api/file/by-path?path=/models/texture.jpg       │
│   Return: [mtlFile, textureFile]                                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 5: Load with all files                                         │
│   const result = {                                                  │
│     mainFile: objFile,                                              │
│     dependencies: [mtlFile, textureFile],                           │
│     allFiles: [objFile, mtlFile, textureFile]                       │
│   }                                                                  │
│   loadModelByExtension('obj', result.mainFile, context,             │
│                        result.dependencies)                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 6: OBJLoader receives all files                                │
│   - Parse OBJ geometry                                              │
│   - Parse MTL materials                                             │
│   - Load textures                                                   │
│   - Apply materials to geometry                                     │
│   - Return complete Three.js Object3D                               │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow - Detailed

### Single-File Model (GLB/STL/PLY) - Works Now ✅

```
User clicks file.glb
    │
    ├─→ ViewerComponent detects: extension = 'glb'
    │
    ├─→ Fetch: GET /api/file/124
    │
    ├─→ ApiController.getFile(124)
    │      └─→ Check permissions
    │      └─→ Stream file
    │
    ├─→ Receive: ArrayBuffer (3D model data)
    │
    ├─→ loadModelByExtension('glb', arrayBuffer, context)
    │      └─→ Import GLTFLoader
    │      └─→ Parse binary data
    │      └─→ Create Three.js mesh
    │
    └─→ Add to scene ✅
```

### Multi-File Model (OBJ+MTL+Textures) - Phase 2 TODO

```
User clicks model.obj
    │
    ├─→ ViewerComponent detects: isMultiFile = true
    │
    ├─→ loadModelWithDependencies(124, 'model.obj', 'obj', '/models')
    │
    ├─→ Fetch main: GET /api/file/124
    │      └─→ Receive: model.obj content
    │
    ├─→ Parse OBJ: find "mtllib model.mtl"
    │
    ├─→ Fetch MTL: GET /api/file/by-path?path=/models/model.mtl
    │      └─→ Receive: model.mtl content
    │
    ├─→ Parse MTL: find "map_Kd texture.jpg"
    │
    ├─→ Fetch texture: GET /api/file/by-path?path=/models/texture.jpg
    │      └─→ Receive: texture.jpg binary
    │
    ├─→ Convert all to File objects
    │      └─→ [objFile, mtlFile, textureFile]
    │
    ├─→ loadModelByExtension('obj', objFile, context, [mtlFile, textureFile])
    │      └─→ Import OBJLoader + MTLLoader
    │      └─→ Parse materials
    │      └─→ Parse geometry
    │      └─→ Apply textures
    │      └─→ Create Three.js mesh
    │
    └─→ Add to scene ✅
```

## Security Model

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
└───────────────────────────┬──────────────────────────────────────┘
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

## Module Architecture

```
src/loaders/
│
├── multiFileHelpers.js          ← [NEW] Multi-file parsing & fetching
│   ├── fetchFileFromUrl()
│   ├── parseObjMaterialFiles()
│   ├── parseMtlTextureFiles()
│   ├── parseGltfDependencies()
│   ├── fetchObjDependencies()
│   ├── fetchGltfDependencies()
│   └── loadModelWithDependencies()  ← Main entry point
│
├── registry.js                  ← [EXISTING] Loader selection
│   └── loadModelByExtension()
│
└── types/
    ├── obj.js                   ← [TODO] Accept additionalFiles param
    ├── gltf.js                  ← [TODO] Accept additionalFiles param
    ├── glb.js                   ← Single-file, no changes
    ├── stl.js                   ← Single-file, no changes
    └── ...
```

## Error Handling Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ Fetch main file                                                   │
│   └─→ ❌ Fails → Show error, stop                                 │
│   └─→ ✅ Success → Continue                                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Fetch dependencies (MTL, textures)                                │
│   └─→ ❌ MTL fails → ⚠️ Log warning, use default materials        │
│   └─→ ❌ Texture fails → ⚠️ Log warning, use default color        │
│   └─→ ✅ All succeed → Full model with textures                   │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│ Load model with available files                                   │
│   └─→ Graceful degradation: Model always loads                   │
│   └─→ Toast notifications for missing dependencies                │
└──────────────────────────────────────────────────────────────────┘
```

## Performance Characteristics

### Single-File Model (Current)
- **Network**: 1 HTTP request
- **Memory**: 1 file in memory
- **Parse time**: Fast (single file)

### Multi-File Model (Phase 2)
- **Network**: 1 + N requests (parallel via Promise.allSettled)
- **Memory**: 1 + N files in memory
- **Parse time**: N sequential parses + 1 main parse
- **Example OBJ**: 1 obj + 1 mtl + 3 textures = 5 files, 5 requests

### Optimization Opportunities (Future)
1. **Batch API**: Single request for all dependencies
2. **Caching**: Store fetched files in IndexedDB
3. **Streaming**: Parse while downloading (for large files)
4. **Preloading**: Fetch likely dependencies in background

---

**Legend**:
- ✅ Implemented
- ⏳ In progress
- ❌ Not implemented
- ⚠️ Warning/degraded mode
