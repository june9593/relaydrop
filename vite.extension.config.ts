import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  if (!env.VITE_MICROSOFT_CLIENT_ID?.trim()) {
    throw new Error(
      "VITE_MICROSOFT_CLIENT_ID is required to build the Edge extension."
    );
  }

  return {
    root: "extension",
    base: "./",
    envDir: "..",
    publicDir: "public",
    build: {
      outDir: "../dist-extension",
      emptyOutDir: true,
      rollupOptions: {
        input: "extension/sidepanel.html",
        output: {
          manualChunks: {
            react: ["react", "react-dom"]
          }
        }
      }
    },
    plugins: [react()]
  };
});
