/**
 * Builds dist/: the TypeScript sources bundled to one browser module, the
 * Tailwind stylesheet compiled to a static file, and the static assets from
 * public/. Nothing third-party is fetched at runtime except the web fonts.
 *
 * dist/ is not committed. The Pages workflow builds it and uploads it as the
 * deployment artifact, which Pages serves verbatim — Jekyll never runs, so no
 * .nojekyll is needed.
 */

const OUT = "dist";

async function run(what: string, args: string[]) {
  const command = new Deno.Command(Deno.execPath(), { args, stdout: "inherit", stderr: "inherit" });
  const { code } = await command.output();
  if (code !== 0) {
    console.error(`${what} failed`);
    Deno.exit(code);
  }
}

await Deno.remove(OUT, { recursive: true }).catch(() => {});
await Deno.mkdir(OUT, { recursive: true });

await run("bundle", [
  "bundle",
  "--platform",
  "browser",
  "--minify",
  "--allow-import",
  "--output",
  `${OUT}/app.js`,
  "src/main.tsx",
]);

await run("tailwind", [
  "run",
  "--allow-read",
  "--allow-write",
  "--allow-env",
  "--allow-sys",
  "--allow-run",
  "npm:tailwindcss@3.4.16",
  "--config",
  "tailwind.config.cjs",
  "--input",
  "src/styles.css",
  "--output",
  `${OUT}/styles.css`,
  "--minify",
]);

for await (const entry of Deno.readDir("public")) {
  if (entry.isFile) await Deno.copyFile(`public/${entry.name}`, `${OUT}/${entry.name}`);
}

for (const file of ["app.js", "styles.css"]) {
  const { size } = await Deno.stat(`${OUT}/${file}`);
  console.log(`  ${OUT}/${file}  ${(size / 1024).toFixed(1)} kB`);
}
