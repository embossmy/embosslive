-- Migration 009: Letters-only name restriction per event.
-- Run in Supabase SQL editor. Idempotent.

-- ---- event_templates: letters-only flag ----
alter table event_templates
  -- When true, the guest name input only accepts letters and spaces.
  -- Digits and symbols are blocked on the guest kiosk page.
  add column if not exists name_letters_only boolean default false;
