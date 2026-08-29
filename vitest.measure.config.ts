import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * The budget runs, kept out of `pnpm test` on purpose. They step whole
 * Scenarios to the clock, which is tens of thousands of steps apiece — a cost
 * worth paying when a number is wanted and not on every save.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["scripts/**/*.measure.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
