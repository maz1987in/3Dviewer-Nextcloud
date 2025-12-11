# Composables API Reference

This document provides a comprehensive reference for all Vue composables used in the 3D Viewer application.

**Last Updated**: 2025-01-XX

---

## Table of Contents

- [Overview](#overview)
- [Core Composables](#core-composables)
  - [useScene](#usescene)
  - [useCamera](#usecamera)
  - [useModelLoading](#usemodelloading)
- [UI Composables](#ui-composables)
  - [useUI](#useui)
  - [useTheme](#usetheme)
  - [useMobile](#usemobile)
- [Feature Composables](#feature-composables)
  - [useAnnotation](#useannotation)
  - [useMeasurement](#usemeasurement)
  - [useComparison](#usecomparison)
  - [useExport](#useexport)
  - [useScreenshot](#usescreenshot)
  - [useSlicerIntegration](#useslicerintegration)
- [Performance Composables](#performance-composables)
  - [usePerformance](#useperformance)
  - [useProgressiveTextures](#useprogressivetextures)
  - [useModelStats](#usemodelstats)
- [Utility Composables](#utility-composables)
  - [useFaceLabels](#usefacelabels)
  - [useController](#usecontroller)
- [Usage Examples](#usage-examples)
- [Vue 3 Migration Notes](#vue-3-migration-notes)

---

## Overview

The 3D Viewer uses Vue 2.7's Composition API (via `@vue/composition-api` compatibility layer) to organize functionality into reusable composables. All composables follow a consistent pattern:

- **State Management**: Use `ref()` and `computed()` for reactive state
- **Lifecycle**: Use Vue lifecycle hooks (`onMounted`, `onUnmounted`, etc.)
- **Return API**: Return an object with reactive refs, computed properties, and methods
- **Logging**: Use centralized `logger` utility instead of `console.log`

### Design Principles

1. **Single Responsibility**: Each composable handles one specific domain
2. **Reactive State**: All state is reactive using Vue's reactivity system
3. **Composability**: Composables can be combined and nested
4. **Type Safety**: JSDoc comments provide type information
5. **Error Handling**: Centralized error handling via logger

---

## Core Composables

### useScene

**Purpose**: Manages Three.js scene, renderer, lighting, and helpers.

**Location**: `src/composables/useScene.js`

**State**:
- `scene` (ref): THREE.Scene instance
- `renderer` (ref): THREE.WebGLRenderer instance
- `grid` (ref): GridHelper instance
- `axes` (ref): AxesHelper instance
- `lights` (ref): Array of light objects
- `helpers` (ref): Array of helper objects
- `backgroundColor` (ref): Current background color
- `fog` (ref): Fog instance
- `shadows` (ref): Shadow enabled state
- `antialias` (ref): Antialiasing enabled state
- `fps` (ref): Current FPS

**Computed**:
- `isSceneReady`: Whether scene and renderer are initialized
- `hasGrid`: Whether grid helper exists
- `hasAxes`: Whether axes helper exists
- `lightCount`: Number of lights
- `helperCount`: Number of helpers
- `currentFPS`: Current FPS value

**Methods**:
- `initScene(container, options)`: Initialize scene and renderer
- `setupLighting(options)`: Configure scene lighting
- `setupHelpers(options)`: Add grid and axes helpers
- `updateSize(width, height)`: Resize renderer
- `render(camera)`: Render the scene
- `getSceneStats()`: Get scene statistics
- `applyThemeToScene(theme)`: Apply theme colors
- `dispose()`: Clean up resources

**Usage Example**:
```javascript
// Options API
import { useScene } from '@/composables/useScene.js'

export default {
  setup() {
    const sceneComposable = useScene()
    return {
      sceneComposable
    }
  },
  mounted() {
    const container = this.$refs.viewerContainer
    this.sceneComposable.initScene(container, {
      backgroundColor: '#1a1a1a',
      shadows: true,
      antialias: true
    })
  }
}
```

---

### useCamera

**Purpose**: Manages camera, controls, animations, and view presets.

**Location**: `src/composables/useCamera.js`

**State**:
- `camera` (ref): Active camera (perspective or orthographic)
- `controls` (ref): OrbitControls instance
- `cameraType` (ref): 'perspective' | 'orthographic'
- `autoRotateEnabled` (ref): Auto-rotate state
- `autoRotateSpeed` (ref): Auto-rotate speed
- `isAnimating` (ref): Animation state
- `isMobile` (ref): Mobile device detection

**Computed**:
- `currentCamera`: Active camera instance
- `isAutoRotating`: Auto-rotate enabled state
- `currentAutoRotateSpeed`: Current rotation speed

**Methods**:
- `initCamera(container, options)`: Initialize camera and controls
- `initPerspectiveCamera(width, height)`: Create perspective camera
- `initOrthographicCamera(width, height)`: Create orthographic camera
- `fitToObject(object)`: Fit camera to object bounds
- `setViewPreset(presetName)`: Apply view preset (front, back, left, right, top, orbit)
- `toggleAutoRotate()`: Toggle auto-rotation
- `setAutoRotateSpeed(speed)`: Set rotation speed
- `updateSize(width, height)`: Resize camera
- `dispose()`: Clean up resources

**Usage Example**:
```javascript
// Composition API
import { useCamera } from '@/composables/useCamera.js'

export default {
  setup() {
    const { camera, controls, initCamera, fitToObject } = useCamera()
    
    onMounted(() => {
      const container = document.getElementById('viewer')
      initCamera(container, { fov: 75 })
    })
    
    return {
      camera,
      controls,
      fitToObject
    }
  }
}
```

---

### useModelLoading

**Purpose**: Handles 3D model loading, progress tracking, and error management.

**Location**: `src/composables/useModelLoading.js`

**State**:
- `loading` (ref): Loading state
- `progress` (ref): Loading progress object
- `error` (ref): Error object
- `errorState` (ref): Formatted error state
- `modelRoot` (ref): Loaded model root Object3D
- `currentFileId` (ref): Current file ID
- `hasDraco` (ref): DRACO decoder availability
- `hasKtx2` (ref): KTX2 decoder availability
- `hasMeshopt` (ref): Meshopt decoder availability

**Computed**:
- `isLoading`: Loading state
- `hasError`: Error state
- `canRetry`: Whether retry is possible
- `progressPercentage`: Progress percentage (0-100)

**Methods**:
- `initDecoders()`: Initialize decoder availability checks
- `loadModel(fileId, filename, context)`: Load model from file ID
- `loadModelFromBuffer(arrayBuffer, extension, context)`: Load model from buffer
- `updateProgress(progressData)`: Update loading progress
- `handleLoadError(error, filename)`: Handle loading errors
- `retryLoad(loadFunction)`: Retry loading
- `clearModel()`: Clear current model
- `abortLoad()`: Cancel ongoing load

**Usage Example**:
```javascript
import { useModelLoading } from '@/composables/useModelLoading.js'

export default {
  setup() {
    const {
      loading,
      progress,
      error,
      modelRoot,
      loadModel,
      initDecoders
    } = useModelLoading()
    
    onMounted(async () => {
      await initDecoders()
      await loadModel(123, 'model.glb', {
        scene: scene.value,
        renderer: renderer.value
      })
    })
    
    return {
      loading,
      progress,
      error,
      modelRoot
    }
  }
}
```

---

## UI Composables

### useUI

**Purpose**: Manages UI state, toolbar visibility, and user interface controls.

**Location**: `src/composables/useUI.js`

**State**:
- `showGrid` (ref): Grid visibility
- `showAxes` (ref): Axes visibility
- `wireframe` (ref): Wireframe mode
- `background` (ref): Background color
- `autoRotate` (ref): Auto-rotate state
- `toolbarVisible` (ref): Toolbar visibility
- `settingsOpen` (ref): Settings panel state
- `helpOpen` (ref): Help panel state
- `isMobile` (ref): Mobile device detection

**Computed**:
- `isGridVisible`: Grid visibility state
- `isAxesVisible`: Axes visibility state
- `isWireframeMode`: Wireframe mode state
- `isAutoRotating`: Auto-rotate state
- `isToolbarVisible`: Toolbar visibility
- `isSettingsOpen`: Settings panel state
- `isHelpOpen`: Help panel state

**Methods**:
- `init(options)`: Initialize UI state
- `toggleGrid()`: Toggle grid visibility
- `toggleAxes()`: Toggle axes visibility
- `toggleWireframe()`: Toggle wireframe mode
- `setBackground(color)`: Set background color
- `toggleAutoRotate()`: Toggle auto-rotation
- `toggleToolbar()`: Toggle toolbar visibility
- `openSettings()`: Open settings panel
- `closeSettings()`: Close settings panel
- `openHelp()`: Open help panel
- `closeHelp()`: Close help panel
- `dispose()`: Clean up resources

---

### useTheme

**Purpose**: Manages theme switching (light/dark/auto) and RTL support.

**Location**: `src/composables/useTheme.js`

**State**:
- `currentTheme` (ref): 'auto' | 'light' | 'dark'
- `direction` (ref): 'ltr' | 'rtl'
- `systemTheme` (ref): Detected system theme

**Computed**:
- `resolvedTheme`: Resolved theme (auto resolves to system)
- `isRTL`: RTL direction state

**Methods**:
- `detectSystemTheme()`: Detect system theme preference
- `detectLanguageDirection()`: Detect RTL/LTR from document
- `applyThemeColors(theme)`: Apply theme CSS variables
- `applyDirection(dir)`: Apply text direction
- `setTheme(theme)`: Set theme
- `init()`: Initialize theme system

**Usage Example**:
```javascript
import { useTheme } from '@/composables/useTheme.js'

export default {
  setup() {
    const { resolvedTheme, setTheme, init } = useTheme()
    
    onMounted(() => {
      init()
    })
    
    return {
      theme: resolvedTheme,
      setTheme
    }
  }
}
```

---

### useMobile

**Purpose**: Detects mobile devices and provides mobile-specific utilities.

**Location**: `src/composables/useMobile.js`

**State**:
- `isMobile` (ref): Mobile device detection
- `isTablet` (ref): Tablet device detection
- `touchEnabled` (ref): Touch support detection

**Computed**:
- `isMobileDevice`: Mobile device state
- `isTabletDevice`: Tablet device state
- `hasTouchSupport`: Touch support state

**Methods**:
- `detectMobile()`: Detect mobile device
- `detectTablet()`: Detect tablet device
- `detectTouch()`: Detect touch support

---

## Feature Composables

### useAnnotation

**Purpose**: Handles 3D annotation creation, management, and interaction.

**Location**: `src/composables/useAnnotation.js`

**State**:
- `isActive` (ref): Annotation mode active state
- `annotations` (ref): Array of annotations
- `currentAnnotation` (ref): Current annotation being edited
- `annotationGroup` (ref): THREE.Group containing all annotations

**Computed**:
- `hasAnnotations`: Whether annotations exist
- `annotationCount`: Number of annotations

**Methods**:
- `init(scene)`: Initialize annotation system
- `toggleAnnotation()`: Toggle annotation mode
- `handleClick(event, camera)`: Handle click for annotation placement
- `addAnnotation(position, text)`: Add annotation
- `removeAnnotation(id)`: Remove annotation
- `clearAnnotations()`: Clear all annotations
- `dispose()`: Clean up resources

---

### useMeasurement

**Purpose**: Provides measurement tools for 3D models (distance, angle, area).

**Location**: `src/composables/useMeasurement.js`

**State**:
- `isActive` (ref): Measurement mode active
- `measurements` (ref): Array of measurements
- `currentMeasurement` (ref): Current measurement being created

**Methods**:
- `init(scene, camera)`: Initialize measurement system
- `toggleMeasurement()`: Toggle measurement mode
- `startMeasurement(point)`: Start new measurement
- `addPoint(point)`: Add point to measurement
- `finishMeasurement()`: Complete current measurement
- `clearMeasurements()`: Clear all measurements
- `dispose()`: Clean up resources

---

### useComparison

**Purpose**: Enables side-by-side model comparison.

**Location**: `src/composables/useComparison.js`

**State**:
- `isActive` (ref): Comparison mode active
- `primaryModel` (ref): Primary model Object3D
- `secondaryModel` (ref): Secondary model Object3D
- `comparisonMode` (ref): 'side-by-side' | 'overlay' | 'difference'

**Methods**:
- `init(scene)`: Initialize comparison system
- `toggleComparison()`: Toggle comparison mode
- `setPrimaryModel(model)`: Set primary model
- `setSecondaryModel(model)`: Set secondary model
- `setComparisonMode(mode)`: Set comparison mode
- `clearComparison()`: Clear comparison
- `dispose()`: Clean up resources

---

### useExport

**Purpose**: Handles 3D model export to various formats (GLB, STL, OBJ).

**Location**: `src/composables/useExport.js`

**State**:
- `exporting` (ref): Export in progress
- `exportProgress` (ref): Export progress
- `exportError` (ref): Export error

**Methods**:
- `exportAsGLB(object, filename)`: Export as GLB
- `exportAsSTL(object, filename)`: Export as STL
- `exportAsOBJ(object, filename)`: Export as OBJ
- `triggerDownload(blob, filename)`: Trigger file download

**Usage Example**:
```javascript
import { useExport } from '@/composables/useExport.js'

export default {
  setup() {
    const { exporting, exportAsGLB } = useExport()
    
    const handleExport = async () => {
      await exportAsGLB(modelRoot.value, 'my-model')
    }
    
    return {
      exporting,
      handleExport
    }
  }
}
```

---

### useScreenshot

**Purpose**: Captures screenshots of the 3D scene.

**Location**: `src/composables/useScreenshot.js`

**State**:
- `capturing` (ref): Screenshot capture in progress
- `lastScreenshot` (ref): Last captured screenshot data URL

**Methods**:
- `capture(renderer, camera, options)`: Capture screenshot
- `downloadScreenshot(dataUrl, filename)`: Download screenshot

---

### useSlicerIntegration

**Purpose**: Integrates with 3D printing slicer software.

**Location**: `src/composables/useSlicerIntegration.js`

**State**:
- `selectedSlicer` (ref): Selected slicer ID
- `slicerSettings` (ref): Slicer configuration
- `exportInProgress` (ref): Export state

**Methods**:
- `init()`: Initialize slicer integration
- `setSlicer(slicerId)`: Set active slicer
- `exportToSlicer(model, format)`: Export model to slicer
- `getSlicerList()`: Get available slicers

---

## Performance Composables

### usePerformance

**Purpose**: Monitors performance and manages quality settings.

**Location**: `src/composables/usePerformance.js`

**State**:
- `performanceMode` (ref): 'auto' | 'low' | 'medium' | 'high'
- `targetFPS` (ref): Target frame rate
- `currentFPS` (ref): Current frame rate
- `frameTime` (ref): Frame time in ms
- `memoryUsage` (ref): Memory usage in MB
- `drawCalls` (ref): Number of draw calls
- `triangles` (ref): Number of triangles

**Computed**:
- `currentPerformanceMode`: Current mode
- `currentFrameRate`: Current FPS
- `performanceScore`: Performance score (0-100)

**Methods**:
- `detectBrowserCapabilities(renderer)`: Detect browser capabilities
- `setPerformanceMode(mode)`: Set performance mode
- `updateFPS(fps)`: Update FPS tracking
- `optimizeForPerformance()`: Apply performance optimizations
- `startMonitoring(renderer)`: Start performance monitoring
- `stopMonitoring()`: Stop performance monitoring

---

### useProgressiveTextures

**Purpose**: Manages progressive texture loading for better performance.

**Location**: `src/composables/useProgressiveTextures.js`

**State**:
- `textureQueue` (ref): Queue of textures to load
- `loadedTextures` (ref): Map of loaded textures
- `loadingPriority` (ref): Loading priority strategy

**Methods**:
- `queueTexture(url, priority)`: Queue texture for loading
- `loadTexture(url)`: Load texture
- `getTexture(url)`: Get loaded texture
- `clearCache()`: Clear texture cache

---

### useModelStats

**Purpose**: Analyzes and provides statistics about loaded models.

**Location**: `src/composables/useModelStats.js`

**State**:
- `stats` (ref): Model statistics object
- `analyzing` (ref): Analysis in progress

**Methods**:
- `analyzeModel(model)`: Analyze model and generate stats
- `getStats()`: Get current statistics
- `clearStats()`: Clear statistics

---

## Utility Composables

### useFaceLabels

**Purpose**: Manages face labels for 3D models.

**Location**: `src/composables/useFaceLabels.js`

**State**:
- `labels` (ref): Array of face labels
- `labelRenderer` (ref): Label renderer instance

**Methods**:
- `init(renderer)`: Initialize label renderer
- `addLabel(face, text)`: Add label to face
- `removeLabel(id)`: Remove label
- `clearLabels()`: Clear all labels
- `dispose()`: Clean up resources

---

### useController

**Purpose**: Provides controller utilities and input handling.

**Location**: `src/composables/useController.js`

**State**:
- `controllerType` (ref): Controller type
- `controllerEnabled` (ref): Controller enabled state

**Methods**:
- `init(options)`: Initialize controller
- `enable()`: Enable controller
- `disable()`: Disable controller
- `handleInput(event)`: Handle input events
- `dispose()`: Clean up resources

---

## Usage Examples

### Options API Integration

```javascript
// In a Vue component using Options API
import { useScene, useCamera, useModelLoading } from '@/composables'

export default {
  name: 'ThreeViewer',
  setup() {
    // Initialize composables
    const sceneComposable = useScene()
    const cameraComposable = useCamera()
    const modelComposable = useModelLoading()
    
    // Return for use in Options API
    return {
      sceneComposable,
      cameraComposable,
      modelComposable
    }
  },
  mounted() {
    // Access composable methods
    const container = this.$refs.viewerContainer
    this.sceneComposable.initScene(container)
    this.cameraComposable.initCamera(container)
    
    // Access reactive state
    this.$watch(() => this.sceneComposable.scene.value, (scene) => {
      if (scene) {
        console.log('Scene ready')
      }
    })
  },
  methods: {
    async loadModel(fileId) {
      await this.modelComposable.loadModel(fileId, 'model.glb', {
        scene: this.sceneComposable.scene.value,
        renderer: this.sceneComposable.renderer.value
      })
    }
  }
}
```

### Composition API Usage

```javascript
// In a Vue component using Composition API
import { ref, onMounted, watch } from 'vue'
import { useScene, useCamera, useModelLoading } from '@/composables'

export default {
  setup() {
    const containerRef = ref(null)
    
    const { scene, renderer, initScene } = useScene()
    const { camera, controls, initCamera, fitToObject } = useCamera()
    const { loading, modelRoot, loadModel } = useModelLoading()
    
    onMounted(() => {
      if (containerRef.value) {
        initScene(containerRef.value)
        initCamera(containerRef.value)
      }
    })
    
    watch(modelRoot, (model) => {
      if (model && scene.value) {
        scene.value.add(model)
        fitToObject(model)
      }
    })
    
    return {
      containerRef,
      scene,
      renderer,
      camera,
      controls,
      loading,
      modelRoot,
      loadModel
    }
  }
}
```

### Combining Multiple Composables

```javascript
import { useScene, useCamera, useUI, useTheme } from '@/composables'

export default {
  setup() {
    const sceneComposable = useScene()
    const cameraComposable = useCamera()
    const uiComposable = useUI()
    const themeComposable = useTheme()
    
    // Initialize all
    onMounted(() => {
      themeComposable.init()
      uiComposable.init()
    })
    
    // Watch theme changes
    watch(() => themeComposable.resolvedTheme.value, (theme) => {
      sceneComposable.applyThemeToScene(theme)
    })
    
    return {
      sceneComposable,
      cameraComposable,
      uiComposable,
      themeComposable
    }
  }
}
```

---

## Vue 3 Migration Notes

### Current Status

The codebase uses **Vue 2.7** with the Composition API compatibility layer. All composables are written to be compatible with Vue 3 with minimal changes.

### Pre-Migration Work Completed ✅

The following Vue 3 incompatible patterns have been eliminated:

1. **Lifecycle Hooks**: All deprecated lifecycle hooks have been replaced:
   - `beforeDestroy` → `beforeUnmount` (in ViewerToolbar, ToastContainer, ViewerComponent, viewer-api.js)
   - `destroyed` → `unmounted` (none found, already using beforeUnmount/unmounted)

2. **Explicit Emits Declarations**: All components now have explicit `emits` declarations:
   - `ViewerToolbar`: 16 events declared
   - `ToastContainer`: 'dismiss' event declared
   - `ViewerComponent`: 4 events declared
   - `ViewerModal`: 2 events declared
   - `FileNavigation`: 2 events declared
   - `FileBrowser`: 5 events declared
   - `ThreeViewer`: Already had explicit emits (23 events)
   - `MinimalTopBar`: Already had explicit emits
   - `SlideOutToolPanel`: Already had explicit emits
   - Other components: Already had explicit emits or don't emit events

3. **No Implicit $listeners**: Verified no usage of implicit `$listeners` (removed in Vue 3)

### Migration Considerations

#### 1. Import Changes

**Vue 2.7 (Current)**:
```javascript
import { ref, computed } from 'vue'
```

**Vue 3 (Future)**:
```javascript
// Same imports - no change needed
import { ref, computed } from 'vue'
```

#### 2. Reactive API

**Current (Vue 2.7)**:
- Uses `ref()` and `computed()` - ✅ Compatible
- Uses `readonly()` - ✅ Compatible

**Vue 3**:
- Same API - ✅ No changes needed

#### 3. Lifecycle Hooks

**Current**:
```javascript
import { onMounted, onUnmounted } from 'vue'
```

**Vue 3**:
- Same API - ✅ No changes needed

#### 4. Template Refs

**Vue 2.7**:
```javascript
// Options API
this.$refs.container

// Composition API
const containerRef = ref(null)
```

**Vue 3**:
- Same API - ✅ No changes needed

#### 5. Watch API

**Vue 2.7**:
```javascript
watch(() => someRef.value, (newVal) => { ... })
```

**Vue 3**:
- Same API - ✅ No changes needed

### Dependency Compatibility Matrix

**Current Dependencies (Vue 2.7)**:
- `vue`: `^2.7.16` ✅ Compatible with Vue 3 (same API)
- `@nextcloud/vue`: `^8.33.0` ⚠️ Vue 2 only (Nextcloud 28+)
- `vue-material-design-icons`: `^5.3.1` ✅ Compatible with Vue 3
- `three`: `^0.181.2` ✅ Framework-agnostic, no changes needed

**Vue 3 Migration Requirements**:
- `vue`: Update to `^3.x` (API compatible, no code changes needed)
- `@nextcloud/vue`: Update to `^9.x` (Vue 3 support, requires Nextcloud 30+)
- `vue-material-design-icons`: ✅ Already compatible
- `three`: ✅ No changes needed

**Note**: `@nextcloud/vue` v9.x is available as alpha/beta for Vue 3 support. Full migration should align with Nextcloud 30+ release cycle.

### Required Changes for Vue 3

1. **Remove Compatibility Layer**: Remove `@vue/composition-api` dependency (if present)
2. **Update Build Config**: Update Vite config for Vue 3 (minimal changes needed)
3. **Update Nextcloud Vue**: Migrate from `@nextcloud/vue` v8.x to v9.x (requires Nextcloud 30+)
4. **Test All Composables**: Verify all composables work with Vue 3 reactivity

### Migration Checklist

**Pre-Migration (Completed)**:
- [x] Replace deprecated lifecycle hooks (`beforeDestroy` → `beforeUnmount`)
- [x] Add explicit `emits` declarations to all components
- [x] Verify no implicit `$listeners` usage
- [x] Document migration notes

**Future Migration Steps**:
- [ ] Remove `@vue/composition-api` dependency (if present)
- [ ] Update `package.json`: `vue` to `^3.x`, `@nextcloud/vue` to `^9.x`
- [ ] Update build configuration (Vite config)
- [ ] Test all composables with Vue 3
- [ ] Update component usage if needed
- [ ] Verify Options API integration still works
- [ ] Test with Nextcloud 30+ (required for `@nextcloud/vue` v9.x)

### Breaking Changes to Watch For

1. **Global API Changes**: `Vue.createApp()` instead of `new Vue()`
2. **Component API**: `defineComponent()` recommended
3. **Props/Emits**: `defineProps()` and `defineEmits()` in `<script setup>`
4. **Slots**: `useSlots()` API changes
5. **Nextcloud Vue**: Component API may change

---

## Best Practices

### 1. Always Dispose Resources

```javascript
onUnmounted(() => {
  sceneComposable.dispose()
  cameraComposable.dispose()
})
```

### 2. Use Computed for Derived State

```javascript
const isReady = computed(() => 
  scene.value !== null && camera.value !== null
)
```

### 3. Handle Errors Gracefully

```javascript
try {
  await loadModel(fileId)
} catch (error) {
  logger.error('Failed to load model', error)
  // Handle error in UI
}
```

### 4. Watch for State Changes

```javascript
watch(() => modelRoot.value, (model) => {
  if (model) {
    // Handle model loaded
  }
})
```

### 5. Initialize in Correct Order

```javascript
// 1. Initialize scene
sceneComposable.initScene(container)

// 2. Initialize camera (needs scene)
cameraComposable.initCamera(container)

// 3. Load model (needs scene and camera)
await modelComposable.loadModel(fileId, filename, {
  scene: sceneComposable.scene.value,
  renderer: sceneComposable.renderer.value
})
```

---

## Debugging

### Enable Debug Logging

All composables use the centralized `logger` utility. To enable debug logging:

```javascript
// In browser console
localStorage.setItem('threedviewer:debug', 'true')
```

### Common Issues

1. **Scene not initializing**: Check container element exists
2. **Camera not working**: Ensure scene is initialized first
3. **Model not loading**: Check file ID and permissions
4. **Performance issues**: Use `usePerformance` to monitor

---

## Contributing

When adding new composables:

1. Follow the existing pattern (state, computed, methods)
2. Use JSDoc comments for all methods
3. Use centralized logger (not console.log)
4. Provide dispose method for cleanup
5. Add to this documentation
6. Include usage examples

---

**Last Updated**: 2025-01-XX

