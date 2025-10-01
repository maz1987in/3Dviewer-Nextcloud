# ModelFileSupport Service Analysis

## Purpose

`ModelFileSupport` is a **centralized configuration service** that acts as the single source of truth for:
- Supported 3D file formats
- MIME type mappings
- File validation logic

## Current Usage

### Controllers (3 places)
1. **`BaseController`** - Validates extensions and checks support
   ```php
   protected function validateFileExtension(string $extension): string {
       if (!$this->modelFileSupport->isSupported($normalizedExt)) {
           throw new UnsupportedFileTypeException(...);
       }
   }
   ```

2. **`FileController`** - Lists files and validates extensions
   ```php
   if ($this->modelFileSupport->isSupported($extension)) {
       // Include in results
   }
   ```

3. **`ThumbnailController`** - Uses it (via DI)

4. **`PublicFileController`** - Uses it (via DI)

### Services (1 place)
1. **`ResponseBuilder`** - Maps extensions to Content-Type headers
   ```php
   $response->addHeader('Content-Type', $this->modelFileSupport->mapContentType($extension));
   ```

### Tests (6 test files)
- `ModelFileSupportTest.php`
- `ModelFileSupport3mfTest.php`
- `ModelFileSupport3dsTest.php`
- `FileServiceTest.php` (mocked)
- `FileServiceSiblingTest.php` (mocked)
- `ShareFileServiceTest.php` (mocked)

## Comparison with MIME Type System

### MIME Type Registration (RegisterThreeDMimeTypes.php)
```php
// Registers in Nextcloud's global MIME type system
'glb' => ['model/gltf-binary'],
'gltf' => ['model/gltf+json'],
// ... stored in config/mimetypemapping.json
```

### ModelFileSupport Service
```php
// Application-level validation and mapping
private array $supported = ['glb','gltf','obj','stl','ply','mtl','fbx','3mf','3ds'];
public function mapContentType(string $ext): string {
    return match (strtolower($ext)) {
        'glb' => 'model/gltf-binary',
        // ...
    };
}
```

## ⚠️ Issue: Duplication

We have **TWO separate lists** of supported formats:

| Location | Purpose | Formats |
|----------|---------|---------|
| `RegisterThreeDMimeTypes.php` | Global NC MIME registration | 10 formats |
| `ModelFileSupport.php` | App-level validation | 9 formats |

### Discrepancy Found:
- `RegisterThreeDMimeTypes` includes: `'dae' => ['model/vnd.collada+xml']`
- `ModelFileSupport` **missing**: `'dae'` (COLLADA format)

## ✅ Do We Need ModelFileSupport?

**YES** - But with improvements:

### Why We Need It

1. **Security** - Validates extensions before streaming files (prevents arbitrary file reads)
2. **Single Source of Truth** - One place to add new format support
3. **MIME Type Mapping** - Provides Content-Type headers for streaming
4. **MTL Resolution** - Handles OBJ material file lookups
5. **Testability** - Can be easily mocked in unit tests

### Why Not Just Use Nextcloud's MIME System?

Nextcloud's MIME type system:
- ✅ Makes files **clickable** (opens in viewer vs download)
- ✅ Provides file **icons**
- ❌ Doesn't provide **validation** for streaming
- ❌ Doesn't have **MTL sibling resolution**
- ❌ Not easily **testable** in unit tests

## 🔧 Recommended Improvements

### 1. Sync Format Lists

**Problem**: MIME registration and ModelFileSupport have different format lists.

**Solution**: Create a shared constant or move the list to one place.

```php
// Option A: Share the list
class ModelFileSupport {
    public const SUPPORTED_FORMATS = [
        'glb' => 'model/gltf-binary',
        'gltf' => 'model/gltf+json',
        'obj' => 'model/obj',
        'stl' => 'model/stl',
        'ply' => 'model/ply',
        'dae' => 'model/vnd.collada+xml',  // ADD MISSING
        '3mf' => 'model/3mf',
        'fbx' => 'model/x.fbx',
        '3ds' => 'application/x-3ds',
        'mtl' => 'text/plain',
    ];
}

// Then RegisterThreeDMimeTypes uses: ModelFileSupport::SUPPORTED_FORMATS
```

### 2. Add Missing COLLADA Support

`ModelFileSupport` should include `'dae'` to match MIME registration.

### 3. Improve Documentation

Add inline comment explaining the relationship:
```php
/**
 * IMPORTANT: This list must stay in sync with RegisterThreeDMimeTypes::EXT_MIME_MAP
 * When adding a new format:
 * 1. Add to RegisterThreeDMimeTypes for global MIME registration
 * 2. Add to ModelFileSupport for app-level validation
 * 3. Add loader in ThreeViewer.vue frontend
 */
```

## Decision: Keep or Remove?

### ✅ **KEEP IT** - Essential Service

**Reasons**:
1. Security validation before streaming
2. MTL sibling resolution is unique functionality
3. Testable abstraction for controllers
4. Single place to manage format support

**Action Items**:
1. Add missing `'dae'` format
2. Sync format lists between MIME registration and ModelFileSupport
3. Document the relationship
4. Consider extracting format list to shared constant

## Alternative Architectures Considered

### ❌ Option 1: Remove ModelFileSupport, Use MIME System Directly
**Rejected**: No validation layer, can't mock in tests, no MTL resolution

### ❌ Option 2: Only Use ModelFileSupport, Skip MIME Registration
**Rejected**: Files won't open in viewer (will download instead)

### ✅ Option 3: Keep Both, But Sync Them (RECOMMENDED)
**Selected**: Clear separation of concerns, both systems have distinct purposes

## Conclusion

`ModelFileSupport` is a **necessary service** that serves a different purpose than MIME type registration:

- **MIME Registration** = Global Nextcloud system (makes files clickable)
- **ModelFileSupport** = App security & business logic (validates, maps, resolves)

The only issue is **inconsistent format lists** which should be fixed by syncing them.
