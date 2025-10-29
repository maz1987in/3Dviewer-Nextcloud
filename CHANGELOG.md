# Changelog

All notable changes to the 3D Viewer Nextcloud app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.9] - 2025-10-28

### Added
- **3D Camera Controller**: New circular controller interface for intuitive 3D model navigation
- **Camera Control Methods**: Advanced camera manipulation including rotation, zoom, and directional nudging
- **View Snapping**: Animated camera transitions to predefined views (Front, Back, Left, Right, Top, Bottom)
- **Controller Persistence**: Save and restore controller position and visibility preferences
- **Smooth Animations**: Eased camera transitions with customizable duration and easing functions

## [1.7.7] - 2025-10-11

### Added
- Comprehensive development tooling and configuration
- Jest testing framework for JavaScript unit tests
- Enhanced GitHub Actions workflows with security scanning
- Improved code quality tools (Stylelint, Psalm enhancements)
- Development documentation and contribution guidelines
- Git hooks for automated code quality checks
- VS Code workspace configuration
- Makefile for common development tasks
- App store marketing materials and screenshots

### Changed
- Enhanced package.json with additional scripts and dependencies
- Improved composer.json with security auditing and additional test configurations
- Updated stylelint configuration with comprehensive CSS/SCSS rules
- Enhanced psalm.xml with better static analysis settings
- Updated app metadata for Nextcloud app store publication

### Security
- Added security scanning workflows (CodeQL, npm audit, composer audit)
- Enhanced dependency vulnerability scanning
- Added security advisories configuration

## [1.0.0] - 2024-01-XX

### Added
- Initial release of 3D Viewer Nextcloud app
- Support for multiple 3D file formats (GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, 3DS)
- Dynamic grid system that adapts to model size
- Model comparison functionality with synchronized controls
- Real-time streaming with authentication
- Performance optimizations with code splitting and dynamic imports
- Theme integration respecting Nextcloud light/dark themes
- Accessibility features with ARIA labels and keyboard navigation
- Bundle size monitoring and optimization
- Comprehensive documentation and user guides
- PHPUnit testing for backend components
- Playwright testing for end-to-end scenarios
- Smoke tests for critical functionality

### Technical Features
- Vue.js 2 + Three.js frontend implementation
- Secure file streaming endpoints
- Dynamic loader imports for format-specific code
- DRACO and KTX2/Basis decoder support (with asset copying)
- Abortable model loading with progress feedback
- Camera state persistence and restoration
- Error handling with user-friendly notifications
- Public share support for anonymous access
- MIME type registration and cleanup
- Centralized model file support logic

### API Endpoints
- `GET /apps/threedviewer/file/{fileId}` - Stream authenticated model files
- `GET /apps/threedviewer/file/{fileId}/mtl/{mtlName}` - Stream MTL files for OBJ models
- `GET /apps/threedviewer/public/file/{token}/{fileId}` - Stream public share model files
- `GET /apps/threedviewer/asset/{type}/{filename}` - Serve static assets
- `GET /apps/threedviewer/decoder/{filename}` - Serve decoder files

### Supported Formats
- **Frontend & Backend**: GLB, GLTF, OBJ (+ MTL), STL, PLY, FBX, 3MF, 3DS
- **Compression**: DRACO (geometry), KTX2/Basis (textures)
- **Materials**: Full MTL support for OBJ files with automatic sibling resolution

### Performance
- Bundle size budget enforcement (950KB main, 120KB chunks)
- Dynamic imports for format-specific loaders
- Code splitting for optimal loading
- Abortable loading for large files
- Progress feedback during model loading

### Testing
- PHPUnit unit tests for controllers and services
- Playwright end-to-end tests
- Smoke tests for critical functionality
- Bundle size monitoring
- Abort behavior testing

### Documentation
- Comprehensive README with technical details
- Installation and user guides
- Developer documentation
- API reference
- Troubleshooting guide
- Technical architecture documentation

---

## Version History

### Development Milestones

- **v0.1.0** - Initial prototype with basic GLTF support
- **v0.5.0** - Added multiple format support and streaming
- **v0.8.0** - Performance optimizations and accessibility features
- **v0.9.0** - Public share support and enhanced error handling
- **v1.0.0** - Production-ready release with comprehensive testing

### Breaking Changes

None in v1.0.0 (initial release)

### Migration Notes

For users upgrading from development versions:

1. **Decoder Assets**: Ensure `draco/` and `basis/` directories are present
2. **MIME Types**: Run the repair step to register missing MIME mappings
3. **Browser Compatibility**: Requires modern browser with WebGL 2.0 support
4. **Nextcloud Version**: Requires Nextcloud 30+ for optimal compatibility

---

## Legend

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

## Links

- [GitHub Repository](https://github.com/your-username/3Dviewer-Nextcloud)
- [Nextcloud App Store](https://apps.nextcloud.com/apps/threedviewer)
- [Documentation](docs/)
- [Issue Tracker](https://github.com/your-username/3Dviewer-Nextcloud/issues)