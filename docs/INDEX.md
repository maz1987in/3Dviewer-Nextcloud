# ThreeDViewer Documentation Index

Complete documentation for the 3D Model Viewer Nextcloud app.

## � Quick Start

- [Installation Guide](INSTALLATION.md) - How to install the app
- [User Guide](USER_GUIDE.md) - End-user documentation
- [Developer Guide](DEVELOPER_GUIDE.md) - Development setup and workflow

## 🏗️ Architecture & Design

- [Technical Architecture](TECHNICAL_ARCHITECTURE.md) - System architecture overview
- [Multi-File Loading Architecture](MULTI_FILE_LOADING_ARCHITECTURE.md) - Detailed diagrams for multi-file model loading
- [API Reference](API_REFERENCE.md) - Backend API endpoints

## 🔧 Implementation Guides

### Core Features
- [MIME Type Setup](MIME_TYPE_SETUP.md) - File type registration
- [MIME Type Lifecycle](MIME_TYPE_LIFECYCLE.md) - Install/uninstall flow
- [Model File Support Analysis](MODEL_FILE_SUPPORT_ANALYSIS.md) - Supported formats

### Advanced Features  
- [Advanced Viewer Wiring](ADVANCED_VIEWER_WIRING.md) - Standalone app integration
- [Model Loading Implementation](MODEL_LOADING_IMPLEMENTATION.md) - Three.js model loading
- [Multi-File Loading](MULTI_FILE_LOADING.md) - OBJ+MTL, GLTF+bins support

## 🐛 Troubleshooting & Fixes

- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions
- [MIME Type Fix Summary](MIME_TYPE_FIX_SUMMARY.md) - MIME registration fixes
- [API Endpoint Fix](API_ENDPOINT_FIX.md) - 404 error resolution
- [Inline File Serving Fix](INLINE_FILE_SERVING_FIX.md) - Download dialog → inline display
- [Translation Navigation Fixes](TRANSLATION_NAVIGATION_FIXES.md) - i18n and nav fixes

## 📋 Change Logs & Summaries

- [Cleanup Summary](CLEANUP_SUMMARY.md) - Legacy code removal (15 files, 1.7 MB)
- [Multi-File Loading Summary](MULTI_FILE_LOADING_SUMMARY.md) - Phase 1 completion status
- [Code Audit: Unused Files](CODE_AUDIT_UNUSED_FILES.md) - Dead code identification

## 🔍 Deep Dives

- [Fixes 2025-10-01](FIXES_2025_10_01.md) - Recent bug fixes and improvements

## 📊 Project Status (October 1, 2025)

### ✅ Completed
- MIME type lifecycle (install/uninstall)
- Legacy file cleanup (15 files removed)
- Advanced viewer wiring (RESTful routing)
- Translation system (l10n integration)
- Navigation entry (app icon in menu)
- Model loading infrastructure (both viewers)
- API endpoint fixes (404 errors resolved)
- Auto-fit camera implementation
- **Multi-file loading infrastructure (Phase 1)** ← NEW

### 🔄 In Progress
- Multi-file loading integration (Phase 2)
- Testing with real 3D files

### ⏳ Pending
- Loading states and progress indicators
- Toolbar feature testing
- Advanced features (annotations, measurements)
- Format-specific testing (COLLADA, FBX)
- Performance optimization

## 🗂️ Document Organization

### By Topic
- **Setup**: INSTALLATION.md, MIME_TYPE_SETUP.md
- **Architecture**: TECHNICAL_ARCHITECTURE.md, MULTI_FILE_LOADING_ARCHITECTURE.md
- **Implementation**: MODEL_LOADING_IMPLEMENTATION.md, MULTI_FILE_LOADING.md
- **Fixes**: API_ENDPOINT_FIX.md, TRANSLATION_NAVIGATION_FIXES.md, MIME_TYPE_FIX_SUMMARY.md
- **Reference**: API_REFERENCE.md, USER_GUIDE.md, DEVELOPER_GUIDE.md

### By Audience
- **Users**: USER_GUIDE.md, INSTALLATION.md
- **Developers**: DEVELOPER_GUIDE.md, TECHNICAL_ARCHITECTURE.md, API_REFERENCE.md
- **Contributors**: All implementation and fix documents

## 🔗 External Resources

- [Nextcloud App Development](https://docs.nextcloud.com/server/latest/developer_manual/app_development/)
- [Three.js Documentation](https://threejs.org/docs/)
- [WARP-LAB files_3dmodelviewer](https://github.com/WARP-LAB/files_3dmodelviewer) - Reference implementation

## 📝 Document Templates

When creating new documentation:
1. Include date and status at top
2. Use clear section headings
3. Add code examples where appropriate
4. Reference related documents
5. Update this index

---

**Last Updated**: October 1, 2025  
**Total Documents**: 21  
**Latest Addition**: MULTI_FILE_LOADING_ARCHITECTURE.md, MULTI_FILE_LOADING_SUMMARY.md
