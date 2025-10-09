# Development Guide

This document provides comprehensive information for developers working on the 3D Viewer Nextcloud app.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Building](#building)
- [Contributing](#contributing)

## Prerequisites

Before you begin, ensure you have the following installed:

- **PHP 8.1+** with required extensions
- **Node.js 22+** and npm 10.5+
- **Composer 2.0+**
- **Git**
- **Nextcloud development environment**

### Required PHP Extensions

```bash
bz2, ctype, curl, dom, fileinfo, gd, iconv, intl, json, libxml, mbstring, openssl, pcntl, posix, session, simplexml, xmlreader, xmlwriter, zip, zlib, sqlite, pdo_sqlite
```

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/3Dviewer-Nextcloud.git
cd 3Dviewer-Nextcloud
```

### 2. Install Dependencies

```bash
# Install PHP dependencies
composer install

# Install Node.js dependencies
npm install

# Copy decoder files
npm run copy-decoders
```

### 3. Development Environment

```bash
# Setup development environment
make setup

# Or manually:
composer install --dev
npm install
npm run copy-decoders
```

## Development Workflow

### Available Commands

Use the Makefile for common development tasks:

```bash
# Show all available commands
make help

# Development
make dev          # Start development server
make watch        # Start development server with watch mode
make build        # Build the application

# Testing
make test         # Run all tests
make test-unit    # Run PHP unit tests
make test-e2e     # Run end-to-end tests
make test-smoke   # Run smoke tests

# Code Quality
make lint         # Run all linting
make lint-fix     # Fix linting issues
make psalm        # Run static analysis
make rector       # Run code modernization

# Maintenance
make clean        # Clean build artifacts
make ci           # Run CI pipeline locally
```

### Git Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. **Push and create a pull request**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Pre-commit Hooks

The project includes pre-commit hooks that automatically run:
- PHP syntax check
- PHP code style check (PHP CS Fixer)
- JavaScript linting (ESLint)
- CSS linting (Stylelint)

## Testing

### PHP Tests

```bash
# Run unit tests
composer test:unit

# Run integration tests
composer test:integration

# Run migration tests
composer test:migration

# Run with coverage
composer test:coverage
```

### JavaScript Tests

```bash
# Run Jest tests
npm test

# Run with watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### End-to-End Tests

```bash
# Run Playwright tests
npm run test:e2e

# Run with browser UI
npm run test:e2e:headed

# View test report
npm run test:e2e:report
```

### Smoke Tests

```bash
# Run smoke tests (builds first)
npm run test:smoke

# Run with browser UI
npm run test:smoke:headed
```

## Code Quality

### PHP Code Quality

```bash
# Check code style
composer cs:check

# Fix code style
composer cs:fix

# Run static analysis
composer psalm

# Run code modernization
composer rector

# Security audit
composer security:audit
```

### JavaScript/TypeScript Code Quality

```bash
# Lint JavaScript/TypeScript
npm run lint

# Fix linting issues
npm run lint:fix

# Lint CSS/SCSS
npm run stylelint

# Fix CSS linting issues
npm run stylelint:fix
```

### Bundle Size

```bash
# Check bundle size
npm run size:check
```

## Building

### Development Build

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Build Verification

```bash
# Check for uncommitted changes after build
make build
git status  # Should show no changes
```

## Contributing

### Code Standards

- Follow **PSR-12** for PHP code
- Use **ESLint** configuration for JavaScript/TypeScript
- Follow **Stylelint** rules for CSS/SCSS
- Write **comprehensive tests** for new features
- Update **documentation** for new features

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Add tests** for new functionality
5. **Update documentation** if needed
6. **Run** the full test suite
7. **Submit** a pull request

### Commit Message Format

Use conventional commits:

```
feat: add new feature
fix: fix bug
docs: update documentation
style: format code
refactor: refactor code
test: add tests
chore: maintenance tasks
```

### Release Process

Releases are automated via GitHub Actions:

1. **Create a tag**:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

2. **GitHub Actions** will automatically:
   - Build the application
   - Create a release
   - Upload the distribution package

## Troubleshooting

### Common Issues

1. **Decoder files missing**:
   ```bash
   npm run copy-decoders
   ```

2. **Build fails**:
   ```bash
   make clean
   npm install
   npm run build
   ```

3. **Tests failing**:
   ```bash
   composer install
   npm install
   make test
   ```

4. **Linting errors**:
   ```bash
   make lint-fix
   ```

### Getting Help

- Check the [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- Review [existing issues](https://github.com/your-username/3Dviewer-Nextcloud/issues)
- Create a [new issue](https://github.com/your-username/3Dviewer-Nextcloud/issues/new)

## Architecture

For detailed architecture information, see [TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md).

## API Reference

For API documentation, see [API_REFERENCE.md](docs/API_REFERENCE.md).
