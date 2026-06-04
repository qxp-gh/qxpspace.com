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
  },
});
