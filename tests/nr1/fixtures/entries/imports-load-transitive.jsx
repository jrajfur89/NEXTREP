// N0 boundary fixture: refused TODAY — src/engine/load.js imports parseRirBounds from
// legacy-progression.js, so the legacy engine would enter the bundle transitively. Finding of N0;
// the shared engine is not changed in N0 (prerequisite of N1).
import { exerciseTotals } from "../../../../src/engine/load.js";
console.log(exerciseTotals);
