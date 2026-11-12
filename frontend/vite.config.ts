import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));
const flags = fileURLToPath(
  new URL("./node_modules/flag-icons/flags/4x3/", import.meta.url),
);
const routes = [
  "home",
  "tests/network",
  "bot",
  "accounts",
  "aggregate-api",
  "apikeys",
  "logs",
  "tests",
  "settings",
  "models",
  "tray-preview",
  "close-confirm",
];
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      vue({ template: { transformAssetUrls: false } }),
      {
        name: "boost-static-shell",
        writeBundle() {
          const out = fileURLToPath(new URL("./out/", import.meta.url));
          const html = readFileSync(resolve(out, "index.html"));
          for (const route of routes) {
            mkdirSync(resolve(out, route), { recursive: true });
            writeFileSync(resolve(out, route, "index.html"), html);
          }
        },
        generateBundle: {
          order: "post",
          handler(_, bundle) {
          const themeSource = readFileSync(fileURLToPath(new URL("./boost-theme.js", import.meta.url)), "utf8");
          for (const name of readdirSync(flags).filter((name) =>
            /^[a-z]{2}\.svg$/.test(name),
          )) {
            this.emitFile({
              type: "asset",
              fileName: `boost-assets/flags/${name}`,
              source: readFileSync(resolve(flags, name)),
            });
          }
          this.emitFile({
            type: "asset",
            fileName: "favicon.ico",
            source: readFileSync(resolve(assets, "images/favicon.ico")),
          });
          for (const dir of ["icons", "images"]) {
            for (const name of readdirSync(resolve(assets, dir))) {
              if (!/\.(svg|png|ico)$/.test(name)) continue;
              this.emitFile({
                type: "asset",
                fileName: `boost-assets/${dir}/${name}`,
                source: readFileSync(resolve(assets, dir, name)),
              });
            }
          }
          const index = bundle["index.html"];
          if (index?.type === "asset") {
            const css = Object.values(bundle).flatMap(asset =>
              asset.type === "asset" && asset.fileName.endsWith(".css")
                ? [asset.source.toString()]
                : [],
            );
            if (!css.length) throw new Error("Boost shell stylesheet was not emitted");
            const inlineTheme = `<script>${themeSource.replace(/<\/script/gi, "<\\/script")}</script>`;
            const inlineStyle = `<style>${css.join("\n").replace(/<\/style/gi, "<\\/style")}</style>`;
            index.source = String(index.source)
              .replace('<script src="/boost-theme.js"></script>', inlineTheme)
              .replace(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*>/gi, "")
              .replace("</head>", `${inlineStyle}</head>`);
          }
          },
        },
        configureServer(server) {
          server.middlewares.use("/boost-assets", (req, res, next) => {
            const path = (req.url || "").split("?")[0];
            if (/^\/flags\/[a-z]{2}\.svg$/.test(path)) {
              try {
                res.setHeader("Content-Type", "image/svg+xml");
                res.end(
                  readFileSync(resolve(flags, path.slice("/flags/".length))),
                );
              } catch {
                next();
              }
              return;
            }
            if (!/^\/(icons|images)\/[\w.-]+\.(svg|png|ico)$/.test(path))
              return next();
            try {
              res.setHeader(
                "Content-Type",
                path.endsWith(".svg")
                  ? "image/svg+xml"
                  : path.endsWith(".ico")
                    ? "image/x-icon"
                    : "image/png",
              );
              res.end(readFileSync(resolve(assets, "." + path)));
            } catch {
              next();
            }
          });
        },
      },
    ],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      "process.env.NEXT_PUBLIC_BOOST_RPC_BASE_URL": JSON.stringify(
        env.VITE_BOOST_RPC_BASE_URL || "",
      ),
    },
    build: { outDir: "out", emptyOutDir: true, sourcemap: false },
    publicDir: false,
    cacheDir: env.BOOST_VITE_CACHE_DIR || "../tmp/boost-vue/vite-cache",
    server: {
      fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] },
      proxy: env.BOOST_DEV_WEB_URL
        ? {
            "/api": env.BOOST_DEV_WEB_URL,
            "/boost-bot": env.BOOST_DEV_WEB_URL,
            "/__login": env.BOOST_DEV_WEB_URL,
            "/__logout": env.BOOST_DEV_WEB_URL,
          }
        : undefined,
    },
  };
});
