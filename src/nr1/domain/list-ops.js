// NEXTREP 1.0 (N1) — child-list operations shared by plans and workouts.
//
// Versioning rule (STORE FIRST + N1 authorisation):
//   * a record gets version + 1 for every change of its own fields, including position and
//     supersetGroup (records shifted by a move / removal / group operation are bumped too);
//   * the PARENT gets version + 1 once per operation that changes the membership or the order of
//     its live child list (insert, remove, move, superset join / leave / group move);
//   * a change of a child's own values (e.g. a set's reps) does not touch the parent.
// Every function returns a new list; the input is never mutated.
import { DomainError, newEntity, tombstone, replaceById } from "./entity.js";
import { liveSiblings, normalize, renumber } from "./ordering.js";
import { dissolveSingles, validateSupersets } from "./superset.js";

// Inserts a new child at `index` of the live order (default: at the end). The new record has
// version 1 and its final position; live siblings shifted by the insert are bumped. In a superset
// list a new record may not land inside a group.
export function insertChild(list, { parentKey, parentId, fields, index = null, now, newId, supersets = false }) {
  const live = liveSiblings(list, parentKey, parentId);
  const at = index === null ? live.length : index;
  if (!Number.isInteger(at) || at < 0 || at > live.length) throw new DomainError("INDEX_OUT_OF_RANGE", "target index outside the list", { index, size: live.length });
  const parentField = parentKey === null ? {} : { [parentKey]: parentId };
  const record = newEntity({ ...fields, ...parentField, position: at, ...(supersets ? { supersetGroup: null } : {}) }, { now, newId });
  const shifted = renumber([...live.slice(0, at), record, ...live.slice(at)], { now }).filter((r) => r.id !== record.id);
  const next = [...replaceById(list, shifted), record];
  if (supersets) {
    const errs = validateSupersets(liveSiblings(next, parentKey, parentId));
    if (errs.length) throw new DomainError("MOVE_INTO_SUPERSET", "a new record cannot be placed inside a superset", { index });
  }
  return { list: next, record };
}

// Tombstones one child (and, through `cascade`, its own children), renumbers the remaining
// siblings and dissolves superset groups left with one member.
export function removeChild(list, { parentKey, parentId, id, now, supersets = false }) {
  const rec = list.find((r) => r.id === id);
  if (!rec || rec.deletedAt !== null || (parentKey !== null && rec[parentKey] !== parentId)) throw new DomainError("NOT_A_LIVE_SIBLING", "record is not a live child of this parent", { id });
  let next = replaceById(list, [tombstone(rec, { now })]);
  next = normalize(next, { parentKey, parentId, now }).list;
  if (supersets) next = dissolveSingles(next, { parentKey, parentId, now }).list;
  return next;
}

// Tombstones every live child of the given parents (cascade of a removed parent).
export function tombstoneChildren(list, { parentKey, parentIds, now }) {
  const ids = new Set(parentIds);
  return list.map((r) => (r.deletedAt === null && ids.has(r[parentKey]) ? tombstone(r, { now }) : r));
}

// True when the live order or membership of the parent's children differs between two lists.
export function structureChanged(before, after, parentKey, parentId, withGroups = false) {
  const sig = (l) => liveSiblings(l, parentKey, parentId).map((r) => `${r.id}${withGroups ? `:${r.supersetGroup ?? ""}` : ""}`).join("|");
  return sig(before) !== sig(after);
}

export function assertSupersets(list, parentKey, parentId) {
  const errs = validateSupersets(liveSiblings(list, parentKey, parentId));
  if (errs.length) throw new DomainError("SUPERSET_INVALID", "superset invariant broken", { errors: errs });
}
