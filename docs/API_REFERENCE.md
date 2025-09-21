# API Reference

This document provides comprehensive API documentation for the 3D Viewer Nextcloud application.

## 🌐 Base URLs

- **Production**: `https://your-nextcloud.com/ocs/v2.php/apps/threedviewer/api`
- **Development**: `http://localhost:8080/ocs/v2.php/apps/threedviewer/api`

## 🔐 Authentication

All API endpoints require authentication. Include the following headers:

```http
OCS-APIRequest: true
Accept: application/json
X-Requested-With: XMLHttpRequest
```

## 📁 File Management

### List Files

Get a list of available 3D files.

```http
GET /files
```

**Response:**
```json
{
  "ocs": {
    "meta": {
      "status": "ok",
      "statuscode": 200,
      "message": "OK"
    },
    "data": {
      "files": [
        {
          "id": 123,
          "name": "model.glb",
          "size": 1048576,
          "path": "/admin/files/Models/model.glb",
          "mimetype": "model/gltf-binary",
          "mtime": 1640995200
        }
      ]
    }
  }
}
```

### Stream File

Stream a 3D model file.

```http
GET /file/{fileId}
```

**Parameters:**
- `fileId` (integer): The file ID

**Response:**
- **200**: File stream begins
- **401**: Unauthorized
- **404**: File not found
- **415**: Unsupported file type

**Headers:**
```http
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="model.glb"
Cache-Control: no-store
```

### Stream MTL File

Stream a material file for OBJ models.

```http
GET /file/{fileId}/mtl/{mtlName}
```

**Parameters:**
- `fileId` (integer): The parent OBJ file ID
- `mtlName` (string): The MTL filename

**Response:**
- **200**: MTL file stream begins
- **404**: MTL file not found
- **415**: Invalid usage (non-OBJ parent)

## 🖼️ Thumbnails

### Get Thumbnail

Get a thumbnail for a 3D model.

```http
GET /thumb/{fileId}
```

**Parameters:**
- `fileId` (integer): The file ID

**Response:**
- **200**: Thumbnail image (PNG)
- **404**: Thumbnail not available

## 🔗 Public Share API

### Stream Public File

Stream a file from a public share.

```http
GET /public/file/{token}/{fileId}
```

**Parameters:**
- `token` (string): Public share token
- `fileId` (integer): The file ID

**Response:**
- **200**: File stream begins
- **404**: File or share not found
- **415**: Unsupported file type

### Stream Public MTL

Stream a material file from a public share.

```http
GET /public/file/{token}/{fileId}/mtl/{mtlName}
```

**Parameters:**
- `token` (string): Public share token
- `fileId` (integer): The parent OBJ file ID
- `mtlName` (string): The MTL filename

## 📊 Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Unauthorized |
| 404 | Not found |
| 415 | Unsupported media type |
| 500 | Internal server error |

## 🎯 Frontend API

### Vue Component Events

The `ThreeViewer` component emits the following events:

#### load-start

Emitted when model loading begins.

```javascript
// Event payload
{
  fileId: 123
}

// Usage
<ThreeViewer @load-start="onLoadStart" />
```

#### model-loaded

Emitted when model successfully loads.

```javascript
// Event payload
{
  fileId: 123,
  filename: "model.glb"
}

// Usage
<ThreeViewer @model-loaded="onModelLoaded" />
```

#### model-aborted

Emitted when loading is cancelled.

```javascript
// Event payload
{
  fileId: 123
}

// Usage
<ThreeViewer @model-aborted="onModelAborted" />
```

#### error

Emitted when an error occurs.

```javascript
// Event payload
{
  message: "Error message",
  error: ErrorObject
}

// Usage
<ThreeViewer @error="onError" />
```

#### reset-done

Emitted when camera reset completes.

```javascript
// No payload

// Usage
<ThreeViewer @reset-done="onResetDone" />
```

### Component Methods

#### loadModel(fileId)

Load a 3D model by file ID.

```javascript
// Usage
this.$refs.viewer.loadModel(123);
```

#### cancelLoad()

Cancel current loading operation.

```javascript
// Usage
this.$refs.viewer.cancelLoad();
```

#### resetCamera()

Reset camera to initial position.

```javascript
// Usage
this.$refs.viewer.resetCamera();
```

#### toggleGrid()

Toggle grid visibility.

```javascript
// Usage
this.$refs.viewer.toggleGrid();
```

#### toggleAxes()

Toggle axes visibility.

```javascript
// Usage
this.$refs.viewer.toggleAxes();
```

#### toggleWireframe()

Toggle wireframe mode.

```javascript
// Usage
this.$refs.viewer.toggleWireframe();
```

#### fitToView()

Fit model to view.

```javascript
// Usage
this.$refs.viewer.fitToView();
```

## 🔧 Configuration API

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `THREEDVIEWER_MAX_FILE_SIZE` | integer | 104857600 | Maximum file size in bytes |
| `THREEDVIEWER_ENABLE_COMPRESSION` | boolean | true | Enable DRACO/KTX2 support |
| `THREEDVIEWER_DEBUG_MODE` | boolean | false | Enable debug logging |
| `THREEDVIEWER_GRID_SIZE` | integer | 10 | Default grid size |
| `THREEDVIEWER_GRID_DIVISIONS` | integer | 10 | Default grid divisions |

### Runtime Configuration

```javascript
// Get current configuration
const config = this.$refs.viewer.getConfig();

// Update configuration
this.$refs.viewer.updateConfig({
  gridSize: 20,
  gridDivisions: 20,
  enableShadows: true
});
```

## 📱 Mobile API

### Touch Events

The viewer handles touch events automatically:

```javascript
// Touch event handlers
onTouchStart(event) {
  // Handle touch start
}

onTouchMove(event) {
  // Handle touch move
}

onTouchEnd(event) {
  // Handle touch end
}
```

### Orientation Support

```javascript
// Orientation change handler
onOrientationChange() {
  this.$refs.viewer.handleOrientationChange();
}
```

## 🎨 Theming API

### Theme Integration

```javascript
// Get current theme
const theme = this.$refs.viewer.getTheme();

// Set custom theme
this.$refs.viewer.setTheme({
  background: '#ffffff',
  gridColor: '#00ff00',
  axesColor: '#ff0000'
});
```

### CSS Variables

The viewer uses CSS variables for theming:

```css
:root {
  --threedviewer-bg-color: #ffffff;
  --threedviewer-grid-color: #00ff00;
  --threedviewer-axes-color: #ff0000;
  --threedviewer-toolbar-bg: #f0f0f0;
  --threedviewer-toolbar-text: #333333;
}
```

## 🔍 Debugging API

### Debug Information

```javascript
// Get debug information
const debugInfo = this.$refs.viewer.getDebugInfo();
console.log(debugInfo);
```

### Performance Metrics

```javascript
// Get performance metrics
const metrics = this.$refs.viewer.getPerformanceMetrics();
console.log(metrics);
```

### Error Logging

```javascript
// Enable error logging
this.$refs.viewer.enableErrorLogging(true);

// Get error log
const errors = this.$refs.viewer.getErrorLog();
console.log(errors);
```

## 🧪 Testing API

### Test Helpers

```javascript
// Simulate file loading
this.$refs.viewer.simulateLoad(fileId);

// Simulate error
this.$refs.viewer.simulateError(errorMessage);

// Get test data
const testData = this.$refs.viewer.getTestData();
```

### Mock Data

```javascript
// Load mock model
this.$refs.viewer.loadMockModel('cube');

// Available mock models
const mockModels = this.$refs.viewer.getMockModels();
```

## 📊 Analytics API

### Usage Tracking

```javascript
// Track user interaction
this.$refs.viewer.trackInteraction('zoom', { level: 1.5 });

// Track model load
this.$refs.viewer.trackModelLoad(fileId, loadTime);

// Get usage statistics
const stats = this.$refs.viewer.getUsageStats();
```

## 🔒 Security API

### Permission Checks

```javascript
// Check file permissions
const hasPermission = await this.$refs.viewer.checkFilePermission(fileId);

// Validate file access
const isValid = await this.$refs.viewer.validateFileAccess(fileId);
```

### CSRF Protection

All API requests automatically include CSRF tokens:

```javascript
// CSRF token is automatically included
const response = await fetch('/ocs/v2.php/apps/threedviewer/api/files', {
  headers: {
    'OCS-APIRequest': 'true',
    'X-Requested-With': 'XMLHttpRequest'
  }
});
```

## 📝 Error Handling

### Error Types

```javascript
// Error types
const ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  PARSE_ERROR: 'parse_error',
  PERMISSION_ERROR: 'permission_error',
  UNSUPPORTED_FORMAT: 'unsupported_format',
  FILE_TOO_LARGE: 'file_too_large'
};
```

### Error Handling

```javascript
// Global error handler
this.$refs.viewer.onError((error) => {
  console.error('Viewer error:', error);
  // Handle error
});

// Specific error handlers
this.$refs.viewer.onNetworkError((error) => {
  // Handle network error
});

this.$refs.viewer.onParseError((error) => {
  // Handle parse error
});
```

---

For more detailed information about specific features, see the [Technical Architecture](TECHNICAL_ARCHITECTURE.md) and [Developer Guide](DEVELOPER_GUIDE.md) documentation.
