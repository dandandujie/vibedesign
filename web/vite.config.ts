import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5473,
    // web imports the repo-root shared/ module (artifact extraction); allow dev
    // server to serve files outside web/.
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
});
