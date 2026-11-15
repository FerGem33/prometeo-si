import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Public API URL from infra/outputs.env (ids and URLs only, never credentials). Absent on a clone that has no API yet. */
function outputsApiUrl(): string | null {
  try {
    const text = readFileSync(new URL("../infra/outputs.env", import.meta.url), "utf8");
    return /^export API_URL="?([^"\r\n]+)"?/m.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  // web/.env.local (not versioned) wins over infra/outputs.env. API_URL has no VITE_ prefix on purpose: it stays on the
  // dev server and is never bundled into the browser code.
  const api = loadEnv(mode, process.cwd(), "API_URL").API_URL || outputsApiUrl();
  return {
    plugins: [react()],
    base: "./",
    // The API only allows the CloudFront origin. In development the browser talks to /api and the dev server forwards the call.
    // Cookies are dropped: the API does not use them, and the cookies a browser keeps for localhost (other dev projects) can
    // exceed the API Gateway 10 KB header limit, which answers 431 Request Header Fields Too Large.
    server: api
      ? {
          proxy: {
            "/api": {
              target: api,
              changeOrigin: true,
              rewrite: (p: string) => p.replace(/^\/api/, ""),
              configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("cookie")),
            },
          },
        }
      : {},
    test: { environment: "node", include: ["src/**/*.test.ts"] },
  };
});
