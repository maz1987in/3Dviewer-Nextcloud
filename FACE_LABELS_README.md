# Face Labels Feature

## Overview

The 3D Viewer now supports face labels that display orientation markers (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT) on the visible faces of loaded 3D models.

## Implementation

### Composable: `useFaceLabels`

Located at: `src/composables/useFaceLabels.js`

This composable provides:
- CSS2D-based labels for better readability and styling
- Automatic positioning based on model bounding box
- Toggle functionality to show/hide labels
- Proper cleanup and disposal

### Integration with ThreeViewer

The face labels are integrated into `ThreeViewer.vue` component:

1. **Initialization**: Label renderer is initialized in `setupScene()` method
2. **Rendering**: Labels are rendered in the animation loop via `faceLabels.renderLabels()`
3. **Resize handling**: Label renderer is resized when window size changes
4. **Cleanup**: Labels are properly disposed in `onBeforeUnmount()`

### Usage

#### Via Props

Add the `showFaceLabels` prop to the ThreeViewer component:

```vue
<ThreeViewer
  :fileId="fileId"
  :filename="filename"
  :showFaceLabels="true"
/>
```

#### Programmatic Control

Toggle face labels programmatically:

```javascript
// Access the toggleFaceLabels method from the component instance
viewerRef.toggleFaceLabels()

// Check if labels are enabled
const labelsEnabled = viewerRef.faceLabelsEnabled
```

### Features

- **Automatic Positioning**: Labels are automatically positioned at each face of the model's bounding box
- **Styled Labels**: Labels have a consistent, readable style with background, border, and shadow
- **Performance**: CSS2D rendering ensures labels are always crisp and don't affect 3D rendering performance
- **Responsive**: Labels resize and reposition when the window is resized

### Label Styling

Labels are styled with:
- Semi-transparent black background (rgba(0, 0, 0, 0.8))
- White text
- Green border (matches grid color)
- Shadow for better visibility
- Uppercase text with letter spacing

### API

#### Methods

- `faceLabels.addFaceLabels(model, scene)` - Add labels to a specific model
- `faceLabels.clearLabels(scene)` - Remove all labels from the scene
- `faceLabels.toggleLabels(model, scene)` - Toggle labels on/off
- `faceLabels.initLabelRenderer(container, width, height)` - Initialize the CSS2D renderer
- `faceLabels.onWindowResize(width, height)` - Handle window resize
- `faceLabels.renderLabels(scene, camera)` - Render labels (called in animation loop)
- `faceLabels.dispose()` - Clean up resources

#### State

- `faceLabels.labelsEnabled` - Boolean ref indicating if labels are currently shown
- `faceLabels.labels` - Array of label objects
- `faceLabels.labelRenderer` - CSS2DRenderer instance

### Example

```javascript
import { useFaceLabels } from '@/composables/useFaceLabels'

const faceLabels = useFaceLabels()

// Initialize renderer
faceLabels.initLabelRenderer(container, 800, 600)

// Add labels to a model
faceLabels.addFaceLabels(model, scene)

// Render in animation loop
function animate() {
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
  faceLabels.renderLabels(scene, camera)
}

// Clean up
faceLabels.dispose()
```

### Notes

- Labels use CSS2DRenderer which overlays DOM elements on the 3D scene
- Labels always face the camera (billboard effect)
- Labels are positioned slightly outside the model's bounding box for clarity
- The label renderer must be initialized after the main WebGL renderer
- Labels are automatically cleaned up when the component unmounts

### Future Enhancements

Potential improvements:
- Customizable label colors per face
- Adjustable label size based on model size
- Label visibility culling (hide labels facing away from camera)
- Custom label text support
- Animation/fade effects when toggling labels

