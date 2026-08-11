-- Family Records — write integrity for the vault.
--
-- Before this migration both tables were adult_only, which grants every adult
-- in the space full UPDATE and DELETE. In a co-parenting space that meant two
-- separate problems wearing one coat: a supporting adult admitted so they could
-- SEE the custody agreement could also replace or delete it, and either parent
-- could destroy a document unilaterally — the last record-bearing surface where
-- that was still true.
--
-- The fix is not a confirmation dialog. Both tables become endpoint-written
-- (`versioned_records` in the manifest), replacement keeps what it replaced —
-- the row AND the file it pointed at — and deletion becomes a retirement
-- timestamp. Destroying the bytes early takes both parents: it is an agreement,
-- and the tables at the bottom of this file are the ones that carry it.

-- ── The current record, plus what it takes to version and retire it ──────────
--   version     bumped on every replace; the optimistic-concurrency token
--   retired_at  soft retirement. NULL means live. Nothing is ever deleted here.
ALTER TABLE app_family_records__records ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_family_records__records ADD COLUMN retired_at TEXT;
ALTER TABLE app_family_records__records ADD COLUMN retired_by TEXT;
ALTER TABLE app_family_records__records ADD COLUMN retire_reason TEXT;

-- Every superseded version of a record, with the file it carried. The file id
-- is the point: a version row without it keeps the metadata of a document and
-- loses the document. The bytes stay served from the same /api/files url they
-- always were, because nothing deleted them.
CREATE TABLE IF NOT EXISTS app_family_records__record_versions (
  id            TEXT NOT NULL PRIMARY KEY,
  record_id     TEXT NOT NULL,
  version       INTEGER NOT NULL,
  superseded_at TEXT NOT NULL,
  superseded_by TEXT,
  title         TEXT,
  record_kind   TEXT,
  category      TEXT,
  child_id      TEXT,
  note          TEXT,
  expires_on    TEXT,
  file_id       TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER,
  created_by    TEXT,
  created_at    TEXT,
  updated_at    TEXT
);

-- ── Child info: versioned, never governed ───────────────────────────────────
-- Sizes, allergies and phone numbers change weekly. Countersigning a shoe size
-- would kill the daily utility this card exists for, so any adult still writes
-- it — but every write now keeps the previous card with the name of whoever
-- changed it, which is what makes a supporting adult's edit safe rather than
-- dangerous.
ALTER TABLE app_family_records__child_info ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS app_family_records__child_info_versions (
  id            TEXT NOT NULL PRIMARY KEY,
  child_id      TEXT NOT NULL,
  version       INTEGER NOT NULL,
  superseded_at TEXT NOT NULL,
  superseded_by TEXT,
  blood_type    TEXT,
  allergies     TEXT,
  medications   TEXT,
  doctor_name   TEXT,
  doctor_phone  TEXT,
  dentist_name  TEXT,
  dentist_phone TEXT,
  school_name   TEXT,
  school_phone  TEXT,
  teacher_name  TEXT,
  shirt_size    TEXT,
  pants_size    TEXT,
  shoe_size     TEXT,
  notes         TEXT,
  updated_by    TEXT,
  updated_at    TEXT
);

-- ── Destroying the bytes early takes both parents ───────────────────────────
-- The proposal (written only by POST /api/propose-agreement) and the agreement
-- it becomes. Party columns hold HOUSEHOLD ids, resolved server-side from who
-- currently stewards each home — which is why no app SQL may write either
-- table, and why a supporting adult can read a proposal and never sign one.
CREATE TABLE IF NOT EXISTS app_family_records__record_purges (
  id                TEXT NOT NULL PRIMARY KEY,
  household_a_id    TEXT,
  household_b_id    TEXT,
  record_id         TEXT NOT NULL,
  record_title      TEXT,
  reason            TEXT,
  proposed_by       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS app_family_records__record_purge_agreements (
  id                 TEXT NOT NULL PRIMARY KEY,
  household_a_id     TEXT,
  household_b_id     TEXT,
  household_a_agreed INTEGER NOT NULL DEFAULT 0,
  household_b_agreed INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending',
  record_id          TEXT,
  record_title       TEXT,
  reason             TEXT,
  proposed_by        TEXT,
  agreed_at          TEXT,
  updated_at         TEXT
);

-- Retention sweeps read the timestamp first, so it LEADS the index — a
-- (record_id, superseded_at) index would make the nightly cutoff scan.
CREATE INDEX IF NOT EXISTS app_family_records__record_versions_retention_idx
  ON app_family_records__record_versions (superseded_at, record_id);
CREATE INDEX IF NOT EXISTS app_family_records__record_versions_record_idx
  ON app_family_records__record_versions (record_id, version);
CREATE INDEX IF NOT EXISTS app_family_records__child_info_versions_retention_idx
  ON app_family_records__child_info_versions (superseded_at, child_id);
CREATE INDEX IF NOT EXISTS app_family_records__child_info_versions_child_idx
  ON app_family_records__child_info_versions (child_id, version);
CREATE INDEX IF NOT EXISTS app_family_records__record_purges_record_idx
  ON app_family_records__record_purges (record_id);
CREATE INDEX IF NOT EXISTS app_family_records__record_purge_agreements_status_idx
  ON app_family_records__record_purge_agreements (status, record_id);
