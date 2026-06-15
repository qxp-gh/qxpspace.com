import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: true,
    proxy: {
      "/api/kick": {
        target: "https://kick.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kick/, "/api/v2"),
        secure: true,
      },
    },
  },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
    rollupOptions: {
      // Multi-page: the homepage + the /portfolio sub-page share the design
      // system, audio engine and effects via src/boot.ts. Bare-string paths
      // (relative to root) avoid resolve()/__dirname — there is no @types/node
      // and vite.config.ts is in tsconfig include, so node APIs would fail tsc.
      input: {
        main: "index.html",
        portfolio: "portfolio/index.html",
      },
    },
  },
});
