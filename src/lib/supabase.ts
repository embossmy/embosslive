import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  // Don't throw at import; pages may render setup hints.
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(url ?? "", anon ?? "", {
  realtime: { params: { eventsPerSecond: 10 } },
});

export type OrderStatus =
  | "waiting"
  | "engraving"
  | "ready"
  | "collected"
  | "issue"
  | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  waiting: "Order received",
  engraving: "Now engraving",
  ready: "Ready for collection",
  collected: "Collected",
  issue: "Please speak to our crew",
  cancelled: "Cancelled",
};

export const STATUS_STEPS: OrderStatus[] = [
  "waiting",
  "engraving",
  "ready",
  "collected",
];

export interface EmbossEvent {
  id: string;
  event_name: string;
  client_name: string | null;
  event_date: string | null;
  venue: string | null;
  product_name: string | null;
  status: string;
  crew_password: string | null;
  created_at: string;
}

export interface EventTemplate {
  id: string;
  event_id: string;
  product_image_url: string | null;
  intro_image_url: string | null;
  welcome_title: string | null;
  welcome_subtitle: string | null;
  available_colours: string[] | null;
  available_fonts: string[] | null;
  preview_name_x: number;
  preview_name_y: number;
  preview_name_size: number;
  preview_name_colour: string;
  preview_name_rotation: number | null;
  preview_name_tilt_x: number | null;
  preview_name_tilt_y: number | null;
  max_name_length: number;
  start_button_text: string | null;
  start_button_bg: string | null;
  start_button_text_color: string | null;
  start_button_shape: "rect" | "pill" | "circle" | null;
  start_button_radius: number | null;
  start_button_width: number | null;
  start_button_height: number | null;
  start_button_font_size: number | null;
  start_button_pos_x: number | null;
  start_button_pos_y: number | null;
  start_button_font: string | null;
  minutes_per_order: number | null;
  auto_reset_enabled: boolean | null;
  auto_reset_seconds: number | null;
  // Door-gift dropoff step (optional)
  gift_required: boolean | null;
  gift_items: string[] | null;
  // Second engraving text (optional)
  name2_enabled: boolean | null;
  name2_label: string | null;
  preview_name2_x: number | null;
  preview_name2_y: number | null;
  preview_name2_size: number | null;
  preview_name2_colour: string | null;
  preview_name2_rotation: number | null;
  preview_name2_tilt_x: number | null;
  preview_name2_tilt_y: number | null;
}

export interface Order {
  id: string;
  event_id: string;
  queue_number: string;
  guest_name: string;
  guest_name2: string | null;
  gift_received: boolean | null;
  gift_items_selected: string[] | null;
  gift_items_received: string[] | null;
  selected_font: string | null;
  selected_colour: string | null;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  engraving_started_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
}
