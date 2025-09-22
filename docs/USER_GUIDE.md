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
   - The model is centered automatically
   - Grid/axes helpers can be shown/hidden
   - Camera is positioned for optimal view and can be reset

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

Shortcuts may vary by integration; common actions include reset view, fit to view, and toggles for grid/axes/wireframe.

## 🛠️ Toolbar Features

### Main Toolbar

Typical controls include:

- **Reset View** (🔄)
- **Fit to View** (📐)
- **Grid/Axes** toggles
- **Wireframe** toggle
- **Comparison mode** (⚖️) controls

### Comparison Mode

1. **Enable Comparison**
   - Click the comparison button to enter comparison mode
   - A list of supported files from your Nextcloud appears to pick from

2. **Controls**
   - Toggle visibility for Original and Comparison models
   - "Fit Both" positions models side by side and frames the camera on both

3. **Exit**
   - Use the close comparison action to return to single model view

## 📁 Supported File Formats

### Supported Formats

- Core: GLB, GLTF, OBJ (+MTL), STL, PLY, FBX, 3MF, 3DS
- Experimental/extra: DAE, X3D, VRML/WRL

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

- Ambient + directional + point lights by default
- Shadows enabled; performance depends on device

### Background

- **Theme Integration**: Automatically matches Nextcloud theme
- **Custom Colors**: Choose from preset background colors
- **Gradient**: Smooth gradient backgrounds available

## ⚡ Performance Features

### Loading Optimization

- Progress indicator and cancel (abort) support
- Decoder auto-detection (DRACO/Basis) when available

### Rendering Optimization

- **Level of Detail**: Automatic quality adjustment
- **Frustum Culling**: Only renders visible parts
- **Dynamic Quality**: Adjusts based on performance

### Memory Management

- Automatic cleanup of scene resources on unload
- Graceful error states with retry

## 🔧 Advanced Features

### Camera Management

- Fit to object and reset view
- Mobile-friendly controls with gesture hints

### Model Information

- File details may be shown in UI/tooling; performance metrics available via console in development

### Export Options

- Screenshot/export features may be added in future versions

## 📱 Mobile Usage

### Touch Interface

- Natural gestures for rotate/zoom/pan with on-screen hints

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

For troubleshooting specific issues, see the [Troubleshooting](TROUBLESHOOTING.md) guide.
