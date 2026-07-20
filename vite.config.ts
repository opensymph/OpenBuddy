/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri spawns a dev server it can then load into the webview.
// HMR works with the default Vite dev server; the fixed port keeps
// tauri.conf.json `devUrl` stable.
const HOST = "0.0.0.0";
const PORT = 1420;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror WorkBuddy's `@` alias so ported components resolve unchanged.
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Tauri webview can't reach a host-relative absolute URL during dev
  // (no server origin), so always emit relative paths.
  base: "./",
  clearScreen: false,
  server: {
    host: HOST,
    port: PORT,
    strictPort: true,
    // Tauri waits for this string before launching the webview.
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // Produce asset URLs that work from the tauri:// or file:// origin
  // the production webview uses.
  build: {
    target: "es2021",
    // Split the heavy markdown / syntax-highlight libs out of the app
    // chunk so the main bundle stays small and fast to hot-reload.
    rollupOptions: {
      output: {
        manualChunks: {
          markdown: ["react-markdown", "remark-gfm"],
          highlight: ["react-syntax-highlighter"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // 不让 CSS import 在测试里报错(我们没装 jsdom CSS 处理)。
    css: false,
  },
});
