import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Webview → dist/webview. Nisbiy asset yo'llari (base "./") — VS Code webview
// URI'larига ViewProvider tomonidan qayta yoziladi. Bitta bundle (chunk yo'q)
// webview CSP'си uchun soddaroq.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
