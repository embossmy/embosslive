-- Migration 003: Add rotation and perspective tilt to engraving preview.
-- Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists preview_name_rotation numeric default 0,
  add column if not exists preview_name_tilt_x   numeric default 0,
  add column if not exists preview_name_tilt_y   numeric default 0;
