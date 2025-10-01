# Viewer Handler Registration Fix (October 1, 2025)

## Problem

Files still triggered download dialog even after fixing MIME type registration. Browser console showed:
```
[INFO] viewer: 5 viewer handlers registered
```

But it should show **6** handlers (including ours), indicating our handler was NOT being registered.

## Root Cause

The `LoadViewerListener` only fires when the **Viewer modal opens**, but by that time the Files app has already decided which files are "viewable" vs "downloadable" based on which handlers were registered at page load.

**Timing Issue**:
1. Files app loads → checks `OCA.Viewer.availableHandlers` → only finds 5 handlers
2. User clicks 3D file → Files app sees no handler → triggers download
3. (Never reached) Viewer would load → LoadViewerListener fires → our handler registers

## Solution

Register our script to load **before template renders** using `BeforeTemplateRenderedEvent`, ensuring the handler is available when Files app initializes.

### Code Changes

**Created**: `lib/Listener/LoadFilesListener.php`
```php
<?php
namespace OCA\ThreeDViewer\Listener;

use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

class LoadFilesListener implements IEventListener {
    public function handle(Event $event): void {
        if (!$event instanceof BeforeTemplateRenderedEvent) {
            return;
        }

        if (!$event->isLoggedIn() && !$event->isPublic()) {
            return;
        }

        // Load viewer handler script early
        Util::addScript('threedviewer', 'threedviewer-main');
    }
}
```

**Updated**: `lib/AppInfo/Application.php`
```php
public function register(IRegistrationContext $context): void {
    // Existing: Load when Viewer opens (for modal)
    if (class_exists('OCA\Viewer\Event\LoadViewer')) {
        $context->registerEventListener(
            \OCA\Viewer\Event\LoadViewer::class, 
            LoadViewerListener::class
        );
    }

    // NEW: Load on every page (for Files app)
    $context->registerEventListener(
        BeforeTemplateRenderedEvent::class, 
        LoadFilesListener::class
    );
}
```

## Verification

### Check Handler Count

**Before Fix**: Browser console shows
```javascript
OCA.Viewer.availableHandlers.length  // Returns: 5 ❌
```

**After Fix**: Browser console shows
```javascript
OCA.Viewer.availableHandlers.length  // Returns: 6 ✅
```

### Check Our Handler

```javascript
OCA.Viewer.availableHandlers.find(h => h.id === 'threedviewer')
// Should return: { id: 'threedviewer', group: '3d-models', mimes: [...], component: ... }
```

### Check MIME Types

```javascript
const handler = OCA.Viewer.availableHandlers.find(h => h.id === 'threedviewer')
console.log(handler.mimes)
// Should show: ['model/gltf-binary', 'model/gltf+json', 'model/obj', ...]
```

## Impact

| Before | After |
|--------|-------|
| ❌ Handler registered too late | ✅ Handler registered at page load |
| ❌ Files app sees no viewer | ✅ Files app recognizes 3D viewer |
| ❌ 3D files trigger download | ✅ 3D files open in viewer |
| ❌ 5 handlers registered | ✅ 6 handlers registered |

## Testing Steps

1. **Hard refresh browser**: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
2. **Check console**: `OCA.Viewer.availableHandlers.length` should be 6
3. **Click 3D file**: Should open in viewer modal, NOT download
4. **Check handler**: Our handler should be in the list

## Related Files

- `lib/Listener/LoadFilesListener.php` - NEW: Loads script early
- `lib/Listener/LoadViewerListener.php` - Existing: Loads script when Viewer opens
- `lib/AppInfo/Application.php` - Registers both listeners
- `src/main.js` - Registers handler with `OCA.Viewer.registerHandler()`

## Key Insight

**Order matters**: Handler registration must happen BEFORE Files app checks which files are viewable. Using `BeforeTemplateRenderedEvent` ensures our script loads at page initialization, not just when the Viewer modal opens.

## Prevention

Future viewer apps should:
1. Always use `BeforeTemplateRenderedEvent` for handler registration
2. Keep `LoadViewer` event for additional modal-specific initialization
3. Test handler count in console: should increase after app is enabled

## Troubleshooting

If files still download after this fix:

1. **Check handler count**:
   ```javascript
   OCA.Viewer.availableHandlers.length  // Should be 6
   ```

2. **Check handler exists**:
   ```javascript
   OCA.Viewer.availableHandlers.find(h => h.id === 'threedviewer')  // Should return object
   ```

3. **Hard refresh**: Ctrl+Shift+R to clear cached JavaScript

4. **Check MIME types registered**: See MIME_TYPE_FIX_SUMMARY.md

5. **Check browser console for errors**: Any JavaScript errors preventing registration?
