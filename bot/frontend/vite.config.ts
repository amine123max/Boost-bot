import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  base: "/boost-bot/amb/static/workspace/",
  plugins: [vue()],
  publicDir: false,
  cacheDir:
    process.env.BOOST_VITE_CACHE_DIR ||
    fileURLToPath(new URL("../../tmp/bot-ui/vite-cache", import.meta.url)),
  build: {
    outDir: "../dist/ui/workspace",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
