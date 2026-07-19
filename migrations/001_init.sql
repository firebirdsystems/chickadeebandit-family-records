-- Family Records — initial schema.
-- Tables are prefixed app_family_records__ (hyphens in the app id become
-- underscores). IDs are TEXT, generated client-side with crypto.randomUUID().
-- Row-level access is enforced by row_policies in manifest.json, NOT here.
--
-- Both tables are adult_only: this is the custody agreement, the insurance
-- card, and the pediatrician's phone number. In a co-parenting space that means
-- both parents read and write everything — they are both adults in the space —
-- while children in either home household see none of it. That is the intended
-- model; there is deliberately no per-uploader ACL, because "my documents" is
-- the wrong shape for a shared record of a shared child.

-- A record: an uploaded file, a reference with no file, or both.
--   record_kind  'document' (has file_id) | 'reference' (a note/number only)
--   category     plaintext enum, used by the glance subtitle and filters
--   child_id     the child this concerns; NULL = applies to the whole family
--   expires_on   'YYYY-MM-DD', plaintext so the glance can compare it to :today
--   file_id      R2 file id from files.upload(); NULL for a reference
CREATE TABLE IF NOT EXISTS app_family_records__records (
  id          TEXT NOT NULL PRIMARY KEY,
  title       TEXT NOT NULL,
  record_kind TEXT NOT NULL DEFAULT 'document',
  category    TEXT NOT NULL DEFAULT 'other',
  child_id    TEXT,
  note        TEXT,
  expires_on  TEXT,
  file_id     TEXT,
  mime_type   TEXT,
  size_bytes  INTEGER,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- The "everything a caregiver asks for" card, one row per child.
-- child_id is the PRIMARY KEY so the one-row-per-child rule is enforced by the
-- database rather than by hopeful client code.
CREATE TABLE IF NOT EXISTS app_family_records__child_info (
  child_id      TEXT NOT NULL PRIMARY KEY,
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
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS app_family_records__records_child_idx
  ON app_family_records__records (child_id);
CREATE INDEX IF NOT EXISTS app_family_records__records_expiry_idx
  ON app_family_records__records (expires_on);
