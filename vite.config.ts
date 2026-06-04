import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: true,
  },
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
});
