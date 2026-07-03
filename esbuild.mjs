import esbuild from "esbuild";

// Extension host (Node/CJS) bundle → dist/extension.js
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const ctx = await esbuild.context({
  entryPoints: ["extension/vscode/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
  console.log("esbuild: watching extension host...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
