# Troubleshooting Guide

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with the 3D Viewer for Nextcloud application.

## Table of Contents

- [Most Common Issues](#most-common-issues)
- [Installation Issues](#installation-issues)
- [Performance Issues](#performance-issues)
- [Model Loading Issues](#model-loading-issues)
- [UI and Controls Issues](#ui-and-controls-issues)
- [API and Networking Issues](#api-and-networking-issues)
- [Debugging Tools](#debugging-tools)
- [Advanced Troubleshooting](#advanced-troubleshooting)
- [Getting Help](#getting-help)

## Most Common Issues

### ❌ 3D Files Download Instead of Opening in Viewer

**This is the #1 most common issue!** If clicking a 3D file downloads it instead of opening the viewer, your MIME types are not configured correctly.

#### Symptoms
- Clicking `.glb`, `.gltf`, `.obj`, `.stl` files triggers download dialog
- Browser downloads file instead of opening viewer
- No viewer window appears

#### Root Cause
Nextcloud doesn't recognize 3D model file extensions and treats them as generic `application/octet-stream` instead of their proper MIME types like `model/gltf-binary`, `model/obj`, etc.

#### Solution

**Step 1: Register MIME Types**

**Option A - Create mapping file** (recommended):
```bash
# Create /path/to/nextcloud/config/mimetypemapping.json
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
```

**Option B - Edit config.php**:
```php
// Add to /path/to/nextcloud/config/config.php
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

**Step 2: Update MIME Type Database**

```bash
# This inserts the MIME types into Nextcloud's database
php occ maintenance:mimetype:update-db
```

**Step 3: Rescan Existing Files** (if you already uploaded 3D models)

```bash
# Rescan all users
php occ files:scan --all

# Or rescan specific user
php occ files:scan admin

# Or rescan specific directory
php occ files:scan admin --path="/3D Models"
```

**Step 4: Verify MIME Types**

```bash
# Check a specific file's MIME type
php occ files:scan --verbose admin --path="/models/test.glb"

# Expected output:
# Starting scan for user 1 out of 1 (admin)
# +---------+-------+--------------+
# | Folders | Files | Updated      |
# +---------+-------+--------------+
# | 0       | 1     | 1            |
# +---------+-------+--------------+

# Then verify in database (optional):
docker exec -it nextcloud-threedviewer mariadb -u nextcloud -pnextcloud nextcloud -e "
SELECT f.name, f.path, m.mimetype 
FROM oc_filecache f 
JOIN oc_mimetypes m ON f.mimetype = m.id 
WHERE f.name LIKE '%.glb' OR f.name LIKE '%.gltf' 
LIMIT 5;
"

# Should show:
# +---------------------+---------------------------+--------------------+
# | name                | path                      | mimetype           |
# +---------------------+---------------------------+--------------------+
# | test.glb            | files/models/test.glb     | model/gltf-binary  |
# | model.gltf          | files/models/model.gltf   | model/gltf+json    |
# +---------------------+---------------------------+--------------------+
```

**Step 5: Clear Browser Cache and Test**

```bash
# In your browser:
# 1. Open Developer Tools (F12)
# 2. Right-click refresh button → "Empty Cache and Hard Reload"
# 3. Go to Nextcloud Files app
# 4. Click a 3D model file
# 5. Check console for:
#    "[ThreeDViewer] Handler registered with Viewer"
#    "[INFO] viewer: Opening viewer for file"
```

#### Verification Checklist

✅ **MIME types registered**: `/config/mimetypemapping.json` exists with 3D model mappings  
✅ **Database updated**: `php occ maintenance:mimetype:update-db` ran successfully  
✅ **Files rescanned**: `php occ files:scan` ran on directories with 3D models  
✅ **MIME types correct**: Database shows `model/gltf-binary` not `application/octet-stream`  
✅ **Browser cache cleared**: Hard refresh performed  
✅ **Handler registered**: Console shows "Handler registered with Viewer {mimes: Array(11)}"  

If all checks pass and files still download, see [Viewer Not Loading](#viewer-not-loading) below.

---

## Installation Issues

### App Not Appearing in Apps List

#### Symptoms
- 3D Viewer doesn't appear in the Apps section
- Cannot enable the app
- App shows as disabled

#### Solutions

**Check File Permissions:**
```bash
# Check app directory permissions
ls -la /path/to/nextcloud/apps/threedviewer/

# Should show:
# drwxr-xr-x www-data www-data threedviewer

# Fix permissions if needed
chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/
chmod -R 755 /path/to/nextcloud/apps/threedviewer/
```

**Verify App is in Correct Directory:**
```bash
# Check if app is in the right place
ls -la /path/to/nextcloud/apps/threedviewer/appinfo/info.xml

# Should exist and be readable
```

**Check Nextcloud Logs:**
```bash
# Check Nextcloud logs for errors
tail -f /path/to/nextcloud/data/nextcloud.log

# Look for errors related to threedviewer
grep -i threedviewer /path/to/nextcloud/data/nextcloud.log
```

**Verify App Dependencies:**
```bash
# Check if all required files exist
ls -la /path/to/nextcloud/apps/threedviewer/
# Should have: appinfo/, lib/, src/, templates/, etc.
```

### MIME Type Registration Issues

#### Symptoms
- MIME types not registered automatically
- Files still download instead of opening
- Error messages about MIME type registration

#### Solutions

**Manual MIME Type Registration:**
```bash
# Enable the app (this should register MIME types)
php occ app:enable threedviewer

# If that doesn't work, manually register
php occ maintenance:mimetype:update-db
php occ files:scan --all
```

**Check MIME Type Files:**
```bash
# Verify config files exist
ls -la /path/to/nextcloud/config/mimetype*.json

# Should show:
# mimetypemapping.json
# mimetypealiases.json
```

**Verify MIME Type Content:**
```bash
# Check if 3D model mappings are present
cat /path/to/nextcloud/config/mimetypemapping.json | grep -E "(glb|gltf|obj|stl)"
```

### Build Issues

#### Symptoms
- Frontend doesn't load
- JavaScript errors in console
- Missing CSS or JS files

#### Solutions

**Rebuild Frontend:**
```bash
cd /path/to/nextcloud/apps/threedviewer
npm install
npm run build

# Check if files were created
ls -la js/
ls -la css/
```

**Check Build Output:**
```bash
# Should see files like:
# js/threedviewer-main.mjs
# css/threedviewer-main.css
```

**Verify Dependencies:**
```bash
# Check if all dependencies are installed
npm list

# Reinstall if needed
rm -rf node_modules package-lock.json
npm install
```

---

## Performance Issues

### Slow Loading Times

#### Symptoms
- Models take a long time to load
- Browser becomes unresponsive during loading
- Progress indicators show slow progress

#### Solutions

**Check File Size:**
```bash
# Check file size
ls -lh /path/to/file.glb

# Large files (>50MB) may cause performance issues
# Consider compressing the model
```

**Optimize Model:**
- Use compressed formats (GLB with DRACO compression)
- Reduce polygon count
- Compress textures
- Use lower resolution textures

**Increase PHP Limits:**
```bash
# Check current limits
php -i | grep -E "(memory_limit|upload_max_filesize|post_max_size|max_execution_time)"

# Edit php.ini to increase limits
memory_limit = 512M
upload_max_filesize = 100M
post_max_size = 100M
max_execution_time = 300
```

**Enable Compression:**
- Ensure DRACO decoders are present: `/apps/threedviewer/draco/`
- Ensure KTX2 transcoders are present: `/apps/threedviewer/basis/`

### Choppy Animation

#### Symptoms
- Low frame rate during camera movement
- Stuttering or jerky motion
- Browser performance warnings

#### Solutions

**Check Performance Mode:**
- Click the **⚡ Performance** button in the toolbar
- Try different quality settings (Auto, Balanced, High, Ultra, Low)
- Use "Auto" mode for optimal performance

**Reduce Model Complexity:**
- Use simpler models for testing
- Disable unnecessary features (shadows, antialiasing)
- Close other browser tabs

**Check Browser Performance:**
```javascript
// Open browser dev tools
// Go to Performance tab
// Record a session while using viewer
// Look for performance bottlenecks
```

**Monitor Frame Rate:**
```javascript
// Check frame rate in console
console.log('Frame rate:', this.frameRate);
// Should be 30+ FPS for smooth experience
```

### High Memory Usage

#### Symptoms
- Browser becomes slow
- Memory warnings
- Browser crashes with large models

#### Solutions

**Close Other Tabs:**
- Close unused browser tabs
- Free up system memory

**Use Smaller Models:**
- Test with smaller files first
- Use compressed formats
- Consider breaking large models into smaller parts

**Enable Garbage Collection:**
```javascript
// Force garbage collection (if available)
if (window.gc) {
  window.gc();
}
```

**Check Memory Usage:**
```javascript
// Monitor memory usage
console.log('Memory usage:', performance.memory);
// Should show reasonable usage
```

---

## Model Loading Issues

### Models Not Displaying

#### Symptoms
- Viewer loads but shows empty scene
- Error message "Model failed to load"
- Loading spinner never stops

#### Solutions

**Check File Format:**
```javascript
// Verify file extension is supported (core)
const supportedFormats = ['glb','gltf','obj','stl','ply','fbx','3mf','3ds'];
console.log('File format supported:', supportedFormats.includes(fileExtension));
```

**Check File Integrity:**
```bash
# Check if file is corrupted
file /path/to/file.glb

# Should show proper file type
```

**Verify File Size:**
```bash
# Check file size
ls -lh /path/to/file.glb

# Should be under 100MB for optimal performance
```

**Check Browser Console:**
- Open Developer Tools (F12)
- Look for JavaScript errors
- Check Network tab for failed requests

### Unsupported Format Errors

#### Symptoms
- Error message "Unsupported file format"
- File doesn't load
- Console shows format errors

#### Solutions

**Check Supported Formats:**
- GLB, GLTF, OBJ, STL, PLY, FBX, 3MF, 3DS, DAE, X3D, VRML are supported
- Convert unsupported formats to supported ones
- Use online converters or 3D modeling software

**Verify File Extension:**
```javascript
// Check if extension is in supported list
const extension = filename.split('.').pop().toLowerCase();
console.log('Extension:', extension);
```

**Check MIME Type:**
```bash
# Verify MIME type is correct
php occ files:scan --verbose username --path="/file.glb"
# Should show: model/gltf-binary (NOT application/octet-stream)
```

### Multi-File Loading Issues

#### Symptoms
- OBJ files load without materials
- GLTF files missing textures
- Error messages about missing dependencies

#### Solutions

**Check File Structure:**
```
# For OBJ files, ensure you have:
model.obj          # Main geometry file
model.mtl          # Material file
texture.jpg        # Texture files

# For GLTF files, ensure you have:
model.gltf         # Main file
model.bin          # Binary data
texture.jpg        # Texture files
```

**Verify File Permissions:**
- Ensure all related files are readable
- Check that MTL and texture files are in the same directory
- Verify file names match exactly (case-sensitive)

**Check Console Logs:**
```javascript
// Look for dependency loading messages
// Should see: "Loading MTL file: model.mtl"
// Should see: "Loading texture: texture.jpg"
```

---

## UI and Controls Issues

### Camera Not Responding

#### Symptoms
- Mouse/touch controls don't work
- Camera doesn't move
- Controls feel unresponsive

#### Solutions

**Check if Controls are Enabled:**
```javascript
// Check if controls are enabled
console.log('Controls enabled:', this.controls.enabled);
console.log('Controls damping:', this.controls.enableDamping);
```

**Verify Event Listeners:**
```javascript
// Verify event listeners are attached
console.log('Event listeners:', this.controls.listeners);
```

**Refresh the Page:**
- Try refreshing the page
- Clear browser cache
- Check for JavaScript errors

**Check Mouse/Touch Events:**
- Ensure you're clicking on the 3D viewer area
- Try different mouse buttons
- Check if touch events are working on mobile

### Model at Edge of Screen

#### Symptoms
- Model appears at edge of viewport
- Camera positioned incorrectly
- Model not centered

#### Solutions

**Use Reset View:**
- Click the "Reset View" button (🔄)
- This should center the model and reset camera position

**Use Fit to View:**
- Click the "Fit to View" button (📐)
- This should frame the model optimally

**Check Model Centering:**
```javascript
// Check if model is centered
const box = new THREE.Box3().setFromObject(this.modelRoot);
console.log('Model bounds:', box);
console.log('Model center:', box.getCenter(new THREE.Vector3()));
```

**Verify Camera Position:**
```javascript
// Check camera position
console.log('Camera position:', this.camera.position);
console.log('Camera target:', this.controls.target);
```

### Grid Issues

#### Symptoms
- Grid not visible
- Grid wrong size
- Grid in wrong position

#### Solutions

**Toggle Grid Visibility:**
- Click the grid toggle button
- Check if grid is enabled in settings

**Check Grid State:**
```javascript
// Check grid visibility
console.log('Grid visible:', this.grid.visible);
console.log('Grid position:', this.grid.position);
console.log('Grid size:', this.grid.size);
```

**Verify Grid Update:**
```javascript
// Check if grid updates when model loads
console.log('Grid updated:', this.gridNeedsUpdate);
```

**Reset Grid:**
- Load a new model (this should update the grid)
- Use "Fit to View" to reposition camera
- Check if model bounds are calculated correctly

### Toolbar Not Working

#### Symptoms
- Toolbar buttons don't respond
- Features not working
- UI elements missing

#### Solutions

**Check Toolbar State:**
```javascript
// Check if toolbar is mounted
console.log('Toolbar mounted:', this.$refs.toolbar);
```

**Verify Event Handlers:**
- Check if button click handlers are attached
- Look for JavaScript errors in console
- Verify component communication

**Check CSS:**
- Ensure toolbar CSS is loaded
- Check for styling conflicts
- Verify responsive design

### 3D Camera Controller Issues

#### Symptoms
- Controller doesn't appear when enabled
- Drag interactions don't work
- Controller position not saved
- Mobile touch events not working

#### Solutions

**Check Controller Visibility:**
```javascript
// Verify controller is enabled
console.log('Controller visible:', this.controllerVisible);
console.log('Controller position:', this.controllerPosition);
```

**Verify Touch Events:**
- Ensure touch events are properly bound
- Check for CSS pointer-events conflicts
- Verify mobile detection is working

**Check Persistence:**
- Verify localStorage is available
- Check if preferences are being saved
- Clear cache if preferences are corrupted

### Face Labels Not Displaying

#### Symptoms
- Labels don't appear when enabled
- Labels show incorrect orientations
- Labels are positioned incorrectly
- Labels don't update with model changes

#### Solutions

**Check Label State:**
```javascript
// Verify labels are enabled
console.log('Labels enabled:', this.labelsEnabled);
console.log('Label count:', this.labels.length);
```

**Verify CSS2D Renderer:**
- Ensure CSS2DRenderer is initialized
- Check if label renderer is attached to scene
- Verify renderer is being called in animation loop

**Check Model Bounding Box:**
```javascript
// Verify model has proper bounding box
const box = new THREE.Box3().setFromObject(this.model);
console.log('Model bounds:', box);
```

### Export Functionality Issues

#### Symptoms
- Export button doesn't work
- Export fails with errors
- Downloaded files are corrupted
- Export progress not shown

#### Solutions

**Check Export State:**
```javascript
// Verify export composable is working
console.log('Exporting:', this.isExporting);
console.log('Export format:', this.exportFormat);
```

**Verify Model Compatibility:**
- Check if model is compatible with export format
- Ensure model has been loaded successfully
- Verify materials are available for OBJ export

**Check Browser Support:**
- Ensure Blob API is supported
- Check if download is blocked by browser
- Verify file size limits

### Performance Overlay Issues

#### Symptoms
- Performance stats not visible
- Overlay doesn't toggle
- Stats show incorrect values
- Overlay interferes with UI

#### Solutions

**Check Overlay State:**
```javascript
// Verify performance monitoring is active
console.log('Performance overlay:', this.showPerformanceStats);
console.log('Current FPS:', this.currentFPS);
```

**Verify Performance Monitoring:**
- Ensure performance composable is initialized
- Check if renderer is being monitored
- Verify animation loop is running

**Check CSS Positioning:**
- Ensure overlay is positioned correctly
- Check for z-index conflicts
- Verify responsive positioning

---

## API and Networking Issues

### 401/403 Responses

#### Symptoms
- Unauthorized errors when loading files
- Permission denied messages
- Files not accessible

#### Solutions

**Check Authentication:**
- Ensure you're logged in to Nextcloud
- Check if session is valid
- Try logging out and back in

**Verify File Permissions:**
- Check if you have read access to the file
- Verify file ownership
- Check Nextcloud file permissions

**Include Required Headers:**
```javascript
// Ensure OCS headers are included
fetch('/ocs/v2.php/apps/threedviewer/api/files', {
  headers: {
    'OCS-APIRequest': 'true',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  }
});
```

### 404 Not Found Errors

#### Symptoms
- File not found errors
- API endpoints not responding
- Missing resources

#### Solutions

**Check File Exists:**
```bash
# Verify file exists in Nextcloud
ls -la /path/to/nextcloud/data/username/files/model.glb
```

**Verify API Endpoints:**
```bash
# Test API endpoint
curl -I https://your-domain.com/apps/threedviewer/api/files
```

**Check App Routes:**
```bash
# Verify app routes are registered
php occ app:list | grep threedviewer
```

**Enable App:**
```bash
# Ensure app is enabled
php occ app:enable threedviewer
```

### CORS Errors

#### Symptoms
- Cross-origin request blocked
- CORS policy errors
- Network requests failing

#### Solutions

**Check CORS Headers:**
```javascript
// Check CORS headers in response
fetch('/ocs/v2.php/apps/threedviewer/api/files')
  .then(response => {
    console.log('CORS headers:', response.headers);
  });
```

**Verify Nextcloud Configuration:**
- Check if CORS is properly configured
- Ensure trusted domains are set
- Verify SSL/TLS configuration

**Check Browser Settings:**
- Disable CORS in development (not recommended for production)
- Use same-origin requests when possible
- Check browser security settings

---

## Debugging Tools

### Browser DevTools

#### Console Tab
```javascript
// Enable debug mode
window.DEBUG = true;

// Check viewer state
console.log('Viewer state:', this.$data);

// Check Three.js objects
console.log('Scene:', this.scene);
console.log('Camera:', this.camera);
console.log('Renderer:', this.renderer);
```

#### Network Tab
- Monitor API requests
- Check file loading progress
- Verify response headers
- Check for failed requests

#### Performance Tab
- Profile rendering performance
- Identify memory leaks
- Monitor frame rates
- Check CPU usage

#### Application Tab
- Check local storage
- Verify service workers
- Check indexed DB
- Monitor cache usage

### Nextcloud Logs

#### Enable Debug Logging
```bash
# Enable debug mode
php occ config:system:set debug --value true

# Enable log level
php occ config:system:set loglevel --value 0
```

#### Check Logs
```bash
# Check Nextcloud log
tail -f /path/to/nextcloud/data/nextcloud.log

# Check web server log
tail -f /var/log/apache2/error.log
# or
tail -f /var/log/nginx/error.log

# Check PHP log
tail -f /var/log/php/error.log
```

### Performance Monitoring

#### Browser Performance
```javascript
// Monitor frame rate
let frameCount = 0;
let lastTime = performance.now();

const monitorPerformance = () => {
  frameCount++;
  const currentTime = performance.now();
  
  if (currentTime - lastTime >= 1000) {
    console.log('FPS:', frameCount);
    frameCount = 0;
    lastTime = currentTime;
  }
  
  requestAnimationFrame(monitorPerformance);
};

monitorPerformance();
```

#### Memory Usage
```javascript
// Monitor memory usage
const monitorMemory = () => {
  if (performance.memory) {
    console.log('Memory usage:', {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
    });
  }
};

setInterval(monitorMemory, 5000);
```

---

## Advanced Troubleshooting

### Server Configuration Issues

#### PHP Configuration
```bash
# Check PHP version
php -v

# Check PHP extensions
php -m | grep -E "(gd|zip|json|mbstring|xml)"

# Check PHP settings
php -i | grep -E "(memory_limit|upload_max_filesize|post_max_size|max_execution_time)"
```

#### Web Server Configuration
```bash
# Check Apache modules
apache2ctl -M | grep -E "(rewrite|headers|expires)"

# Check Nginx modules
nginx -V 2>&1 | grep -o with-[a-z]*

# Check file permissions
ls -la /path/to/nextcloud/apps/threedviewer/
```

#### Database Issues
```bash
# Check database connection
php occ status

# Check database tables
php occ db:status

# Repair database
php occ db:add-missing-indices
php occ db:add-missing-columns
```

### Network Issues

#### SSL/TLS Issues
```bash
# Check SSL certificate
openssl s_client -connect your-domain.com:443

# Check TLS version
curl -I https://your-domain.com
```

#### Firewall Issues
```bash
# Check firewall rules
iptables -L

# Check port accessibility
telnet your-domain.com 443
```

### File System Issues

#### Disk Space
```bash
# Check disk space
df -h

# Check inode usage
df -i

# Clean up old files
find /path/to/nextcloud/data -name "*.tmp" -mtime +7 -delete
```

#### File Permissions
```bash
# Check file ownership
ls -la /path/to/nextcloud/apps/threedviewer/

# Fix ownership
chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/

# Fix permissions
find /path/to/nextcloud/apps/threedviewer/ -type d -exec chmod 755 {} \;
find /path/to/nextcloud/apps/threedviewer/ -type f -exec chmod 644 {} \;
```

---

## Getting Help

### Self-Help Resources

1. **Documentation**
   - Check this troubleshooting guide
   - Review [README.md](README.md) and [TECHNICAL.md](TECHNICAL.md)
   - Search GitHub wiki

2. **Community Forums**
   - Nextcloud community forum
   - GitHub discussions
   - Stack Overflow

3. **Issue Tracking**
   - Search existing GitHub issues
   - Check if issue is already reported
   - Look for similar problems

### Reporting Issues

When reporting issues, include:

1. **System Information**
   - Nextcloud version
   - PHP version
   - Browser version
   - Operating system

2. **Error Details**
   - Error messages
   - Browser console output
   - Nextcloud log entries
   - Steps to reproduce

3. **File Information**
   - File format and size
   - File source (uploaded, shared, etc.)
   - File permissions

4. **Environment Details**
   - Server configuration
   - Network setup
   - Security settings

### Contact Information

- **GitHub Issues**: [Report bugs](https://github.com/maz1987in/3Dviewer-Nextcloud/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/maz1987in/3Dviewer-Nextcloud/discussions)

---

## Maintenance

### Regular Maintenance

#### Weekly Tasks
- Check error logs
- Monitor performance
- Update dependencies
- Clean up temporary files

#### Monthly Tasks
- Review security updates
- Check disk space
- Update documentation
- Test backup/restore

#### Quarterly Tasks
- Full system backup
- Security audit
- Performance review
- Dependency updates

### Backup and Recovery

#### Backup Strategy
```bash
# Backup app files
tar -czf threedviewer-backup-$(date +%Y%m%d).tar.gz /path/to/nextcloud/apps/threedviewer/

# Backup Nextcloud data
php occ maintenance:mode --on
tar -czf nextcloud-backup-$(date +%Y%m%d).tar.gz /path/to/nextcloud/data/
php occ maintenance:mode --off
```

#### Recovery Process
```bash
# Restore app files
tar -xzf threedviewer-backup-YYYYMMDD.tar.gz -C /

# Restore Nextcloud data
php occ maintenance:mode --on
tar -xzf nextcloud-backup-YYYYMMDD.tar.gz -C /
php occ maintenance:mode --off

# Fix permissions
chown -R www-data:www-data /path/to/nextcloud/
```

---

For more detailed technical information, see the [TECHNICAL.md](TECHNICAL.md) and [IMPLEMENTATION.md](IMPLEMENTATION.md) documentation.