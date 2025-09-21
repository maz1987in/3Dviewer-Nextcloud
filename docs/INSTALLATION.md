# Installation Guide

This guide covers the installation of the 3D Viewer for Nextcloud application.

## 📋 Prerequisites

### System Requirements
- **Nextcloud**: Version 25+ (recommended)
- **PHP**: Version 8.1 or higher
- **Node.js**: Version 20.19+ (for development)
- **Memory**: Minimum 512MB RAM (1GB+ recommended)
- **Storage**: 100MB+ free space

### PHP Extensions Required
- `php-gd` or `php-imagick`
- `php-zip`
- `php-json`
- `php-mbstring`
- `php-xml`

### Browser Support
- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

## 🚀 Installation Methods

### Method 1: App Store Installation (Recommended)

1. **Access Nextcloud Admin Panel**
   - Log in as administrator
   - Go to "Apps" section

2. **Install the App**
   - Search for "3D Viewer"
   - Click "Install" or "Download and enable"

3. **Enable the App**
   - The app will be automatically enabled
   - No additional configuration required

### Method 2: Manual Installation

1. **Download the App**
   ```bash
   # Clone the repository
   git clone https://github.com/your-username/3Dviewer-Nextcloud.git
   cd 3Dviewer-Nextcloud
   ```

2. **Install Dependencies**
   ```bash
   # Install PHP dependencies
   composer install --no-dev --optimize-autoloader
   
   # Install Node.js dependencies
   npm install
   ```

3. **Build the Frontend**
   ```bash
   # Build for production
   npm run build
   ```

4. **Deploy to Nextcloud**
   ```bash
   # Copy to Nextcloud apps directory
   cp -r . /path/to/nextcloud/apps/threedviewer/
   
   # Set proper permissions
   chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/
   chmod -R 755 /path/to/nextcloud/apps/threedviewer/
   ```

5. **Enable in Nextcloud**
   - Go to Apps section in admin panel
   - Find "3D Viewer" and click "Enable"

### Method 3: Development Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/your-username/3Dviewer-Nextcloud.git
   cd 3Dviewer-Nextcloud
   ```

2. **Install Dependencies**
   ```bash
   # Install all dependencies (including dev)
   composer install
   npm install
   ```

3. **Build Development Version**
   ```bash
   # Build with development optimizations
   npm run build
   ```

4. **Symlink to Nextcloud**
   ```bash
   # Create symlink for development
   ln -s /path/to/3Dviewer-Nextcloud /path/to/nextcloud/apps/threedviewer
   ```

## ⚙️ Configuration

### Basic Configuration

The app works out of the box with default settings. No initial configuration is required.

### Advanced Configuration

1. **File Size Limits**
   - Default: 100MB per file
   - Configure in Nextcloud admin settings
   - Adjust `upload_max_filesize` and `post_max_size` in PHP

2. **Memory Limits**
   - Default: 256MB PHP memory limit
   - Increase for large models: `memory_limit = 512M`

3. **Timeout Settings**
   - Default: 30 seconds execution time
   - Increase for large files: `max_execution_time = 300`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `THREEDVIEWER_MAX_FILE_SIZE` | Maximum file size in bytes | `104857600` (100MB) |
| `THREEDVIEWER_ENABLE_COMPRESSION` | Enable DRACO/KTX2 support | `true` |
| `THREEDVIEWER_DEBUG_MODE` | Enable debug logging | `false` |

## 🔧 Post-Installation Setup

### 1. Verify Installation

1. **Check App Status**
   - Go to Apps section
   - Verify "3D Viewer" is enabled and active

2. **Test File Upload**
   - Upload a small 3D file (e.g., `.glb`, `.obj`)
   - Verify the file appears in Files app

3. **Test Viewer**
   - Click on a 3D file
   - Verify the 3D viewer opens
   - Test basic navigation (zoom, rotate, pan)

### 2. Configure MIME Types

The app automatically registers supported MIME types. If you encounter issues:

1. **Check MIME Type Registration**
   ```bash
   # Run repair command
   php occ app:repair threedviewer
   ```

2. **Manual MIME Type Addition**
   - Go to Admin → Settings → MIME types
   - Add custom MIME types if needed

### 3. Set Up Compression Support

1. **Verify Decoder Files**
   ```bash
   # Check if decoder files exist
   ls -la /path/to/nextcloud/apps/threedviewer/draco/
   ls -la /path/to/nextcloud/apps/threedviewer/basis/
   ```

2. **Enable Compression** (if not already enabled)
   - Set `THREEDVIEWER_ENABLE_COMPRESSION=true`
   - Restart web server

## 🧪 Testing Installation

### Basic Functionality Test

1. **Upload Test Files**
   - Upload files of different formats (GLB, OBJ, STL)
   - Verify all formats are recognized

2. **Test Viewer Features**
   - Open a 3D model
   - Test camera controls (orbit, zoom, pan)
   - Test grid toggle
   - Test axes toggle
   - Test wireframe mode

3. **Test Performance**
   - Upload a moderately large file (10-50MB)
   - Verify loading performance
   - Test abort functionality

### Advanced Testing

1. **Compression Test**
   - Upload a DRACO-compressed GLTF file
   - Verify it loads correctly

2. **Mobile Test**
   - Test on mobile device
   - Verify touch controls work

3. **Theme Test**
   - Switch between light and dark themes
   - Verify viewer adapts correctly

## 🚨 Troubleshooting

### Common Issues

**App not appearing in Apps list**:
- Check file permissions
- Verify app is in correct directory
- Check Nextcloud logs for errors

**3D files not opening**:
- Verify MIME types are registered
- Check file format is supported
- Check browser console for errors

**Performance issues**:
- Increase PHP memory limit
- Check file size limits
- Verify compression support

**Permission errors**:
- Check file ownership
- Verify directory permissions
- Check Nextcloud app permissions

### Debug Mode

Enable debug mode for troubleshooting:

1. **Enable Debug Logging**
   ```bash
   # Set debug mode
   export THREEDVIEWER_DEBUG_MODE=true
   ```

2. **Check Logs**
   ```bash
   # Check Nextcloud logs
   tail -f /path/to/nextcloud/data/nextcloud.log
   
   # Check web server logs
   tail -f /var/log/apache2/error.log
   # or
   tail -f /var/log/nginx/error.log
   ```

3. **Browser Console**
   - Open browser developer tools
   - Check console for JavaScript errors
   - Check network tab for failed requests

## 📞 Support

If you encounter issues during installation:

1. **Check Documentation**: Review this guide and other docs
2. **Search Issues**: Check [GitHub Issues](https://github.com/your-username/3Dviewer-Nextcloud/issues)
3. **Create Issue**: Provide detailed error information
4. **Community Support**: Ask in [GitHub Discussions](https://github.com/your-username/3Dviewer-Nextcloud/discussions)

## 🔄 Updates

### Updating the App

1. **App Store Update**:
   - Go to Apps section
   - Click "Update" if available

2. **Manual Update**:
   ```bash
   # Pull latest changes
   git pull origin main
   
   # Update dependencies
   composer install --no-dev --optimize-autoloader
   npm install
   
   # Rebuild frontend
   npm run build
   ```

3. **Verify Update**:
   - Check app version in Apps section
   - Test basic functionality
   - Check for any new features

---

For more detailed information, see the [Technical Architecture](TECHNICAL_ARCHITECTURE.md) and [Troubleshooting](TROUBLESHOOTING.md) guides.
