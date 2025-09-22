# API Reference

This document provides comprehensive API documentation for the 3D Viewer Nextcloud application.

## 🌐 Base URLs

- **OCS base**: `/ocs/v2.php/apps/threedviewer`
- **App base**: `/apps/threedviewer`

## 🔐 Authentication

All API endpoints require authentication. Include the following headers:

```http
OCS-APIRequest: true
Accept: application/json
X-Requested-With: XMLHttpRequest
```

## 📁 File Management

### List Files (OCS)

Get a list of available 3D files for the current user.

```http
GET /ocs/v2.php/apps/threedviewer/api/files
OCS-APIRequest: true
```

Response body is a JSON object with `files: [{ id, name, path, size, mtime, mimetype }]`.

### Stream File (App Route)

Stream a 3D model file for the current user by file ID.

```http
GET /apps/threedviewer/file/{fileId}
```

Responses: 200 stream, 401 unauthorized, 404 not found, 415 unsupported.

### Public Share Streaming

Stream files from a public share token (no auth) when allowed.

```http
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{fileId}
GET /ocs/v2.php/apps/threedviewer/public/file/{token}/{fileId}/mtl/{mtlName}
```

## 🖼️ Thumbnails

### Thumbnails

Thumbnail endpoints may be added in future versions.

## 🔗 OCS Index

Basic OCS index endpoint (from `openapi.json`):

```http
GET /ocs/v2.php/apps/threedviewer/api
OCS-APIRequest: true
```

## 📊 Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 401 | Unauthorized |
| 404 | Not found |
| 415 | Unsupported media type |
| 500 | Internal server error |

## 🎯 Frontend Component API

### Vue Component Events

The `ThreeViewer` component emits the following events:

Events may include: `model-loaded`, `error`, `toggle-comparison`, etc. Refer to `src/components/ThreeViewer.vue` for the latest emits.

Example:
```javascript
<ThreeViewer @model-loaded="onModelLoaded" @error="onError" />
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
