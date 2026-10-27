import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The whole app is bundled into a single self-contained dist/index.html:
// the same file is served by the server and used as the template for
// standalone exports (see src/lib/embed.ts).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 4096,
  },
});
