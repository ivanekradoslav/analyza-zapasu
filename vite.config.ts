import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import path from "node:path";

// Pre GitHub Pages potrebujeme base path v tvare "/nazov-repa/".
// V GitHub Actions ho nastavíme cez env premennú VITE_BASE_PATH.
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    // Skopíruje ffmpeg.wasm core súbory (single-thread aj multithread) do dist,
    // aby appka nebola závislá od CDN a fungovala aj offline / na GitHub Pages.
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@ffmpeg/core/dist/umd/*",
          dest: "ffmpeg/core",
        },
        {
          src: "node_modules/@ffmpeg/core-mt/dist/umd/*",
          dest: "ffmpeg/core-mt",
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  worker: {
    format: "es",
  },
  server: {
    // COOP/COEP pre SharedArrayBuffer (multithread ffmpeg.wasm) v dev móde.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
});
