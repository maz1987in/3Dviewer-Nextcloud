# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the 3D Viewer for Nextcloud application.

## 🚨 Common Issues

### Viewer Not Loading

#### Symptoms
- Blank screen when clicking 3D files
- Error message "Viewer failed to load"
- Browser console shows JavaScript errors

#### Diagnosis
1. **Check Browser Console**
   ```javascript
   // Look for errors like:
   // - "Failed to load resource"
   // - "Uncaught TypeError"
   // - "Module not found"
   ```

2. **Verify File Permissions**
   ```bash
   # Check app directory permissions
   ls -la /path/to/nextcloud/apps/threedviewer/
   
   # Should show:
   # drwxr-xr-x www-data www-data threedviewer
   ```

3. **Check Nextcloud Logs**
   ```bash
   # Check Nextcloud log
   tail -f /path/to/nextcloud/data/nextcloud.log
   
   # Look for errors related to threedviewer
   grep -i threedviewer /path/to/nextcloud/data/nextcloud.log
   ```

#### Solutions

**JavaScript Bundle Not Loading**:
```bash
# Rebuild frontend
cd /path/to/nextcloud/apps/threedviewer
npm install
npm run build

# Check if files exist
ls -la js/
```

**Permission Issues**:
```bash
# Fix permissions
chown -R www-data:www-data /path/to/nextcloud/apps/threedviewer/
chmod -R 755 /path/to/nextcloud/apps/threedviewer/
```

**Missing Dependencies**:
```bash
# Install PHP dependencies
composer install --no-dev --optimize-autoloader

# Install Node.js dependencies
npm install
```

### Models Not Displaying

#### Symptoms
- Viewer loads but shows empty scene
- Error message "Model failed to load"
- Loading spinner never stops

#### Diagnosis
1. **Check File Format**
   ```javascript
   // Verify file extension is supported
   const supportedFormats = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx'];
   console.log('File format supported:', supportedFormats.includes(fileExtension));
   ```

2. **Check File Size**
   ```bash
   # Check file size
   ls -lh /path/to/file.glb
   
   # Should be under 100MB for optimal performance
   ```

3. **Verify File Integrity**
   ```bash
   # Check if file is corrupted
   file /path/to/file.glb
   
   # Should show proper file type
   ```

#### Solutions

**Unsupported Format**:
- Convert to supported format (GLB, GLTF, OBJ, STL, PLY, FBX)
- Check if format is in supported list

**File Too Large**:
- Compress the model
- Increase PHP memory limit
- Use streaming for very large files

**Corrupted File**:
- Re-upload the file
- Check file transfer integrity
- Verify original file is not corrupted

### Performance Issues

#### Symptoms
- Slow loading times
- Choppy animation
- Browser becomes unresponsive
- High memory usage

#### Diagnosis
1. **Check Browser Performance**
   ```javascript
   // Open browser dev tools
   // Go to Performance tab
   // Record a session while using viewer
   ```

2. **Monitor Memory Usage**
   ```javascript
   // Check memory usage
   console.log('Memory usage:', performance.memory);
   
   // Check frame rate
   console.log('Frame rate:', this.frameRate);
   ```

3. **Check File Size**
   ```bash
   # Check file size
   du -h /path/to/file.glb
   
   # Large files (>50MB) may cause performance issues
   ```

#### Solutions

**High Memory Usage**:
- Close other browser tabs
- Reduce model complexity
- Use lower quality models
- Enable garbage collection

**Slow Loading**:
- Use compressed formats (GLB with DRACO)
- Optimize model geometry
- Use texture compression
- Enable progressive loading

**Choppy Animation**:
- Reduce model complexity
- Lower render quality
- Disable unnecessary features
- Check browser hardware acceleration

### Camera Issues

#### Symptoms
- Camera not responding to controls
- Model appears at edge of screen
- Camera resets unexpectedly
- Controls feel sluggish

#### Diagnosis
1. **Check Camera State**
   ```javascript
   // Check camera position
   console.log('Camera position:', this.camera.position);
   console.log('Camera target:', this.controls.target);
   ```

2. **Verify Controls**
   ```javascript
   // Check if controls are enabled
   console.log('Controls enabled:', this.controls.enabled);
   console.log('Controls damping:', this.controls.enableDamping);
   ```

3. **Check Event Listeners**
   ```javascript
   // Verify event listeners are attached
   console.log('Event listeners:', this.controls.listeners);
   ```

#### Solutions

**Camera Not Responding**:
- Refresh the page
- Check if controls are enabled
- Verify mouse/touch events are working
- Check for JavaScript errors

**Model at Edge**:
- Click "Reset View" button
- Use "Fit to View" button
- Check model centering logic
- Verify camera positioning

**Sluggish Controls**:
- Reduce damping factor
- Increase frame rate
- Optimize rendering
- Check browser performance

### Grid Issues

#### Symptoms
- Grid not visible
- Grid wrong size
- Grid in wrong position
- Grid not updating

#### Diagnosis
1. **Check Grid State**
   ```javascript
   // Check grid visibility
   console.log('Grid visible:', this.grid.visible);
   console.log('Grid position:', this.grid.position);
   console.log('Grid size:', this.grid.size);
   ```

2. **Verify Grid Update**
   ```javascript
   // Check if grid updates when model loads
   console.log('Grid updated:', this.gridNeedsUpdate);
   ```

3. **Check Model Bounds**
   ```javascript
   // Check model bounding box
   const box = new THREE.Box3().setFromObject(this.modelRoot);
   console.log('Model bounds:', box);
   ```

#### Solutions

**Grid Not Visible**:
- Toggle grid visibility
- Check grid material opacity
- Verify grid is added to scene
- Check camera position

**Wrong Grid Size**:
- Check model dimensions
- Verify grid sizing logic
- Update grid after model load
- Check grid divisions

**Grid Wrong Position**:
- Check model centering
- Verify grid positioning logic
- Update grid after model load
- Check ground level calculation

## 🔍 Debugging Tools

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

## 🛠️ Advanced Troubleshooting

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

#### CORS Issues
```javascript
// Check CORS headers
fetch('/ocs/v2.php/apps/threedviewer/api/files')
  .then(response => {
    console.log('CORS headers:', response.headers);
  });
```

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

## 📞 Getting Help

### Self-Help Resources

1. **Documentation**
   - Check this troubleshooting guide
   - Review user guide and API reference
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

- **GitHub Issues**: [Report bugs](https://github.com/your-username/3Dviewer-Nextcloud/issues)
- **GitHub Discussions**: [Ask questions](https://github.com/your-username/3Dviewer-Nextcloud/discussions)
- **Email**: [Contact maintainers](mailto:support@example.com)

## 🔧 Maintenance

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

For more detailed information, see the [Technical Architecture](TECHNICAL_ARCHITECTURE.md) and [Developer Guide](DEVELOPER_GUIDE.md) documentation.
