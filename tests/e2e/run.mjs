// F1.1 — runs the E2E suite: builds the app under test (repo dist/) and the reference build
// (E2E_REF, default a2b9ca0 = finished S1) in a temporary git worktree, then runs e2e/*.e2e.mjs.
// Both builds use the TEST Supabase project; the browser blocks all network anyway.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const REF = process.env.E2E_REF || "a2b9ca0";
const env = {
  ...process.env,
  NEXTREP_SUPABASE_URL: "https://qnyjrvoudyjxvitazclo.supabase.co",
  NEXTREP_SUPABASE_KEY: "sb_publishable_m-a9ngkx_UsLw1IglNj-HQ_JdpAqRmy",
  NEXTREP_TARGET: "native",
  NEXTREP_BUILD_ID: "__e2e",
};
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, env, stdio: "inherit" });

// 1. build under test
run("node", ["tools/build-web.mjs"], root);

// 2. reference build from REF in a throw-away worktree (shares the installed node_modules)
const refDir = join(root, ".e2e-ref");
rmSync(refDir, { recursive: true, force: true });
try { execFileSync("git", ["worktree", "prune"], { cwd: root }); } catch {}
run("git", ["worktree", "add", "--detach", refDir, REF], root);
try {
  if (!existsSync(join(refDir, "node_modules"))) symlinkSync(join(root, "node_modules"), join(refDir, "node_modules"), "dir");
  run("node", ["tools/build-web.mjs"], refDir);

  // 3. tests
  const files = process.argv.slice(2).length ? process.argv.slice(2) : ["e2e/s1-flow.e2e.mjs", "e2e/visual.e2e.mjs", "e2e/i5-atlas-browse.e2e.mjs", "e2e/i5-a11y.e2e.mjs"];
  mkdirSync(join(here, ".out"), { recursive: true });
  execFileSync("node", ["--test", "--test-concurrency=1", "--test-reporter=spec", ...files], {
    cwd: resolve(here, ".."),
    env: { ...env, E2E_DIST: join(root, "dist"), E2E_REF_DIST: join(refDir, "dist") },
    stdio: "inherit",
  });
} finally {
  try { execFileSync("git", ["worktree", "remove", "--force", refDir], { cwd: root }); } catch {}
}
