import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const PORT = Number(process.env.BOOST_TEST_PORT || "3200");
const LOCAL_TEST_HOST = "localhost";

const noProxyHosts = ["localhost", "127.0.0.1", "::1"];
const noProxy = [process.env.NO_PROXY, process.env.no_proxy, ...noProxyHosts]
  .filter(Boolean)
  .join(",");

process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

export default defineConfig({
  outputDir: resolve(
    process.env.BOOST_TEST_OUTPUT_DIR || "../tmp/boost-vue",
    "playwright-results",
  ),
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: `http://${LOCAL_TEST_HOST}:${PORT}`,
    channel: "msedge",
    viewport: { width: 1100, height: 860 },
    trace: "on-first-retry",
    video: "off",
  },
  webServer: {
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://${LOCAL_TEST_HOST}:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NO_PROXY: noProxy,
      PORT: String(PORT),
      no_proxy: noProxy,
    },
  },
});
