import { defineConfig } from '@playwright/test'

// Flags to enable software WebGL (SwiftShader) under headless Chromium so
// Three.js can create a GL context in CI / GPU-less environments. Without
// these, the smoke canvas-mount tests fail with "Error creating WebGL
// context." --enable-unsafe-swiftshader is required by recent Chromium
// versions to opt back into the software path.
const WEBGL_FLAGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
]

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.(ts|js)/,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    launchOptions: {
      args: WEBGL_FLAGS,
    },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
