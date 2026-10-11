// NEXTREP 1.0 — muscle-group work of one exercise (decision of 11.10.2026, F2 v2 point 1).
//
// Every PRIMARY group of the exercise gets the full work (working sets and classic kg, equal-weight
// measures); every SECONDARY group gets the same numbers as separate, secondary work. Within one
// exercise a group is never both (deriveGroups already removes primary groups from the secondary
// list). Group work is never summed across groups into a workout total — one set would be counted
// several times; the workout volume comes from sessionTotals only.
// Not used by any screen yet (PE-C).

// totals: exerciseTotals(...) of the exercise; groups: { primaryGroups, secondaryGroups }
export function allocateGroupWork(totals, groups) {
  const primary = [...new Set((groups && groups.primaryGroups) || [])];
  const secondary = [...new Set((groups && groups.secondaryGroups) || [])].filter((g) => !primary.includes(g));
  const work = {
    sets: totals ? totals.workingSets : 0,
    volumeKg: totals ? totals.volumeKg : 0, // null when the volume is unavailable — stays null
    volumeStatus: totals ? totals.volumeStatus : "none",
    reps: totals ? totals.reps : 0,
    seconds: totals ? totals.seconds : 0,
  };
  return {
    main: Object.fromEntries(primary.map((g) => [g, { ...work }])),
    secondary: Object.fromEntries(secondary.map((g) => [g, { ...work }])),
  };
}

// Adds one exercise's allocation into per-group accumulators (main and secondary kept apart).
export function addGroupWork(acc, allocation) {
  const out = acc || { main: {}, secondary: {} };
  for (const kind of ["main", "secondary"]) {
    for (const [g, w] of Object.entries(allocation[kind])) {
      const t = out[kind][g] || (out[kind][g] = { sets: 0, volumeKg: 0, reps: 0, seconds: 0, volumeStatus: "none" });
      t.sets += w.sets;
      t.reps += w.reps;
      t.seconds += w.seconds;
      if (w.volumeKg === null) t.volumeStatus = "partial";
      else {
        t.volumeKg = Math.round((t.volumeKg + w.volumeKg) * 1000) / 1000;
        if (t.volumeStatus !== "partial" && w.volumeStatus !== "none") t.volumeStatus = t.volumeStatus === "estimated" || w.volumeStatus === "estimated" ? "estimated" : "exact";
      }
    }
  }
  return out;
}
