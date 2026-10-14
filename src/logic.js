// Pure, DOM-free logic for Family Records. No browser globals, no DB calls,
// no app state — everything here is unit-tested in __tests__/logic.test.mjs.
// Dates are 'YYYY-MM-DD' strings compared lexicographically, which is exact for
// that format and avoids the timezone shifts a Date round-trip introduces.

export const CATEGORIES = [
  { id: "legal",     label: "Legal",      glyph: "gavel" },
  { id: "medical",   label: "Medical",    glyph: "stethoscope" },
  { id: "school",    label: "School",     glyph: "graduation" },
  { id: "insurance", label: "Insurance",  glyph: "shield" },
  { id: "identity",  label: "Identity",   glyph: "contact-card" },
  { id: "other",     label: "Other",      glyph: "document" },
];

export function categoryFor(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

/** Days from a → b, both 'YYYY-MM-DD'. Negative when b precedes a. */
export function daysUntil(fromDate, targetDate) {
  const day = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };
  return day(targetDate) - day(fromDate);
}

export const EXPIRY_SOON_DAYS = 45;

/**
 * Expiry state of a record relative to `todayStr`.
 * → 'none' (no expiry set) | 'expired' | 'soon' | 'ok'
 *
 * `todayStr` is passed in rather than read from the clock so this stays
 * deterministic — and so callers use the household-local date, never UTC.
 */
export function expiryStatus(record, todayStr) {
  if (!record?.expires_on) return "none";
  const left = daysUntil(todayStr, record.expires_on);
  if (left < 0) return "expired";
  if (left <= EXPIRY_SOON_DAYS) return "soon";
  return "ok";
}

/** Human label for the expiry chip. Returns '' when nothing should be shown. */
export function expiryLabel(record, todayStr) {
  const status = expiryStatus(record, todayStr);
  if (status === "none" || status === "ok") return "";
  const left = daysUntil(todayStr, record.expires_on);
  if (status === "expired") {
    const ago = -left;
    return ago === 0 ? "Expires today" : `Expired ${ago} day${ago === 1 ? "" : "s"} ago`;
  }
  if (left === 0) return "Expires today";
  return `Expires in ${left} day${left === 1 ? "" : "s"}`;
}

/**
 * Filter + sort records for the list view. Expiring records float to the top
 * (expired first, then soon), because those are the ones needing action; the
 * rest fall back to newest-first.
 */
/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`). The
 * note counts as well as the title — a record is often remembered by what it
 * says ("policy number", "Dr Ruiz") rather than by what it was filed as.
 */
export function searchableFields(record) {
  return [record.title, record.note];
}

export function visibleRecords(records, { childId = "all", category = "all" } = {}, todayStr) {
  const rank = { expired: 0, soon: 1, ok: 2, none: 2 };

  return (records ?? [])
    .filter((r) => {
      if (childId !== "all" && (r.child_id ?? "") !== childId) return false;
      if (category !== "all" && r.category !== category) return false;
      return true;
    })
    .sort((a, b) => {
      const ra = rank[expiryStatus(a, todayStr)];
      const rb = rank[expiryStatus(b, todayStr)];
      if (ra !== rb) return ra - rb;
      // Within the urgent buckets, soonest expiry first.
      if (ra < 2) return String(a.expires_on).localeCompare(String(b.expires_on));
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
}

/**
 * Validate a record before writing it. Returns { ok: true } or { ok, error }.
 * A record must carry a file or a note — a bare title is a to-do, not a record.
 */
export function validateRecord(rec) {
  const title = String(rec?.title ?? "").trim();
  if (!title) return { ok: false, error: "Give the record a title." };
  if (title.length > 200) return { ok: false, error: "That title is too long." };
  if (!CATEGORIES.some((c) => c.id === rec.category)) {
    return { ok: false, error: "Pick a category." };
  }
  if (!rec.file_id && !String(rec.note ?? "").trim()) {
    return { ok: false, error: "Attach a file or add a note." };
  }
  if (rec.expires_on && !/^\d{4}-\d{2}-\d{2}$/.test(rec.expires_on)) {
    return { ok: false, error: "Expiry must be a valid date." };
  }
  return { ok: true };
}

/** Fields shown on the child info card, in display order. */
export const CHILD_INFO_FIELDS = [
  { key: "blood_type",    label: "Blood type",     group: "Medical" },
  { key: "allergies",     label: "Allergies",      group: "Medical", multiline: true },
  { key: "medications",   label: "Medications",    group: "Medical", multiline: true },
  { key: "doctor_name",   label: "Doctor",         group: "Medical" },
  { key: "doctor_phone",  label: "Doctor phone",   group: "Medical" },
  { key: "dentist_name",  label: "Dentist",        group: "Medical" },
  { key: "dentist_phone", label: "Dentist phone",  group: "Medical" },
  { key: "school_name",   label: "School",         group: "School" },
  { key: "school_phone",  label: "School phone",   group: "School" },
  { key: "teacher_name",  label: "Teacher",        group: "School" },
  { key: "shirt_size",    label: "Shirt",          group: "Sizes" },
  { key: "pants_size",    label: "Pants",          group: "Sizes" },
  { key: "shoe_size",     label: "Shoes",          group: "Sizes" },
  { key: "notes",         label: "Notes",          group: "Other", multiline: true },
];

/** True when a child info row has nothing worth showing. */
export function isChildInfoEmpty(info) {
  if (!info) return true;
  return CHILD_INFO_FIELDS.every((f) => !String(info[f.key] ?? "").trim());
}

/** Group the populated fields for rendering. → [{ group, fields: [{...f, value}] }] */
export function groupedChildInfo(info) {
  const out = [];
  for (const field of CHILD_INFO_FIELDS) {
    const value = String(info?.[field.key] ?? "").trim();
    if (!value) continue;
    let bucket = out.find((g) => g.group === field.group);
    if (!bucket) { bucket = { group: field.group, fields: [] }; out.push(bucket); }
    bucket.fields.push({ ...field, value });
  }
  return out;
}

/** Bytes → "1.4 MB". Used for the file-size hint on a record. */
export function fmtBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

// ── Versioning, retirement and the governed purge ─────────────────────────────
// Records are never deleted by the app: replacing one keeps the version it
// replaced (file included), and deleting one is a `retired_at` timestamp. These
// helpers are what the UI reasons with, kept here so they are testable without
// a DOM or a database.

/** Records still in force. A retired record has not gone anywhere — it is out
 *  of the working list, and the history view is where it still lives. */
export function liveRecords(records) {
  return (records ?? []).filter((r) => !r.retired_at);
}

/** Retired records, newest retirement first. */
export function retiredRecords(records) {
  return (records ?? [])
    .filter((r) => r.retired_at)
    .sort((a, b) => String(b.retired_at).localeCompare(String(a.retired_at)));
}

/**
 * Every version of one record, newest first: the row in force, then each
 * superseded version. `version` numbers them, so the caller can say "v3 of 3"
 * without counting.
 */
export function versionsOf(record, versionRows) {
  const earlier = (versionRows ?? [])
    .filter((v) => v.record_id === record?.id)
    .map((v) => ({ ...v, current: false }))
    .sort((a, b) => Number(b.version) - Number(a.version));
  return record ? [{ ...record, current: true }, ...earlier] : earlier;
}

/**
 * Where a record stands with the other parent on being destroyed for good.
 * → { state: 'none' | 'pending' | 'agreed', row? }
 *
 * Deliberately NOT "is it my turn?": which side the viewer signs for is a fact
 * about the live roster that can change between rendering this and clicking it,
 * so the hub answers it at the moment of the act and tells a mis-sided UI it has
 * already agreed. Reading it here would be caching exactly the wrong thing.
 */
export function purgeStateFor(recordId, purgeRows) {
  const row = (purgeRows ?? [])
    .filter((p) => p.record_id === recordId && (p.status === "pending" || p.status === "agreed"))
    .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0];
  return row ? { state: row.status === "agreed" ? "agreed" : "pending", row } : { state: "none" };
}

/**
 * The child-info fields whose value actually changed. A replace that changes
 * nothing is refused by the hub (and rightly — it would burn a version and
 * claim an edit nobody made), so the editor asks this before it sends.
 */
export function changedChildInfo(before, after) {
  const changed = {};
  for (const [key, value] of Object.entries(after ?? {})) {
    const previous = before?.[key] ?? null;
    const next = value === "" ? null : value;
    if ((previous ?? null) !== (next ?? null)) changed[key] = next;
  }
  return changed;
}

/**
 * Whether a failed write may nonetheless have been stored ("retry after a lost
 * response"). No status: the request threw before any answer. A 400: the hub's
 * answer for a write that timed out after it may have been stored, and for a
 * retry that met the first try's row under its pinned id (UNIQUE_CONSTRAINT).
 * A 5xx other than 507: the hub failing on its side, possibly after the write.
 * Anything else (403, 404, 409, 413, 415, 429, 507) is a refusal that stored
 * nothing — the only case in which an upload made for the row may be deleted.
 */
export function outcomeUnknown(e) {
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return true;
  const status = Number(e?.status) || 0;
  // Up to 400: no answer, a 2xx whose body could not be read as a result, or a 400.
  return status <= 400 || (status >= 500 && status !== 507);
}

/**
 * The line a failed write shows ("Refused, gone, or failed: which line"), from
 * the error's `status` / `code` — never the hub's text. On the versioned-records
 * endpoint a 404 is a record no longer there and a 409 a record changed (or
 * retired) since this tab read it.
 */
export function failureLine(e, { action, thing } = {}) {
  if (e?.forUser) return e.message;
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return `That ${thing} already exists.`;
  if (e?.status === 403) return `You don’t have permission to ${action}.`;
  if (e?.status === 507) return "The household’s storage is full — free up space first.";
  if (e?.status === 404) return `This ${thing} has been removed.`;
  if (e?.status === 409) return `This ${thing} was changed by someone else — check it first.`;
  if (e?.status === 429) return "Too many tries — wait a minute and try again.";
  return `Couldn’t ${action} — try again.`;
}

/** The line a failed file upload shows: the upload's own refusals first. */
export function uploadFailureLine(e) {
  if (e?.status === 413) return "That file is too large.";
  if (e?.status === 415) return "That kind of file can’t be uploaded.";
  return failureLine(e, { action: "attach that file", thing: "file" });
}
