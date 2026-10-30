import { createAppConfig } from "@nextcloud/vite-config";
import { occtNoEval } from "./scripts/occt-no-eval.mjs";

// Every file of a worker's bundle (see `worker` below): the background thumbnail worker's
// and the print-check worker's
const WORKER_FILE = /^js\/(thumbnail|print-check|point-cloud)-worker-/;

// Which worker a bundle file belongs to: the file holding the print-check or point-cloud
// worker's entry is that worker's, and every other worker file keeps the thumbnail worker's
// names (the G-code loader the thumbnail worker bundles imports from src/printCheck/ too,
// and its scan loaders read with the same readers the point-cloud worker does)
const holds = (chunk, file) => [chunk.facadeModuleId, ...(chunk.moduleIds || [])].some((id) => id && id.endsWith(file));
const workerPrefix = (chunk) => (
  holds(chunk, '/src/printCheck/printCheck.worker.js')
    ? 'print-check-worker'
    : holds(chunk, '/src/pointclouds/pointCloud.worker.js') ? 'point-cloud-worker' : 'thumbnail-worker'
);

const appConfig = createAppConfig(
  {
    main: 'src/main.js',
    'settings-personal': 'src/settings-personal.js',
    'settings-admin': 'src/settings-admin.js',
    embed: 'src/embed.js',
  },
  {
    createEmptyCSSEntryPoints: true,
    extractLicenseInformation: true,
    thirdPartyLicense: false,
    inlineCSS: false,
    // Replaces @nextcloud/vite-config's default, so it repeats `protocolImports`.
    // `crypto` is left unpolyfilled: its only importer is the OCCT glue, which calls
    // `require("crypto")` inside a Node-only branch, and the polyfill (crypto-browserify,
    // bn.js, elliptic, asn1.js, readable-stream...) was most of the occt-runtime chunk.
    nodePolyfills: {
      protocolImports: true,
      exclude: ['crypto'],
    },
    // Decoder assets are now copied by scripts/copy-decoders.mjs via prebuild script
    config: {
      // The OCCT glue compiles its bindings with `new Function`, which Nextcloud's CSP
      // blocks; rewrite it to closures as it is bundled (#169).
      plugins: [occtNoEval()],
      // The background thumbnail worker (src/thumbnails/thumbnail.worker.js), the
      // print-check worker (src/printCheck/printCheck.worker.js) and the point-cloud worker
      // (src/pointclouds/pointCloud.worker.js) are each bundled on their own, with none of the main build's plugins or output names. It is a module
      // worker, because the loader registry code-splits, and its files go under js/ like
      // every other chunk. The OCCT glue it bundles needs the same rewrite as above.
      worker: {
        format: 'es',
        // The print-check and point-cloud workers bundle no OCCT loader, so they have no glue to rewrite
        plugins: () => [occtNoEval({ exemptEntry: /[\\/]src[\\/](printCheck[\\/]printCheck|pointclouds[\\/]pointCloud)\.worker\.js$/ })],
        rollupOptions: {
          output: {
            entryFileNames: (chunk) => `js/${workerPrefix(chunk)}-[hash].mjs`,
            chunkFileNames: (chunk) => `js/${workerPrefix(chunk)}-[name]-[hash].chunk.mjs`,
            assetFileNames: 'dist/[name]-[hash][extname]',
          },
        },
      },
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

// @nextcloud/vite-config resolves every built URL in JS through `window.OC.filePath`, which
// a worker does not have: three's DRACO and KTX2 loaders build their decoder URLs at module
// load, so the worker would die importing them. Inside the worker's own files, resolve
// URLs relative to the importing chunk instead. All of it sits under js/ and dist/ of the
// app, so that holds wherever the app is served from (apps/ or custom_apps/).
export default async (env) => {
  const config = await appConfig(env);
  const renderBuiltUrl = config.experimental.renderBuiltUrl;
  config.experimental.renderBuiltUrl = (filename, context) => (
    WORKER_FILE.test(context.hostId) ? { relative: true } : renderBuiltUrl(filename, context)
  );
  return config;
};
