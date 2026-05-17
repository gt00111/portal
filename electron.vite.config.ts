import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const sharedAlias = {
  "@shared": resolve(__dirname, "src/shared"),
};

const mainAlias = {
  ...sharedAlias,
  "@main": resolve(__dirname, "src/main"),
  "@preload": resolve(__dirname, "src/preload"),
};

const rendererAlias = {
  ...sharedAlias,
  "@renderer": resolve(__dirname, "src/renderer/src"),
  "@branding": resolve(__dirname, "resources/branding"),
  "@": resolve(__dirname, "src/renderer/src/apps/seisan-board"),
  shared: resolve(__dirname, "src/shared/seisan/index.ts"),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: mainAlias },
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: mainAlias },
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    resolve: { alias: rendererAlias },
    /** PixoConverter 等の既定 5173 と被らないよう分離（誤 URL だと window.api が無いまま別フロントが動く） */
    server: {
      port: 5180,
      strictPort: true,
    },
    build: {
      outDir: resolve(__dirname, "out/renderer"),
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
