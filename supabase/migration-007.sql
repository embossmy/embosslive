-- Migration 007: Auto-reset (kiosk) — admin can enable/disable and choose duration.
-- Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists auto_reset_enabled boolean default false, -- whether the confirmation screen auto-returns to the start
  add column if not exists auto_reset_seconds integer default 30;     -- countdown in seconds before auto-reset
