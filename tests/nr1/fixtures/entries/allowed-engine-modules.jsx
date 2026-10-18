// N0/N1 boundary fixture: must PASS — the approved pure engine modules (since N1 load.js no longer
// imports the legacy engine: parseRirBounds lives in src/engine/rir.js).
import { exerciseTotals } from "../../../../src/engine/load.js";
import { parseRirBounds } from "../../../../src/engine/rir.js";
import { buildLoadSnapshot } from "../../../../src/engine/load-snapshot.js";
import { validateAtlas } from "../../../../src/engine/atlas-validate.js";
import { buildHierarchyIndex } from "../../../../src/engine/hierarchy.js";
import { aggregateMuscleWork } from "../../../../src/engine/muscle-stats.js";
import release from "nr1:atlas-release";
console.log(exerciseTotals, parseRirBounds, buildLoadSnapshot, validateAtlas, buildHierarchyIndex, aggregateMuscleWork, release.atlasVersion);
