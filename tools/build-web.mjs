// NEXTREP S1 (STORE FIRST spike) — builds ../index.html into dist/ WITHOUT any CDN at runtime.
//
// index.html stays the single source of the app; this script never edits it. It:
//   1. extracts the <script type="text/babel"> body and the inline `tailwind.config`;
//   2. applies a small, exact list of build-time substitutions (Supabase project, Google Fonts
//      @import) — each must match exactly once, otherwise the build fails;
//   3. bundles the app with esbuild (JSX compiled ahead of time; react, react-dom, lucide-react and
//      supabase-js from npm, pinned to the same versions as the import map);
//   4. generates the CSS with Tailwind CLI 3 (same config) + self-hosted Inter / Barlow Condensed;
//   5. writes dist/index.html: same <head>/<body> as the source minus the CDN tags, plus the
//      update checker with a "__" build id (= switched off: the native app updates through the store).
//
// Required env: NEXTREP_SUPABASE_URL, NEXTREP_SUPABASE_KEY (publishable key).
// The production project is refused unless NEXTREP_ALLOW_PROD=1 (never set in S1).
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const work = resolve(root, ".build-web");
const PROD_REF = "pyhhvbqcjhpulrmqiguz";

const fail = (msg) => { console.error(`[build-web] ${msg}`); process.exit(1); };

const supabaseUrl = process.env.NEXTREP_SUPABASE_URL;
const supabaseKey = process.env.NEXTREP_SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) fail("set NEXTREP_SUPABASE_URL and NEXTREP_SUPABASE_KEY (test project for S1)");
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)) fail(`unexpected NEXTREP_SUPABASE_URL: ${supabaseUrl}`);
if (supabaseUrl.includes(PROD_REF) && process.env.NEXTREP_ALLOW_PROD !== "1") fail("refusing to build against the production Supabase project");
const buildId = process.env.NEXTREP_BUILD_ID || "__native-s1";
const target = process.env.NEXTREP_TARGET || "native"; // "native" (Capacitor) | "web"
if (!["native", "web"].includes(target)) fail(`unknown NEXTREP_TARGET: ${target}`);
if (!buildId.startsWith("__")) fail("NEXTREP_BUILD_ID must start with \"__\" (update checker off in the native build)");

const html = readFileSync(resolve(root, "index.html"), "utf8");
const sourceSha = createHash("sha256").update(html).digest("hex");

// ---- 1. pieces of index.html -------------------------------------------------------------
const babelOpen = html.indexOf('<script type="text/babel"');
if (babelOpen < 0) fail("<script type=\"text/babel\"> not found");
const babelBodyStart = html.indexOf(">", babelOpen) + 1;
const babelBodyEnd = html.indexOf("</script>", babelBodyStart);
let app = html.slice(babelBodyStart, babelBodyEnd);

const cfgMatch = html.match(/<script>\s*tailwind\.config\s*=\s*([\s\S]*?);\s*<\/script>/);
if (!cfgMatch) fail("inline tailwind.config not found");
const tailwindTheme = vm.runInNewContext(`(${cfgMatch[1]})`);

// ---- 2. exact substitutions --------------------------------------------------------------
function replaceOnce(src, from, to, what) {
  const n = src.split(from).length - 1;
  if (n !== 1) fail(`${what}: expected exactly 1 match, found ${n}`);
  return src.replace(from, to);
}
app = replaceOnce(app, /^const SUPABASE_URL = "[^"]*";.*$/m.exec(app)?.[0] ?? "\u0000", `const SUPABASE_URL = ${JSON.stringify(supabaseUrl)}; // S1 build: injected by tools/build-web.mjs`, "SUPABASE_URL line");
app = replaceOnce(app, /^const SUPABASE_PUBLISHABLE_KEY = "[^"]*";.*$/m.exec(app)?.[0] ?? "\u0000", `const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(supabaseKey)}; // S1 build: injected by tools/build-web.mjs`, "SUPABASE_PUBLISHABLE_KEY line");
app = replaceOnce(app, "@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap');", "/* fonts: self-hosted in app.css (S1 build) */", "Google Fonts @import");
if (/https:\/\/(esm\.sh|unpkg\.com|cdn\.tailwindcss\.com|fonts\.googleapis\.com)/.test(app)) fail("a CDN URL is still referenced by the app code");

// ---- 3. bundle ---------------------------------------------------------------------------
rmSync(work, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(resolve(dist, "assets"), { recursive: true });
writeFileSync(resolve(work, "app.jsx"), app);

await build({
  entryPoints: [resolve(work, "app.jsx")],
  outfile: resolve(dist, "assets/app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome100", "safari15"],
  jsx: "transform", // classic React.createElement, as Babel's preset-react did
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [resolve(root, "node_modules")],
  logLevel: "warning",
});

// ---- 4. CSS: Tailwind 3 (same theme) + self-hosted fonts --------------------------------
const twInput = [
  "@tailwind base;",
  "@tailwind components;",
  "@tailwind utilities;",
].join("\n");
const twOut = await postcss([
  tailwindcss({
    content: [{ raw: app, extension: "jsx" }, { raw: html.slice(0, babelOpen), extension: "html" }],
    theme: tailwindTheme.theme,
  }),
]).process(twInput, { from: undefined });
const fontCss = [
  "@fontsource/inter/400.css", "@fontsource/inter/500.css", "@fontsource/inter/600.css",
  "@fontsource/inter/700.css", "@fontsource/inter/800.css", "@fontsource/inter/900.css",
  "@fontsource/barlow-condensed/500.css", "@fontsource/barlow-condensed/600.css", "@fontsource/barlow-condensed/700.css",
].map((p) => `@import "${p}";`).join("\n");
writeFileSync(resolve(work, "fonts.css"), fontCss);
await build({
  entryPoints: [resolve(work, "fonts.css")],
  outfile: resolve(dist, "assets/fonts.css"),
  bundle: true,
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "fonts/[name]-[hash]",
  nodePaths: [resolve(root, "node_modules")],
  minify: true,
  logLevel: "warning",
});
writeFileSync(resolve(dist, "assets/app.css"), twOut.css);

// ---- 5. dist/index.html ------------------------------------------------------------------
let head = html.slice(0, babelOpen);
const tail = html.slice(babelBodyEnd + "</script>".length);
head = replaceOnce(head, '<script src="https://cdn.tailwindcss.com"></script>', "", "Tailwind CDN tag");
head = head.replace(/<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>/, "");
head = head.replace(/<script type="importmap">[\s\S]*?<\/script>/, "");
head = replaceOnce(head, '<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>', "", "Babel CDN tag");
// Native (Capacitor): no viewport-fit=cover, so Capacitor 8 SystemBars pads the app below the status bar
// and above the navigation bar (like the installed PWA on Android) and reports 0 safe-area insets to
// the page — the app's existing env(safe-area-inset-bottom) then adds nothing twice.
if (target === "native") head = replaceOnce(head, ", viewport-fit=cover", "", "viewport-fit=cover");
head = head.replace(/<meta name="nextrep-build" content="[^"]*" \/>/, `<meta name="nextrep-build" content="${buildId}" />`);
head = replaceOnce(head, "</head>", '<link rel="stylesheet" href="./assets/fonts.css" />\n<link rel="stylesheet" href="./assets/app.css" />\n</head>', "</head>");
const out = `${head}<script type="module" src="./assets/app.js"></script>${tail}`;
if (/https:\/\/(esm\.sh|unpkg\.com|cdn\.tailwindcss\.com|fonts\.googleapis\.com)/.test(out)) fail("a CDN URL is still referenced by dist/index.html");
if (!out.includes(`content="${buildId}"`)) fail("build id meta not set");
writeFileSync(resolve(dist, "index.html"), out);

for (const f of ["manifest.webmanifest", "nextrep-intro.mp4", "icons"]) {
  if (!existsSync(resolve(root, f))) fail(`missing ${f}`);
  cpSync(resolve(root, f), resolve(dist, f), { recursive: true });
}
writeFileSync(resolve(dist, "build-info.json"), JSON.stringify({
  source: "index.html", sourceSha256: sourceSha, buildId, target, supabaseUrl,
  builtAt: new Date().toISOString(),
}, null, 2));
rmSync(work, { recursive: true, force: true });
console.log(`[build-web] dist/ ready — index.html sha256 ${sourceSha.slice(0, 12)}…, Supabase ${supabaseUrl}, build id ${buildId}`);
