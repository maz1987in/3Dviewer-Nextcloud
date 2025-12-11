# Changelog

All notable changes to the 3D Viewer Nextcloud app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Animation Controls in UI**: Added animation play/pause controls to viewer interface
  - Animation play/pause button in MinimalTopBar component
  - Animation controls section in SlideOutToolPanel with play/pause and loop toggle
  - Animation state props passed through App.vue to child components
  - Integration of useAnimation composable in ThreeViewer component
  - Improved directory path extraction for multi-file model loading
- **Dependency Cache Insights**: Added live cache statistics (size, entries, hit rate) to the viewer and slide-out tools
  - Viewer performance panel now shows cache size and hit rate
  - Slide-out tools panel displays cache stats and clear-cache control with status
  - Cache stats refresh automatically during use and after model loads or cache clears
  - Cache hit/miss tracking with reset when clearing the cache

### Fixed
- **Model Comparison Positioning**: Fixed comparison model positioning issues where the second model's position was immutable
  - Wrapped comparison model in a Group to neutralize baked position offset from loading
  - Fixed parent-child relationship handling by using toRaw() to get actual Three.js objects instead of Vue proxies
  - Ensured matrixAutoUpdate is enabled for wrapper and all children for proper render loop updates
  - Fixed matrix validation order: validate parent matrices before child objects to prevent "Cannot read properties of undefined" errors
  - Improved scene hierarchy validation to include all objects (grid, axes, lights) not just models
  - Fixed matrix update sequence: call updateMatrix() on all objects before updateMatrixWorld() to ensure proper transformations
  - Comparison models now position correctly side-by-side with proper spacing and alignment
- **CSP Compliance for Texture Loading**: Fixed Content Security Policy violations when loading GLB/GLTF models with embedded textures in Nextcloud modal viewer
  - Patched `Image.prototype.src` setter to automatically convert blob URLs to data URIs for texture loading
  - Patched `URL.createObjectURL` to track blob-to-URL mappings for later conversion
  - Patched `fetch()` and `XMLHttpRequest` to intercept blob URLs and convert them to data URIs
  - Patched `THREE.FileLoader` to handle blob URL conversion for texture resources
  - Automatic detection of modal viewer context (iframe or Nextcloud viewer) to apply CSP workarounds only when needed
  - All patches are automatically restored after model loading completes
- **CSP Compliance for Buffer Loading**: Fixed CSP violations when loading GLTF files with external `.bin` buffer files
  - Updated `setupResourceManager` to use data URIs for buffers in modal context (instead of blob URLs)
  - Patched `fetch()` to intercept data URI requests and decode them manually, bypassing CSP restrictions
  - Supports both base64 and URL-encoded data URIs for maximum compatibility
- **Animation Support for Multi-File GLTF**: Fixed missing animation initialization for GLTF files loaded with external dependencies
  - Added animation detection and initialization to `loadModelWithFiles` function
  - Animations now properly initialize when loading GLTF files with external `.bin` files
  - Animation controls now appear correctly for animated multi-file GLTF models
- **False Texture Warning**: Removed automatic texture warning banner that was incorrectly showing for all GLB/GLTF files
  - Warning now only appears when actual CSP errors or texture loading failures are detected
  - Improved user experience by eliminating false warnings when textures load successfully
- **Slicer Upload Safety**: Hardened temporary STL upload handling with size and MIME validation
  - Reject uploads over 50 MB per file and enforce a 200 MB rolling temp folder cap
  - Validate STL MIME/header before accepting; reject invalid content
  - Enforce rolling 24h expiration on access and clean up expired shares/files
  - Use rolling +1 day expiration for generated share links
- **OBJ Texture Loading Robustness**: Improved OBJ/MTL parsing and texture handling
  - Preserve texture/MTL paths with spaces and mark materials for update after textures load
  - Use existing blob File objects for texture URLs and tighten loader logging
  - Handle texture load failures gracefully and ensure needsUpdate flags are set
- **Texture Dependency Lookup**: Skip direct “find by path” lookups for image textures to avoid unnecessary 404s; rely on directory listings for textures commonly stored in subfolders

## [2.1.0] - 2025-12-06

### Added
- **File Browser Default View Setting**: Added user preference for default file browser view mode (Grid or List)
  - New setting in Personal Settings → File Browser → Default View
  - FileBrowser component now loads and respects the default view from user settings
  - Setting takes precedence over localStorage, ensuring consistent default behavior
  - Manual view changes are still saved to localStorage for session persistence
- **Format Sync Test Suite**: Created comprehensive unit tests (`tests/unit/Service/FormatSyncTest.php`) to ensure format definitions stay synchronized across:
  - Backend PHP constants (`lib/Constants/SupportedFormats.php`)
  - Frontend configuration (`src/config/viewer-config.js`)
  - Nextcloud MIME registration (`appinfo/mimetypemapping.json`)
- **File Browser List View**: Added ability to toggle between grid and list views in file browser

### Changed
- **Format Definitions Centralized**: Consolidated all 3D model format definitions into `lib/Constants/SupportedFormats.php` as single source of truth
  - `EXT_MIME_MAP` for extension to MIME type mappings
  - `CONTENT_TYPE_MAP` for file streaming content types
  - All repair steps and services now reference centralized constants
  - Eliminates format definition divergence between components
- **File Browser Grid Padding**: Updated file grid padding to consistent 20px on all sides for better visual spacing

### Documentation
- Corrected repository URLs and upstream fork instructions in `CONTRIBUTING.md` (replaced placeholders with `maz1987in/3Dviewer-Nextcloud`).
- Updated `TECHNICAL.md` with new controllers (`SettingsController`, `SlicerController`), components (`PersonalSettings.vue`, `SlicerModal.vue`), and detailed Personal Settings + File Browser implementation sections.
- Added comprehensive "Adding a New Format" guide in `TECHNICAL.md` with step-by-step instructions and code examples
- Expanded `IMPLEMENTATION.md`: added Slicer Integration & Personal Settings System sections; reorganized and deduplicated legacy "Code Audit and Cleanup" content; refreshed Table of Contents.
- Updated `README.md` (docs version) advanced features list to include Slicer Integration and Personal Settings.
- Added troubleshooting sections for Slicer Integration and Personal Settings in `TROUBLESHOOTING.md`.
- Expanded test coverage notes in `TESTING.md` to include new controllers (Settings/Slicer) and components (PersonalSettings/SlicerModal).
- Normalized wording and removed outdated dual-mode duplication in implementation documentation.
- Documented dual-mode viewer architecture in `TECHNICAL.md` with viewer lifecycle diagram (standalone vs modal modes).

### Fixed
- Settings page image/logo path resolution: replaced hardcoded asset URL with `imagePath()` helper in `PersonalSettings.vue` to ensure correct loading under all deployment paths.
- **VRML preprocessing duplication**: Removed duplicate preprocessing code in `preprocessVrmlText()` that was applying BOM removal, line ending normalization, and null byte removal twice, causing inconsistent preprocessing behavior.
- **Flexible texture matching loop control**: Fixed nested loop control flow in texture matching logic (`multiFileHelpers.js`) by adding `foundMatch` flag to properly exit outer loop when match is found in inner loop, preventing valid texture matches from being skipped.
- **Premature texture issue check**: Moved `checkForTextureIssues()` setTimeout call in `ViewerComponent.vue` to execute after model successfully loads and is added to scene, ensuring accurate texture loading status assessment.
- **Debug logging cleanup**: Removed `console.log` statements from `FileBrowser.vue` component (viewMode watcher and setViewMode method) to improve production code quality.

## [2.0.0] - 2025-12-01

### Added
- **Standalone Advanced Viewer**: Full-featured standalone viewer mode accessible via `/apps/threedviewer/f/{fileId}`
  - Dual-mode architecture: simple modal viewer (ViewerComponent) and advanced standalone viewer (App.vue)
  - Conditional mounting in `src/main.js` for `#threedviewer` root element
  - Props-based data flow: `fileId`, `filename`, and `dir` passed via data attributes from template to App.vue
  - Loader-driven model pipeline works in both simple and advanced modes
  - Enhanced error handling with specific messages for 404, 403, network, and parsing errors
  - PageController automatically fetches filename and directory from fileId for robustness
  - User-friendly loading and error states harmonized between both viewer modes
- **Personal Settings**: Added personal settings page for user-specific preferences
  - SettingsController and PersonalSettings view for managing user preferences
  - Settings routes and configuration updates
- **Enhanced File Loaders**: Significantly improved loader capabilities
  - Enhanced FBX loader with additional features and better support
  - Improved VRML loader with expanded capabilities
  - Updated DAE loader for better compatibility
  - Enhanced multi-file loading helpers for improved dependency resolution

### Changed
- **Viewer Enhancements**: Enhanced ThreeViewer component with improved controls and features
- **Camera Improvements**: Updated camera composable with additional functionality
- **Circular Controller**: Enhanced circular controller with better user experience
- **Theme and Performance**: Updated theme and performance composables
- **Major Version Bump**: Version 2.0.0 introduces significant improvements and new features

### Technical
- Updated GitHub workflows with improved condition syntax
- Updated Dependabot timezone to Asia/Muscat
- Added change detection to prevent unnecessary PRs in workflows
- Updated stylelint to 16.26.1

## [1.9.8] - 2025-11-28

### Changed
- **Dependencies**: Updated development and runtime dependencies
  - `three`: ^0.181.1 → ^0.181.2 (patch update)
  - `stylelint`: ^16.25.0 → ^16.26.0 (dev)
  - `vite`: ^7.2.2 → ^7.2.4 (dev)

## [1.9.7] - 2025-11-27

### Added
- **Folder Exclusion**: Added support for `.no3d` marker file to exclude specific folders from 3D file scanning.
- **Hidden Folder Exclusion**: Automatically exclude hidden folders (starting with `.`) from the file index.
- **Temp File Cleanup**: Implemented background job to automatically clean up `.3dviewer_temp` files older than 24 hours.

### Fixed
- **Layout Issue**: Fixed white empty space when hiding the navigation sidebar by ensuring correct flexbox behavior and explicit slot usage.
- **Viewer Resizing**: Fixed 3D canvas visual resizing issue by syncing internal resolution with CSS dimensions (`width: 100%`).
- **App Logo**: Fixed broken app logo in demo scene by using correct asset path helper.
- **Slicer Icons**: Fixed missing slicer icons by using the correct `imagePath` helper for asset URLs.
- **"By Folder" Navigation**: improved folder indexing logic to correctly build hierarchy and handle edge cases.
- **Server Error**: Resolved persistent `preg_match` error in `PreviewManager` by disabling unused app preview provider registration.

## [1.9.6] - 2025-11-21

### Fixed
- **Preview Provider Registration**: Fixed `ArgumentCountError` during app service registration
  - `registerPreviewProvider()` requires 2 arguments (MIME type and provider class)
  - Now registers `ModelPreviewProvider` for each supported MIME type individually
  - Resolves error: "Too few arguments to function registerPreviewProvider(), 1 passed and exactly 2 expected"
- **Migration Class Declaration**: Fixed missing class declaration in migration file
  - Added `class Version010902Date20251116061241 extends SimpleMigrationStep` declaration
  - Resolves syntax error: "unexpected token \"public\", expecting end of file"
- **Folder Path Length**: Removed the 512-character limit by hashing folder paths for indexing
  - Restored `folder_path` to `TEXT` and added a `folder_path_hash` column with a new migration
  - Existing rows are backfilled automatically so deep folder structures continue to work

## [1.9.2] - 2025-11-19

### Added
- **Database-Backed File Indexing**: New `tv_file_index` database table for fast folder, type, date, and favorites navigation
  - Automatic indexing via filesystem event listeners (`NodeCreated`, `NodeWritten`, `NodeDeleted`)
  - Manual reindexing via `php occ threedviewer:index-files [userId]` command or `/apps/threedviewer/api/files/index` endpoint
  - Migration automatically creates the index table on upgrade
- **Smart File Browser**: Complete file navigation system with multiple view modes
  - Viewer mode: Opens 3D viewer by default on app load
  - Folders mode: Hierarchical folder navigation with recursive folder structure
  - Type mode: Browse files grouped by extension (GLB, GLTF, OBJ, etc.)
  - Date mode: Browse files organized by year and month
  - Favorites mode: View all favorited 3D files using Nextcloud system tags
  - Breadcrumb navigation for easy navigation back through folder/type/date hierarchies
  - Consistent card-based UI for folders, types, dates, and files
- **Per-User Configuration**: Remembers user preferences via `ConfigController`
  - Saves preferred sort mode (viewer/folders/type/date/favorites)
  - Remembers last opened file ID for session persistence
- Mobile experience: automatically hides the circular 3D controller when the viewer detects a small/mobile viewport, preventing overlap with the canvas controls.

### Changed
- Viewer opens by default on app load; the file browser now appears only when a user explicitly selects a navigation mode.
- `GET /apps/threedviewer/api/files/list` now serves hierarchical payloads from the database index (folders, types, dates, favorites) instead of scanning filesystem
  - Supports `includeDependencies=1` parameter to return all files including textures and nested subfolders for multi-file model loading
  - Dramatically reduces filesystem scans and improves performance
- Navigation data is loaded lazily per sort mode and cached so switching between viewer and browser modes no longer blocks on loading every file upfront.
- File browser UI refinements:
  - File cards now share the same compact layout as folder cards (consistent padding, thumbnail sizing, fonts, and grid spacing).
  - Type view heading and breadcrumbs no longer show a leading dot (e.g. `GLB` instead of `.GLB`).
  - Breadcrumb component now handles clicks directly via `NcBreadcrumb` to improve reliability.
- Remembered folder/type state is cleared when returning to the root via breadcrumbs to ensure a fresh reload.

### Fixed
- Newly uploaded, edited, or deleted 3D files (and favorites) appear instantly in every navigation mode because the indexing listener reacts to filesystem events instead of relying on manual rescans.
- Root breadcrumb ("Home") navigation restores the folder list correctly, even after drilling into nested folders.
- Multi-file dependency loading:
  - Backend `listFiles` now supports `includeDependencies=1` to return every file (including textures) and nested subfolders.
  - The dependency crawler recursively searches texture subdirectories so 3DS/FBX models with textured assets load successfully.
- Texture search now uses the updated backend response structure to avoid missing files and 404 fetches.

### Technical
- Created `lib/Db/FileIndex.php` and `lib/Db/FileIndexMapper.php` for database operations
- Created `lib/Service/FileIndexService.php` for indexing logic
- Created `lib/Listener/FileIndexListener.php` for automatic index updates
- Created `lib/Command/IndexFiles.php` for manual reindexing command
- Created `lib/Controller/ConfigController.php` for user preference storage
- Created `lib/Migration/Version010902Date20251116061241.php` for database schema migration
- Created `src/components/FileNavigation.vue` and `src/components/FileBrowser.vue` for new navigation UI
- Updated `lib/Controller/FileController.php` with new `listFiles()` and `indexFiles()` endpoints

## [1.9.1] - 2025-11-15

### Added
- **Preview Provider Implementation**: Implemented Nextcloud `IPreviewProvider` interface for 3D model previews
  - Admins can enable/disable via `enabledPreviewProviders` config in `config/config.php`
  - Integrates with Nextcloud's native preview system
  - When enabled, provider is registered and ready for future preview rendering implementation
  - When disabled, Nextcloud automatically uses custom filetype SVG icons

### Changed
- Updated dependencies:
  - `three`: ^0.181.0 → ^0.181.1 (patch update)
  - `@nextcloud/router`: ^3.0.1 → ^3.1.0 (minor update)
  - `vite`: ^7.1.12 → ^7.2.2 (patch update)
  - `@nextcloud/browserslist-config`: ^3.1.1 → ^3.1.2 (patch update)
- Improved duplicate registration prevention:
  - Added guards to prevent duplicate file action registration
  - Added guards to prevent duplicate viewer handler registration
  - Enhanced error handling with try-catch blocks

### Removed
- **ThumbnailController**: Removed custom thumbnail controller endpoint
  - Replaced by proper Nextcloud `IPreviewProvider` implementation
  - No longer needed as Nextcloud handles previews natively
- **Thumbnail Placeholder**: Removed dependency on `thumbnail-placeholder.png`
  - Nextcloud automatically uses custom filetype icons when previews are disabled
  - Custom icons already registered via `mimetypemapping.json`
- **CSS Thumbnail Overrides**: Removed CSS rules that forced `app.svg` background on thumbnails
  - Allows Nextcloud's preview system to work properly
  - Custom filetype icons display correctly when previews are unavailable

### Fixed
- **Duplicate Registration Warnings**: Fixed console warnings about duplicate settings/registrations
  - Added registration guards using window/globalThis flags
  - Improved handler registration checks
  - Better error handling for duplicate registrations

### Technical
- Created `lib/Preview/ModelPreviewProvider.php` implementing `IPreviewProvider`
- Registered preview provider in `Application.php` bootstrap
- Removed `THUMBNAIL` endpoint from constants and API documentation
- Updated `openapi.json` with preview provider documentation

## [1.9.0] - 2025-11-10

### Added
- **🖨️ Slicer Integration**: Send 3D models directly to slicer applications for 3D printing
  - Support for PrusaSlicer, UltiMaker Cura, BambuStudio, OrcaSlicer, Simplify3D, and Eufy Studio
  - One-click export with URL scheme integration
  - Automatic STL conversion and temporary share link creation
  - Professional slicer logos with brand-matched colors
  - Last used slicer appears first for quick access
  - Smart detection of uninstalled slicers with user-friendly error messages
  - Auto-download fallback when slicer app is not registered
  - Temporary file cleanup after 2 minutes
  - Share links expire after 24 hours for security
- **SlicerController API**: Backend controller for handling slicer exports
  - POST `/api/slicer/temp` - Upload STL and create temporary share link
  - GET `/api/slicer/temp/{fileId}` - Download temporary file
  - DELETE `/api/slicer/temp/{fileId}` - Delete temporary file and share
  - Automatic cleanup of old temporary files
  - Proper filename sanitization for paths and special characters
  - CORS headers for slicer application compatibility

### Changed
- Updated app version to 1.9.0
- Enhanced toolbar with "Send to Slicer" button
- Added slicer integration to slide-out tools panel
- Improved error handling with toast notifications
- Updated translations for all supported languages

### Technical
- Created `appinfo/routes.php` for route registration
- Added `@NoCSRFRequired` annotations for API endpoints
- Implemented Nextcloud native share system for temporary URLs
- Fixed filename handling for files with paths and special characters
- Added proper authentication and cleanup mechanisms

## [1.8.0] - 2025-01-05

### Added
- **Screenshot Feature**: Capture high-quality screenshots of 3D models directly from the viewer
  - PNG and JPEG format support with configurable quality
  - Automatic filename generation with timestamp
  - Accessible from toolbar and tools panel
  - Download screenshots directly to local device
  - Fixed WebGL renderer configuration to enable screenshot capture (`preserveDrawingBuffer: true`)
- **Billboard Text Labels**: Annotation and measurement text now always faces the camera
  - Text remains readable from any viewing angle
  - No more reversed/mirrored text when viewing from behind
  - Smooth rotation as camera moves around the model
  - Improved user experience for annotations and measurements

### Changed
- Updated app version to 1.8.0
- Enhanced info.xml with new feature descriptions
- Updated English translations for screenshot and billboard features

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