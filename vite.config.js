import { createAppConfig } from "@nextcloud/vite-config";

export default createAppConfig(
  {
    main: 'src/main.js',
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
        esbuild: {
          target: 'es2022' // Override esbuild target specifically
        }
      }
    }
  }
);
