// AT2 (NEXTREP 1.0): the approved atlas release bundled with the app, read-only.
// The app reads it ONLY through the catalog adapter (src/app/17b-atlas-catalog.jsx); nothing writes it
// to the user's data, plans, workouts or the sync queue. Content comes exclusively from approved
// batches of „Standaryzacja ćwiczeń NextRep” (src/atlas/atlas.json, validated in CI).
import atlas from "../atlas/atlas.json" with { type: "json" };

export const ATLAS_RELEASE = atlas;
