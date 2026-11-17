-- Migration 012: Guest-selectable engraving text colour / finish.
-- Admin lists options (label + value, where value is a hex colour or a finish
-- keyword like "gold-foil"); guests pick one on the personalization form.
-- Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists text_finishes jsonb default '[]'::jsonb,
  -- Background behind each option on the guest picker (colour and/or image).
  add column if not exists finish_swatch_bg text default '#4A5A50',
  add column if not exists finish_swatch_image_url text;

alter table orders
  add column if not exists text_finish text;
