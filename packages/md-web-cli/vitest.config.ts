import { defineConfig } from 'vitest/config'

// `.css?raw` imports are handled natively by Vite's ?raw suffix, matching
// what src/assets.ts uses (the esbuild build maps the same suffix to its text
// loader). css must be enabled: with vitest's default CSS handling disabled,
// CSS imports (including ?raw) come back as empty strings.
export default defineConfig({
  test: {
    css: true,
    environment: `node`,
    include: [`tests/**/*.test.ts`],
  },
})
