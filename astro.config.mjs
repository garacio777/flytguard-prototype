// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://flytguard-prototype.pages.dev",
  output: "static",
  build: {
    inlineStylesheets: "never"
  },
  vite: {
    build: {
      sourcemap: false
    }
  }
});
