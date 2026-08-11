import { describe, it, expect } from "vitest";
import {
  CATEGORIES, categoryFor, daysUntil, expiryStatus, expiryLabel, EXPIRY_SOON_DAYS,
  visibleRecords, validateRecord, CHILD_INFO_FIELDS, groupedChildInfo,
  isChildInfoEmpty, fmtBytes, searchableFields,
} from "../src/logic.js";

const TODAY = "2026-07-19";
const rec = (over = {}) => ({
  id: "r1", title: "Passport", category: "identity", child_id: "kid-1",
  note: "In the safe", expires_on: null, file_id: null,
  created_at: "2026-01-01T00:00:00Z", ...over,
});

describe("categoryFor", () => {
  it("resolves every declared category", () => {
    for (const c of CATEGORIES) expect(categoryFor(c.id).id).toBe(c.id);
  });
  it("falls back to 'other' for unknown ids", () => {
    expect(categoryFor("nope").id).toBe("other");
    expect(categoryFor(undefined).id).toBe("other");
  });
});

describe("daysUntil", () => {
  it("is signed and inclusive of whole days", () => {
    expect(daysUntil("2026-07-19", "2026-07-19")).toBe(0);
    expect(daysUntil("2026-07-19", "2026-07-20")).toBe(1);
    expect(daysUntil("2026-07-19", "2026-07-18")).toBe(-1);
  });
  it("crosses months and years", () => {
    expect(daysUntil("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysUntil("2026-02-28", "2026-03-01")).toBe(1);   // 2026 is not a leap year
    expect(daysUntil("2024-02-28", "2024-03-01")).toBe(2);   // 2024 is
  });
});

describe("expiryStatus / expiryLabel", () => {
  it("reports nothing for a record with no expiry", () => {
    expect(expiryStatus(rec(), TODAY)).toBe("none");
    expect(expiryLabel(rec(), TODAY)).toBe("");
  });
  it("treats today as expiring, not expired", () => {
    const r = rec({ expires_on: TODAY });
    expect(expiryStatus(r, TODAY)).toBe("soon");
    expect(expiryLabel(r, TODAY)).toBe("Expires today");
  });
  it("marks yesterday as expired", () => {
    const r = rec({ expires_on: "2026-07-18" });
    expect(expiryStatus(r, TODAY)).toBe("expired");
    expect(expiryLabel(r, TODAY)).toBe("Expired 1 day ago");
  });
  it("draws the 'soon' boundary at exactly EXPIRY_SOON_DAYS", () => {
    const onEdge  = rec({ expires_on: "2026-09-02" });   // +45
    const justOut = rec({ expires_on: "2026-09-03" });   // +46
    expect(daysUntil(TODAY, onEdge.expires_on)).toBe(EXPIRY_SOON_DAYS);
    expect(expiryStatus(onEdge, TODAY)).toBe("soon");
    expect(expiryStatus(justOut, TODAY)).toBe("ok");
    expect(expiryLabel(justOut, TODAY)).toBe("");
  });
  it("pluralises correctly", () => {
    expect(expiryLabel(rec({ expires_on: "2026-07-20" }), TODAY)).toBe("Expires in 1 day");
    expect(expiryLabel(rec({ expires_on: "2026-07-21" }), TODAY)).toBe("Expires in 2 days");
    expect(expiryLabel(rec({ expires_on: "2026-07-17" }), TODAY)).toBe("Expired 2 days ago");
  });
});

describe("visibleRecords", () => {
  const expired = rec({ id: "expired", title: "Old card", expires_on: "2026-06-01", created_at: "2026-01-01T00:00:00Z" });
  const soon    = rec({ id: "soon",    title: "Insurance", expires_on: "2026-08-01", created_at: "2026-01-01T00:00:00Z" });
  const soonest = rec({ id: "soonest", title: "Permit",    expires_on: "2026-07-25", created_at: "2026-01-01T00:00:00Z" });
  const newish  = rec({ id: "newish",  title: "Consent form", created_at: "2026-05-01T00:00:00Z" });
  const older   = rec({ id: "older",   title: "Agreement",    created_at: "2026-02-01T00:00:00Z" });
  const all = [newish, soon, older, expired, soonest];

  it("floats expiring records above the rest, soonest first", () => {
    expect(visibleRecords(all, {}, TODAY).map(r => r.id))
      .toEqual(["expired", "soonest", "soon", "newish", "older"]);
  });

  it("sorts non-expiring records newest first", () => {
    expect(visibleRecords([older, newish], {}, TODAY).map(r => r.id)).toEqual(["newish", "older"]);
  });

  it("filters by child, treating whole-family records as their own bucket", () => {
    const family = rec({ id: "family", child_id: null });
    const other  = rec({ id: "other",  child_id: "kid-2" });
    const set = [rec({ id: "mine" }), family, other];
    expect(visibleRecords(set, { childId: "kid-1" }, TODAY).map(r => r.id)).toEqual(["mine"]);
    expect(visibleRecords(set, { childId: "kid-2" }, TODAY).map(r => r.id)).toEqual(["other"]);
    expect(visibleRecords(set, { childId: "all" }, TODAY)).toHaveLength(3);
  });

  it("filters by category", () => {
    const set = [rec({ id: "a", category: "legal" }), rec({ id: "b", category: "medical" })];
    expect(visibleRecords(set, { category: "legal" }, TODAY).map(r => r.id)).toEqual(["a"]);
    expect(visibleRecords(set, { category: "all" }, TODAY)).toHaveLength(2);
  });

  it("combines filters and handles missing input", () => {
    const set = [rec({ id: "hit", category: "legal", child_id: "kid-1", title: "Custody order" }),
                 rec({ id: "miss", category: "legal", child_id: "kid-2", title: "Custody order" })];
    expect(visibleRecords(set, { category: "legal", childId: "kid-1", query: "custody" }, TODAY)
      .map(r => r.id)).toEqual(["hit"]);
    expect(visibleRecords(undefined, {}, TODAY)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const set = [newish, expired];
    const before = set.map(r => r.id);
    visibleRecords(set, {}, TODAY);
    expect(set.map(r => r.id)).toEqual(before);
  });
});

describe("validateRecord", () => {
  const base = { title: "Passport", category: "identity", note: "In the safe" };

  it("accepts a well-formed record", () => {
    expect(validateRecord(base)).toEqual({ ok: true });
  });
  it("requires a title", () => {
    expect(validateRecord({ ...base, title: "   " }).ok).toBe(false);
    expect(validateRecord({ ...base, title: "x".repeat(201) }).ok).toBe(false);
  });
  it("requires a known category", () => {
    expect(validateRecord({ ...base, category: "made-up" }).ok).toBe(false);
    expect(validateRecord({ ...base, category: undefined }).ok).toBe(false);
  });
  it("requires either a file or a note", () => {
    expect(validateRecord({ ...base, note: "  " }).ok).toBe(false);
    expect(validateRecord({ ...base, note: "", file_id: "f1" }).ok).toBe(true);
  });
  it("rejects a malformed expiry but allows none", () => {
    expect(validateRecord({ ...base, expires_on: "07/19/2026" }).ok).toBe(false);
    expect(validateRecord({ ...base, expires_on: "2026-07-19" }).ok).toBe(true);
    expect(validateRecord({ ...base, expires_on: null }).ok).toBe(true);
  });
});

describe("child info helpers", () => {
  it("treats blank and missing rows as empty", () => {
    expect(isChildInfoEmpty(undefined)).toBe(true);
    expect(isChildInfoEmpty({})).toBe(true);
    expect(isChildInfoEmpty({ allergies: "   " })).toBe(true);
    expect(isChildInfoEmpty({ allergies: "Peanuts" })).toBe(false);
  });

  it("groups only populated fields, in declared order", () => {
    const groups = groupedChildInfo({ allergies: "Peanuts", shoe_size: "4", blood_type: "  " });
    expect(groups.map(g => g.group)).toEqual(["Medical", "Sizes"]);
    expect(groups[0].fields.map(f => f.key)).toEqual(["allergies"]);
    expect(groups[1].fields[0]).toMatchObject({ key: "shoe_size", value: "4" });
  });

  it("returns nothing for an empty row", () => {
    expect(groupedChildInfo({})).toEqual([]);
    expect(groupedChildInfo(null)).toEqual([]);
  });

  it("declares unique field keys", () => {
    const keys = CHILD_INFO_FIELDS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("fmtBytes", () => {
  it("scales units and rounds readably", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2.0 KB");
    expect(fmtBytes(1024 * 1024 * 1.4)).toBe("1.4 MB");
    expect(fmtBytes(1024 * 1024 * 15)).toBe("15 MB");
  });
  it("returns '' for nothing useful", () => {
    for (const bad of [0, -1, null, undefined, NaN, "abc"]) expect(fmtBytes(bad)).toBe("");
  });
});

describe("searchableFields", () => {
  it("matches on the note, not just the title", () => {
    expect(searchableFields(rec({ title: "Misc", note: "Ask the dentist" })))
      .toContain("Ask the dentist");
  });
});

// ── Versioning, retirement, and the governed purge ───────────────────────────

import {
  liveRecords, retiredRecords, versionsOf, purgeStateFor, changedChildInfo,
} from "../src/logic.js";

describe("liveRecords / retiredRecords", () => {
  const live = { id: "a", title: "Live" };
  const gone = { id: "b", title: "Retired", retired_at: "2026-05-01T00:00:00Z" };
  const older = { id: "c", title: "Older", retired_at: "2026-01-01T00:00:00Z" };

  it("splits on the retirement timestamp rather than on absence", () => {
    expect(liveRecords([live, gone]).map(r => r.id)).toEqual(["a"]);
    // The retired record is still THERE — that is the whole point of a retire.
    expect(retiredRecords([live, gone, older]).map(r => r.id)).toEqual(["b", "c"]);
  });
  it("tolerates no records at all", () => {
    expect(liveRecords(undefined)).toEqual([]);
    expect(retiredRecords(null)).toEqual([]);
  });
});

describe("versionsOf", () => {
  const record = { id: "r1", version: 3, title: "Custody agreement", file_id: "f3" };
  const versions = [
    { id: "v1", record_id: "r1", version: 1, file_id: "f1", superseded_at: "2026-01-01T00:00:00Z" },
    { id: "v2", record_id: "r1", version: 2, file_id: "f2", superseded_at: "2026-02-01T00:00:00Z" },
    { id: "vX", record_id: "other", version: 1, file_id: "fx", superseded_at: "2026-02-01T00:00:00Z" },
  ];

  it("lists the row in force first, then earlier versions newest-first", () => {
    expect(versionsOf(record, versions).map(v => v.version)).toEqual([3, 2, 1]);
    expect(versionsOf(record, versions)[0].current).toBe(true);
  });
  it("keeps every version's own file id — the bytes are what history is for", () => {
    expect(versionsOf(record, versions).map(v => v.file_id)).toEqual(["f3", "f2", "f1"]);
  });
  it("never mixes in another record's versions", () => {
    expect(versionsOf(record, versions).some(v => v.file_id === "fx")).toBe(false);
  });
});

describe("purgeStateFor", () => {
  const pending = { id: "p1", record_id: "r1", status: "pending", updated_at: "2026-03-02T00:00:00Z" };
  const declined = { id: "p0", record_id: "r1", status: "declined", updated_at: "2026-03-01T00:00:00Z" };

  it("reports nothing when no proposal is open", () => {
    expect(purgeStateFor("r1", [declined]).state).toBe("none");
    expect(purgeStateFor("r1", []).state).toBe("none");
  });
  it("reports a pending proposal without guessing whose turn it is", () => {
    const state = purgeStateFor("r1", [declined, pending]);
    expect(state.state).toBe("pending");
    expect(state.row.id).toBe("p1");
  });
  it("ignores proposals about other records", () => {
    expect(purgeStateFor("r2", [pending]).state).toBe("none");
  });
});

describe("changedChildInfo", () => {
  it("sends only what actually changed", () => {
    const before = { shoe_size: "4", allergies: "Peanuts" };
    expect(changedChildInfo(before, { shoe_size: "5", allergies: "Peanuts" }))
      .toEqual({ shoe_size: "5" });
  });
  it("treats cleared fields as null rather than empty string", () => {
    expect(changedChildInfo({ notes: "x" }, { notes: "" })).toEqual({ notes: null });
  });
  it("is empty when nothing moved, so no version is burned on a no-op", () => {
    expect(changedChildInfo({ a: "1" }, { a: "1" })).toEqual({});
    // An absent previous value and a null new one are the same fact.
    expect(changedChildInfo({}, { a: null })).toEqual({});
  });
  it("treats a first card as all-new", () => {
    expect(changedChildInfo(undefined, { shoe_size: "4" })).toEqual({ shoe_size: "4" });
  });
});
