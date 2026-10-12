// NEXTREP 1.0 (N1) — v2 entity basics: UUID created on the device, version, timestamps, tombstones.
//
// STORE FIRST: every user record carries id (uuid from the device), created_at, updated_at, version
// and deleted_at; device_id and sync_seq are added with synchronisation (N11), when the server
// becomes authoritative for version / updated_at. Until then:
//   * version starts at 1 and goes up by exactly 1 for every change of the record (bump);
//   * a "change" that leaves every field equal is not a change: same object, same version;
//   * deletion is a tombstone (deletedAt + version up), never removal of the record.
// Everything here is pure: the caller passes `now` (ISO time) and, when ids are made, `newId`.
// Inputs are never mutated; a changed record is a new object.

export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export const ENTITY_FIELDS = ["id", "createdAt", "updatedAt", "version", "deletedAt"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(v) {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isIsoTime(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) && !Number.isNaN(Date.parse(v));
}

export function defaultNewId() {
  const c = globalThis.crypto;
  if (!c || typeof c.randomUUID !== "function") throw new DomainError("NO_UUID_SOURCE", "crypto.randomUUID is not available");
  return c.randomUUID();
}

export function requireNow(now) {
  if (!isIsoTime(now)) throw new DomainError("NOW_REQUIRED", "an ISO UTC time (now) is required", { now });
  return now;
}

const later = (a, b) => (Date.parse(a) >= Date.parse(b) ? a : b);

// A new record: version 1, created = updated = now, not deleted.
export function newEntity(fields, { now, newId = defaultNewId } = {}) {
  requireNow(now);
  const id = newId();
  if (!isUuid(id)) throw new DomainError("ID_INVALID", "newId() must return a lower-case UUID", { id });
  for (const k of ENTITY_FIELDS) if (k in (fields || {})) throw new DomainError("ENTITY_FIELD_RESERVED", `${k} is set by newEntity`, { field: k });
  return { id, createdAt: now, updatedAt: now, version: 1, deletedAt: null, ...fields };
}

const same = (a, b) => a === b || (a && b && typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

// Applies `changes` to a record. Returns the SAME object when nothing changes; otherwise a new
// object with version + 1 and updatedAt = now (never earlier than the previous updatedAt).
export function bump(record, changes, { now }) {
  requireNow(now);
  for (const k of ENTITY_FIELDS) if (k in (changes || {}) && k !== "deletedAt") throw new DomainError("ENTITY_FIELD_RESERVED", `${k} cannot be changed directly`, { field: k });
  const changed = Object.keys(changes || {}).some((k) => !same(record[k], changes[k]));
  if (!changed) return record;
  return { ...record, ...changes, version: record.version + 1, updatedAt: later(now, record.updatedAt) };
}

// Forced version step without a field change (the parent of a reordered list, STORE FIRST).
export function touch(record, { now }) {
  requireNow(now);
  return { ...record, version: record.version + 1, updatedAt: later(now, record.updatedAt) };
}

export function tombstone(record, { now }) {
  if (record.deletedAt) return record;
  return bump(record, { deletedAt: now }, { now });
}

export const isLive = (r) => Boolean(r) && r.deletedAt === null;

// Structural validation of the entity fields of one record.
export function validateEntity(r, where = {}) {
  const errors = [];
  const e = (code, field) => errors.push({ code, field, ...where, id: r && r.id });
  if (!r || typeof r !== "object") return [{ code: "RECORD_MISSING", field: null, ...where }];
  if (!isUuid(r.id)) e("ID_INVALID", "id");
  if (!Number.isInteger(r.version) || r.version < 1) e("VERSION_INVALID", "version");
  if (!isIsoTime(r.createdAt)) e("TIME_INVALID", "createdAt");
  if (!isIsoTime(r.updatedAt)) e("TIME_INVALID", "updatedAt");
  if (r.deletedAt !== null && !isIsoTime(r.deletedAt)) e("TIME_INVALID", "deletedAt");
  if (r.version === 1 && r.deletedAt !== null) e("TOMBSTONE_WITHOUT_VERSION", "version");
  return errors;
}

// One operation = one version step per changed record. Intermediate steps of an operation may bump a
// record more than once (e.g. renumbered and then removed from a superset); squash() compares the
// result with the state BEFORE the operation: a record whose fields (other than version / updatedAt)
// differ gets exactly previous version + 1; an unchanged record is returned as it was; a new record
// keeps version 1.
const contentKey = (r) => JSON.stringify({ ...r, version: 0, updatedAt: "" });
export function squash(beforeList, afterList, { now }) {
  const before = new Map(beforeList.map((r) => [r.id, r]));
  return afterList.map((r) => {
    const b = before.get(r.id);
    if (!b) return r.version === 1 ? r : { ...r, version: 1, updatedAt: r.createdAt };
    if (contentKey(b) === contentKey(r)) return b;
    return { ...r, version: b.version + 1, updatedAt: later(now, b.updatedAt) };
  });
}

export function squashOne(before, after, { now, structural = false }) {
  const [r] = squash([before], [after], { now });
  if (r === before && structural) return touch(before, { now });
  return r;
}

// Replaces records in a list by id (new array; order of the list kept).
export function replaceById(list, changed) {
  if (!changed.length) return list;
  const map = new Map(changed.map((r) => [r.id, r]));
  return list.map((r) => map.get(r.id) || r);
}
