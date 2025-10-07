# 3D Viewer for Nextcloud - Documentation

This directory contains comprehensive documentation for the 3D Viewer Nextcloud application.

## 📚 Documentation Index

### Core Documentation
- [**Installation Guide**](INSTALLATION.md)
- [**User Guide**](USER_GUIDE.md)
- [**Developer Guide**](DEVELOPER_GUIDE.md)
- [**API Reference**](API_REFERENCE.md)

### Migration Documentation 🚀
Start here: [**Composables Migration Summary**](COMPOSABLES_MIGRATION_SUMMARY.md) - Executive overview & decision record

**Planning Phase**:
- [**Composables Migration Plan**](COMPOSABLES_MIGRATION_PLAN.md) - Detailed strategy & 4-phase roadmap
- [**Composables Issues Analysis**](COMPOSABLES_ISSUES_ANALYSIS.md) - Technical analysis of composable quality
- [**Composables Architecture Diagram**](COMPOSABLES_ARCHITECTURE_DIAGRAM.md) - Visual architecture diagrams

**Implementation Phase**:
- [**Composables Migration Quickstart**](COMPOSABLES_MIGRATION_QUICKSTART.md) - Step-by-step implementation guide
- [**Composables Migration Checklist**](COMPOSABLES_MIGRATION_CHECKLIST.md) - Detailed task checklist

## 🚀 Quick Start

1. **Installation**: See [Installation Guide](INSTALLATION.md)
2. **Basic Usage**: See [User Guide](USER_GUIDE.md)
3. **Development**: See [Developer Guide](DEVELOPER_GUIDE.md)

## 📖 Overview

The 3D Viewer for Nextcloud lets users view, interact with, and compare 3D models directly within Nextcloud. It supports multiple 3D file formats and provides features like dynamic grid sizing, model comparison, measurement, and annotations.

### Key Features
- **Multi-format support**: GLB, GLTF, OBJ (+MTL), STL, PLY, FBX, 3MF, 3DS
- **Experimental formats**: DAE, X3D, VRML/WRL (listing and client-side loading via WebDAV)
- **Dynamic grid system**: Automatically adapts to model size and position
- **Model comparison**: Load a second model, position side-by-side, fit both to view
- **Measurement and annotations**: Create distance measurements and text notes
- **Abort and retry loading**: Cancel large loads with graceful error states
- **Performance-optimized**: Dynamic imports, decoder auto-detection (DRACO/Basis)
- **Theme integration & accessibility**: Works with light/dark themes, ARIA roles

### Architecture
- **Frontend**: Vue 2.7 + Three.js, Vite build
- **Backend**: PHP 8.1+ on Nextcloud app framework
- **API**: OCS endpoints and app routes for file listing/streaming
- **Security**: Authenticated access via Nextcloud sessions and OCS

## 🔧 Technical Stack

### Frontend
- **Vue 2.7**
- **Three.js 0.169**
- **Vite 7**

### Backend
- **PHP 8.1+**, **Composer**
- **Nextcloud app framework (NC 30-32)**
- **OCS API** for API endpoints

### Build Tools
- **Node.js 22+**, **npm 10+**
- **ESLint**, **Stylelint**

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

## 🧪 Testing

### Test Coverage
- **PHP unit tests** (services and controllers)
- **Playwright smoke/e2e tests** (viewer flows)

### Running Tests
```bash
# Frontend smoke tests (build + Playwright smoke suite)
npm run test:smoke

# Full e2e tests (headless/headed/report)
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:report

# Backend unit tests
composer test:unit

# Linting
npm run lint && npm run stylelint
composer cs:check
```

## 🤝 Contributing

We welcome contributions! See the Developer Guide for setup, style, and testing.

## 📄 License

This project is licensed under the AGPL-3.0 License. See [LICENSE](../LICENSE) for details.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/maz1987in/3Dviewer-Nextcloud/issues)
- **Documentation**: This documentation directory

---

For specific topics, please refer to the individual documentation files listed above.
