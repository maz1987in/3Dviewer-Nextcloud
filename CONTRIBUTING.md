# Contributing to 3D Viewer Nextcloud App

Thank you for your interest in contributing to the 3D Viewer Nextcloud app! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Issue Reporting](#issue-reporting)
- [Documentation](#documentation)

## Code of Conduct

This project adheres to the [Nextcloud Code of Conduct](https://nextcloud.com/code-of-conduct/). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- PHP 8.1+
- Node.js 22+
- Composer 2.0+
- Git
- Basic knowledge of Nextcloud app development

### Fork and Clone

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/your-username/3Dviewer-Nextcloud.git
   cd 3Dviewer-Nextcloud
   ```

3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/original-owner/3Dviewer-Nextcloud.git
   ```

## Development Setup

Follow the [Development Guide](DEVELOPMENT.md) for detailed setup instructions.

### Quick Setup

```bash
# Install dependencies
composer install
npm install

# Setup development environment
make setup

# Verify setup
make ci
```

## Making Changes

### Branch Strategy

- Create a **feature branch** for each contribution
- Use descriptive branch names:
  - `feature/add-new-format-support`
  - `fix/camera-controls-bug`
  - `docs/update-api-documentation`

### Code Standards

#### PHP Code
- Follow **PSR-12** coding standards
- Use **type hints** where appropriate
- Write **comprehensive docblocks**
- Follow **Nextcloud coding conventions**

#### JavaScript/TypeScript Code
- Use **ESLint** configuration
- Follow **Vue.js** best practices
- Use **TypeScript** for new code
- Write **comprehensive tests**

#### CSS/SCSS Code
- Follow **Stylelint** rules
- Use **BEM** methodology when appropriate
- Maintain **consistent naming**

### Example PHP Code

```php
<?php

declare(strict_types=1);

namespace OCA\ThreeDViewer\Service;

/**
 * Service for handling 3D model file operations
 */
class ModelFileService
{
    private ModelFileSupport $modelFileSupport;

    public function __construct(ModelFileSupport $modelFileSupport)
    {
        $this->modelFileSupport = $modelFileSupport;
    }

    /**
     * Check if file extension is supported
     */
    public function isSupportedExtension(string $extension): bool
    {
        return $this->modelFileSupport->isSupportedExtension($extension);
    }
}
```

### Example JavaScript Code

```javascript
/**
 * Loader for 3D model files
 */
export class ModelLoader {
    /**
     * Load a 3D model from URL
     * @param {string} url - Model file URL
     * @param {Object} options - Loading options
     * @returns {Promise<Object>} Loaded model
     */
    async loadModel(url, options = {}) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load model: ${response.statusText}`);
            }
            return await this.parseModel(response, options);
        } catch (error) {
            console.error('Model loading failed:', error);
            throw error;
        }
    }
}
```

## Testing

### Writing Tests

#### PHP Tests
- Place tests in `tests/unit/` directory
- Use **PHPUnit** framework
- Test both **success** and **failure** scenarios
- Aim for **high code coverage**

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

#### JavaScript Tests
- Place tests in `tests/` directory
- Use **Jest** framework
- Test **components**, **utilities**, and **composables**
- Use **mocking** for external dependencies

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

        await expect(loader.loadModel('invalid.glb')).rejects.toThrow('Failed to load model');
    });
});
```

### Running Tests

```bash
# Run all tests
make test

# Run specific test suites
composer test:unit
npm test
npm run test:e2e
```

## Submitting Changes

### Pull Request Process

1. **Ensure tests pass**:
   ```bash
   make ci
   ```

2. **Update documentation** if needed

3. **Create pull request** with:
   - **Clear title** describing the change
   - **Detailed description** of what was changed and why
   - **Reference to issues** if applicable
   - **Screenshots** for UI changes

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added new tests
- [ ] Updated existing tests

## Checklist
- [ ] Code follows project standards
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

1. **Automated checks** must pass
2. **Code review** by maintainers
3. **Testing** in different environments
4. **Approval** and merge

## Issue Reporting

### Before Creating an Issue

1. **Search existing issues** to avoid duplicates
2. **Check documentation** and troubleshooting guides
3. **Try latest version** to see if issue is fixed

### Issue Template

```markdown
## Description
Clear description of the issue

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Nextcloud version:
- 3D Viewer version:
- Browser:
- PHP version:

## Additional Context
Screenshots, logs, etc.
```

### Bug Reports

Include:
- **Clear reproduction steps**
- **Expected vs actual behavior**
- **Environment details**
- **Error messages/logs**
- **Screenshots** if applicable

### Feature Requests

Include:
- **Use case description**
- **Proposed solution**
- **Alternative solutions considered**
- **Additional context**

## Documentation

### Types of Documentation

1. **Code documentation** (docblocks, comments)
2. **API documentation** (OpenAPI specs)
3. **User documentation** (guides, tutorials)
4. **Developer documentation** (setup, architecture)

### Documentation Standards

- Use **clear, concise language**
- Provide **examples** where helpful
- Keep **up-to-date** with code changes
- Follow **consistent formatting**

### Updating Documentation

When making changes:
1. **Update relevant documentation**
2. **Add new documentation** for new features
3. **Remove outdated information**
4. **Test documentation examples**

## Getting Help

### Resources

- [Nextcloud Developer Documentation](https://docs.nextcloud.com/server/latest/developer_manual/)
- [Vue.js Documentation](https://vuejs.org/guide/)
- [Three.js Documentation](https://threejs.org/docs/)
- [Project Documentation](docs/)

### Community

- **GitHub Discussions** for questions
- **GitHub Issues** for bugs and features
- **Pull Requests** for contributions

### Contact

- **Maintainer**: [Your Name](mailto:your-email@example.com)
- **Project Repository**: [GitHub Repository](https://github.com/your-username/3Dviewer-Nextcloud)

## Recognition

Contributors will be:
- **Listed** in the project's contributor list
- **Mentioned** in release notes for significant contributions
- **Thanked** in project documentation

Thank you for contributing to the 3D Viewer Nextcloud app! 🎉
