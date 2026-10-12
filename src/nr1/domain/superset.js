// NEXTREP 1.0 (N1) — supersets on ordered lists (plan items, workout exercises).
//
// STORE FIRST: a superset is `supersetGroup` (a UUID) on neighbouring siblings; validation checks
// that every group is contiguous in the live order and has at least two members. Every operation
// here keeps that invariant or refuses (DomainError) — it never returns a half-changed list:
//   * join(a, b)    — a and b must be live neighbours; groups merge into a's group (or a new one);
//   * leave(x)      — x leaves its group; a group split in the middle becomes two groups, a part
//                     with one member is no group at all;
//   * a single record never moves out of its group (use leave first) or into the middle of another
//     group; a whole group moves as one block (moveGroup).
// Every record whose supersetGroup or position changes gets version + 1.
import { DomainError, bump, isUuid, replaceById } from "./entity.js";
import { liveSiblings, moveBlock } from "./ordering.js";

// Contiguity and size of every group in an ORDERED array of live siblings.
export function validateSupersets(orderedLive) {
  const errors = [];
  const seen = new Map(); // group -> { count, closed }
  let prev = null;
  for (const r of orderedLive) {
    const g = r.supersetGroup ?? null;
    if (g !== null && !isUuid(g)) errors.push({ code: "SUPERSET_GROUP_INVALID", id: r.id, field: "supersetGroup" });
    if (g !== null) {
      const s = seen.get(g);
      if (s && s.closed) errors.push({ code: "SUPERSET_NOT_CONTIGUOUS", id: r.id, field: "supersetGroup" });
      seen.set(g, { count: (s ? s.count : 0) + 1, closed: false });
    }
    if (prev !== null && prev !== g && seen.has(prev)) seen.get(prev).closed = true;
    prev = g;
  }
  for (const [g, s] of seen) if (s.count < 2) errors.push({ code: "SUPERSET_TOO_SMALL", group: g, field: "supersetGroup" });
  return errors;
}

// Span [first, last] (indexes in the live order) of each group.
function spans(orderedLive) {
  const m = new Map();
  orderedLive.forEach((r, i) => {
    const g = r.supersetGroup ?? null;
    if (g === null) return;
    const s = m.get(g);
    m.set(g, s ? [s[0], i] : [i, i]);
  });
  return m;
}

const indexOf = (ordered, id) => ordered.findIndex((r) => r.id === id);

// Joins two neighbouring siblings (in either order) into one superset.
export function join(records, { parentKey, parentId, firstId, secondId, now, newId }) {
  const live = liveSiblings(records, parentKey, parentId);
  const i = indexOf(live, firstId);
  const j = indexOf(live, secondId);
  if (i < 0 || j < 0) throw new DomainError("NOT_A_LIVE_SIBLING", "both records must be live siblings", { firstId, secondId });
  if (Math.abs(i - j) !== 1) throw new DomainError("SUPERSET_NOT_NEIGHBOURS", "only neighbouring records can form a superset", { firstId, secondId });
  const [a, b] = i < j ? [live[i], live[j]] : [live[j], live[i]];
  const ga = a.supersetGroup ?? null;
  const gb = b.supersetGroup ?? null;
  if (ga !== null && ga === gb) throw new DomainError("SUPERSET_ALREADY_JOINED", "the records are already in the same superset", { firstId, secondId });
  const target = ga ?? gb ?? newId();
  if (!isUuid(target)) throw new DomainError("ID_INVALID", "newId() must return a UUID");
  const changed = live
    .filter((r) => r.id === a.id || r.id === b.id || (ga !== null && r.supersetGroup === ga) || (gb !== null && r.supersetGroup === gb))
    .map((r) => bump(r, { supersetGroup: target }, { now }))
    .filter((n, k, arr) => n !== live.find((r) => r.id === n.id));
  const list = replaceById(records, changed);
  assertValid(list, parentKey, parentId);
  return { list, changed, group: target };
}

// Removes one record from its superset (see header for splits).
export function leave(records, { parentKey, parentId, id, now, newId }) {
  const live = liveSiblings(records, parentKey, parentId);
  const k = indexOf(live, id);
  if (k < 0) throw new DomainError("NOT_A_LIVE_SIBLING", "record is not a live sibling", { id });
  const g = live[k].supersetGroup ?? null;
  if (g === null) throw new DomainError("NOT_IN_SUPERSET", "record is not in a superset", { id });
  const members = live.map((r, i) => ({ r, i })).filter((x) => x.r.supersetGroup === g);
  const left = members.filter((x) => x.i < k).map((x) => x.r);
  const right = members.filter((x) => x.i > k).map((x) => x.r);
  const updates = new Map([[id, null]]);
  if (left.length < 2) left.forEach((r) => updates.set(r.id, null));
  if (right.length < 2) right.forEach((r) => updates.set(r.id, null));
  else if (left.length >= 2) {
    const ng = newId();
    if (!isUuid(ng)) throw new DomainError("ID_INVALID", "newId() must return a UUID");
    right.forEach((r) => updates.set(r.id, ng));
  }
  const changed = [...updates].map(([rid, grp]) => bump(live.find((r) => r.id === rid), { supersetGroup: grp }, { now }));
  const list = replaceById(records, changed);
  assertValid(list, parentKey, parentId);
  return { list, changed };
}

// Clears groups left with one live member (after a removal). Returns the changed records.
export function dissolveSingles(records, { parentKey, parentId, now }) {
  const live = liveSiblings(records, parentKey, parentId);
  const counts = new Map();
  for (const r of live) if (r.supersetGroup) counts.set(r.supersetGroup, (counts.get(r.supersetGroup) || 0) + 1);
  const changed = live.filter((r) => r.supersetGroup && counts.get(r.supersetGroup) < 2).map((r) => bump(r, { supersetGroup: null }, { now }));
  return { list: replaceById(records, changed), changed };
}

// Moves ONE record to `toIndex` (index in the order of the other live siblings). A grouped record
// stays inside its group's span; any record may not land inside another group.
export function moveOne(records, { parentKey, parentId, id, toIndex, now }) {
  const live = liveSiblings(records, parentKey, parentId);
  const k = indexOf(live, id);
  if (k < 0) throw new DomainError("NOT_A_LIVE_SIBLING", "record is not a live sibling", { id });
  const res = moveBlock(records, { parentKey, parentId, ids: [id], toIndex, now });
  const g = live[k].supersetGroup ?? null;
  const errs = validateSupersets(res.ordered);
  if (errs.length) throw new DomainError(g ? "SUPERSET_MEMBER_OUT_OF_GROUP" : "MOVE_INTO_SUPERSET", g ? "a superset member moves only inside its group — leave the superset first" : "a record cannot be placed inside a superset", { id, toIndex });
  return res;
}

// Moves a whole group as one block to `toIndex` (index in the order of the non-member siblings).
export function moveGroup(records, { parentKey, parentId, group, toIndex, now }) {
  const live = liveSiblings(records, parentKey, parentId);
  const ids = live.filter((r) => r.supersetGroup === group).map((r) => r.id);
  if (ids.length < 2) throw new DomainError("SUPERSET_UNKNOWN", "no such superset in this list", { group });
  const res = moveBlock(records, { parentKey, parentId, ids, toIndex, now });
  if (validateSupersets(res.ordered).length) throw new DomainError("MOVE_INTO_SUPERSET", "a superset cannot be placed inside another superset", { group, toIndex });
  return res;
}

export function groupSpans(records, parentKey, parentId) {
  return spans(liveSiblings(records, parentKey, parentId));
}

function assertValid(list, parentKey, parentId) {
  const errs = validateSupersets(liveSiblings(list, parentKey, parentId));
  if (errs.length) throw new DomainError("SUPERSET_INVALID", "operation would break a superset", { errors: errs });
}
