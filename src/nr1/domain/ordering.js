// NEXTREP 1.0 (N1) — ordered lists (STORE FIRST: five lists with position).
//
//   plans                        by profile (the user)      plan_items        by plan
//   plan_item_sets               by plan item               workout_exercises by workout
//   workout_sets                 by workout exercise        (workouts are ordered by date)
//
// Rules:
//   * position is an integer >= 0, not unique; order is ALWAYS (position, createdAt, id), so it is
//     deterministic even with duplicates or gaps (PE-32);
//   * a structural change (move, insert inside the list, removal) renumbers the live siblings 0..n-1;
//     every record whose position changes gets version + 1;
//   * tombstoned records keep their last position and are not part of the live order.
// Functions take the WHOLE list of the kind (any parents, live and tombstoned) and return a new
// list; nothing is mutated.
import { DomainError, bump, isLive, replaceById } from "./entity.js";

export function compareOrder(a, b) {
  if (a.position !== b.position) return a.position - b.position;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByOrder(records) {
  return [...records].sort(compareOrder);
}

// Live siblings of one parent, in order. parentKey null = the whole list is one family (plans of
// the user: their parent is the profile, which is not a field of the record).
export function liveSiblings(records, parentKey, parentId) {
  return sortByOrder(records.filter((r) => isLive(r) && (parentKey === null || r[parentKey] === parentId)));
}

// Renumbers an ordered array of siblings to 0..n-1; returns only the records that changed.
export function renumber(orderedSiblings, { now }) {
  const out = [];
  orderedSiblings.forEach((r, i) => {
    const n = bump(r, { position: i }, { now });
    if (n !== r) out.push(n);
  });
  return out;
}

export function nextPosition(records, parentKey, parentId) {
  const live = liveSiblings(records, parentKey, parentId);
  return live.length ? live[live.length - 1].position + 1 : 0;
}

// Places `ids` (a contiguous block, in the given order) at `toIndex` of the live order of the other
// siblings, then renumbers. Returns { list, changed } — changed = records whose position changed.
export function moveBlock(records, { parentKey, parentId, ids, toIndex, now }) {
  const live = liveSiblings(records, parentKey, parentId);
  const block = ids.map((id) => live.find((r) => r.id === id));
  if (block.some((r) => !r)) throw new DomainError("NOT_A_LIVE_SIBLING", "a moved record is not a live sibling of this parent", { ids });
  const rest = live.filter((r) => !ids.includes(r.id));
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > rest.length) throw new DomainError("INDEX_OUT_OF_RANGE", "target index outside the list", { toIndex, size: rest.length });
  const ordered = [...rest.slice(0, toIndex), ...block, ...rest.slice(toIndex)];
  const changed = renumber(ordered, { now });
  return { list: replaceById(records, changed), changed, ordered };
}

// Renumbers the live siblings of one parent (after an insert or a removal).
export function normalize(records, { parentKey, parentId, now }) {
  const changed = renumber(liveSiblings(records, parentKey, parentId), { now });
  return { list: replaceById(records, changed), changed };
}

// Structural check: live siblings of every parent have positions 0..n-1 after any operation.
export function validatePositions(records, parentKey) {
  const errors = [];
  const parents = new Set(records.filter(isLive).map((r) => (parentKey === null ? null : r[parentKey])));
  for (const p of parents) {
    const live = liveSiblings(records, parentKey, p);
    live.forEach((r, i) => {
      if (!Number.isInteger(r.position) || r.position < 0) errors.push({ code: "POSITION_INVALID", id: r.id, field: "position" });
      else if (r.position !== i) errors.push({ code: "POSITION_NOT_DENSE", id: r.id, field: "position" });
    });
  }
  return errors;
}
