import esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Extension host (Node/CJS) bundle → dist/extension.js
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};

// 1) Extension host → dist/extension.js
const extCtx = await esbuild.context({
  ...common,
  entryPoints: ["extension/vscode/extension.ts"],
  outfile: "dist/extension.js",
  external: ["vscode"],
});

// 2) Claude hook-skripti → dist/hooks/claude-hook.js (Claude Code ishga tushiradi)
const hookCtx = await esbuild.context({
  ...common,
  entryPoints: ["extension/server/hooks/claudeHook.ts"],
  outfile: "dist/hooks/claude-hook.js",
  banner: { js: "#!/usr/bin/env node" },
});

// 3) Standalone CLI → dist/cli.js (`node dist/cli.js`, brauzerda kuzatish; npm'da E'LON QILINMAGAN —
//    npm'dagi "agent-office" nomi boshqa muallifga tegishli)
const cliCtx = await esbuild.context({
  ...common,
  entryPoints: ["extension/cli/main.ts"],
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node" },
  // Versiya — yagona manba package.json (qo'lda takrorlanmaydi).
  define: { __AO_VERSION__: JSON.stringify(pkg.version) },
});

// 4) `vscode:uninstall` skripti → dist/uninstall.js (o'chirishda hooklarni tozalaydi)
const uninstallCtx = await esbuild.context({
  ...common,
  entryPoints: ["extension/vscode/uninstall.ts"],
  outfile: "dist/uninstall.js",
});

if (watch) {
  await extCtx.watch();
  await hookCtx.watch();
  await cliCtx.watch();
  console.log("esbuild: watching extension host + hook script + cli...");
} else {
  await extCtx.rebuild();
  await hookCtx.rebuild();
  await cliCtx.rebuild();
  await uninstallCtx.rebuild();
  await extCtx.dispose();
  await hookCtx.dispose();
  await cliCtx.dispose();
  await uninstallCtx.dispose();
}
