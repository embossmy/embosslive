-- Migration 010: Guest ID capture + optional "thank you" confirmation (no QR) per event.
-- Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists guest_id_required boolean default false,
  add column if not exists hide_qr_after_submit boolean default false;

alter table orders
  add column if not exists guest_id text;

-- Enable for the C1MY event only.
update event_templates
set guest_id_required = true,
    hide_qr_after_submit = true
where event_id = 'ea47fe32-5dd4-4de2-bcee-4ea4282bad5e';
