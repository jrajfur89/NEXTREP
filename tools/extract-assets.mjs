// F1.4 — ONE-OFF: moves the base64 images out of src/app/ into src/assets/ files. Kept in the
// repo to document exactly what was done.
//
// Each literal "data:image/…;base64,…" in src/app/ becomes an identifier (__asset_<name>) imported
// in 00-imports.jsx between the "F1.4 assets" markers; the bytes go to src/assets/<file> unchanged.
// The transformation is reversible: tools/check-split.mjs puts the literals back from the files
// and must obtain the baseline app script byte for byte.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = resolve(root, "src/app");
const assetDir = resolve(root, "src/assets");
if (existsSync(resolve(assetDir, "MANIFEST.json"))) throw new Error("src/assets/MANIFEST.json exists — already extracted");

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// the code just before a literal tells what it is
const NAMED = {
  WELCOME_BG_IMAGE: "welcome-bg",
  NEXTREP_SYMBOL_SRC: "nextrep-symbol",
  NEXTREP_LOGO_SRC: "nextrep-logo",
  NEXTREP_LOGO_STACKED_SRC: "nextrep-logo-stacked",
};
const EXT = { "image/jpeg": "jpg", "image/png": "png" };

const order = JSON.parse(readFileSync(resolve(appDir, "ORDER.json"), "utf8"));
const manifest = [];
const used = new Set();
for (const file of order) {
  const path = resolve(appDir, file);
  let src = readFileSync(path, "utf8");
  src = src.replace(/"data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)"/g, (lit, mime, b64, offset) => {
    const before = src.slice(Math.max(0, offset - 80), offset);
    const constName = before.match(/const ([A-Z_]+) = $/)?.[1];
    const key = before.match(/"([^"]+)":\s*$/)?.[1];
    let base = constName && NAMED[constName];
    if (!base && key) base = `${file.startsWith("10-") ? "plan" : "muscle"}-${slug(key)}`;
    if (!base) throw new Error(`${file}: cannot name the image at offset ${offset}`);
    if (used.has(base)) throw new Error(`duplicate asset name ${base}`);
    used.add(base);
    const bytes = Buffer.from(b64, "base64");
    if (bytes.toString("base64") !== b64) throw new Error(`${base}: base64 does not round-trip`);
    const name = `${base}.${EXT[mime]}`;
    const id = `__asset_${base.replace(/-/g, "_")}`;
    mkdirSync(assetDir, { recursive: true });
    writeFileSync(resolve(assetDir, name), bytes);
    manifest.push({ id, file: name, mime, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), from: file });
    return id;
  });
  writeFileSync(path, src);
}

const block =
  "// F1.4 assets (begin) — images moved out of the code into src/assets/ (see MANIFEST.json)\n" +
  manifest.map((m) => `import ${m.id} from "@nextrep-assets/${m.file}";\n`).join("") +
  "// F1.4 assets (end)\n";
const importsPath = resolve(appDir, "00-imports.jsx");
writeFileSync(importsPath, block + readFileSync(importsPath, "utf8"));
writeFileSync(resolve(assetDir, "MANIFEST.json"), JSON.stringify({ note: "F1.4: images formerly inlined as base64 in the app code. id = identifier used in src/app/.", assets: manifest }, null, 2) + "\n");
console.log(`[extract-assets] ${manifest.length} images → src/assets/ (${manifest.reduce((a, m) => a + m.bytes, 0)} bytes)`);
