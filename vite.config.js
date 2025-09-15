import { createAppConfig } from "@nextcloud/vite-config";
import { join, resolve } from "path";

export default createAppConfig(
  {
    main: resolve(join("src", "main.js")),
    files: resolve(join("src", "files.js")),
  },
  {
    createEmptyCSSEntryPoints: true,
    extractLicenseInformation: true,
    thirdPartyLicense: false,
    // Decoder assets are now copied by scripts/copy-decoders.mjs via prebuild script
  }
);
