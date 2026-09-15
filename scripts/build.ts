/**
 * Builds the published site into the repository root, because Pages serves
 * this repo with "Deploy from a branch: main / (root)". The generated files
 * are committed, so what is served is exactly what is in git.
 *
 * Generated, do not edit by hand: index.html, app.js, styles.css, icon.svg,
 * .nojekyll. Sources live in src/ and public/.
 */

const GENERATED = ["app.js", "styles.css", "index.html", "icon.svg", ".nojekyll"];

async function run(what: string, args: string[]) {
  const command = new Deno.Command(Deno.execPath(), { args, stdout: "inherit", stderr: "inherit" });
  const { code } = await command.output();
  if (code !== 0) {
    console.error(`${what} failed`);
    Deno.exit(code);
  }
}

// Never a recursive delete here: the output directory is the repository root.
for (const file of GENERATED) {
  await Deno.remove(file).catch(() => {});
}

await run("bundle", [
  "bundle",
  "--platform",
  "browser",
  "--minify",
  "--allow-import",
  "--output",
  "app.js",
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
  "styles.css",
  "--minify",
]);

for await (const entry of Deno.readDir("public")) {
  if (entry.isFile) await Deno.copyFile(`public/${entry.name}`, entry.name);
}

// Without this, Pages runs the branch through Jekyll, which ignores files and
// folders beginning with an underscore and rewrites what it does serve.
await Deno.writeTextFile(".nojekyll", "");

for (const file of ["app.js", "styles.css"]) {
  const { size } = await Deno.stat(file);
  console.log(`  ${file}  ${(size / 1024).toFixed(1)} kB`);
}
