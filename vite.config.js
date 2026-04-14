import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || "http://localhost:3001";

  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      proxy: {
        "/api": proxyTarget,
      },
    },
  };
});
