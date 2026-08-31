import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"
import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  /**
   * The socket a two-Commander battle is fought over, handed to the Bun process
   * beside this one. In production nginx does the same job with the same path,
   * so the client never has an address to configure — it opens `/ws` on
   * whatever host served it (ADR-0013).
   */
  server: {
    proxy: {
      "/ws": { target: `ws://localhost:${process.env.PORT ?? 8787}`, ws: true },
    },
  },
})
