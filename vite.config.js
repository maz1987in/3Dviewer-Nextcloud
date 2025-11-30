import { createAppConfig } from "@nextcloud/vite-config";

export default createAppConfig(
  {
    main: 'src/main.js',
    'settings-personal': 'src/settings-personal.js',
  },
  {
    createEmptyCSSEntryPoints: true,
    extractLicenseInformation: true,
    thirdPartyLicense: false,
    inlineCSS: false,
    // Decoder assets are now copied by scripts/copy-decoders.mjs via prebuild script
    config: {
      build: {
        target: 'es2022', // Support top-level await
        chunkSizeWarningLimit: 600, // Increase limit to 600kB (gzipped sizes are reasonable)
        esbuild: {
          target: 'es2022' // Override esbuild target specifically
        },
        rollupOptions: {
          output: {
            manualChunks: {
              // Three.js core (large but commonly used)
              'three-core': ['three'],
              
              // Three.js loaders (split by type for better caching)
              'three-loaders': [
                'three/examples/jsm/loaders/GLTFLoader',
                'three/examples/jsm/loaders/DRACOLoader',
                'three/examples/jsm/loaders/KTX2Loader',
              ],
              
              // Three.js controls
              'three-controls': ['three/examples/jsm/controls/OrbitControls'],
              
              // Vue runtime (separate chunk)
              'vue-runtime': ['vue'],
              
              // Nextcloud Vue components (already split by default, but ensure separation)
              // Note: NcSelect is large but used sparingly, so it will lazy load
            }
          }
        }
      }
    }
  }
);
