# Testing Guide

This guide covers all testing aspects of the 3D Viewer for Nextcloud application, including unit tests, integration tests, end-to-end tests, and bundle size monitoring.

## Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Bundle Size Monitoring](#bundle-size-monitoring)
- [Writing Tests](#writing-tests)
- [Test Checklist](#test-checklist)

## Overview

The 3D Viewer uses a comprehensive testing strategy covering:

- **PHP Unit Tests** - Backend controllers and services
- **JavaScript Tests** - Frontend components and utilities (Jest)
- **End-to-End Tests** - User flows with Playwright
- **Smoke Tests** - Critical functionality verification
- **Bundle Size Monitoring** - Performance budget enforcement

## Test Types

### PHP Unit Tests

Run backend unit tests for controllers and services:

```bash
# Run all PHP tests
composer test:unit

# Run with coverage
composer test:coverage

# Run specific test file
./vendor/bin/phpunit tests/unit/Controller/FileControllerTest.php
```

**Test Coverage:**
- Controllers: `FileController`, `ApiController`, `PublicFileController`, `SettingsController`, `SlicerController`
- Services: `FileService`, `ShareFileService`, `ModelFileSupport`
- Response builders and validators

### JavaScript Tests

Run frontend tests with Jest (configured in `package.json`):

```bash
# Run all JS tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

> **Note**: Jest configuration is defined in `package.json` under the `"jest"` key, using `@vue/vue2-jest` for Vue component testing.

**Test Coverage:**
- Components: Vue components (`ThreeViewer`, `PersonalSettings`, `SlicerModal`) and utilities
- Composables: `useScene`, `useCamera`, `useModelLoading`, etc.
- Loaders: Format-specific loader modules
- Utilities: Helper functions and validators

**Test Files Location:**
- JavaScript tests can be placed alongside source files with `.spec.js` or `.test.js` extensions
- Integration tests in `tests/` directory

### End-to-End Tests (Playwright)

Run browser-based integration tests:

```bash
# Run all e2e tests
npm run test:e2e

# Run with browser UI
npm run test:e2e:headed

# View test report
npm run test:e2e:report

# Debug specific test
npx playwright test --debug tests/playwright/viewer-smoke.spec.js
```

**Current E2E Coverage:**
- Viewer smoke test (component mounting, canvas rendering)
- OBJ+MTL loading test
- DRACO compressed glTF test
- Abort loading test

### Smoke Tests

Minimal Playwright tests ensuring critical functionality:

```bash
npm run test:smoke
```

**Smoke Test Coverage:**
- Mount test: Verifies viewer root + WebGL canvas appears
- DRACO compressed glTF test: Exercises conditional decoder wiring
- Abort test: Deterministic slow stream + cancel mid-download

**Current Test Fixtures** (in `tests/fixtures/`):
- `triangle.obj`, `triangle.mtl` - OBJ with materials
- `triangle.glb`, `triangle.gltf` - glTF formats
- `triangle.stl`, `triangle.ply` - Mesh formats
- `triangle-draco.gltf` - Compressed glTF
- `triangle.fbx`, `triangle.3ds`, `triangle.3mf` - Additional formats
- Info files (`.info.txt`) - Metadata about test models

**Adding New Smoke Tests:**

1. Place fixtures under `tests/fixtures/` (keep each <10 KB)
2. Add spec in `tests/smoke/` (TypeScript or JS)
3. Assert emitted DOM events (`threedviewer:model-loaded`, etc.)
4. Use internal static server for throttling if needed

## Bundle Size Monitoring

The viewer enforces bundle size budgets to maintain performance.

### Current Thresholds

| Bundle Pattern | Raw (bytes) | Gzip (bytes) |
|----------------|------------:|-------------:|
| `threedviewer-main.mjs` | 950,000 | 260,000 |
| `gltf-*.chunk.mjs` | 120,000 | 40,000 |
| `FBXLoader-*.chunk.mjs` | 120,000 | 50,000 |

### Running Size Checks

```bash
# Automatic check after build
npm run build
# Runs postbuild hook which includes size check

# Manual check
npm run size:check
```

### Environment Variables

| Variable | Effect |
|----------|--------|
| `SKIP_SIZE_CHECK=1` | Bypass size check (avoid in CI) |
| `SIZE_CHECK_SOFT=1` | Exit 0 but print failures (exploratory) |

### When a Bundle Exceeds Limits

1. **Confirm** the diff meaningfully justifies added bytes
2. **Update thresholds** in `scripts/check-bundle-size.mjs` with modest headroom
3. **Add CHANGELOG entry** explaining the increase
4. **Consider alternatives first:**
   - Further code-splitting
   - Conditional dynamic imports
   - Removing unused exports
   - Replacing heavy utilities

### Size Check Script

The script evaluates specific bundle targets and fails in CI if thresholds are exceeded.

**Location:** `scripts/check-bundle-size.mjs`

## Running Tests

### Complete Test Suite

Run all tests (PHP + JS + build + smoke):

```bash
# Using Makefile
make test

# Or manually
composer test:unit
npm test
npm run build
npm run test:smoke
```

### Continuous Integration

The complete CI pipeline:

```bash
make ci
```

This runs:
1. PHP linting and static analysis (Psalm)
2. JavaScript linting (ESLint)
3. PHP unit tests
4. JavaScript tests
5. Build verification
6. Bundle size check
7. Smoke tests

### Pre-Commit Checks

Before committing code:

```bash
# Check code quality
make lint

# Auto-fix issues
make lint-fix

# Run tests
make test
```

## Writing Tests

### PHP Test Example

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Tests\Unit\Service;

use OCA\ThreeDViewer\Service\ModelFileService;
use PHPUnit\Framework\TestCase;

class ModelFileServiceTest extends TestCase
{
    private ModelFileService $service;

    protected function setUp(): void
    {
        $this->service = new ModelFileService();
    }

    public function testIsSupportedExtension(): void
    {
        $this->assertTrue($this->service->isSupportedExtension('glb'));
        $this->assertTrue($this->service->isSupportedExtension('gltf'));
        $this->assertFalse($this->service->isSupportedExtension('txt'));
    }
}
```

### JavaScript Test Example

```javascript
import { ModelLoader } from '../src/loaders/ModelLoader';

describe('ModelLoader', () => {
    let loader;

    beforeEach(() => {
        loader = new ModelLoader();
    });

    test('should load model successfully', async () => {
        const mockModel = { scenes: [], animations: [] };
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockModel)
        });

        const result = await loader.loadModel('test.glb');
        expect(result).toEqual(mockModel);
    });

    test('should handle loading errors', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            statusText: 'Not Found'
        });

        await expect(loader.loadModel('invalid.glb'))
            .rejects.toThrow('Failed to load model');
    });
});
```

### Playwright Test Example

```javascript
import { test, expect } from '@playwright/test';

test('viewer loads and displays canvas', async ({ page }) => {
    await page.goto('/apps/threedviewer/123');
    
    // Wait for viewer to mount
    await page.waitForSelector('#threedviewer');
    
    // Check for canvas element
    const canvas = await page.locator('canvas');
    await expect(canvas).toBeVisible();
    
    // Verify WebGL context
    const hasWebGL = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        return !!canvas.getContext('webgl2');
    });
    expect(hasWebGL).toBe(true);
});
```

## Test Checklist

### Pre-Refactoring Tests

#### Core Functionality
- [ ] **Model Loading**
  - [ ] GLB files load correctly
  - [ ] GLTF files load correctly
  - [ ] OBJ files load correctly (with and without MTL)
  - [ ] STL files load correctly
  - [ ] PLY files load correctly
  - [ ] FBX files load correctly
  - [ ] 3MF files load correctly
  - [ ] 3DS files load correctly
  - [ ] DAE files load correctly
  - [ ] X3D files load correctly
  - [ ] VRML files load correctly

- [ ] **3D Camera Controller**
  - [ ] Circular controller appears when enabled
  - [ ] Drag rotation works correctly
  - [ ] Zoom control functions properly
  - [ ] Directional arrows snap to views
  - [ ] Controller position persists across sessions
  - [ ] Controller visibility toggle works
  - [ ] Smooth animations between views
  - [ ] Mobile touch interactions work

- [ ] **Face Labels**
  - [ ] Labels appear on model faces when enabled
  - [ ] Labels show correct orientation (TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT)
  - [ ] Labels toggle on/off correctly
  - [ ] Labels update when model changes
  - [ ] Labels are styled correctly (background, border, text)
  - [ ] Labels render with CSS2D for crisp display

- [ ] **Export Functionality**
  - [ ] GLB export works correctly
  - [ ] STL export works correctly
  - [ ] OBJ export works correctly
  - [ ] Export progress is tracked
  - [ ] Export errors are handled gracefully
  - [ ] Materials are preserved in exports
  - [ ] File downloads automatically

- [ ] **Camera Projection Toggle**
  - [ ] Perspective mode works correctly
  - [ ] Orthographic mode works correctly
  - [ ] Toggle between modes functions
  - [ ] Camera controls work in both modes
  - [ ] View fitting works in both modes

- [ ] **Progressive Texture Loading**
  - [ ] Geometry loads before textures
  - [ ] Textures load progressively in background
  - [ ] Progress tracking works correctly
  - [ ] Failed texture loads are handled gracefully
  - [ ] Batch loading is efficient

- [ ] **Dependency Caching**
  - [ ] MTL files are cached correctly
  - [ ] Texture files are cached correctly
  - [ ] Cache invalidation works on file changes
  - [ ] Cache size limits are respected
  - [ ] Expired cache entries are cleaned up
  - [ ] Cache improves loading performance

- [ ] **Error Handling**
  - [ ] Unsupported file types show appropriate error
  - [ ] Corrupted files show appropriate error
  - [ ] Network errors are handled gracefully
  - [ ] Large files show appropriate warnings
  - [ ] Memory errors are handled gracefully

- [ ] **UI Functionality**
  - [ ] Grid toggle works
  - [ ] Axes toggle works
  - [ ] Wireframe toggle works
  - [ ] Background color changes work
  - [ ] Camera controls work (rotate, zoom, pan)
  - [ ] Reset view works
  - [ ] Fit to view works
  - [ ] Auto-rotate works

- [ ] **Comparison Mode**
  - [ ] Toggle comparison mode works
  - [ ] Load comparison model works
  - [ ] Toggle original/comparison models works
  - [ ] Fit both models works

- [ ] **Mobile Support**
  - [ ] Touch gestures work (rotate, zoom, pan)
  - [ ] Pinch to zoom works
  - [ ] Double tap to reset works
  - [ ] Mobile UI elements display correctly

### Post-Refactoring Tests

#### Phase 1: Core Infrastructure
- [ ] Material creation utilities work correctly
- [ ] Bounding box calculation is accurate
- [ ] Error handling is consistent across components
- [ ] Validation functions reject invalid inputs

#### Phase 2: Loader System
- [ ] BaseLoader validates inputs correctly
- [ ] Format-specific loaders extend BaseLoader
- [ ] Dynamic imports work for all formats
- [ ] Error messages are user-friendly

#### Phase 3: Backend
- [ ] ResponseBuilder creates correct responses
- [ ] BaseController validation works
- [ ] File streaming has proper headers
- [ ] Permission checks are enforced

### Integration Tests

#### End-to-End Functionality
- [ ] Complete model loading flow works
- [ ] Comparison mode flow works
- [ ] Error recovery flow works
- [ ] Performance is acceptable

#### Performance Tests
- [ ] Small files load quickly (< 1 second)
- [ ] Medium files load reasonably (< 5 seconds)
- [ ] Large files show progress indication
- [ ] Frame rate is stable (30+ FPS)
- [ ] No memory leaks during extended use

#### Browser Compatibility
- [ ] **Desktop:** Chrome, Firefox, Safari, Edge (latest)
- [ ] **Mobile:** Chrome Mobile, Safari Mobile, Firefox Mobile

#### Security Tests
- [ ] Unauthorized users cannot access files
- [ ] File permissions are respected
- [ ] Path traversal is prevented
- [ ] Input validation works
- [ ] Error messages don't leak information

### Regression Tests

#### Critical Functionality
- [ ] All supported formats still work
- [ ] Error handling still works
- [ ] Performance is not degraded
- [ ] UI functionality intact
- [ ] Mobile support works

#### Performance Regression
- [ ] No significant slowdown in model loading
- [ ] No significant increase in memory usage
- [ ] No significant increase in bundle size
- [ ] No drop in frame rate

### Test Coverage Goals

- [ ] Unit test coverage > 80%
- [ ] Integration test coverage > 70%
- [ ] Critical path coverage > 90%
- [ ] Error path coverage > 60%

### Success Criteria

#### Functional Requirements
- [ ] All existing functionality works
- [ ] New functionality works correctly
- [ ] Error handling is improved
- [ ] Performance is maintained or improved

#### Non-Functional Requirements
- [ ] Code is more maintainable
- [ ] Code duplication is reduced by 70%
- [ ] Error handling is consistent
- [ ] Performance is acceptable

#### Quality Requirements
- [ ] Code follows best practices
- [ ] Documentation is complete
- [ ] Tests are comprehensive
- [ ] Security is maintained

---

For more information, see:
- [Technical Documentation](TECHNICAL.md) - Architecture and implementation
- [Implementation Guide](IMPLEMENTATION.md) - Development lessons learned
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions

