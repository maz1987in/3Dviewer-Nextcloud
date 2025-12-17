# 3D Viewer for Nextcloud

[![Version](https://img.shields.io/badge/version-2.2.0-blue)](https://github.com/maz1987in/3Dviewer-Nextcloud/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-orange)](LICENSE)
[![Nextcloud](https://img.shields.io/badge/Nextcloud-30--32-0082c9)](https://nextcloud.com)
[![Update nextcloud/ocp](https://github.com/maz1987in/3Dviewer-Nextcloud/actions/workflows/update-nextcloud-ocp-matrix.yml/badge.svg)](https://github.com/maz1987in/3Dviewer-Nextcloud/actions/workflows/update-nextcloud-ocp-matrix.yml)
[![Release](https://github.com/maz1987in/3Dviewer-Nextcloud/actions/workflows/release.yml/badge.svg)](https://github.com/maz1987in/3Dviewer-Nextcloud/actions/workflows/release.yml)

A comprehensive 3D model viewer application for Nextcloud that supports multiple 3D file formats with advanced features like dynamic grid sizing, model comparison, and real-time streaming.

## 📸 Screenshots

<table>
  <tr>
    <td align="center">
      <img src="img/screenshots/01-main-viewer.png" alt="Main Viewer Interface" width="400"/><br/>
      <b>Main Viewer Interface</b><br/>
      Interactive 3D model viewing with intuitive controls
    </td>
    <td align="center">
      <img src="img/screenshots/02-files-integration.png" alt="Files Integration" width="400"/><br/>
      <b>Nextcloud Files Integration</b><br/>
      Seamlessly integrated with the Files app
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="img/screenshots/03-toolbar-features.png" alt="Toolbar Features" width="400"/><br/>
      <b>Rich Toolbar Features</b><br/>
      Grid, axes, wireframe, background controls and more
    </td>
    <td align="center">
      <img src="img/screenshots/04-multi-file-support.png" alt="Multi-File Support" width="400"/><br/>
      <b>Multi-File Support</b><br/>
      OBJ+MTL+textures, GLTF+bins+images
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="img/screenshots/05-dark-theme.png" alt="Dark Theme" width="400"/><br/>
      <b>Dark Theme Support</b><br/>
      Automatically adapts to Nextcloud theme
    </td>
  </tr>
</table>

## 📚 Documentation

- **[User Guide](docs/README.md)** - Complete installation, usage, and feature documentation
- **[Technical Documentation](docs/TECHNICAL.md)** - Architecture, API, and implementation details
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Testing Guide](docs/TESTING.md)** - Testing procedures and guidelines
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project

## ✨ Key Features

- **Multi-Format Support** - GLB, GLTF, OBJ (+MTL), STL, PLY, FBX, 3MF, 3DS, DAE, X3D, VRML
- **Enhanced File Loaders** - Significantly improved FBX, VRML, and DAE loaders with better material and texture support
- **Multi-File Models** - Full support for OBJ+MTL+textures and GLTF+bins+images
- **Personal Settings** - User-specific preferences and settings page integrated with Nextcloud personal settings
- **Measurement & Annotation Visual Controls** - Customizable sizing controls (point size, line thickness, label width) for measurements and annotations
- **Animation Controls** - Play/pause controls for animated 3D models with loop toggle support
- **Performance Scaling** - Automatic performance mode suggestions for large models with configurable triangle count thresholds
- **Cache Insights** - Live dependency cache statistics (size, entries, hit rate) visible in viewer and tools panel
- **Enhanced Security** - Hardened slicer temp file handling with file size limits, MIME validation, and rolling expiration
- **Bundle Budget Enforcement** - Automated bundle size checking with historical tracking and CI integration
- **Smart File Browser** - Toggle between Viewer, Folders, Type, Date, and Favorites modes with breadcrumbs, Nextcloud-style navigation, lazy loading, and customizable default view (Grid/List)
- **Dynamic Grid System** - Automatically adapts to model size and position
- **Model Comparison** - Side-by-side model viewing with synchronized controls
- **Advanced Tooling** - Annotations and measurements with customizable visual sizing controls (point size, line thickness, label width)
- **3D Camera Controller** - Enhanced intuitive circular controller for precise camera navigation with improved controls
- **Face Labels** - Orientation markers (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT) on model faces
- **Screenshot Capture** - Take high-quality PNG/JPEG screenshots of 3D models
- **Export Functionality** - Export models to GLB, STL, and OBJ formats
- **Slicer Integration** - Send models directly to PrusaSlicer, Cura, BambuStudio, OrcaSlicer, Simplify3D, Eufy Studio, and AnycubicSlicer with enhanced security (file size limits, MIME validation, rolling expiration)
- **Camera Projection Toggle** - Switch between perspective and orthographic views
- **Enhanced Camera Controls** - Improved camera composable with additional functionality and better user experience
- **Progressive Texture Loading** - Background loading for improved performance
- **Dependency Caching** - IndexedDB caching for faster multi-file model loading with live cache statistics (size, entries, hit rate)
- **Model Statistics Panel** - Detailed information about loaded models
- **Help Panel** - Comprehensive in-app documentation and controls guide
- **Performance Optimized** - Code splitting, dynamic imports, quality modes with visual overlay, and automatic performance suggestions for large models
- **Theme Integration** - Respects Nextcloud light/dark themes with RTL support
- **Accessibility** - ARIA labels and keyboard navigation
- **Compression Support** - DRACO geometry and KTX2/Basis texture compression
- **Live File Indexing** - Database-backed index updates automatically via filesystem events with CLI/REST helpers for bulk reindexing

## 🚀 Quick Start

### Installation

#### From Nextcloud App Store (Recommended)

1. Open your Nextcloud instance
2. Go to **Apps** (top-right menu)
3. Search for "**3D Viewer**"
4. Click **Download and enable**

MIME types are registered automatically during installation!

#### Manual Installation

```bash
# Clone or download the app
git clone https://github.com/maz1987in/3Dviewer-Nextcloud.git
cd 3Dviewer-Nextcloud

# Install dependencies and build
composer install --no-dev
npm install
npm run build

# Deploy to Nextcloud
cp -r . /path/to/nextcloud/apps/threedviewer/

# Enable the app
php occ app:enable threedviewer
```

**Post-Installation:** If you uploaded 3D files before installing the app, rescan them:

```bash
php occ files:scan --all
```

### Basic Usage

1. **Upload** 3D files to your Nextcloud Files
2. **Click** on any 3D file (`.glb`, `.gltf`, `.obj`, `.stl`, etc.)
3. **Navigate** using mouse/touch:
   - **Rotate**: Left click + drag (or one finger)
   - **Zoom**: Mouse wheel (or pinch)
   - **Pan**: Right click + drag (or two fingers)
   - **Reset**: Double-click (or double-tap)

For detailed usage instructions, see the [User Guide](docs/README.md).

### Rebuilding the 3D File Index

The new navigation views are powered by a dedicated `tv_file_index` table. Newly uploaded, edited, or deleted 3D files are indexed automatically, but if you install the app on an instance that already contains models you can rebuild the index with:

```bash
php occ threedviewer:index-files          # Reindex all users
php occ threedviewer:index-files alice    # Reindex a single user
```

The UI will also call `POST /apps/threedviewer/api/files/index` the first time it notices an empty index, so admins rarely need to run the command manually.

## 📦 Supported Formats

### 3D Model Formats

| Format | Extension | Multi-file Support | Notes |
|--------|-----------|-------------------|-------|
| GLTF   | `.gltf`, `.glb` | Yes (bins, images) | Preferred format, full support |
| OBJ    | `.obj`    | Yes (MTL, textures) | Requires MTL for materials |
| STL    | `.stl`    | No | 3D printing format |
| PLY    | `.ply`    | No | Point cloud support |
| FBX    | `.fbx`    | Limited | Autodesk format |
| DAE    | `.dae`    | Limited | Collada format |
| 3DS    | `.3ds`    | Limited | 3D Studio format |
| 3MF    | `.3mf`    | No | 3D Manufacturing format |
| X3D    | `.x3d`    | Limited | Web3D standard |
| VRML   | `.wrl`, `.vrml` | Limited | Legacy format |

### Supporting File Types

**Material & Dependency Files:**
- `.mtl` - Material definitions for OBJ files
- `.bin` - Binary data for GLTF models

**Texture Formats** (for multi-file models):
- `.png`, `.jpg`/`.jpeg` - Standard web formats
- `.tga` - Targa image format
- `.bmp` - Bitmap format
- `.webp` - Modern web format

> **Note**: Supporting files (MTL, BIN, textures) are automatically loaded when present in the same directory as the main model file.

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for:
- Code standards and best practices
- Development environment setup
- Pull request process
- Testing requirements

## 📄 License

Copyright © 2025 Mazin Al Saadi. Licensed under AGPL-3.0-or-later.

This project is licensed under the **AGPL-3.0 License**. See [LICENSE](LICENSE) for details.

## 🔗 Links

- **GitHub**: [github.com/maz1987in/3Dviewer-Nextcloud](https://github.com/maz1987in/3Dviewer-Nextcloud)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Issues**: [GitHub Issues](https://github.com/maz1987in/3Dviewer-Nextcloud/issues)
- **Discussions**: [GitHub Discussions](https://github.com/maz1987in/3Dviewer-Nextcloud/discussions)

## 📊 Version

**Current Version**: 2.2.0  
**Released**: December 17, 2025

### What's New in 2.2.0
- **Measurement & Annotation Visual Sizing Controls** - Per-user sliders to customize measurement and annotation visuals
- **Animation Controls in UI** - Animation play/pause controls in toolbar and tools panel
- **Dependency Cache Insights** - Live cache statistics (size, entries, hit rate) in viewer and tools
- **Performance Scaling for Large Models** - Automatic performance mode suggestions and easy mode switching
- **Slicer Temp File Security Hardening** - Enhanced security with file size limits, MIME validation, and rolling expiration
- **Automated Bundle Budget Enforcement** - Enhanced bundle size checking with historical tracking
- **Vue 3 Migration Pre-Work** - Eliminated Vue 3 incompatible patterns for future migration readiness
- **Updated Dependencies** - Three.js 0.182.0, Vite 7.2.7, CodeQL Action v4

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes and version history.

---

For detailed technical information, API documentation, and architecture details, see the [Technical Documentation](docs/TECHNICAL.md).
