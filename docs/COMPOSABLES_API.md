# Composables API Reference

> **Note**: This document describes the correct usage patterns for the composables in `src/composables/`. After refactoring to remove `readonly()` wrappers, these composables are ready for use in **Vue Composition API components only** (`<script setup>`). Using them in Options API components (like `ViewerComponent.vue`) requires careful handling of Vue 2.7's auto-unwrapping behavior.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Composables](#composables)
   - [useScene](#usescene)
   - [useCamera](#usecamera)
   - [useModelLoading](#usemodelLoading)
   - [useMobile](#usemobile)
4. [Usage Patterns](#usage-patterns)
5. [Common Pitfalls](#common-pitfalls)

---

## Overview

The ThreeDViewer composables provide reusable logic for Three.js scene management, camera controls, model loading, and mobile detection. They follow Vue 3 Composition API patterns but are compatible with Vue 2.7's backport.

**Architecture Philosophy:**
- **Composables manage state via refs** (scene, renderer, camera, etc.)
- **Methods mutate internal refs directly** (no readonly wrappers)
- **Consumers access refs via `.value`** in Composition API context
- **Options API auto-unwraps refs** (avoid `.value` there)

---

## Core Concepts

### Refs vs Readonly

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

### Auto-unwrapping in Options API

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

---

## Composables

### useScene

**Purpose:** Manages Three.js scene, renderer, lighting, and helpers.

#### API

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

#### Options

```javascript
initScene(container, {
  // Renderer
  antialias: true,           // Enable anti-aliasing
  alpha: true,               // Transparent background
  shadows: true,             // Enable shadow mapping
  powerPreference: 'high-performance',
  
  // Scene
  backgroundColor: '#263238', // CSS color string
  fog: false,                // Enable fog
  
  // Lighting (flat structure!)
  lighting: {
    ambientColor: '#ffffff',
    ambientIntensity: 0.5,
    directionalColor: '#ffffff',
    directionalIntensity: 0.8,
    directionalPosition: { x: 5, y: 10, z: 7.5 },
    hemisphereColor: '#ffffff',
    hemisphereSkyColor: '#87CEEB',
    hemisphereGroundColor: '#8B4513',
    hemisphereIntensity: 0.6,
    shadowMapSize: 2048,
    castShadows: true
  },
  
  // Helpers
  helpers: {
    grid: true,
    axes: true,
    directionalLight: false
  }
})
```

#### Lighting Structure (Important!)

**✅ Correct (flat structure):**
```javascript
const lightingOptions = {
  ambientColor: '#ffffff',      // Direct properties
  ambientIntensity: 0.5,
  directionalColor: '#ffffff',
  directionalIntensity: 0.8
}
```

**❌ Incorrect (nested structure):**
```javascript
const lightingOptions = {
  ambient: {                    // Don't nest!
    color: '#ffffff',
    intensity: 0.5
  }
}
```

#### Example Usage

**Composition API:**
```vue
<script setup>
import { onMounted, ref } from 'vue'
import useScene from '@/composables/useScene'

const container = ref(null)
const { scene, renderer, initScene, render } = useScene()

onMounted(() => {
  initScene(container.value, {
    backgroundColor: '#263238',
    lighting: {
      ambientIntensity: 0.5,
      directionalIntensity: 0.8
    }
  })
  
  console.log('Scene:', scene.value)       // ✅ Access via .value
  console.log('Renderer:', renderer.value) // ✅ Access via .value
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
</template>
```

---

### useCamera

**Purpose:** Manages camera and OrbitControls.

#### API

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

#### Options

```javascript
initCamera(container, {
  fov: 45,                    // Field of view (degrees)
  near: 0.1,                  // Near clipping plane
  far: 10000,                 // Far clipping plane
  position: { x: 5, y: 5, z: 5 },
  
  // OrbitControls
  enableDamping: true,
  dampingFactor: 0.05,
  enableZoom: true,
  enablePan: true,
  enableRotate: true,
  autoRotate: false,
  autoRotateSpeed: 2.0,
  minDistance: 0.1,
  maxDistance: 1000,
  maxPolarAngle: Math.PI
})
```

#### Example Usage

```vue
<script setup>
import { onMounted, ref } from 'vue'
import useCamera from '@/composables/useCamera'

const container = ref(null)
const { camera, controls, initCamera, fitCameraToObject } = useCamera()

onMounted(() => {
  initCamera(container.value, {
    position: { x: 10, y: 10, z: 10 },
    autoRotate: true
  })
  
  // Fit camera to loaded model
  fitCameraToObject(modelObject, 1.5)
})
</script>
```

---

### useModelLoading

**Purpose:** Load 3D models with automatic format detection and multi-file support.

#### API

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

#### Supported Formats

| Format | Extension | Multi-file Support | Notes |
|--------|-----------|-------------------|-------|
| GLTF   | `.gltf`, `.glb` | Yes (bins, images) | Preferred format |
| OBJ    | `.obj`    | Yes (MTL, textures) | Requires MTL for materials |
| STL    | `.stl`    | No | ASCII or binary |
| PLY    | `.ply`    | No | ASCII or binary |
| FBX    | `.fbx`    | Limited | Autodesk format |
| DAE    | `.dae`    | Limited | Collada |
| 3DS    | `.3ds`    | Limited | 3D Studio |
| 3MF    | `.3mf`    | No | 3D Manufacturing |
| X3D    | `.x3d`    | Limited | Web3D standard |
| VRML   | `.wrl`    | Limited | Legacy format |

#### Multi-file Loading

**OBJ + MTL + Textures:**
```javascript
const primaryUrl = '/path/to/model.obj'
const dependencyUrls = [
  '/path/to/model.mtl',
  '/path/to/texture1.jpg',
  '/path/to/texture2.png'
]

const model = await loadModelWithDependencies(primaryUrl, dependencyUrls, 'obj')
```

**GLTF + Bins + Images:**
```javascript
const primaryUrl = '/path/to/model.gltf'
const dependencyUrls = [
  '/path/to/data.bin',
  '/path/to/texture.jpg'
]

const model = await loadModelWithDependencies(primaryUrl, dependencyUrls, 'gltf')
```

#### Example Usage

**Simple load:**
```vue
<script setup>
import { onMounted } from 'vue'
import useModelLoading from '@/composables/useModelLoading'
import useScene from '@/composables/useScene'

const { loadModel, isLoading, loadError } = useModelLoading()
const { scene, addObject } = useScene()

onMounted(async () => {
  try {
    const model = await loadModel('/models/example.glb')
    addObject(model)
  } catch (error) {
    console.error('Load failed:', loadError.value)
  }
})
</script>

<template>
  <div v-if="isLoading">Loading model...</div>
  <div v-if="loadError">Error: {{ loadError }}</div>
</template>
```

**Multi-file load:**
```vue
<script setup>
import { useModelLoading } from '@/composables/useModelLoading'

const { loadModelWithDependencies } = useModelLoading()

async function loadOBJModel() {
  const model = await loadModelWithDependencies(
    '/models/chair.obj',
    ['/models/chair.mtl', '/models/wood.jpg'],
    'obj'
  )
  return model
}
</script>
```

---

### useMobile

**Purpose:** Detect mobile devices and adjust UI/controls.

#### API

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

#### Example Usage

```vue
<script setup>
import { computed } from 'vue'
import useMobile from '@/composables/useMobile'

const { isMobile, isTablet, touchEnabled } = useMobile()

const controlsEnabled = computed(() => {
  return isMobile.value ? { zoom: true, rotate: touchEnabled.value } : true
})
</script>

<template>
  <div :class="{ mobile: isMobile, tablet: isTablet }">
    <p v-if="isMobile">Mobile controls enabled</p>
  </div>
</template>
```

---

## Usage Patterns

### Pattern 1: Composition API (Recommended)

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

### Pattern 2: Options API (Advanced)

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

### Pattern 3: Combine Multiple Composables

```vue
<script setup>
import { onMounted, ref } from 'vue'
import useScene from '@/composables/useScene'
import useCamera from '@/composables/useCamera'
import useModelLoading from '@/composables/useModelLoading'
import useMobile from '@/composables/useMobile'

const container = ref(null)

// Initialize all composables
const sceneManager = useScene()
const cameraManager = useCamera()
const modelLoader = useModelLoading()
const mobile = useMobile()

onMounted(async () => {
  // Setup scene and camera
  sceneManager.initScene(container.value, {
    backgroundColor: '#263238',
    lighting: { ambientIntensity: 0.5 }
  })
  
  cameraManager.initCamera(container.value, {
    autoRotate: !mobile.isMobile.value // Disable autoRotate on mobile
  })
  
  // Load model
  try {
    const model = await modelLoader.loadModel('/models/example.glb')
    sceneManager.addObject(model)
    cameraManager.fitCameraToObject(model, 1.5)
  } catch (error) {
    console.error('Load failed:', error)
  }
  
  // Render loop
  function animate() {
    requestAnimationFrame(animate)
    cameraManager.updateControls()
    sceneManager.render(cameraManager.camera.value)
  }
  animate()
})
</script>

<template>
  <div ref="container" :class="{ mobile: mobile.isMobile }"></div>
</template>
```

---

## Common Pitfalls

### ❌ Pitfall 1: Mixing .value in Options API

```javascript
// Options API
computed: {
  sceneChildren() {
    return this.sceneManager.scene.value.children  // ❌ Don't use .value!
  }
}

// ✅ Correct:
computed: {
  sceneChildren() {
    return this.sceneManager.scene.children  // Auto-unwrapped
  }
}
```

### ❌ Pitfall 2: Nested Lighting Options

```javascript
// ❌ Wrong:
initScene(container, {
  lighting: {
    ambient: { color: '#fff', intensity: 0.5 }  // Don't nest!
  }
})

// ✅ Correct:
initScene(container, {
  lighting: {
    ambientColor: '#fff',
    ambientIntensity: 0.5
  }
})
```

### ❌ Pitfall 3: Forgetting Multi-file Dependencies

```javascript
// ❌ Wrong (OBJ without MTL):
await loadModel('/models/chair.obj')  // Materials missing!

// ✅ Correct:
await loadModelWithDependencies(
  '/models/chair.obj',
  ['/models/chair.mtl', '/textures/wood.jpg'],
  'obj'
)
```

### ❌ Pitfall 4: Not Disposing Resources

```javascript
// ❌ Wrong:
onUnmounted(() => {
  // Memory leak! Forgot to cleanup
})

// ✅ Correct:
onUnmounted(() => {
  sceneManager.dispose()
  cameraManager.dispose()
  modelLoader.unloadModel()
})
```

### ❌ Pitfall 5: Initializing Before Mounted

```javascript
// ❌ Wrong (setup runs before DOM exists):
const container = ref(null)
initScene(container.value)  // null! Container not ready yet

// ✅ Correct:
onMounted(() => {
  initScene(container.value)  // DOM ready now
})
```

---

## Migration Notes

### From Old Composables (readonly wrappers)

**Before (broken):**
```javascript
const { scene, renderer } = useScene()
// scene and renderer were frozen at null due to readonly()!
```

**After (fixed):**
```javascript
const { scene, renderer } = useScene()
// scene and renderer are now properly reactive refs
console.log(scene.value)     // ✅ Works in Composition API
```

### Preparing for Vue 3 Migration

These composables are **already Vue 3 compatible**! When upgrading from Vue 2.7 to Vue 3:

1. **No composable changes needed** ✅
2. **Update component syntax** (minor template adjustments)
3. **Remove Vue 2.7 backport** (`import { ref } from 'vue'` instead of `'@vue/composition-api'`)
4. **Test auto-unwrapping** (Vue 3 Options API behaves identically)

---

## Summary

| Use Case | Pattern | Access Pattern | Example |
|----------|---------|----------------|---------|
| **New components** | `<script setup>` | `.value` | `scene.value.children` |
| **Existing Options API** | `data()` return | No `.value` | `this.scene.children` |
| **Vue 3 migration** | Same as above | Same as above | Already compatible |
| **Multi-file models** | `loadModelWithDependencies()` | N/A | OBJ+MTL, GLTF+bins |
| **Mobile detection** | `useMobile()` | `.value` or auto-unwrapped | `isMobile.value` |

**Key Takeaway:** Always use **Composition API (`<script setup>`)** for new components. Only use Options API for maintaining existing code like `ViewerComponent.vue`.

---

For more information, see:
- [VIEWERCOMPONENT_REFACTORING_LESSONS.md](./VIEWERCOMPONENT_REFACTORING_LESSONS.md) - Complete refactoring journey
- [MULTI_FILE_LOADING_COMPLETE.md](./MULTI_FILE_LOADING_COMPLETE.md) - Multi-file loading architecture
- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) - Overall system design
