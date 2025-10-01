# Multi-File Model Loading Implementation

**Date**: October 1, 2025  
**Status**: Phase 1 - Infrastructure Complete, Integration Pending

## Overview

Implemented multi-file model loading support , adapted to work with our secure API architecture.

## What Was Implemented

### 1. Multi-File Helper Module (`src/loaders/multiFileHelpers.js`)

Created a comprehensive helper library for parsing and fetching multi-file 3D models:

#### Core Functions:

- **`fetchFileFromUrl(url, name, type)`**: Fetch files and convert to File objects
- **`parseObjMaterialFiles(objContent)`**: Extract MTL file references from OBJ
- **`parseMtlTextureFiles(mtlContent)`**: Extract texture references from MTL
- **`parseGltfDependencies(gltfJson)`**: Extract buffers and images from GLTF JSON
- **`fetchObjDependencies(...)`**: Fetch MTL files + textures for OBJ models
- **`fetchGltfDependencies(...)`**: Fetch bins + textures for GLTF models
- **`loadModelWithDependencies(...)`**: Main entry point for multi-file loading

#### Key Features:

- **Regex parsing** for material/texture references (like WARP-LAB)
- **Promise.allSettled** for robust error handling (graceful degradation)
- **Security**: All fetches go through our API endpoints
- **Logging**: Comprehensive console logging for debugging

### 2. Backend API Endpoint (`lib/Controller/ApiController.php`)

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

### 3. ViewerComponent Integration Stub

Updated `ViewerComponent.vue` to detect multi-file formats:

```javascript
const isMultiFile = ['obj', 'gltf'].includes(extension)
if (isMultiFile) {
    console.info('[ThreeDViewer] Multi-file format detected...')
    // TODO: Full integration
}
```

## How It Works (Design)

### For OBJ Models:

```
1. Fetch model.obj via /api/file/{fileId}
2. Parse OBJ content for "mtllib material.mtl"
3. Fetch material.mtl via /api/file/by-path?path=/models/material.mtl
4. Parse MTL content for "map_Kd texture.jpg"
5. Fetch texture.jpg via /api/file/by-path?path=/models/texture.jpg
6. Pass all files to OBJLoader
```

### For GLTF Models:

```
1. Fetch model.gltf via /api/file/{fileId}
2. Parse JSON for buffers[].uri and images[].uri
3. Fetch each dependency via /api/file/by-path
4. Pass all files to GLTFLoader
```

### For GLB/STL/PLY (Single-File):

```
1. Fetch model via /api/file/{fileId}
2. Load directly (no dependencies)
```

## Comparison with WARP-LAB Approach

### ✅ What We Kept:

- **Regex parsing** for MTL/texture references
- **Promise.allSettled** pattern for robust fetching
- **Graceful degradation** (missing textures don't break loading)
- **Console logging** for debugging

### 🔄 What We Changed:

| WARP-LAB | Our Implementation |
|----------|-------------------|
| Fetch from WebDAV URLs directly | Fetch via secure API endpoints |
| Uses `online-3d-viewer` library | Uses Three.js directly + custom loaders |
| Single Vue component (~600 lines) | Modular architecture (registry + helpers) |
| No backend controllers | PHP API controllers with auth |

### ✅ Our Advantages:

1. **Better Security**: All file access goes through authenticated API with permission checks
2. **Separation of Concerns**: Parsing logic separated from loading logic
3. **Reusable**: Both simple & advanced viewers can use the same helpers
4. **Type Safety**: Can add TypeScript types later

## Next Steps

### Phase 2: Full Integration (TODO)

1. **Update Loaders** to accept multiple File objects:
   ```javascript
   // In src/loaders/types/obj.js
   export async function loadObj(arrayBuffer, context, additionalFiles) {
       // additionalFiles = [mtlFile1, textureFile1, textureFile2, ...]
   }
   ```

2. **Wire Up ViewerComponent**:
   ```javascript
   if (isMultiFile) {
       const { loadModelWithDependencies } = await import('../loaders/multiFileHelpers.js')
       const result = await loadModelWithDependencies(this.fileid, this.filename, extension, dirPath)
       // Pass result.allFiles to loader
   }
   ```

3. **Test with Real Files**:
   - Upload OBJ + MTL + textures
   - Upload GLTF + bins + textures
   - Verify all dependencies load correctly

4. **Error Handling**:
   - Show toast notifications for missing dependencies
   - Fall back to placeholder materials when textures fail
   - Log comprehensive error details

### Phase 3: Advanced Features (Future)

- **Dependency Resolution**: Smart path resolution for relative vs absolute paths
- **Caching**: Cache dependency files to avoid re-fetching
- **Progress Tracking**: Show progress bar for multi-file downloads
- **Batch API**: Single API call to fetch all dependencies
- **Public Share Support**: Extend to work with share tokens

## Testing Checklist

- [ ] Test OBJ without MTL (should work)
- [ ] Test OBJ with MTL but no textures (should work with default materials)
- [ ] Test OBJ with MTL and textures (should work fully)
- [ ] Test GLTF with embedded buffers/images (should work, skip fetch)
- [ ] Test GLTF with external bins/textures (should fetch dependencies)
- [ ] Test GLB (should work, single file)
- [ ] Test with missing dependencies (should gracefully degrade)
- [ ] Test with incorrect paths (should show error)
- [ ] Test permission errors (user can't read dependency)
- [ ] Test large files (>10MB) with multiple textures

## File Structure

```
src/loaders/
├── multiFileHelpers.js       [NEW] Multi-file parsing & fetching
├── registry.js               [EXISTING] Loader selection
└── types/
    ├── obj.js                [TODO] Update to accept additionalFiles
    ├── gltf.js               [TODO] Update to accept additionalFiles
    └── ...

lib/Controller/
└── ApiController.php         [MODIFIED] Added getFileByPath endpoint

src/views/
└── ViewerComponent.vue       [MODIFIED] Added multi-file detection stub
```

## Performance Considerations

1. **Parallel Fetching**: All dependencies fetched with `Promise.allSettled`
2. **Network Overhead**: Each file = 1 HTTP request (could batch later)
3. **Memory**: All files loaded into memory (File objects)
4. **Bundle Size**: No new dependencies added (uses built-in fetch)

## Security Considerations

1. **Path Traversal**: Prevented by normalizing paths and user folder scoping
2. **Authentication**: All endpoints require auth (`#[NoAdminRequired]`)
3. **Permission Checks**: File read permissions verified
4. **Error Messages**: No sensitive path info leaked in errors

## Known Limitations

1. **Path Resolution**: Assumes dependencies in same directory as main file
2. **No Caching**: Re-fetches dependencies on every load
3. **Sequential MTL Parsing**: Could parallelize MTL fetches + texture parsing
4. **No Progress Tracking**: User doesn't see download progress for dependencies
5. **Share Token Support**: Not yet implemented for public shares

## References

- **WARP-LAB Implementation**: https://github.com/WARP-LAB/files_3dmodelviewer/tree/main
- **Key File**: `src/js/App/App.mjs` lines 259-338 (OBJ/MTL/texture loading)
- **Helper Functions**: `src/js/helpers/warp-helpers.mjs` (fetchFileFromUrl)
- **Online-3D-Viewer**: https://www.npmjs.com/package/online-3d-viewer

## Summary

We've implemented the **infrastructure** for multi-file 3D model loading (OBJ+MTL+textures, GLTF+bins+images) using a secure, modular approach inspired by WARP-LAB but adapted to our architecture.

**Status**: ✅ Infrastructure ready, ⏳ Full integration pending

**Next Action**: Complete Phase 2 integration and test with real multi-file models.
