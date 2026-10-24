// Loads the bundle built from the app source (src/app/) inside a jsdom environment (window, document,
// localStorage, navigator …) so module-level code of the app runs like in a browser.
// Usage in a test:  const app = await loadApp();  app.computeExerciseAnalysis(...)
// All date tests assume the owner's time zone (Poland; includes DST transitions).
// Override from the shell with TZ=... if needed.
if (!process.env.TZ) process.env.TZ = "Europe/Warsaw";
import { JSDOM } from "jsdom";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const metaPath = resolve(here, ".build/app.meta.json");
let appPromise = null;
// I2: "legacy" (default) = the bundle with the legacy profile (old key space, cloud on — the dormant
// code); "s1" = the app exactly as it ships (clean data space, cloud off). Chosen once per test file,
// before the first loadApp().
let appProfile = "legacy";
export function useS1Profile() {
  if (appPromise && appProfile !== "s1") throw new Error("useS1Profile() must run before the first loadApp()");
  appProfile = "s1";
}
export function currentAppProfile() {
  return appProfile;
}
// local key of a scoped entry / the onboarding marker, in the active profile's key space
export function scopedKey(name, ns = "guest") {
  return `${appProfile === "s1" ? "nextrep1_" : "nextrep_"}${ns}_${name}_v1`;
}
export function onboardingKey() {
  return appProfile === "s1" ? "nextrep1_onboarding_completed_v1" : "trainapp_onboarding_completed_v1";
}

export function installDom() {
  if (globalThis.__nrDom) return globalThis.__nrDom;
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: "https://nextrep.test/",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const g = globalThis;
  const keys = ["window", "document", "localStorage", "sessionStorage", "HTMLElement", "HTMLInputElement", "HTMLButtonElement", "HTMLTextAreaElement", "HTMLMediaElement", "FocusEvent", "InputEvent", "Node", "Element", "Event", "KeyboardEvent", "MouseEvent", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "MutationObserver", "DOMParser", "location", "history", "matchMedia"];
  for (const k of keys) {
    if (k === "matchMedia") continue;
    try {
      Object.defineProperty(g, k, { value: w[k], configurable: true, writable: true });
    } catch {}
  }
  Object.defineProperty(g, "navigator", { value: w.navigator, configurable: true, writable: true });
  w.matchMedia = w.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  g.matchMedia = w.matchMedia;
  w.scrollTo = () => {};
  g.scrollTo = w.scrollTo;
  {
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () {};
  }
  g.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__nrDom = dom;
  return dom;
}

export async function loadApp() {
  if (!appPromise) {
    if (!existsSync(resolve(here, ".build/app-s1.bundle.mjs"))) throw new Error("Bundle missing — run `npm run build` (or `npm test`) in tests/ first.");
    // Guard: the bundle must come from the CURRENT app source (src/app/, joined in ORDER.json order).
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const srcDir = resolve(here, "../../src/app");
    const order = JSON.parse(readFileSync(resolve(srcDir, "ORDER.json"), "utf8"));
    const md5 = createHash("md5").update(order.map((f) => readFileSync(resolve(srcDir, f), "utf8")).join("")).digest("hex");
    if (meta.indexMd5 !== md5) throw new Error("Bundle is stale (src/app changed) — run `npm run build`.");
    installDom();
    appPromise = import(pathToFileURL(resolve(here, appProfile === "s1" ? ".build/app-s1.bundle.mjs" : ".build/app.bundle.mjs")).href);
  }
  return appPromise;
}

// Fresh storage between tests (the app keeps everything in localStorage).
export function resetStorage() {
  installDom();
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  if (globalThis.__nrSupabase) globalThis.__nrSupabase.reset();
}

// Loads a bundle built with `node harness/build.mjs --ref <ref>` (an older index.html from git).
// Returns null when it hasn't been built (e.g. git history unavailable) so tests can skip.
export async function loadRefApp(ref) {
  const p = resolve(here, `.build/ref-${ref}.bundle.mjs`);
  if (!existsSync(p)) return null;
  installDom();
  return import(pathToFileURL(p).href);
}
