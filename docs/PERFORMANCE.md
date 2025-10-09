# Performance Monitoring System

**Component**: `usePerformance.js` composable  
**Status**: ✅ Production Ready  
**Last Updated**: October 9, 2025

---

## Overview

The ThreeDViewer includes a comprehensive performance monitoring and optimization system that automatically detects browser capabilities and adjusts rendering quality for optimal user experience.

### Key Features

- **🤖 Auto-Detection**: Automatically detects hardware capabilities and sets optimal quality
- **📊 Real-time Monitoring**: Live FPS, frame time, memory usage, draw calls, and triangle count
- **⚙️ Manual Control**: 5 quality presets (Low, Balanced, High, Ultra, Auto)
- **🎨 Visual Overlay**: Optional performance stats display (toggle with eye icon 👁️)
- **🔧 Smart Optimization**: Browser scoring system (0-100+) for quality recommendations

---

## Performance Modes

### Mode Descriptions

| Mode | Pixel Ratio | Shadows | Antialias | Target FPS | Use Case |
|------|-------------|---------|-----------|------------|----------|
| **Low** | 0.5x | ❌ | ❌ | 30 | Old hardware, mobile devices |
| **Balanced** | 1.0x | ✅ | ✅ | 60 | Mid-range systems |
| **High** | 1.5x | ✅ | ✅ | 60 | Good desktops (recommended) |
| **Ultra** | 2.0x | ✅ | ✅ | 120 | High-end gaming PCs |
| **Auto** | Detected | Detected | Detected | 60 | **Default** - Smart detection |

### Mode Selection Guide

- **Auto Mode** (Default): System automatically detects hardware and chooses optimal settings
- **Manual Modes**: Use when you want fixed quality regardless of model complexity

### How to Change Mode

Click the **⚡ Performance** button in the toolbar to cycle through modes:
```
Auto → Balanced → High → Ultra → Low → Auto
```

---

## Browser Capability Detection

### Scoring System

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

### Score Thresholds

| Score Range | Recommended Mode | Expected Performance |
|-------------|------------------|----------------------|
| 0-24 | Low | 30 FPS, basic quality |
| 25-54 | Balanced | 60 FPS, good quality |
| 55+ | High | 60 FPS, high quality (1.5x rendering) |

**Example**: WebGL2 + 16K textures + 4GB RAM + 4 cores = **60 points** → **High mode** (1.5x pixel ratio)

---

## Visual Performance Overlay

### Enabling the Overlay

Click the **👁️ Eye Icon** button in the toolbar to toggle the performance stats panel.

### Understanding the Stats

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

**Color Indicators**:
- 🟢 **Green**: FPS ≥ 60 (excellent)
- 🟡 **Yellow**: FPS 30-59 (acceptable)
- 🔴 **Red**: FPS < 30 (poor)

---

## Integration Guide

### For Developers

#### 1. Import the Composable

```javascript
import { usePerformance } from '../composables/usePerformance.js'
```

#### 2. Initialize in Component

```javascript
// In setup()
const performance = usePerformance()

// After renderer creation
performance.initPerformance(renderer.value)

// Set initial mode (auto recommended)
performance.setPerformanceMode('auto', renderer.value)
```

#### 3. Update in Animation Loop

```javascript
const animate = () => {
	requestAnimationFrame(animate)
	
	// Update performance metrics every frame
	performance.updatePerformanceMetrics(renderer.value, scene.value)
	
	// Your render code
	renderer.value.render(scene.value, camera.value)
}
```

#### 4. Change Modes Dynamically

```javascript
// User clicks performance button
const onTogglePerformance = () => {
	const modes = ['auto', 'balanced', 'high', 'ultra', 'low']
	const currentIndex = modes.indexOf(performanceMode.value)
	const nextIndex = (currentIndex + 1) % modes.length
	performanceMode.value = modes[nextIndex]
	
	// Apply to viewer
	performance.setPerformanceMode(performanceMode.value, renderer.value)
}
```

---

## Technical Details

### Pixel Ratio Explained

**Pixel Ratio** controls the resolution at which Three.js renders the 3D scene:

- **0.5x**: Renders at 50% resolution, then scales up (fastest, lowest quality)
- **1.0x**: Native resolution matching display (balanced)
- **1.5x**: Renders at 150% resolution, then scales down (supersampling - sharper)
- **2.0x**: Renders at 200% resolution (ultra quality, GPU intensive)

**Example**: On a 1920×1080 canvas:
- 0.5x = 960×540 render → scaled to 1920×1080
- 1.5x = 2880×1620 render → scaled to 1920×1080 (2.25× more pixels!)

### Auto-Optimization (Disabled in Auto Mode)

The system includes an optional auto-optimizer that can reduce quality when FPS drops below 30. However, this is **disabled in Auto mode** because:

1. Auto mode already chose optimal settings based on hardware detection
2. Brief FPS drops during model loading would trigger unnecessary quality reduction
3. Users get predictable quality instead of dynamic changes

**Status**: Currently disabled for all modes to provide consistent quality.

---

## Troubleshooting

### Issue: Blurry Models in Auto Mode

**Symptoms**:
- Auto mode selects correctly but image looks blurry
- Drawing buffer size smaller than expected

**Solution**:
1. Check browser console for detection logs
2. Verify `renderer.getContext('webgl2').drawingBufferWidth` matches expected resolution
3. Try manually selecting "High" mode to confirm hardware can handle 1.5x

### Issue: Low FPS in High/Ultra Mode

**Symptoms**:
- FPS drops below 30 in high quality modes
- Performance panel shows red FPS indicator

**Solution**:
1. Switch to "Auto" mode (system will choose appropriate quality)
2. Manually select "Balanced" or "Low" mode
3. Check model complexity (triangles count in stats)

### Issue: Performance Stats Not Showing

**Symptoms**:
- Overlay doesn't appear after clicking eye icon
- No FPS counter visible

**Solution**:
1. Ensure performance monitoring is initialized
2. Check browser console for errors
3. Verify eye icon button is triggering `showPerformanceOverlay` toggle

### Debugging Console Commands

```javascript
// Check current pixel ratio
renderer.getPixelRatio()

// Check drawing buffer resolution
const gl = renderer.getContext('webgl2')
console.log(`Drawing buffer: ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`)

// Check performance mode
console.log('Mode:', performance.currentPerformanceMode.value)
console.log('Pixel ratio:', performance.currentPixelRatio.value)
```

---

## Known Limitations

1. **Antialias**: Cannot be changed after renderer creation (requires full re-initialization)
2. **Auto-optimizer**: Currently disabled for all modes (predictable quality prioritized)
3. **Mobile Detection**: Based on user agent string (may not catch all devices)
4. **Memory Stats**: Only available in Chromium-based browsers (performance.memory API)

---

## Future Enhancements

- [ ] Per-model quality presets (remember user preference per file)
- [ ] Adaptive quality based on model complexity
- [ ] GPU detection and scoring (currently CPU/RAM focused)
- [ ] Advanced LOD (Level of Detail) system for large models
- [ ] Thumbnail quality presets for file browser

---

## References

- **Code**: `src/composables/usePerformance.js` (742 lines)
- **Integration**: `src/components/ThreeViewer.vue` (lines 395-430)
- **UI**: `src/components/ViewerToolbar.vue` (performance button)
- **Overlay**: `src/components/ThreeViewer.vue` (PerformanceOverlay component)

---

## Changelog

### October 9, 2025
- ✅ Integrated performance monitoring into ThreeViewer
- ✅ Added browser capability detection (scoring system)
- ✅ Fixed pixel ratio bugs (Math.min issues)
- ✅ Disabled auto-optimizer in auto mode (prevents quality reduction)
- ✅ Added visual performance overlay (6 stats)
- ✅ Cleaned up excessive console.log statements
- ✅ Added all 5 performance modes to toolbar button

### Known Fixed Issues (October 9, 2025)
1. **Panel Positioning**: Moved from top to bottom-left to avoid toolbar overlap
2. **Auto Mode Quality**: Added browser capability detection (WebGL2, RAM, CPU scoring)
3. **Reactive Panel**: Fixed variable name collision (`performanceMode` prop vs exposed value)
4. **Ultra Mode Missing**: Added ultra mode to toolbar cycle (was excluded)
5. **Mode Switch Detection**: Auto mode now re-runs detection when switched to
6. **Apply Settings Bug**: `setPerformanceMode()` now calls `applyPerformanceSettings()`
7. **Pixel Ratio Bug**: Removed `Math.min(1.5, devicePixelRatio)` logic preventing supersampling
8. **Resize Bug**: `onWindowResize()` now preserves pixel ratio across resizes
9. **Auto-optimizer Conflict**: Disabled in auto mode to trust hardware detection

---

## Historical Documentation

Detailed bug fix investigations archived in [`docs/archived/`](./archived/):
- `PERFORMANCE_FIXES.md` - Panel positioning + initial quality bugs
- `SMART_AUTO_QUALITY.md` - Reactive panel + browser detection implementation
- `AUTO_MODE_DETECTION_FIX.md` - Mode switching detection bug
- `ULTRA_MODE_FIX.md` - Ultra mode availability fix

**For code changes, see Git commit history.**
