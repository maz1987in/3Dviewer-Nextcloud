# Technical Architecture

This document describes the technical architecture and design decisions of the 3D Viewer for Nextcloud application.

## 🏗️ System Overview

The 3D Viewer is a Nextcloud application that provides 3D model viewing capabilities through a modern web interface. It consists of a PHP backend integrated with Nextcloud and a Vue.js frontend with Three.js for 3D rendering.

## 🎯 Architecture Principles

- **Modularity**: Clear separation of concerns between frontend and backend
- **Performance**: Optimized for large 3D models with streaming and compression
- **Security**: Permission-based access control and CSRF protection
- **Extensibility**: Easy to add new 3D formats and features
- **Accessibility**: WCAG compliant with keyboard navigation support

## 🏛️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Nextcloud Platform                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │   Files App     │  │   Admin Panel   │  │   Other     │  │
│  │                 │  │                 │  │   Apps      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              3D Viewer Application                     │ │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐  │ │
│  │  │   Backend       │  │        Frontend             │  │ │
│  │  │   (PHP)         │  │        (Vue.js + Three.js)  │  │ │
│  │  └─────────────────┘  └─────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Backend Architecture

### Core Components

#### Controllers
- **`ApiController`**: Main API endpoint for file operations
- **`FileController`**: File streaming and management
- **`PublicFileController`**: Public share file access
- **`ThumbnailController`**: Thumbnail generation
- **`PageController`**: Page rendering

#### Services
- **`FileService`**: File operations and validation
- **`ShareFileService`**: Public share file handling
- **`ModelFileSupport`**: 3D format support and MIME types

#### Models
- **`Application`**: App configuration and metadata
- **`MimeType`**: MIME type handling and registration

### API Design

#### RESTful Endpoints
```
GET  /ocs/v2.php/apps/threedviewer/api/files
GET  /ocs/v2.php/apps/threedviewer/api/file/{fileId}
GET  /ocs/v2.php/apps/threedviewer/api/file/{fileId}/mtl/{mtlName}
GET  /ocs/v2.php/apps/threedviewer/api/thumb/{fileId}
```

#### Public Share Endpoints
```
GET  /ocs/v2.php/apps/threedviewer/api/public/file/{token}/{fileId}
GET  /ocs/v2.php/apps/threedviewer/api/public/file/{token}/{fileId}/mtl/{mtlName}
```

### Security Implementation

#### Authentication
- **Nextcloud Integration**: Uses Nextcloud's authentication system
- **Session Management**: Leverages Nextcloud's session handling
- **Permission Checks**: Validates file access permissions

#### CSRF Protection
- **Token Validation**: All requests include CSRF tokens
- **Attribute-based**: Uses PHP 8+ attributes for route protection
- **Automatic Injection**: Tokens are automatically included in forms

#### File Security
- **Extension Validation**: Only allowed file extensions are processed
- **Path Traversal Protection**: Prevents directory traversal attacks
- **MIME Type Validation**: Validates file types before processing

## 🎨 Frontend Architecture

### Component Structure

```
ThreeViewer.vue (Main Component)
├── ViewerToolbar.vue (Toolbar)
├── ViewerModal.vue (Modal Dialogs)
└── ToastContainer.vue (Notifications)
```

### State Management

#### Vue.js Reactive State
```javascript
data() {
  return {
    // Scene state
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    
    // Model state
    modelRoot: null,
    comparisonModel: null,
    currentFileId: null,
    
    // UI state
    showGrid: true,
    showAxes: false,
    wireframeMode: false,
    loading: false,
    
    // Performance state
    frameRate: 0,
    memoryUsage: 0
  }
}
```

#### Event System
```javascript
// Component events
this.$emit('model-loaded', { fileId, filename });
this.$emit('model-aborted', { fileId });
this.$emit('error', { message, error });

// Global events
this.$root.$emit('threedviewer:load-start', { fileId });
```

### Three.js Integration

#### Scene Management
```javascript
// Scene setup
this.scene = new THREE.Scene();
this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
this.renderer = new THREE.WebGLRenderer({ antialias: true });

// Lighting setup
const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
```

#### Model Loading
```javascript
// Dynamic loader imports
const loadModelByExtension = async (extension, arrayBuffer, options) => {
  switch (extension) {
    case 'glb':
    case 'gltf':
      return await loadGLTF(arrayBuffer, options);
    case 'obj':
      return await loadOBJ(arrayBuffer, options);
    // ... other formats
  }
};
```

#### Camera Controls
```javascript
// OrbitControls setup
this.controls = new OrbitControls(this.camera, this.renderer.domElement);
this.controls.enableDamping = true;
this.controls.dampingFactor = 0.05;
this.controls.minDistance = 5;
this.controls.maxDistance = 100;
```

## 🔄 Data Flow

### Model Loading Flow

```
1. User clicks 3D file
   ↓
2. FileAction triggers viewer
   ↓
3. ThreeViewer component mounts
   ↓
4. API request to /files endpoint
   ↓
5. File list returned
   ↓
6. User selects file
   ↓
7. API request to /file/{fileId}
   ↓
8. File stream begins
   ↓
9. Three.js loader processes data
   ↓
10. Model added to scene
    ↓
11. Camera positioned
    ↓
12. Grid updated
    ↓
13. Render loop starts
```

### Event Flow

```
User Interaction
   ↓
Vue Component Handler
   ↓
Three.js Scene Update
   ↓
Render Loop
   ↓
DOM Update
   ↓
User Feedback
```

## 🚀 Performance Architecture

### Code Splitting

#### Dynamic Imports
```javascript
// Lazy load Three.js loaders
const GLTFLoader = await import('three/examples/jsm/loaders/GLTFLoader');
const OBJLoader = await import('three/examples/jsm/loaders/OBJLoader');
const OrbitControls = await import('three/examples/jsm/controls/OrbitControls');
```

#### Bundle Optimization
```javascript
// Vite configuration
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-loaders': ['three/examples/jsm/loaders'],
          'three-controls': ['three/examples/jsm/controls']
        }
      }
    }
  }
});
```

### Memory Management

#### Resource Cleanup
```javascript
// Cleanup on component destroy
beforeDestroy() {
  // Dispose geometries
  this.scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) object.material.dispose();
  });
  
  // Dispose renderer
  this.renderer.dispose();
  
  // Remove event listeners
  this.controls.removeEventListener('change', this.onControlsChange);
}
```

#### Garbage Collection
```javascript
// Force garbage collection
if (window.gc) {
  window.gc();
}
```

### Streaming Architecture

#### File Streaming
```javascript
// Stream large files
const response = await fetch(fileUrl, {
  headers: {
    'Accept': 'application/octet-stream',
    'X-Requested-With': 'XMLHttpRequest'
  }
});

const reader = response.body.getReader();
const chunks = [];

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  chunks.push(value);
}
```

#### Abortable Loading
```javascript
// Abort controller for cancellation
this.abortController = new AbortController();

const response = await fetch(fileUrl, {
  signal: this.abortController.signal
});

// Cancel loading
this.abortController.abort();
```

## 🔧 Build System

### Frontend Build

#### Vite Configuration
```javascript
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'js',
    rollupOptions: {
      input: {
        main: 'src/main.js',
        files: 'src/files.js',
        viewer: 'src/viewer-entry.js'
      }
    }
  }
});
```

#### Prebuild Scripts
```javascript
// Copy decoder assets
import { copyFileSync, mkdirSync } from 'fs';

const copyDecoders = () => {
  // Copy DRACO decoders
  copyFileSync('node_modules/three/examples/jsm/libs/draco/draco_decoder.js', 'draco/draco_decoder.js');
  copyFileSync('node_modules/three/examples/jsm/libs/draco/draco_decoder.wasm', 'draco/draco_decoder.wasm');
  
  // Copy Basis decoders
  copyFileSync('node_modules/three/examples/jsm/libs/basis/basis_transcoder.js', 'basis/basis_transcoder.js');
  copyFileSync('node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm', 'basis/basis_transcoder.wasm');
};
```

### Backend Build

#### Composer Configuration
```json
{
  "autoload": {
    "psr-4": {
      "OCA\\ThreeDViewer\\": "lib/"
    }
  },
  "require": {
    "php": ">=8.1"
  }
}
```

## 🧪 Testing Architecture

### Test Structure

```
tests/
├── unit/           # PHP unit tests
├── integration/    # API integration tests
├── smoke/          # Frontend smoke tests
└── fixtures/       # Test data
```

### Test Types

#### Unit Tests
```php
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
```javascript
// Playwright test
test('loads 3D model', async ({ page }) => {
  await page.goto('/apps/threedviewer');
  await page.click('[data-testid="load-model"]');
  await expect(page.locator('canvas')).toBeVisible();
});
```

#### Smoke Tests
```javascript
// Basic functionality test
test('viewer mounts and renders', () => {
  const wrapper = mount(ThreeViewer);
  expect(wrapper.find('canvas').exists()).toBe(true);
});
```

## 🔒 Security Architecture

### Input Validation

#### File Validation
```php
public function validateFile($fileId)
{
    // Check file exists
    if (!$this->fileService->fileExists($fileId)) {
        throw new NotFoundException('File not found');
    }
    
    // Check file type
    if (!$this->modelFileSupport->isSupported($fileId)) {
        throw new UnsupportedFileTypeException('Unsupported file type');
    }
    
    // Check permissions
    if (!$this->fileService->hasPermission($fileId)) {
        throw new UnauthorizedException('No permission');
    }
}
```

#### XSS Prevention
```javascript
// Sanitize user input
const sanitizeInput = (input) => {
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};
```

### CSRF Protection

#### Token Generation
```php
#[NoCSRFRequired]
public function serveFile(int $fileId)
{
    // CSRF protection handled by Nextcloud
}
```

#### Token Validation
```javascript
// Include CSRF token in requests
const token = document.querySelector('meta[name="csrf-token"]').content;
fetch(url, {
  headers: {
    'X-CSRF-Token': token
  }
});
```

## 📊 Monitoring Architecture

### Performance Monitoring

#### Metrics Collection
```javascript
// Performance metrics
const metrics = {
  frameRate: 0,
  memoryUsage: 0,
  loadTime: 0,
  renderTime: 0
};

// Update metrics
const updateMetrics = () => {
  metrics.frameRate = this.frameRate;
  metrics.memoryUsage = performance.memory?.usedJSHeapSize || 0;
};
```

#### Error Tracking
```javascript
// Error tracking
const trackError = (error) => {
  console.error('3D Viewer Error:', error);
  
  // Send to analytics
  if (window.analytics) {
    window.analytics.track('3d_viewer_error', {
      error: error.message,
      stack: error.stack
    });
  }
};
```

### Logging

#### Backend Logging
```php
// PSR-3 compatible logging
$this->logger->info('3D model loaded', [
    'fileId' => $fileId,
    'filename' => $filename,
    'size' => $fileSize
]);
```

#### Frontend Logging
```javascript
// Console logging with levels
const log = {
  info: (message, data) => console.log(`[3D Viewer] ${message}`, data),
  warn: (message, data) => console.warn(`[3D Viewer] ${message}`, data),
  error: (message, data) => console.error(`[3D Viewer] ${message}`, data)
};
```

## 🔄 Deployment Architecture

### Production Deployment

#### File Structure
```
/var/www/nextcloud/apps/threedviewer/
├── appinfo/
├── lib/
├── src/
├── js/
├── css/
├── draco/
├── basis/
└── templates/
```

#### Nginx Configuration
```nginx
location /apps/threedviewer/ {
    try_files $uri $uri/ /index.php?$query_string;
    
    # Cache static assets
    location ~* \.(js|css|wasm)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### Apache Configuration
```apache
<Directory "/var/www/nextcloud/apps/threedviewer">
    AllowOverride All
    Require all granted
    
    # Cache static assets
    <FilesMatch "\.(js|css|wasm)$">
        ExpiresActive On
        ExpiresDefault "access plus 1 year"
    </FilesMatch>
</Directory>
```

### Development Deployment

#### Docker Setup
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
```

#### Local Development
```bash
# Start development server
npm run dev

# Watch for changes
npm run watch

# Run tests
npm run test
```

---

This architecture provides a solid foundation for the 3D Viewer application, ensuring scalability, maintainability, and performance. For implementation details, see the [Developer Guide](DEVELOPER_GUIDE.md) and [API Reference](API_REFERENCE.md).
