# Developer Guide

This guide provides comprehensive information for developers working on the 3D Viewer for Nextcloud application.

## 🚀 Getting Started

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
   # Install PHP dependencies
   composer install
   
   # Install Node.js dependencies
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
   # Enable via command line
   php occ app:enable threedviewer
   ```

## 🏗️ Project Structure

### Backend Structure

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

### Frontend Structure

```
src/
├── components/
│   ├── ThreeViewer.vue            # Main viewer (measurement, annotation, comparison)
│   └── ViewerToolbar.vue
├── composables/                   # useModelLoading, useComparison, useMeasurement, ...
├── loaders/
│   ├── registry.js                # Extension -> loader module mapping
│   └── types/                     # gltf, obj, stl, ply, fbx, 3mf, 3ds, dae, x3d, vrml
├── utils/
│   └── error-handler.js
├── viewer-entry.js                # Entry point mounted by Nextcloud
└── main.js
```

## 🔧 Development Workflow

### Code Style

#### PHP Code Style
```bash
# Check code style
composer cs:check

# Fix code style
composer cs:fix
```

#### JavaScript Code Style
```bash
# Check JavaScript style
npm run lint

# Fix JavaScript style
npm run lint:fix
```

### Git Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/new-format-support
   ```

2. **Make Changes**
   - Write code following style guidelines
   - Add tests for new functionality
   - Update documentation

3. **Test Changes**
   ```bash
   # Run all tests
   npm run test:all
   
   # Run specific tests
   composer test:unit
   npm run test:smoke
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add support for new 3D format"
   ```

5. **Push and Create PR**
   ```bash
   git push origin feature/new-format-support
   # Create pull request on GitHub
   ```

## 🧪 Testing

### Test Types

#### Unit Tests (PHP)
```php
<?php
namespace OCA\ThreeDViewer\Tests\Unit\Controller;

use OCA\ThreeDViewer\Controller\FileController;
use PHPUnit\Framework\TestCase;

class FileControllerTest extends TestCase
{
    public function testServeFile()
    {
        $controller = new FileController();
        $response = $controller->serveFile(123);
        
        $this->assertEquals(200, $response->getStatus());
    }
}
```

#### Integration Tests
```php
<?php
namespace OCA\ThreeDViewer\Tests\Integration;

use OCA\ThreeDViewer\Tests\Integration\TestCase;

class ApiTest extends TestCase
{
    public function testFileListEndpoint()
    {
        $response = $this->request('GET', '/ocs/v2.php/apps/threedviewer/api/files');
        
        $this->assertEquals(200, $response->getStatus());
        $this->assertArrayHasKey('files', $response->getData());
    }
}
```

#### Frontend Tests (Playwright)
```javascript
import { test, expect } from '@playwright/test';

test('loads 3D model', async ({ page }) => {
  await page.goto('/apps/threedviewer');
  await page.click('[data-testid="load-model"]');
  await expect(page.locator('canvas')).toBeVisible();
});
```

### Running Tests

```bash
# PHP unit tests
composer test:unit

# Frontend smoke tests
npm run test:smoke

# E2E tests
npm run test:e2e
```

### Test Data

#### Fixtures
```
tests/fixtures/
├── triangle.glb         # Small GLB model
├── triangle.obj         # Small OBJ model
├── triangle.mtl         # MTL material file
└── triangle.stl         # Small STL model
```

#### Mock Data
```javascript
// Mock file data
const mockFiles = [
  {
    id: 1,
    name: 'test.glb',
    size: 1024,
    path: '/admin/files/test.glb',
    mimetype: 'model/gltf-binary'
  }
];
```

## 🔧 Adding New Features

### Adding a New 3D Format

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

4. **Add Tests**
   ```php
   // tests/unit/Service/ModelFileSupportNewFormatTest.php
   public function testNewFormatSupport()
   {
       $this->assertTrue($this->modelFileSupport->isSupported('newformat'));
   }
   ```

### Adding New UI Features

1. **Create Component**
   ```vue
   <!-- src/components/NewFeature.vue -->
   <template>
     <div class="new-feature">
       <!-- Component template -->
     </div>
   </template>
   
   <script>
   export default {
     name: 'NewFeature',
     props: {
       // Component props
     },
     methods: {
       // Component methods
     }
   };
   </script>
   ```

2. **Integrate with Main Component**
   ```vue
   <!-- src/components/ThreeViewer.vue -->
   <template>
     <div class="three-viewer">
       <NewFeature v-if="showNewFeature" />
       <!-- Other components -->
     </div>
   </template>
   
   <script>
   import NewFeature from './NewFeature.vue';
   
   export default {
     components: {
       NewFeature
     }
   };
   </script>
   ```

3. **Add Tests**
   ```javascript
   // tests/smoke/new-feature.spec.js
   test('new feature works', async ({ page }) => {
     await page.goto('/apps/threedviewer');
     await page.click('[data-testid="new-feature-button"]');
     await expect(page.locator('[data-testid="new-feature"]')).toBeVisible();
   });
   ```

## 🐛 Debugging

### Backend Debugging

#### Enable Debug Mode
```php
// lib/Service/FileService.php
public function __construct()
{
    $this->logger = \OC::$server->getLogger();
    $this->debugMode = \OC::$server->getConfig()->getSystemValue('debug', false);
}
```

#### Logging
```php
// Add debug logging
$this->logger->debug('Loading file', [
    'fileId' => $fileId,
    'filename' => $filename,
    'size' => $fileSize
]);
```

#### Error Handling
```php
try {
    $result = $this->processFile($fileId);
} catch (Exception $e) {
    $this->logger->error('File processing failed', [
        'fileId' => $fileId,
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
    throw $e;
}
```

### Frontend Debugging

#### Console Logging
```javascript
// Enable debug logging
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('Debug info:', debugData);
}
```

#### Performance Monitoring
```javascript
// Monitor performance
const startTime = performance.now();
// ... do work ...
const endTime = performance.now();
console.log(`Operation took ${endTime - startTime} milliseconds`);
```

#### Error Tracking
```javascript
// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  // Send to error tracking service
});
```

### Browser DevTools

#### Network Tab
- Monitor API requests
- Check file loading progress
- Verify response headers

#### Console Tab
- Check for JavaScript errors
- Monitor debug output
- Test API calls

#### Performance Tab
- Profile rendering performance
- Identify memory leaks
- Monitor frame rates

## 📦 Building and Deployment

### Development Build

```bash
# Build with development optimizations
npm run build

# Watch for changes
npm run watch

# Build with source maps
npm run build:dev
```

### Production Build

```bash
# Build for production
npm run build:prod

# Check bundle size
npm run size:check

# Run all tests
npm run test:all
```

### Deployment

#### Manual Deployment
```bash
# Build frontend
npm run build

# Copy to Nextcloud
cp -r . /path/to/nextcloud/apps/threedviewer/

# Set permissions
chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/
chmod -R 755 /path/to/nextcloud/apps/threedviewer/
```

#### Docker Deployment
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM php:8.1-apache
COPY --from=builder /app /var/www/html/apps/threedviewer
```

## 🔍 Code Quality

### Static Analysis

#### PHP Static Analysis
```bash
# Run Psalm
composer psalm

# Run Rector
composer rector
```

#### JavaScript Static Analysis
```bash
# Run ESLint
npm run lint

# Run TypeScript check
npm run type-check
```

### Code Coverage

#### PHP Coverage
```bash
# Generate coverage report
composer test:coverage

# View coverage report
open coverage/index.html
```

#### JavaScript Coverage
```bash
# Generate coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Performance Testing

#### Bundle Size Analysis
```bash
# Analyze bundle size
npm run analyze

# Check size limits
npm run size:check
```

#### Load Testing
```bash
# Run load tests
npm run test:load

# Performance benchmarks
npm run benchmark
```

## 📚 Documentation

### Code Documentation

#### PHP Documentation
```php
/**
 * Serves a 3D model file for streaming
 *
 * @param int $fileId The file ID to serve
 * @return StreamResponse The file stream response
 * @throws NotFoundException When file is not found
 * @throws UnauthorizedException When user lacks permission
 */
public function serveFile(int $fileId): StreamResponse
{
    // Implementation
}
```

#### JavaScript Documentation
```javascript
/**
 * Loads a 3D model by file ID
 * @param {number} fileId - The file ID to load
 * @param {Object} options - Loading options
 * @param {boolean} options.showProgress - Show loading progress
 * @returns {Promise<Object>} The loaded model data
 */
async loadModel(fileId, options = {}) {
  // Implementation
}
```

### API Documentation

#### OpenAPI Specification
```yaml
# openapi.json
openapi: 3.0.0
info:
  title: 3D Viewer API
  version: 1.0.0
paths:
  /files:
    get:
      summary: List 3D files
      responses:
        200:
          description: List of files
          content:
            application/json:
              schema:
                type: object
```

## 🤝 Contributing

### Pull Request Process

1. **Fork Repository**
   - Fork the repository on GitHub
   - Clone your fork locally

2. **Create Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Write code following style guidelines
   - Add tests for new functionality
   - Update documentation

4. **Test Changes**
   ```bash
   npm run test:all
   composer test:unit
   ```

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   # Create pull request on GitHub
   ```

### Code Review Process

1. **Automated Checks**
   - All tests must pass
   - Code style must be correct
   - Bundle size must be within limits

2. **Manual Review**
   - Code quality review
   - Security review
   - Performance review

3. **Approval Process**
   - At least one approval required
   - All comments must be addressed
   - CI checks must pass

## 📞 Support

### Getting Help

1. **Documentation**: Check this guide and other docs
2. **Issues**: Search existing GitHub issues
3. **Discussions**: Ask in GitHub discussions
4. **Community**: Join the Nextcloud community

### Reporting Issues

When reporting issues, include:
- Nextcloud version
- PHP version
- Browser version
- Error messages
- Steps to reproduce
- Expected vs actual behavior

---

For more detailed information, see the [Technical Architecture](TECHNICAL_ARCHITECTURE.md) and [API Reference](API_REFERENCE.md) documentation.
