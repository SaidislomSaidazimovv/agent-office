import esbuild from "esbuild";

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

if (watch) {
  await extCtx.watch();
  await hookCtx.watch();
  console.log("esbuild: watching extension host + hook script...");
} else {
  await extCtx.rebuild();
  await hookCtx.rebuild();
  await extCtx.dispose();
  await hookCtx.dispose();
}
