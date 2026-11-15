import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Public API URL from infra/outputs.env (ids and URLs only, never credentials). Absent on a clone that has no API yet. */
function apiUrl(): string | null {
  try {
    const text = readFileSync(new URL("../infra/outputs.env", import.meta.url), "utf8");
    return /^export API_URL="?([^"\r\n]+)"?/m.exec(text)?.[1] ?? null;
  } catch {
    return null;
  }
}

const api = apiUrl();

export default defineConfig({
  plugins: [react()],
  base: "./",
  // The API only allows the CloudFront origin. In development the browser talks to /api and the dev server forwards the call.
  server: api ? { proxy: { "/api": { target: api, changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } } } : {},
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
