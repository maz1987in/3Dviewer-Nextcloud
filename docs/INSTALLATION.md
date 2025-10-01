# Installation Guide

This guide covers the installation of the 3D Viewer for Nextcloud application.

## 📋 Prerequisites

### System Requirements
- **Nextcloud**: Version 30–32
- **PHP**: Version 8.1 or higher
- **Node.js**: Version 22+ (for development/build)
- **Memory**: Minimum 512MB RAM (1GB+ recommended)
- **Storage**: 100MB+ free space

### PHP Extensions Required
- `php-gd` or `php-imagick`
- `php-zip`
- `php-json`
- `php-mbstring`
- `php-xml`

### Browser Support
- Modern browsers per `@nextcloud/browserslist-config`

## 🚀 Installation Methods

### Method 1: App Store Installation (when published)

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
   git clone https://github.com/maz1987in/3Dviewer-Nextcloud.git
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
   # Build for production (vite)
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
   git clone https://github.com/maz1987in/3Dviewer-Nextcloud.git
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
   # Build development/watch
   npm run watch
   ```

4. **Symlink to Nextcloud**
   ```bash
   # Create symlink for development
   ln -s /path/to/3Dviewer-Nextcloud /path/to/nextcloud/apps/threedviewer
   ```

## ⚙️ Configuration

### Basic Configuration

Works out of the box. No initial configuration required.

### Advanced Configuration

- File size, memory, and timeout limits are governed by your PHP/Nextcloud server settings. Adjust `upload_max_filesize`, `post_max_size`, `memory_limit`, and `max_execution_time` as appropriate for your instance.

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

### 2. **✅ AUTOMATIC: MIME Types Register on App Enable**

> **✅ NO MANUAL SETUP REQUIRED!** MIME types are registered automatically when you enable the app.

When you enable the threedviewer app, a repair step automatically:

1. ✅ Registers all 3D model MIME types in Nextcloud's database
2. ✅ Creates `/config/mimetypemapping.json` with extension mappings  
3. ✅ Creates `/config/mimetypealiases.json` for icon support
4. ✅ Regenerates JavaScript MIME type mappings

#### Enable the App

```bash
# Enable app (MIME types register automatically during this step)
php occ app:enable threedviewer
```

**Expected output:**
```
threedviewer enabled
...
Register 3D model MIME types and create config files (threedviewer)
  ✓ Registered: .glb => model/gltf-binary
  ✓ Registered: .gltf => model/gltf+json
  ✓ Registered: .obj => model/obj
  ✓ Registered: .stl => model/stl
  ✓ Registered: .ply => model/ply
  ✓ Registered: .dae => model/vnd.collada+xml
  ✓ Registered: .3mf => model/3mf
  ✓ Updated: /path/to/config/mimetypemapping.json
  ✓ Updated: /path/to/config/mimetypealiases.json
  ✓ Regenerated JavaScript MIME type mappings
...done. MIME types registered successfully.
NOTE: Existing files may need to be rescanned with: php occ files:scan --all
```

#### Rescan Existing Files (if applicable)

If you **already have 3D model files** uploaded before installing the app, rescan them to update their MIME types:

```bash
# Rescan all users
php occ files:scan --all

# Or rescan specific user
php occ files:scan username

# Or rescan specific directory
php occ files:scan username --path="/3D Models"
```

> **Note**: New files uploaded after enabling the app will automatically get the correct MIME types. Only files uploaded **before** the app was enabled need rescanning.

#### Verification

Check that MIME types were registered:

```bash
# Verify config files exist
ls -la /path/to/nextcloud/config/mimetype*.json

# Should show:
# mimetypemapping.json
# mimetypealiases.json
```

Upload a test 3D file and verify its MIME type:

```bash
php occ files:scan --verbose username --path="/test.glb"

# Expected: Shows file was scanned
# Check database to confirm MIME type:
```

```sql
SELECT f.name, m.mimetype 
FROM oc_filecache f 
JOIN oc_mimetypes m ON f.mimetype = m.id 
WHERE f.name LIKE '%.glb' 
LIMIT 1;

-- Expected result:
-- test.glb | model/gltf-binary
```

#### Supported MIME Types (Registered Automatically)

| Extension | MIME Type | Format Name |
|-----------|-----------|-------------|
| `.glb` | `model/gltf-binary` | GLTF Binary |
| `.gltf` | `model/gltf+json` | GLTF JSON |
| `.obj` | `model/obj` | Wavefront OBJ |
| `.stl` | `model/stl` | Stereolithography |
| `.ply` | `model/ply` | Polygon File Format |
| `.dae` | `model/vnd.collada+xml` | COLLADA |
| `.3mf` | `model/3mf` | 3D Manufacturing Format |
| `.fbx` | `model/x.fbx` | Autodesk FBX |
| `.3ds` | `application/x-3ds` | 3D Studio |
| `.mtl` | `text/plain` | Material Library |

> **Implementation Note**: The automatic MIME type registration is based on the proven solution from [WARP-LAB/files_3dmodelviewer](https://github.com/WARP-LAB/files_3dmodelviewer), which has been successfully used in production.

#### Legacy Manual Setup (Not Needed)

The following manual setup options are **no longer required** but are documented for reference:

<details>
<summary>Click to view legacy manual setup instructions</summary>

**Option A: Use Automated Script**

```bash
cd /path/to/nextcloud/apps/threedviewer
chmod +x scripts/register-mime-types.sh
./scripts/register-mime-types.sh
```

**Option B: Create MIME Type Mapping File Manually**

```bash
cat > /path/to/nextcloud/config/mimetypemapping.json <<'EOF'
{
  "glb": ["model/gltf-binary"],
  "gltf": ["model/gltf+json"],
  "obj": ["model/obj"],
  "stl": ["model/stl"],
  "ply": ["model/ply"],
  "dae": ["model/vnd.collada+xml"],
  "3mf": ["model/3mf"],
  "fbx": ["model/x.fbx"],
  "3ds": ["application/x-3ds"],
  "mtl": ["text/plain"]
}
EOF

php occ maintenance:mimetype:update-db
php occ files:scan --all
```

**Option C: Add to config.php**

```php
// Edit /path/to/nextcloud/config/config.php
'mimetypealiases' => array(
    'glb' => 'model/gltf-binary',
    'gltf' => 'model/gltf+json',
    'obj' => 'model/obj',
    'stl' => 'model/stl',
    'ply' => 'model/ply',
    'dae' => 'model/vnd.collada+xml',
    '3mf' => 'model/3mf',
    'fbx' => 'model/x.fbx',
    '3ds' => 'application/x-3ds',
    'mtl' => 'text/plain',
),
```

</details>

### 3. Decoder Files (DRACO/Basis)

Decoder assets are bundled and copied during build. Verify presence after build/deploy:

```bash
ls -la /path/to/nextcloud/apps/threedviewer/draco/
ls -la /path/to/nextcloud/apps/threedviewer/basis/
```

## 🧪 Testing Installation

### Basic Functionality Test

1. **Upload Test Files**
   - Upload files of different formats (GLB, OBJ, STL)
   - Verify all formats are recognized

2. **Test Viewer Features**
   - Open a 3D model
   - Test camera controls (orbit, zoom, pan)
   - Test grid/axes toggle and wireframe mode

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

**❌ 3D files download instead of opening in viewer** (MOST COMMON):

**Cause**: MIME types not registered correctly in Nextcloud.

**Solution**:
1. Verify you completed **Step 2** in Post-Installation Setup (MIME type registration)
2. Check if `config/mimetypemapping.json` exists with 3D model mappings
3. Run: `php occ maintenance:mimetype:update-db`
4. Rescan existing files: `php occ files:scan --all`
5. Verify MIME type is correct:
   ```bash
   # Check specific file
   php occ files:scan --verbose username --path="/file.glb"
   # Should show: model/gltf-binary (NOT application/octet-stream)
   ```
6. Clear browser cache and reload Nextcloud Files app
7. Open browser console (F12) and check for handler registration:
   ```
   [ThreeDViewer] Handler registered with Viewer {mimes: Array(11)}
   ```

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

1. **Check Logs**
   ```bash
   # Check Nextcloud logs
   tail -f /path/to/nextcloud/data/nextcloud.log
   
   # Check web server logs
   tail -f /var/log/apache2/error.log
   # or
   tail -f /var/log/nginx/error.log
   ```

2. **Browser Console**
   - Open browser developer tools
   - Check console for JavaScript errors
   - Check network tab for failed requests

## 📞 Support

If you encounter issues during installation:

1. **Check Documentation**: Review this guide and other docs
2. **Search Issues**: Check [GitHub Issues](https://github.com/maz1987in/3Dviewer-Nextcloud/issues)
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
