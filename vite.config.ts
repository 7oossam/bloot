import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  root: ".",
  // Relative asset paths so the build works from a GitHub Pages subpath
  // (https://<user>.github.io/<repo>/) without hardcoding the repo name.
  base: command === "build" ? "./" : "/",
  server: {
    host: true,
    port: 5173,
  },
}));
