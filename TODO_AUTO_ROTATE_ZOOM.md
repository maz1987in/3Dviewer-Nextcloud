# TODO: Fix Auto-Rotate Zoom Issue

## Problem
When auto-rotate is enabled in the main ThreeViewer page, mouse wheel zoom does not work. The wheel events are received and all OrbitControls settings are correct (`enableZoom: true`, `autoRotate: true`), but the camera does not zoom in/out.

## Current Behavior
- Auto-rotate OFF → Zoom works perfectly ✅
- Auto-rotate ON → Zoom does NOT work ❌
- Wheel events ARE received during auto-rotate
- All OrbitControls settings are correct

## What We Tried
1. ✅ Enabled OrbitControls' built-in `autoRotate` feature
2. ✅ Explicitly set `enableZoom: true`, `enableRotate: true`, `enablePan: true`
3. ✅ Set `zoomSpeed: 1.0` and `rotateSpeed: 1.0`
4. ❌ Removed custom wheel event listener (was interfering)
5. ❌ Disabled `onControlsChange` listener during auto-rotate
6. ❌ Tried disabling damping during auto-rotate
7. ❌ Tried forcing `controls.update()` after wheel events

## Expected Behavior
The standard OrbitControls behavior:
- Auto-rotate ON → Model rotates automatically
- User scrolls to zoom → Auto-rotate pauses, zoom works
- User stops scrolling → Auto-rotate resumes

## Investigation Needed
1. Compare ThreeViewer setup with ViewerComponent (which works)
2. Check if there are other event listeners interfering
3. Verify animation loop is calling `controls.update()` correctly
4. Test if the issue is specific to damping + auto-rotate combination
5. Consider using a different approach (custom rotation instead of OrbitControls auto-rotate)

## Files Involved
- `src/composables/useCamera.js` - Camera and controls setup
- `src/components/ThreeViewer.vue` - Main viewer component
- Lines 119-126, 169-189, 644-651 in useCamera.js

## Notes
- This might be a known OrbitControls limitation with damping enabled
- May need to implement custom auto-rotate instead of using OrbitControls' built-in feature
- The modal viewer (ViewerComponent) doesn't have auto-rotate, so we can't compare directly

