import { defineConfig, devices } from '@playwright/test'

// `npm run test:e2e` builds first; this serves the built dist/ and drives headless Chromium.
const port = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: 'e2e',
  // SwiftShader runs the solver on the CPU. On a two-core hosted runner the page can take tens of
  // seconds to settle, and the reduced-motion preroll blocks the main thread for longer.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 900 },
      // Hosted runners have no GPU. SwiftShader runs WebGL2 on the CPU, the same on every machine.
      launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    },
  }],
  webServer: {
    // --ignore-lock keeps the server in the foreground. Without it, astro preview detaches into the
    // background when it detects a coding agent, and Playwright would lose track of it.
    command: `npx astro preview --port ${port} --host 127.0.0.1 --ignore-lock`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
