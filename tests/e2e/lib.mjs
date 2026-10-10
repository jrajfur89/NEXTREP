// E2E helpers (F1.1). Serves a built app directory (dist/) over http://127.0.0.1 and opens it in
// Chromium with a phone-sized viewport and EVERY non-local request blocked — the app has to work
// from its own files only, like the Capacitor build on the phone.
//
// No real data, tokens or passwords: the app runs as a guest; the login check uses a made-up
// address and password and the network is blocked, so nothing ever reaches Supabase.
import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json",
};

export function serve(dir) {
  if (!existsSync(join(dir, "index.html"))) throw new Error(`no index.html in ${dir} — build it first`);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = join(dir, p);
    if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/index.html` })));
}

// Optional: a specific Chromium binary (local sandbox); in CI Playwright's own install is used.
const launchOptions = () => (process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});

// Deterministic page: fixed Math.random sequence (greeting texts etc.); with `fixedTime` also a
// frozen clock (Date) while timers keep running — used for screenshots.
const SEEDED_RANDOM = `(() => { let a = 0x9e3779b9; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

export async function openApp({ fixedTime = null } = {}) {
  const browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext({
    viewport: { width: 384, height: 832 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    acceptDownloads: true, locale: "pl-PL", timezoneId: "Europe/Warsaw", reducedMotion: "reduce",
  });
  const blocked = [];
  await ctx.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "127.0.0.1") return route.continue();
    blocked.push(route.request().url());
    return route.abort("internetdisconnected");
  });
  await ctx.addInitScript(SEEDED_RANDOM);
  const page = await ctx.newPage();
  if (fixedTime) await page.clock.setFixedTime(new Date(fixedTime));
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  return { browser, ctx, page, errors, blocked };
}

// Every Tailwind-looking class used on the current screen must exist in the loaded CSS
// (lucide-* icon classes carry no CSS by design).
export async function missingClasses(page) {
  return page.evaluate(() => {
    const sel = [];
    const walk = (rules) => { for (const r of rules) { if (r.selectorText) sel.push(r.selectorText); if (r.cssRules) walk(r.cssRules); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} }
    const all = sel.join("\n");
    const tokens = new Set();
    document.querySelectorAll("[class]").forEach((el) => {
      const c = el.getAttribute("class");
      if (typeof c === "string") c.split(/\s+/).filter(Boolean).forEach((t) => tokens.add(t));
    });
    return [...tokens].filter((t) => !t.startsWith("lucide") && !all.includes("." + CSS.escape(t)));
  });
}

export const bodyText = (page) => page.innerText("body");
