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
2. **Clone** your fork (replace `<your-github-username>`):
   ```bash
   git clone https://github.com/<your-github-username>/3Dviewer-Nextcloud.git
   cd 3Dviewer-Nextcloud
   ```

3. **Add upstream** remote (canonical repository):
   ```bash
   git remote add upstream https://github.com/maz1987in/3Dviewer-Nextcloud.git
   ```

## Development Setup

For detailed development environment setup, see the [User Guide](docs/README.md#developer-guide).

### Quick Setup

```bash
# Install dependencies
composer install
npm install

# Build the project
npm run build

# Run tests
make test
```

### Optional: Install Git Hooks

Git hooks help catch issues before committing. To install them:

```bash
# Automated installation
make install-hooks

# Or manual installation
chmod +x .hooks/pre-commit
ln -s ../../.hooks/pre-commit .git/hooks/pre-commit
chmod +x .hook-checkout/post-checkout
ln -s ../../.hook-checkout/post-checkout .git/hooks/post-checkout
```

**What the hooks do:**

- **Pre-commit hook** (`.hooks/pre-commit`):
  - Checks PHP syntax
  - Runs PHP-CS-Fixer
  - Runs ESLint
  - Runs StyleLint
  - Prevents commits with code quality issues

- **Post-checkout hook** (`.hook-checkout/post-checkout`):
  - Auto-runs `npm install` when package.json changes
  - Auto-runs `composer install` when composer.json changes
  - Copies decoder files if missing
  - Keeps your environment up-to-date automatically

> **Note**: Hooks are optional. CI runs these checks on pull requests anyway.

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

For code examples and architecture details, see [Technical Documentation](docs/TECHNICAL.md).

## Testing

All tests should pass before submitting a pull request. For detailed testing procedures, examples, and guidelines, see the [Testing Guide](docs/TESTING.md).

### Running Tests

```bash
# Run all tests
make test

# Run PHP unit tests
composer test:unit

# Run JavaScript tests
npm test

# Run end-to-end tests
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

- **Maintainer**: [Mazin Al Saadi](mailto:maz1987in@gmail.com)
- **Project Repository**: [GitHub Repository](https://github.com/maz1987in/3Dviewer-Nextcloud)

## Recognition

Contributors will be:
- **Listed** in the project's contributor list
- **Mentioned** in release notes for significant contributions
- **Thanked** in project documentation

Thank you for contributing to the 3D Viewer Nextcloud app! 🎉
