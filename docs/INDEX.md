# Documentation Index

Welcome to the 3D Viewer for Nextcloud documentation. This index provides quick access to all available documentation.

## 📖 Getting Started

### For Users
- **[Installation Guide](INSTALLATION.md)** - How to install and set up the 3D viewer
- **[User Guide](USER_GUIDE.md)** - How to use all the features of the 3D viewer

### For Administrators
- **[Installation Guide](INSTALLATION.md)** - Server installation and configuration
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions
- **[Technical Architecture](TECHNICAL_ARCHITECTURE.md)** - System requirements and architecture

### For Developers
- **[Developer Guide](DEVELOPER_GUIDE.md)** - Development setup and contribution guidelines
- **[API Reference](API_REFERENCE.md)** - Complete API documentation
- **[Technical Architecture](TECHNICAL_ARCHITECTURE.md)** - System design and implementation details

## 🎯 Quick Reference

### Installation
```bash
# Install from App Store (recommended)
# Or install manually:
git clone https://github.com/your-username/3Dviewer-Nextcloud.git
cd 3Dviewer-Nextcloud
composer install
npm install
npm run build
```

### Basic Usage
1. Upload 3D files to Nextcloud Files
2. Click on any supported 3D file
3. Use mouse/touch controls to navigate
4. Use toolbar for additional features

### Supported Formats
- **GLB/GLTF**: Full support with materials and animations
- **OBJ + MTL**: Full support with material files
- **STL**: Full support for 3D printing
- **PLY**: Full support for point clouds
- **FBX**: Full support with animations
- **3MF/3DS**: Full support
- **VRML/X3D**: Basic support

## 🔧 Development

### Project Structure
```
3Dviewer-Nextcloud/
├── src/                    # Frontend Vue.js application
├── lib/                   # Backend PHP classes
├── tests/                 # Test suites
├── docs/                  # Documentation
└── templates/            # PHP templates
```

### Key Components
- **ThreeViewer.vue**: Main 3D viewer component
- **ApiController.php**: API endpoints
- **FileService.php**: File operations
- **ModelFileSupport.php**: Format support

### Testing
```bash
# Run all tests
npm run test:all

# PHP unit tests
composer test:unit

# Frontend smoke tests
npm run test:smoke
```

## 📊 Performance

### Bundle Size Limits
| Bundle | Raw (bytes) | Gzip (bytes) |
|--------|------------:|-------------:|
| `threedviewer-main.mjs` | 950,000 | 260,000 |
| `gltf-*.chunk.mjs` | 120,000 | 40,000 |
| `FBXLoader-*.chunk.mjs` | 120,000 | 50,000 |

### Optimization Features
- Dynamic imports for loaders
- Code splitting by feature
- DRACO/KTX2 compression support
- Abortable loading for large files

## 🛠️ Troubleshooting

### Common Issues
- **Viewer not loading**: Check browser console, verify file permissions
- **Models not displaying**: Check file format, verify file integrity
- **Performance issues**: Check file size, close other tabs, optimize model
- **Camera issues**: Use reset view, check controls, verify positioning

### Debug Tools
- Browser DevTools (Console, Network, Performance tabs)
- Nextcloud logs (`/path/to/nextcloud/data/nextcloud.log`)
- Performance monitoring (FPS, memory usage)

## 🤝 Contributing

### How to Contribute
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style
- PHP: PSR-12 standards
- JavaScript: ESLint configuration
- Vue: Vue.js style guide

### Testing Requirements
- All tests must pass
- Code coverage must be maintained
- Bundle size limits must be respected

## 📞 Support

### Getting Help
- **Documentation**: Check this index and individual guides
- **Issues**: [GitHub Issues](https://github.com/your-username/3Dviewer-Nextcloud/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/3Dviewer-Nextcloud/discussions)

### Reporting Issues
When reporting issues, include:
- Nextcloud version
- PHP version
- Browser version
- Error messages
- Steps to reproduce

## 📄 License

This project is licensed under the AGPL-3.0 License. See [LICENSE](../LICENSE) for details.

## 🙏 Acknowledgments

- [Three.js](https://threejs.org/) for 3D rendering
- [Vue.js](https://vuejs.org/) for the frontend framework
- [Nextcloud](https://nextcloud.com/) for the platform
- Contributors and the open-source community

---

**Need help?** Start with the [Installation Guide](INSTALLATION.md) for setup, or the [User Guide](USER_GUIDE.md) for usage instructions.
