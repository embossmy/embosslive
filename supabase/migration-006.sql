-- Migration 006: Per-event engrave-time estimate for guest ETA + admin wait time.
-- Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists minutes_per_order numeric default 5; -- minutes to engrave one item for this event's door gift
