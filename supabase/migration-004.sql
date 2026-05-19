-- Migration 004: Per-event Start button customization on welcome screen.
-- Run in Supabase SQL editor. Idempotent.

alter table event_templates
  add column if not exists start_button_text         text    default 'Start',
  add column if not exists start_button_bg           text    default '#3B2A1A',
  add column if not exists start_button_text_color   text    default '#FBF8F3',
  add column if not exists start_button_shape        text    default 'rect',  -- 'rect' | 'pill' | 'circle'
  add column if not exists start_button_radius       numeric default 16,      -- px (used when shape='rect')
  add column if not exists start_button_width        numeric default 240,     -- px; 0 = auto
  add column if not exists start_button_height       numeric default 72,      -- px
  add column if not exists start_button_font_size    numeric default 22,      -- px
  add column if not exists start_button_pos_x        numeric default 50,      -- % from left, button center
  add column if not exists start_button_pos_y        numeric default 85,      -- % from top, button center
  add column if not exists start_button_font         text    default '';      -- font option string (e.g. 'Modern', 'Signature:Dancing Script*i'); empty = default UI font
