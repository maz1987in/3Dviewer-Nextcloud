# User Guide

This guide explains how to use the 3D Viewer for Nextcloud application.

## 🎯 Getting Started

### Opening a 3D Model

1. **Navigate to Files**
   - Open Nextcloud Files app
   - Browse to your 3D model files

2. **Open a 3D File**
   - Click on any supported 3D file (`.glb`, `.gltf`, `.obj`, `.stl`, etc.)
   - The 3D viewer will open automatically

3. **First View**
   - The model will load and be automatically centered
   - A grid will appear at the bottom of the model
   - Camera will be positioned for optimal viewing

## 🎮 Navigation Controls

### Mouse Controls

| Action | Control | Description |
|--------|---------|-------------|
| **Rotate** | Left click + drag | Orbit around the model |
| **Zoom** | Mouse wheel | Zoom in/out |
| **Pan** | Right click + drag | Move the view |
| **Reset View** | Double-click | Return to initial view |

### Touch Controls (Mobile)

| Action | Gesture | Description |
|--------|---------|-------------|
| **Rotate** | One finger drag | Orbit around the model |
| **Zoom** | Pinch | Zoom in/out |
| **Pan** | Two finger drag | Move the view |
| **Reset** | Double-tap | Return to initial view |

### Keyboard Shortcuts

| Key | Action | Description |
|-----|--------|-------------|
| `R` | Reset view | Return to initial camera position |
| `G` | Toggle grid | Show/hide the grid |
| `A` | Toggle axes | Show/hide coordinate axes |
| `W` | Toggle wireframe | Switch between solid and wireframe |
| `F` | Fit to view | Adjust camera to fit entire model |
| `Esc` | Close viewer | Return to file list |

## 🛠️ Toolbar Features

### Main Toolbar

The toolbar appears at the top of the viewer and includes:

#### View Controls
- **Reset View** (🔄): Return camera to initial position
- **Fit to View** (📐): Adjust camera to show entire model
- **Toggle Grid** (⊞): Show/hide the reference grid
- **Toggle Axes** (📏): Show/hide coordinate axes

#### Display Options
- **Wireframe Mode** (🔲): Switch between solid and wireframe rendering
- **Background Color** (🎨): Change viewer background color
- **Fullscreen** (⛶): Enter/exit fullscreen mode

#### Model Controls
- **Load Comparison** (⚖️): Load a second model for comparison
- **Toggle Original** (👁️): Show/hide the original model (in comparison mode)
- **Toggle Comparison** (👁️): Show/hide the comparison model

### Comparison Mode

1. **Enable Comparison**
   - Click the "Load Comparison" button
   - Select a second 3D file from the file picker

2. **Comparison Controls**
   - Both models will be displayed side by side
   - Camera controls affect both models simultaneously
   - Use toggle buttons to show/hide individual models

3. **Exit Comparison**
   - Click "Close Comparison" to return to single model view

## 📁 Supported File Formats

### Primary Formats

| Format | Extension | Features | Notes |
|--------|-----------|----------|-------|
| **GLB** | `.glb` | Full support | Binary glTF format |
| **GLTF** | `.gltf` | Full support | JSON-based format |
| **OBJ** | `.obj` | Full support | Includes MTL material support |
| **STL** | `.stl` | Full support | 3D printing format |
| **PLY** | `.ply` | Full support | Polygon file format |

### Additional Formats

| Format | Extension | Features | Notes |
|--------|-----------|----------|-------|
| **FBX** | `.fbx` | Full support | Autodesk format |
| **3MF** | `.3mf` | Full support | 3D Manufacturing format |
| **3DS** | `.3ds` | Full support | 3D Studio format |
| **VRML** | `.wrl` | Basic support | Virtual Reality Modeling Language |
| **X3D** | `.x3d` | Basic support | Extensible 3D format |

### Material Support

- **OBJ + MTL**: Automatic material loading for OBJ files
- **GLTF/GLB**: Full material and texture support
- **FBX**: Material and animation support
- **Other formats**: Basic material support

## 🎨 Visual Features

### Grid System

The dynamic grid system automatically adapts to your model:

- **Size**: Grid size adjusts based on model dimensions
- **Position**: Grid appears at the bottom of the model
- **Style**: Clean, professional appearance
- **Toggle**: Can be hidden/shown as needed

### Lighting

- **Automatic**: Default lighting setup for optimal viewing
- **Ambient**: Soft ambient lighting
- **Directional**: Main directional light source
- **Shadows**: Optional shadow rendering

### Background

- **Theme Integration**: Automatically matches Nextcloud theme
- **Custom Colors**: Choose from preset background colors
- **Gradient**: Smooth gradient backgrounds available

## ⚡ Performance Features

### Loading Optimization

- **Progress Indicator**: Shows loading progress for large files
- **Abort Loading**: Cancel loading if file is too large
- **Streaming**: Large files load progressively
- **Caching**: Models are cached for faster subsequent loads

### Rendering Optimization

- **Level of Detail**: Automatic quality adjustment
- **Frustum Culling**: Only renders visible parts
- **Dynamic Quality**: Adjusts based on performance

### Memory Management

- **Automatic Cleanup**: Unused resources are freed
- **Model Switching**: Smooth transitions between models
- **Error Recovery**: Graceful handling of loading errors

## 🔧 Advanced Features

### Camera Management

- **Smart Positioning**: Camera automatically positions for best view
- **Boundary Limits**: Prevents camera from going too far
- **Smooth Transitions**: Animated camera movements
- **Multiple Views**: Save and restore camera positions

### Model Information

- **File Details**: View file size, format, and metadata
- **Geometry Stats**: Number of vertices, faces, materials
- **Performance Metrics**: Rendering performance information

### Export Options

- **Screenshot**: Capture current view as image
- **Model Data**: Export model information
- **View State**: Save current camera position

## 📱 Mobile Usage

### Touch Interface

- **Intuitive Gestures**: Natural touch controls
- **Responsive Design**: Adapts to different screen sizes
- **Performance**: Optimized for mobile devices

### Mobile-Specific Features

- **Orientation Support**: Works in portrait and landscape
- **Touch Feedback**: Visual feedback for touch interactions
- **Battery Optimization**: Efficient rendering for longer battery life

## 🚨 Troubleshooting

### Common Issues

**Model not loading**:
- Check file format is supported
- Verify file is not corrupted
- Try refreshing the page

**Poor performance**:
- Close other browser tabs
- Try reducing model complexity
- Check available memory

**Controls not working**:
- Ensure you're clicking on the 3D viewer area
- Try refreshing the page
- Check browser compatibility

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Unsupported file format" | File type not supported | Use a supported format |
| "File too large" | File exceeds size limit | Reduce file size or contact admin |
| "Loading failed" | Network or file error | Check file and try again |
| "Memory error" | Insufficient memory | Close other tabs and try again |

### Getting Help

1. **Check Documentation**: Review this guide and other docs
2. **Browser Console**: Check for error messages
3. **Contact Support**: Reach out through GitHub issues
4. **Community**: Ask in GitHub discussions

## 💡 Tips and Best Practices

### File Preparation

- **Optimize Models**: Reduce polygon count for better performance
- **Compress Textures**: Use compressed texture formats
- **Check File Size**: Keep files under 100MB for best performance
- **Test Formats**: Verify compatibility before uploading

### Viewing Tips

- **Use Grid**: Keep grid visible for spatial reference
- **Reset View**: Use reset button to return to optimal view
- **Compare Models**: Use comparison mode for detailed analysis
- **Fullscreen**: Use fullscreen for detailed inspection

### Performance Tips

- **Close Unused Tabs**: Free up browser memory
- **Use Modern Browser**: Ensure browser is up to date
- **Stable Connection**: Use stable internet connection
- **Regular Updates**: Keep Nextcloud and app updated

---

For technical details, see the [Technical Architecture](TECHNICAL_ARCHITECTURE.md) guide. For troubleshooting specific issues, see the [Troubleshooting](TROUBLESHOOTING.md) guide.
