# 3D Viewer for Nextcloud - Documentation

This directory contains comprehensive documentation for the 3D Viewer Nextcloud application.

## 📚 Documentation Index

### Core Documentation
- [**Installation Guide**](INSTALLATION.md) - Step-by-step installation instructions
- [**User Guide**](USER_GUIDE.md) - How to use the 3D viewer features
- [**Developer Guide**](DEVELOPER_GUIDE.md) - Development setup and contribution guidelines
- [**API Reference**](API_REFERENCE.md) - Complete API documentation
- [**Technical Architecture**](TECHNICAL_ARCHITECTURE.md) - System design and architecture

### Feature Documentation
- [**Model Formats**](MODEL_FORMATS.md) - Supported 3D file formats and features
- [**Performance Guide**](PERFORMANCE.md) - Optimization and performance tuning
- [**Troubleshooting**](TROUBLESHOOTING.md) - Common issues and solutions
- [**Security**](SECURITY.md) - Security considerations and best practices

### Development Resources
- [**Testing Guide**](TESTING.md) - Testing strategies and test execution
- [**Deployment Guide**](DEPLOYMENT.md) - Production deployment instructions
- [**Configuration**](CONFIGURATION.md) - Configuration options and settings

## 🚀 Quick Start

1. **Installation**: See [Installation Guide](INSTALLATION.md)
2. **Basic Usage**: See [User Guide](USER_GUIDE.md)
3. **Development**: See [Developer Guide](DEVELOPER_GUIDE.md)

## 📖 Overview

The 3D Viewer for Nextcloud is a comprehensive application that enables users to view, interact with, and compare 3D models directly within their Nextcloud instance. It supports multiple 3D file formats and provides advanced features like dynamic grid sizing, model comparison, and real-time streaming.

### Key Features
- **Multi-format Support**: GLB, GLTF, OBJ (+ MTL), STL, PLY, FBX, 3MF, 3DS, VRML, X3D
- **Dynamic Grid System**: Automatically adapts to model size and position
- **Model Comparison**: Side-by-side model viewing with synchronized controls
- **Real-time Streaming**: Secure file streaming with authentication
- **Performance Optimized**: Code splitting and dynamic imports
- **Theme Integration**: Respects Nextcloud light/dark themes
- **Accessibility**: ARIA labels and keyboard navigation

### Architecture
- **Frontend**: Vue.js 2 + Three.js for 3D rendering
- **Backend**: PHP with Nextcloud framework integration
- **API**: RESTful API with OCS integration
- **Security**: Permission-based file access and CSRF protection

## 🔧 Technical Stack

### Frontend
- **Vue.js 2**: Component-based UI framework
- **Three.js**: 3D graphics library
- **Vite**: Build tool and development server
- **Webpack**: Module bundling (legacy)

### Backend
- **PHP 8.1+**: Server-side language
- **Nextcloud Framework**: App framework integration
- **OCS API**: Open Collaboration Services API
- **Composer**: Dependency management

### Build Tools
- **Node.js 20.19+**: JavaScript runtime
- **npm**: Package management
- **ESLint**: Code linting
- **Stylelint**: CSS linting

## 📊 Performance Metrics

### Bundle Size Limits
| Bundle | Raw (bytes) | Gzip (bytes) |
|--------|------------:|-------------:|
| `threedviewer-main.mjs` | 950,000 | 260,000 |
| `gltf-*.chunk.mjs` | 120,000 | 40,000 |
| `FBXLoader-*.chunk.mjs` | 120,000 | 50,000 |

### Supported File Sizes
- **Small models**: < 1MB (instant loading)
- **Medium models**: 1-10MB (fast loading with progress)
- **Large models**: 10-100MB (streaming with abort support)
- **Very large models**: > 100MB (progressive loading)

## 🧪 Testing

### Test Coverage
- **Unit Tests**: PHP backend services and controllers
- **Integration Tests**: API endpoints and file streaming
- **Smoke Tests**: Frontend mounting and basic functionality
- **E2E Tests**: Complete user workflows

### Running Tests
```bash
# All tests
npm run test:all

# Frontend tests
npm run test:smoke

# Backend tests
composer test:unit

# Code quality
composer cs:check
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:
- Code style guidelines
- Pull request process
- Issue reporting
- Development setup

## 📄 License

This project is licensed under the AGPL-3.0 License. See [LICENSE](../LICENSE) for details.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/3Dviewer-Nextcloud/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/3Dviewer-Nextcloud/discussions)
- **Documentation**: This documentation directory

---

For specific topics, please refer to the individual documentation files listed above.
