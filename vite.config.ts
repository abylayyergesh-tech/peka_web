import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Dev: SPA calls "/api/*"; the proxy strips the prefix and forwards to the
// backend (no CORS needed locally). Prod: either serve behind the same
// reverse proxy with an /api -> backend rule, or set VITE_API_URL to the API
// origin at build time (backend CORS_ORIGINS must then include the SPA origin).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL ?? "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
