// F1.2 — ONE-OFF mechanical split of the app script (the <script type="text/babel"> body of
// index.html) into src/app/*.jsx. Kept in the repo to document exactly how the split was made.
//
// The script is cut into consecutive pieces at the top-level declarations listed below (each piece
// starts at its anchor declaration, together with the comment lines directly above it). Nothing is
// added, removed or reordered: joining the pieces in src/app/ORDER.json order gives back the
// original bytes — tools/check-split.mjs proves it against tools/f1-baseline.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src/app");

// [file name, anchor = top-level declaration that starts the piece]
const PIECES = [
  ["00-imports.jsx", null],
  ["01-config-utils.jsx", "const SUPABASE_URL"],
  ["02-progression-core.jsx", "const RIR_OPTIONS"],
  ["03-normalizers-namespaces.jsx", "function normalizePlan"],
  ["04-account-init-migration.jsx", "const NETWORK_ERROR_TEXT"],
  ["05-storage-keys-draft-pro.jsx", "const STORAGE_KEYS"],
  ["06-legacy-cloud-v1.jsx", "const CLOUD_SYNC_FIELDS"],
  ["07-sync-queue-push.jsx", "const SYNC_OPERATIONS"],
  ["08-sync-meta-pull-conflicts.jsx", "function saveSyncMeta"],
  ["09-backups.jsx", "const BACKUP_LIST_KEY"],
  ["10-atlas-templates.jsx", "const SLOGANS"],
  ["11-ui-shared.jsx", "function FontStyles"],
  ["12-admin.jsx", "function AdminAccessMessage"],
  ["13-account-ui.jsx", "function FeedbackScreen"],
  ["14-analytics.jsx", "function getRangeBounds"],
  ["15-pro-ui.jsx", "const PRO_CARD_POINTS"],
  ["16-dashboard.jsx", "function NameModal"],
  ["17-exercises-plans.jsx", "function Stat"],
  ["18-active-workout.jsx", "function findMatchingSessions"],
  ["19-stats-history-report.jsx", "function MonthCalendar"],
  ["20-measurements.jsx", "const MEASUREMENT_FIELDS"],
  ["21-app.jsx", "const exercisesOverlayRef"],
];

const html = readFileSync(resolve(root, "index.html"), "utf8");
const open = html.indexOf('<script type="text/babel"');
const bodyStart = html.indexOf(">", open) + 1;
const bodyEnd = html.indexOf("</script>", bodyStart);
const code = html.slice(bodyStart, bodyEnd);

const lines = code.split("\n");
const lineStart = []; // char offset of each line
{ let pos = 0; for (const l of lines) { lineStart.push(pos); pos += l.length + 1; } }
const isComment = (l) => /^(\/\/|\/\*| \*|\*\/)/.test(l);

const cuts = [0];
for (const [, anchor] of PIECES.slice(1)) {
  const re = new RegExp(`^(async )?${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const hits = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`anchor "${anchor}": expected 1 line, found ${hits.length}`);
  let i = hits[0];
  while (i > 0 && isComment(lines[i - 1])) i--;
  if (lineStart[i] <= cuts[cuts.length - 1]) throw new Error(`anchor "${anchor}" is not after the previous one`);
  cuts.push(lineStart[i]);
}
cuts.push(code.length);

mkdirSync(outDir, { recursive: true });
if (readdirSync(outDir).some((f) => f.endsWith(".jsx"))) throw new Error("src/app/ already has .jsx files — refusing to overwrite");
PIECES.forEach(([file], k) => writeFileSync(resolve(outDir, file), code.slice(cuts[k], cuts[k + 1])));
writeFileSync(resolve(outDir, "ORDER.json"), JSON.stringify(PIECES.map(([f]) => f), null, 2) + "\n");
console.log(`[split-app] ${PIECES.length} files written to src/app/`);
