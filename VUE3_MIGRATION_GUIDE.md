# Vue 3 Migration Guide for 3D Viewer Nextcloud App

## Overview

This document outlines the requirements and steps needed to migrate the 3D Viewer Nextcloud app from Vue 2.7 to Vue 3 to enable the blocked dependency updates.

## Blocked Dependencies

The following Dependabot PRs are blocked until Vue 3 migration is completed:

- **PR #31**: `@nextcloud/vue` 8.31.0 → 9.1.0 (Vue 3 only)
- **PR #32**: `@nextcloud/vite-config` 1.7.1 → 2.5.2 (Vue 3 only)

## Current State

- **Vue Version**: 2.7.16 (Options API + Composition API support)
- **@nextcloud/vue**: 8.29.2 (Vue 2 compatible)
- **@nextcloud/vite-config**: 1.7.1 (Vue 2 compatible)
- **Components**: 10+ Vue components using Options API with some Composition API features

## Migration Requirements

### 1. Vue Framework Upgrade

**From**: Vue 2.7.16  
**To**: Vue 3.x (latest stable)

**Breaking Changes to Address:**
- Global API changes (`Vue.mixin` → `app.mixin`)
- Component instance API changes
- Event handling changes
- Filter removal
- Custom directive API changes

### 2. @nextcloud/vue Component Updates

**Current Usage:**
- `NcAppContent` (App.vue)
- `NcButton` (ViewerComponent.vue, ThreeViewer.vue)
- `NcProgressBar` (ViewerComponent.vue, ThreeViewer.vue)

**Breaking Changes in v9.x:**
- `NcButton`: No longer includes `role="button"` when used as link (uses `link` role instead)
- `NcColorPicker`: `close` event removed (use `closed` event)
- Requires Nextcloud 32+ compatibility

### 3. Build Configuration Updates

**Current**: `@nextcloud/vite-config` 1.7.1  
**Target**: `@nextcloud/vite-config` 2.5.2

**Configuration Changes:**
- New options and defaults in 2.x series
- May affect build output, CSS extraction, and asset handling
- Custom options to verify: `createEmptyCSSEntryPoints`, `extractLicenseInformation`, `thirdPartyLicense`, `inlineCSS`

## Migration Steps

### Phase 1: Preparation
1. **Create migration branch**: `git checkout -b vue3-migration`
2. **Backup current state**: Ensure all tests pass on current Vue 2 version
3. **Document current functionality**: List all features to verify post-migration

### Phase 2: Vue 3 Core Migration
1. **Update Vue**: `npm install vue@^3.0.0`
2. **Update main.js**: Convert global API usage
   ```javascript
   // From Vue 2
   Vue.mixin({ methods: { t: translate, n: translatePlural } })
   new Vue({ el: '#threedviewer', render: h => h(App) })
   
   // To Vue 3
   import { createApp } from 'vue'
   const app = createApp(App)
   app.mixin({ methods: { t: translate, n: translatePlural } })
   app.mount('#threedviewer')
   ```

3. **Update component syntax**: Convert Options API components to Vue 3 compatible syntax
4. **Update composables**: Ensure all composables work with Vue 3 Composition API

### Phase 3: Nextcloud Package Updates
1. **Update @nextcloud/vue**: `npm install @nextcloud/vue@^9.0.0`
2. **Update @nextcloud/vite-config**: `npm install @nextcloud/vite-config@^2.0.0`
3. **Test component compatibility**: Verify all Nextcloud components work correctly
4. **Update build configuration**: Adjust vite.config.js for new package versions

### Phase 4: Testing & Validation
1. **Build verification**: Ensure `npm run build` succeeds
2. **Component testing**: Test all Vue components individually
3. **Integration testing**: Test Three.js integration
4. **E2E testing**: Run Playwright tests
5. **Manual testing**: Test all 3D file format loading
6. **Feature testing**: Verify controller, measurement, annotation features

## Files Requiring Updates

### Core Files
- `src/main.js` - Global API conversion
- `package.json` - Dependency updates
- `vite.config.js` - Build configuration updates

### Vue Components (10+ files)
- `src/App.vue`
- `src/views/ViewerComponent.vue`
- `src/components/ThreeViewer.vue`
- `src/components/CircularController.vue`
- `src/components/HelpPanel.vue`
- `src/components/MinimalTopBar.vue`
- `src/components/SlideOutToolPanel.vue`
- `src/components/ToastContainer.vue`
- `src/components/ViewCube.vue`
- `src/components/ViewerModal.vue`
- `src/components/ViewerToolbar.vue`

### Composables (10+ files)
- `src/composables/useAnnotation.js`
- `src/composables/useCamera.js`
- `src/composables/useComparison.js`
- `src/composables/useController.js`
- `src/composables/useExport.js`
- `src/composables/useFaceLabels.js`
- `src/composables/useMeasurement.js`
- `src/composables/useMobile.js`
- `src/composables/useModelLoading.js`
- `src/composables/useModelStats.js`
- `src/composables/usePerformance.js`
- `src/composables/useProgressiveTextures.js`
- `src/composables/useScene.js`
- `src/composables/useTheme.js`
- `src/composables/useUI.js`

## Risk Assessment

### High Risk Areas
1. **Three.js Integration**: Complex 3D rendering may have compatibility issues
2. **Component Lifecycle**: Vue 3 lifecycle hooks differ from Vue 2
3. **Event Handling**: Custom event system may need updates
4. **Build Process**: Vite configuration changes may affect asset loading

### Medium Risk Areas
1. **Nextcloud Component Compatibility**: Some components may have API changes
2. **Composition API**: Mixed Options/Composition API usage may need refactoring
3. **Testing**: Playwright tests may need updates for Vue 3

### Low Risk Areas
1. **Static Assets**: CSS, images, and static files should be unaffected
2. **PHP Backend**: No changes required to PHP components
3. **Build Scripts**: Most build scripts should work unchanged

## Testing Strategy

### Pre-Migration Testing
1. **Current functionality baseline**: Document all working features
2. **Test coverage**: Ensure all tests pass on Vue 2
3. **Performance baseline**: Measure current bundle sizes and performance

### Post-Migration Testing
1. **Unit tests**: `npm run test`
2. **Build tests**: `npm run build`
3. **Linting**: `npm run lint` and `npm run stylelint`
4. **E2E tests**: `npm run test:e2e`
5. **Smoke tests**: `npm run test:smoke`
6. **Manual testing**: All 3D file formats and features

## Timeline Estimate

- **Phase 1 (Preparation)**: 1-2 days
- **Phase 2 (Vue 3 Core)**: 3-5 days
- **Phase 3 (Nextcloud Packages)**: 2-3 days
- **Phase 4 (Testing & Validation)**: 3-5 days
- **Total**: 2-3 weeks

## Rollback Plan

If migration encounters critical issues:
1. **Keep Vue 2 branch**: Maintain `dev` branch with Vue 2
2. **Cherry-pick safe updates**: Apply only the safe dependency updates
3. **Gradual migration**: Consider incremental migration approach

## Success Criteria

- [ ] All tests pass
- [ ] Build succeeds without errors
- [ ] All 3D file formats load correctly
- [ ] All UI components work as expected
- [ ] Performance is maintained or improved
- [ ] Bundle sizes are within acceptable limits
- [ ] No breaking changes to user experience

## Next Steps

1. **Evaluate timing**: Determine when Vue 3 migration fits into development schedule
2. **Create migration branch**: Set up dedicated branch for migration work
3. **Begin Phase 1**: Start with preparation and documentation
4. **Monitor Nextcloud ecosystem**: Stay updated on Vue 3 migration patterns in Nextcloud apps

## Resources

- [Vue 3 Migration Guide](https://v3-migration.vuejs.org/)
- [Nextcloud Vue 3 Migration](https://github.com/nextcloud/nextcloud-vue/releases)
- [Vite Vue 3 Configuration](https://vitejs.dev/guide/features.html#vue)
- [Three.js Vue 3 Integration](https://threejs.org/docs/#manual/en/introduction/Installation)
