import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Webview → dist/webview. Nisbiy asset yo'llari (base "./") — VS Code webview
// URI'larига ViewProvider tomonidan qayta yoziladi (barcha src/href generik
// almashtiriladi, shu jumladan modulepreload va bo'lingan chunk teglari ham).
// Chunklar ES-import bilan bir-birini yuklaydi — har biri entry'ning webview
// URI'siga NISBATAN yechiladi, shuning uchun webview'da to'g'ri ishlaydi.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // 3D stack (three + @react-three + drei) ~750KB (siqib bo'lmaydi) — alohida
    // chunkда; ilova kodi kichik chunkда qoladi. Limitni stack hajmidan sal
    // yuqori qo'yamiz (three yangilanishida soxta ogohlantirish chiqmasin).
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        // Vendorni mantiqiy chunklarга ajratamiz: 3D stack (kamdan-kam o'zgaradi →
        // brauzer/CLI relizlar aro keshlaydi) ilova kodidan alohida yuklanadi.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](three|three-stdlib|@react-three|troika|troika-three-text|troika-worker-utils|webgl-sdf-generator|bidi-js|maath|meshline|@use-gesture|suspend-react|its-fine|stats-gl)([\\/]|$)/.test(id)) return "three";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-reconciler)([\\/]|$)/.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },
});
