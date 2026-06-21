import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/widget.ts",
      name: "AssaddarWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  preview: {
    allowedHosts: true,
  },
  server: {
    allowedHosts: true,
    fs: {
      allow: ["."],
    },
  },
});
