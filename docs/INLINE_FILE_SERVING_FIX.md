# Inline File Serving Fix (October 1, 2025)

## Problem

When clicking 3D model files in Nextcloud Files, the browser triggered a **download dialog** instead of rendering the model in the viewer. Files were being served with `Content-Disposition: attachment` header.

## Root Cause

The `ApiController.php` was using `FileDisplayResponse`, which by default serves files as attachments (triggering downloads) rather than displaying them inline in the browser.

## Solution

### Changed Response Type

Replaced `FileDisplayResponse` with `StreamResponse` in both API endpoints:
- `GET /apps/threedviewer/api/file/{fileId}` - Get file by ID
- `GET /apps/threedviewer/api/file/by-path` - Get file by path (for multi-file models)

### Updated Headers

Now explicitly sets:
```php
$response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
$response->addHeader('Content-Type', $file->getMimeType());
$response->addHeader('Content-Length', (string)$file->getSize());
$response->addHeader('Cache-Control', 'public, max-age=3600');
```

### Code Changes

**Before** (`FileDisplayResponse`):
```php
return new FileDisplayResponse(
    $file,
    Http::STATUS_OK,
    ['Content-Type' => $file->getMimeType()]
);
```

**After** (`StreamResponse`):
```php
$stream = $file->fopen('r');
if ($stream === false) {
    return new DataResponse(['error' => 'Failed to open file'], Http::STATUS_INTERNAL_SERVER_ERROR);
}

$response = new StreamResponse($stream);
$response->addHeader('Content-Type', $file->getMimeType());
$response->addHeader('Content-Length', (string)$file->getSize());
$response->addHeader('Content-Disposition', 'inline; filename="' . addslashes($file->getName()) . '"');
$response->addHeader('Cache-Control', 'public, max-age=3600');

return $response;
```

## Benefits

1. **Files display inline** - Browser renders content instead of downloading
2. **Better error handling** - Returns proper JSON error responses instead of throwing exceptions
3. **Improved caching** - Added Cache-Control header for better performance
4. **Security** - Proper filename escaping in Content-Disposition header
5. **Follows Nextcloud patterns** - Matches implementation in `PublicFileController.php`

## Reference

- Nextcloud Filesystem API: https://docs.nextcloud.com/server/stable/developer_manual/basics/storage/filesystem.html
- Similar pattern used in: `lib/Controller/PublicFileController.php`

## Testing

1. Log into Nextcloud
2. Navigate to Files app
3. Click a GLB/GLTF/OBJ file
4. **Expected**: Viewer opens with model rendered
5. **Not Expected**: Download dialog appears

## Related Issues

This fix also resolved the route registration issue caused by a duplicate `lib/AppInfo/Application.php` file (see separate documentation).
