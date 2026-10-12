// NEXTREP 1.0 (N0) — entry of the new app, independent of the old one in src/app/.
// N0 shows only a development screen: no user data, no storage, no network, no backend.
// The atlas release metadata comes from the build (tools/build-nr1.mjs, decision C01-4); the atlas
// itself is validated there and a validator error stops the build.
import { createRoot } from "react-dom/client";
import atlasRelease from "nr1:atlas-release";

const styles = {
  main: { maxWidth: 560, margin: "0 auto", padding: "48px 24px" },
  badge: { display: "inline-block", fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#FF6A00", border: "1px solid #FF6A00", borderRadius: 999, padding: "4px 10px" },
  title: { fontSize: 28, lineHeight: 1.2, margin: "16px 0 12px" },
  text: { fontSize: 15, lineHeight: 1.5, color: "#B8B8B8", margin: "0 0 24px" },
  card: { background: "#151515", border: "1px solid #2A2A2A", borderRadius: 16, padding: 16, margin: 0 },
  row: { display: "flex", justifyContent: "space-between", gap: 16, fontSize: 14, padding: "4px 0" },
  dt: { color: "#B8B8B8" },
  dd: { margin: 0, fontVariantNumeric: "tabular-nums" },
};

function DevScreen({ release }) {
  return (
    <main style={styles.main} data-testid="nr1-dev-screen">
      <span style={styles.badge}>wersja deweloperska</span>
      <h1 style={styles.title} data-testid="nr1-title">NEXTREP 1.0 — wersja deweloperska</h1>
      <p style={styles.text}>
        Ta wersja nie służy do zapisywania treningów. Nie ma konta, synchronizacji ani połączenia z chmurą i nie
        korzysta z danych dotychczasowej aplikacji.
      </p>
      <dl style={styles.card} data-testid="nr1-atlas">
        <div style={styles.row}><dt style={styles.dt}>Atlas — wydanie</dt><dd style={styles.dd} data-testid="nr1-atlas-version">{release.atlasVersion}</dd></div>
        <div style={styles.row}><dt style={styles.dt}>Ćwiczenia w atlasie</dt><dd style={styles.dd} data-testid="nr1-atlas-exercises">{release.exerciseCount}</dd></div>
        <div style={styles.row}><dt style={styles.dt}>Suma kontrolna</dt><dd style={styles.dd}>{release.sha256.slice(0, 12)}</dd></div>
      </dl>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<DevScreen release={atlasRelease} />);
