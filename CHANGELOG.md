# Changelog

All notable changes to the 3D Viewer Nextcloud app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.13] - 2025-01-05

### Fixed
- **CSP Conflicts**: Removed global CSP listener that was breaking other Nextcloud apps (Memories, etc.)
- **File Icons**: Fixed custom file type icons not displaying by copying them to correct location
- **App Compatibility**: CSP modifications now only apply to 3D viewer routes, allowing other apps to function normally

### Changed
- CSP headers now scoped to specific 3D viewer routes instead of globally
- Added automatic icon copying during build process (scripts/copy-icons.mjs)
- Removed `lib/Listener/CspListener.php` (no longer needed)

## [1.7.12] - 2025-01-04

### Fixed
- **Viewer Integration**: Fixed `files()` method not storing files list, causing "No files provided, skipping update" error
- **File Loading**: Fixed `TypeError: Cannot read properties of undefined (reading 'filename')` when opening 3D files
- **Static Assets**: Fixed 500 error when loading app-color.svg due to route conflicts
- **Route Structure**: Changed viewer route from `/{fileId}` to `/f/{fileId}` to prevent conflicts with static assets
- **Axes Positioning**: Axes helper now positioned at bottom center of models, aligned with grid
- **Axes Scaling**: Made axes size dynamic (25% of model's largest dimension, minimum 5 units)
- **Logo Loading**: Fixed app logo path in demo scene to use generateUrl() for correct URL resolution

### Changed
- Enhanced `files()` method in ViewerComponent with fallback logic to create synthetic file from props
- Simplified PageController by removing unnecessary `is_numeric()` checks
- Updated URL structure for better RESTful design: `/apps/threedviewer/f/{fileId}`
- Axes now recreate on model load to ensure proper sizing and positioning

## [1.7.11] - 2025-01-04

### Fixed
- **Dark Theme Support**: Fixed slide-out toolbar panel not responding to theme changes
- **Theme Switching**: Implemented reactive theme binding using Vue computed properties
- **CSS Integration**: Converted base styles to use Nextcloud CSS variables for better theme integration
- **UI Consistency**: Toolbar panel now properly switches between Light, Dark, and Auto themes

### Changed
- Improved maintainability by using Nextcloud's standard color system throughout the toolbar
- Enhanced theme responsiveness with component-level class binding

## [1.7.10] - 2025-11-04

### Fixed
- **Dark Theme Support**: Fixed slide-out toolbar panel not responding to theme changes
- **Theme Switching**: Implemented reactive theme binding using Vue computed properties
- **CSS Integration**: Converted base styles to use Nextcloud CSS variables for better theme integration
- **UI Consistency**: Toolbar panel now properly switches between Light, Dark, and Auto themes

### Changed
- Improved maintainability by using Nextcloud's standard color system throughout the toolbar
- Enhanced theme responsiveness with component-level class binding

## [1.7.9] - 2025-10-28

### Added
- **3D Camera Controller**: New circular controller interface for intuitive 3D model navigation
- **Camera Control Methods**: Advanced camera manipulation including rotation, zoom, and directional nudging
- **View Snapping**: Animated camera transitions to predefined views (Front, Back, Left, Right, Top, Bottom)
- **Controller Persistence**: Save and restore controller position and visibility preferences
- **Smooth Animations**: Eased camera transitions with customizable duration and easing functions
- **Face Labels**: Orientation markers (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT) on model faces
- **Export Functionality**: Export models to GLB, STL, and OBJ formats
- **Camera Projection Toggle**: Switch between perspective and orthographic views
- **Progressive Texture Loading**: Background texture loading for improved performance
- **Dependency Caching**: IndexedDB caching system for faster multi-file model loading
- **Model Statistics Panel**: Detailed information about loaded models
- **Help Panel**: Comprehensive in-app documentation and controls guide
- **Theme Customization**: Enhanced theme switching with RTL support
- **Performance Overlay**: Visual performance stats display with real-time monitoring
- **KTX2 Texture Support**: GPU texture compression for better performance

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