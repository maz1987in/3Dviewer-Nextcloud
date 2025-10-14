# 3D Viewer for Nextcloud

A comprehensive 3D model viewer application for Nextcloud that supports multiple 3D file formats with advanced viewing capabilities.

## 📚 Table of Contents

- [Quick Start](#-quick-start)
- [Features](#-features)
- [Installation](#-installation)
- [User Guide](#-user-guide)
- [Developer Guide](#-developer-guide)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)

## 🚀 Quick Start

### For Users
1. **Install the app** in your Nextcloud admin panel
2. **Upload 3D files** to your Files app (GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, 3DS, DAE, X3D, VRML)
3. **Click any 3D file** to open it in the viewer
4. **Navigate** using mouse/touch controls

### For Developers
1. **Clone the repository**: `git clone https://github.com/maz1987in/3Dviewer-Nextcloud.git`
2. **Install dependencies**: `composer install && npm install`
3. **Build the frontend**: `npm run build`
4. **Deploy to Nextcloud**: Copy to `/path/to/nextcloud/apps/threedviewer/`
5. **Enable the app**: `php occ app:enable threedviewer`

## ✨ Features

### Core Capabilities
- **Multi-format support**: GLB, GLTF, OBJ (+MTL), STL, PLY, FBX, 3MF, 3DS, DAE, X3D, VRML/WRL
- **Dynamic grid system**: Automatically adapts to model size and position
- **Model comparison**: Load a second model, position side-by-side, fit both to view
- **Measurement and annotations**: Create distance measurements and text notes
- **Performance optimization**: Dynamic imports, decoder auto-detection (DRACO/Basis)
- **Theme integration**: Works with light/dark themes, ARIA roles

### Advanced Features
- **Dual-mode architecture**: Quick preview (Files app) + Full-featured standalone viewer
- **Multi-file loading**: Automatic MTL/texture loading for OBJ models
- **Performance monitoring**: Real-time FPS, memory usage, quality settings
- **Mobile support**: Touch gestures, responsive design
- **Error handling**: Graceful degradation, retry mechanisms

### Supported File Formats

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

## 📦 Installation

### Prerequisites
- **Nextcloud**: Version 30–32
- **PHP**: Version 8.1 or higher
- **Node.js**: Version 22+ (for development/build)
- **Memory**: Minimum 512MB RAM (1GB+ recommended)

### Method 1: App Store Installation (when published)
1. Go to Nextcloud Admin Panel → Apps
2. Search for "3D Viewer"
3. Click "Install" or "Download and enable"

### Method 2: Manual Installation
1. **Download the App**
   ```bash
   git clone https://github.com/maz1987in/3Dviewer-Nextcloud.git
   cd 3Dviewer-Nextcloud
   ```

2. **Install Dependencies**
   ```bash
   composer install --no-dev --optimize-autoloader
   npm install
   ```

3. **Build the Frontend**
   ```bash
   npm run build
   ```

4. **Deploy to Nextcloud**
   ```bash
   cp -r . /path/to/nextcloud/apps/threedviewer/
   chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/
   chmod -R 755 /path/to/nextcloud/apps/threedviewer/
   ```

5. **Enable in Nextcloud**
   - Go to Apps section in admin panel
   - Find "3D Viewer" and click "Enable"

### Post-Installation Setup

#### ✅ Automatic MIME Type Registration
MIME types are registered automatically when you enable the app:

```bash
php occ app:enable threedviewer
```

**Expected output:**
```
threedviewer enabled
...
Register 3D model MIME types and create config files (threedviewer)
  ✓ Registered: .glb => model/gltf-binary
  ✓ Registered: .gltf => model/gltf+json
  ✓ Registered: .obj => model/obj
  ✓ Registered: .stl => model/stl
  ✓ Registered: .ply => model/ply
  ✓ Registered: .dae => model/vnd.collada+xml
  ✓ Registered: .3mf => model/3mf
  ✓ Registered: .fbx => model/x.fbx
  ✓ Registered: .3ds => application/x-3ds
  ✓ Updated: /path/to/config/mimetypemapping.json
  ✓ Updated: /path/to/config/mimetypealiases.json
  ✓ Regenerated JavaScript MIME type mappings
...done. MIME types registered successfully.
```

#### Rescan Existing Files (if applicable)
If you already have 3D model files uploaded before installing the app:

```bash
php occ files:scan --all
```

## 👤 User Guide

### Opening a 3D Model

1. **Navigate to Files** - Open Nextcloud Files app
2. **Browse to your 3D model files**
3. **Click on any supported 3D file** (`.glb`, `.gltf`, `.obj`, `.stl`, etc.)
4. **The 3D viewer will open automatically**

### Navigation Controls

#### Mouse Controls
| Action | Control | Description |
|--------|---------|-------------|
| **Rotate** | Left click + drag | Orbit around the model |
| **Zoom** | Mouse wheel | Zoom in/out |
| **Pan** | Right click + drag | Move the view |
| **Reset View** | Double-click | Return to initial view |

#### Touch Controls (Mobile)
| Action | Gesture | Description |
|--------|---------|-------------|
| **Rotate** | One finger drag | Orbit around the model |
| **Zoom** | Pinch | Zoom in/out |
| **Pan** | Two finger drag | Move the view |
| **Reset** | Double-tap | Return to initial view |

### Toolbar Features

#### Main Toolbar
- **Reset View** (🔄) - Return to initial camera position
- **Fit to View** (📐) - Frame the model optimally
- **Grid/Axes** toggles - Show/hide reference helpers
- **Wireframe** toggle - Switch between solid and wireframe rendering
- **Comparison mode** (⚖️) - Load and compare two models
- **Performance** (⚡) - Adjust rendering quality
- **Background** - Change background color

#### Comparison Mode
1. **Enable Comparison** - Click the comparison button
2. **Select Model** - Choose from your Nextcloud files
3. **Toggle Visibility** - Show/hide original and comparison models
4. **Fit Both** - Position models side-by-side and frame both

### Performance Settings

The viewer includes intelligent performance monitoring with 5 quality presets:

| Mode | Pixel Ratio | Shadows | Antialias | Target FPS | Use Case |
|------|-------------|---------|-----------|------------|----------|
| **Auto** | Detected | Detected | Detected | 60 | **Default** - Smart detection |
| **Low** | 0.5x | ❌ | ❌ | 30 | Old hardware, mobile devices |
| **Balanced** | 1.0x | ✅ | ✅ | 60 | Mid-range systems |
| **High** | 1.5x | ✅ | ✅ | 60 | Good desktops (recommended) |
| **Ultra** | 2.0x | ✅ | ✅ | 120 | High-end gaming PCs |

### Visual Features

#### Grid System
- **Dynamic sizing**: Grid adjusts based on model dimensions
- **Smart positioning**: Appears at the bottom of the model
- **Professional appearance**: Clean, subtle styling
- **Toggle control**: Can be hidden/shown as needed

#### Lighting
- **Multi-light setup**: Ambient + directional + hemisphere lights
- **Shadow mapping**: Enabled for realistic depth perception
- **Performance aware**: Adjusts based on device capabilities

#### Background
- **Theme integration**: Automatically matches Nextcloud theme
- **Custom colors**: Choose from preset background colors
- **Gradient options**: Smooth gradient backgrounds available

## 👨‍💻 Developer Guide

### Prerequisites

- **PHP**: 8.1 or higher
- **Node.js**: 22 or higher
- **Composer**: Latest version
- **Git**: For version control
- **Nextcloud**: 30–32 (for testing)

### Development Environment Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/maz1987in/3Dviewer-Nextcloud.git
   cd 3Dviewer-Nextcloud
   ```

2. **Install Dependencies**
   ```bash
   composer install
   npm install
   ```

3. **Build/Watch Frontend**
   ```bash
   # Build once (Vite)
   npm run build

   # Watch mode during development
   npm run watch
   ```

4. **Set Up Nextcloud**
   ```bash
   # Symlink to Nextcloud apps directory
   ln -s /path/to/3Dviewer-Nextcloud /path/to/nextcloud/apps/threedviewer
   ```

5. **Enable App**
   ```bash
   php occ app:enable threedviewer
   ```

### Project Structure

#### Backend Structure
```
lib/
├── Controller/
│   ├── ApiController.php          # OCS endpoints: /api, /api/files, /api/file/{id}
│   ├── FileController.php         # App routes: /file/{id}, /files
│   ├── PublicFileController.php   # Public share routes: /public/file/...
│   ├── AssetController.php        # Decoder/assets serving
│   └── BaseController.php
├── Service/
│   ├── ModelFileSupport.php       # Supported extensions/MIME mapping
│   ├── FileService.php
│   ├── ShareFileService.php
│   └── ResponseBuilder.php
├── Repair/
│   ├── RegisterThreeDMimeTypes.php     # Install: Register MIME types
│   └── UnregisterThreeDMimeTypes.php   # Uninstall: Clean up MIME types
└── AppInfo/
    └── Application.php
```

#### Frontend Structure
```
src/
├── components/
│   ├── ThreeViewer.vue            # Main viewer (measurement, annotation, comparison)
│   └── ViewerToolbar.vue
├── composables/                   # useScene, useCamera, useModelLoading, useMobile
├── loaders/
│   ├── registry.js                # Extension -> loader module mapping
│   └── types/                     # gltf, obj, stl, ply, fbx, 3mf, 3ds, dae, x3d, vrml
├── utils/
│   └── error-handler.js
├── viewer-entry.js                # Entry point mounted by Nextcloud
└── main.js
```

### Development Workflow

#### Available Commands
```bash
# Development
make dev          # Start development server
make watch        # Start development server with watch mode
make build        # Build the application

# Testing
make test         # Run all tests
make test-unit    # Run PHP unit tests
make test-e2e     # Run end-to-end tests
make test-smoke   # Run smoke tests

# Code Quality
make lint         # Run all linting
make lint-fix     # Fix linting issues
make psalm        # Run static analysis
make rector       # Run code modernization

# Maintenance
make clean        # Clean build artifacts
make ci           # Run CI pipeline locally
```

#### Code Style

**PHP Code Style:**
```bash
composer cs:check
composer cs:fix
```

**JavaScript Code Style:**
```bash
npm run lint
npm run lint:fix
```

### Testing

#### PHP Tests
```bash
# Run unit tests
composer test:unit

# Run integration tests
composer test:integration

# Run with coverage
composer test:coverage
```

#### JavaScript Tests
```bash
# Run Jest tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

#### End-to-End Tests
```bash
# Run Playwright tests
npm run test:e2e

# Run with browser UI
npm run test:e2e:headed

# View test report
npm run test:e2e:report
```

### Adding New Features

#### Adding a New 3D Format

1. **Backend Support**
   ```php
   // lib/Service/ModelFileSupport.php
   public function getSupportedExtensions(): array
   {
       return [
           'glb', 'gltf', 'obj', 'stl', 'ply',
           'fbx', '3mf', '3ds', 'vrml', 'x3d',
           'newformat' // Add new format
       ];
   }
   ```

2. **Frontend Loader**
   ```javascript
   // src/loaders/types/newformat.js
   import * as THREE from 'three';
   import { NewFormatLoader } from 'three/examples/jsm/loaders/NewFormatLoader';
   
   export async function loadNewFormat(arrayBuffer, options = {}) {
     const loader = new NewFormatLoader();
     const result = await loader.parseAsync(arrayBuffer);
     
     return {
       scene: result.scene,
       animations: result.animations || [],
       metadata: result.metadata || {}
     };
   }
   ```

3. **Register Loader**
   ```javascript
   // src/loaders/registry.js
   import { loadNewFormat } from './types/newformat.js';
   
   const loaders = {
     'newformat': loadNewFormat,
     // ... other loaders
   };
   ```

### Building and Deployment

#### Development Build
```bash
npm run dev
```

#### Production Build
```bash
npm run build
```

#### Build Verification
```bash
# Check for uncommitted changes after build
make build
git status  # Should show no changes
```

## 🔌 API Reference

### Base URLs
- **OCS base**: `/ocs/v2.php/apps/threedviewer`
- **App base**: `/apps/threedviewer`

### Authentication
All API endpoints require authentication. Include the following headers:
```http
OCS-APIRequest: true
Accept: application/json
X-Requested-With: XMLHttpRequest
```

### File Management

#### List Files (OCS)
```http
GET /ocs/v2.php/apps/threedviewer/api/files
OCS-APIRequest: true
```

Response body is a JSON object with `files: [{ id, name, path, size, mtime, mimetype }]`.

#### Stream File (App Route)
```http
GET /apps/threedviewer/file/{fileId}
```

Responses: 200 stream, 401 unauthorized, 404 not found, 415 unsupported.

#### Public Share Streaming
```http
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{fileId}
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{fileId}/mtl/{mtlName}
```

### Frontend Component API

#### Vue Component Events
The `ThreeViewer` component emits the following events:

```javascript
<ThreeViewer @model-loaded="onModelLoaded" @error="onError" />
```

**Available Events:**
- `model-loaded` - Emitted when model loads successfully
- `model-aborted` - Emitted when loading is cancelled
- `error` - Emitted when an error occurs
- `reset-done` - Emitted when camera reset completes

#### Component Methods
```javascript
// Load a 3D model by file ID
this.$refs.viewer.loadModel(123);

// Cancel current loading operation
this.$refs.viewer.cancelLoad();

// Reset camera to initial position
this.$refs.viewer.resetCamera();

// Toggle grid visibility
this.$refs.viewer.toggleGrid();

// Toggle axes visibility
this.$refs.viewer.toggleAxes();

// Toggle wireframe mode
this.$refs.viewer.toggleWireframe();

// Fit model to view
this.$refs.viewer.fitToView();
```

### Configuration API

#### Environment Variables
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `THREEDVIEWER_MAX_FILE_SIZE` | integer | 104857600 | Maximum file size in bytes |
| `THREEDVIEWER_ENABLE_COMPRESSION` | boolean | true | Enable DRACO/KTX2 support |
| `THREEDVIEWER_DEBUG_MODE` | boolean | false | Enable debug logging |
| `THREEDVIEWER_GRID_SIZE` | integer | 10 | Default grid size |
| `THREEDVIEWER_GRID_DIVISIONS` | integer | 10 | Default grid divisions |

## 🐛 Troubleshooting

### Most Common Issues

#### ❌ 3D Files Download Instead of Opening in Viewer

**This is the #1 most common issue!** If clicking a 3D file downloads it instead of opening the viewer, your MIME types are not configured correctly.

**Solution:**
1. Verify MIME types are registered: Check if `config/mimetypemapping.json` exists
2. Update MIME type database: `php occ maintenance:mimetype:update-db`
3. Rescan existing files: `php occ files:scan --all`
4. Clear browser cache and reload Nextcloud Files app

#### Viewer Not Loading

**Symptoms:**
- Blank screen when clicking 3D files
- Error message "Viewer failed to load"
- Browser console shows JavaScript errors

**Solutions:**
1. **JavaScript Bundle Not Loading:**
   ```bash
   cd /path/to/nextcloud/apps/threedviewer
   npm install
   npm run build
   ```

2. **Permission Issues:**
   ```bash
   chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/
   chmod -R 755 /path/to/nextcloud/apps/threedviewer/
   ```

3. **Missing Dependencies:**
   ```bash
   composer install --no-dev --optimize-autoloader
   npm install
   ```

#### Models Not Displaying

**Symptoms:**
- Viewer loads but shows empty scene
- Error message "Model failed to load"
- Loading spinner never stops

**Solutions:**
- **Unsupported Format**: Convert to supported format (GLB, GLTF, OBJ, STL, PLY, FBX)
- **File Too Large**: Compress the model or increase PHP memory limit
- **Corrupted File**: Re-upload the file

#### Performance Issues

**Symptoms:**
- Slow loading times
- Choppy animation
- Browser becomes unresponsive
- High memory usage

**Solutions:**
- **High Memory Usage**: Close other browser tabs, reduce model complexity
- **Slow Loading**: Use compressed formats (GLB with DRACO), optimize model geometry
- **Choppy Animation**: Reduce model complexity, lower render quality

### Debug Mode

Enable debug mode for troubleshooting:

1. **Check Logs**
   ```bash
   # Check Nextcloud logs
   tail -f /path/to/nextcloud/data/nextcloud.log
   
   # Check web server logs
   tail -f /var/log/apache2/error.log
   # or
   tail -f /var/log/nginx/error.log
   ```

2. **Browser Console**
   - Open browser developer tools
   - Check console for JavaScript errors
   - Check network tab for failed requests

### Getting Help

1. **Check Documentation**: Review this guide and other docs
2. **Search Issues**: Check [GitHub Issues](https://github.com/maz1987in/3Dviewer-Nextcloud/issues)
3. **Create Issue**: Provide detailed error information
4. **Community Support**: Ask in [GitHub Discussions](https://github.com/maz1987in/3Dviewer-Nextcloud/discussions)

## 🤝 Contributing

### Code Standards
- Follow **PSR-12** for PHP code
- Use **ESLint** configuration for JavaScript/TypeScript
- Follow **Stylelint** rules for CSS/SCSS
- Write **comprehensive tests** for new features
- Update **documentation** for new features

### Pull Request Process
1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Add tests** for new functionality
5. **Update documentation** if needed
6. **Run** the full test suite
7. **Submit** a pull request

### Commit Message Format
Use conventional commits:
```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: maintenance tasks
```

## 📊 Performance Metrics

### Bundle Size Limits
| Bundle | Raw (bytes) | Gzip (bytes) |
|--------|------------:|-------------:|
| `threedviewer-main.mjs` | 950,000 | 260,000 |
| `gltf-*.chunk.mjs` | 120,000 | 40,000 |
| `FBXLoader-*.chunk.mjs` | 120,000 | 50,000 |

### Supported File Sizes
- **Small models**: < 1MB (instant loading)
- **Medium models**: 1-10MB (fast loading with progress)
- **Large models**: 10-100MB (streaming with abort support)
- **Very large models**: > 100MB (progressive loading)

## 📄 License

This project is licensed under the AGPL-3.0 License. See [LICENSE](../LICENSE) for details.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/maz1987in/3Dviewer-Nextcloud/issues)
- **Documentation**: This documentation directory
- **Community**: [GitHub Discussions](https://github.com/maz1987in/3Dviewer-Nextcloud/discussions)

---

For specific technical details, see the [Technical Documentation](TECHNICAL.md) and [Implementation Guide](IMPLEMENTATION.md).