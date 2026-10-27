// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://flytguard-prototype.vercel.app",
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
