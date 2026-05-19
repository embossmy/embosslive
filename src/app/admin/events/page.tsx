"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase, type EmbossEvent, type EventTemplate } from "@/lib/supabase";
import {
  encodeColour,
  encodeFont,
  fontClassFor,
  fontStyleFor,
  nameTransform,
  parseColour,
  parseFont,
  startButtonStyle,
} from "@/lib/utils";
import GoogleFontsLoader from "@/components/GoogleFontsLoader";

interface FormState {
  event_name: string;
  client_name: string;
  event_date: string;
  venue: string;
  product_name: string;
  product_image_url: string;
  intro_image_url: string;
  welcome_title: string;
  welcome_subtitle: string;
  crew_password: string;
  available_colours: string; // comma sep
  available_fonts: string; // comma sep
  preview_name_x: number;
  preview_name_y: number;
  preview_name_size: number;
  preview_name_colour: string;
  preview_name_rotation: number;
  preview_name_tilt_x: number;
  preview_name_tilt_y: number;
  max_name_length: number;
  start_button_text: string;
  start_button_bg: string;
  start_button_text_color: string;
  start_button_shape: "rect" | "pill" | "circle";
  start_button_radius: number;
  start_button_width: number;
  start_button_height: number;
  start_button_font_size: number;
  start_button_pos_x: number;
  start_button_pos_y: number;
  start_button_font: string;
  minutes_per_order: number;
  auto_reset_enabled: boolean;
  auto_reset_seconds: number;
  status: "active" | "inactive";
}

const empty: FormState = {
  event_name: "",
  client_name: "",
  event_date: "",
  venue: "",
  product_name: "",
  product_image_url: "",
  intro_image_url: "",
  welcome_title: "",
  welcome_subtitle: "",
  crew_password: "",
  available_colours: "Natural Oak, Walnut, Ebony",
  available_fonts: "",
  preview_name_x: 50,
  preview_name_y: 55,
  preview_name_size: 36,
  preview_name_colour: "#3B2A1A",
  preview_name_rotation: 0,
  preview_name_tilt_x: 0,
  preview_name_tilt_y: 0,
  max_name_length: 20,
  start_button_text: "Start",
  start_button_bg: "#3B2A1A",
  start_button_text_color: "#FBF8F3",
  start_button_shape: "rect",
  start_button_radius: 16,
  start_button_width: 240,
  start_button_height: 72,
  start_button_font_size: 22,
  start_button_pos_x: 50,
  start_button_pos_y: 85,
  start_button_font: "",
  minutes_per_order: 5,
  auto_reset_enabled: false,
  auto_reset_seconds: 30,
  status: "active",
};

export default function EventsAdminPage() {
  const [events, setEvents] = useState<EmbossEvent[]>([]);
  const [templates, setTemplates] = useState<Record<string, EventTemplate>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ---------- Form-level undo / redo (Ctrl+Z / Ctrl+Y) ----------
  const historyRef = useRef<{ past: FormState[]; future: FormState[] }>({
    past: [],
    future: [],
  });
  const isApplyingRef = useRef(false); // true while applying an undo/redo
  const lastSnapshotRef = useRef<FormState>(form);
  const snapshotTimerRef = useRef<number | null>(null);
  const [historySizes, setHistorySizes] = useState({ past: 0, future: 0 });

  function refreshHistorySizes() {
    setHistorySizes({
      past: historyRef.current.past.length,
      future: historyRef.current.future.length,
    });
  }

  // Debounce-record snapshots so a burst of keystrokes becomes a single undo step.
  useEffect(() => {
    if (isApplyingRef.current) {
      isApplyingRef.current = false;
      lastSnapshotRef.current = form;
      return;
    }
    if (snapshotTimerRef.current) window.clearTimeout(snapshotTimerRef.current);
    const prev = lastSnapshotRef.current;
    snapshotTimerRef.current = window.setTimeout(() => {
      if (prev === form) return;
      historyRef.current.past.push(prev);
      if (historyRef.current.past.length > 100) historyRef.current.past.shift();
      historyRef.current.future = [];
      lastSnapshotRef.current = form;
      refreshHistorySizes();
    }, 400);
  }, [form]);

  function resetHistory(initial: FormState) {
    historyRef.current = { past: [], future: [] };
    lastSnapshotRef.current = initial;
    if (snapshotTimerRef.current) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    refreshHistorySizes();
  }

  function undo() {
    // Flush any pending snapshot first so the current state is recoverable.
    if (snapshotTimerRef.current) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
      const prev = lastSnapshotRef.current;
      if (prev !== form) {
        historyRef.current.past.push(prev);
        lastSnapshotRef.current = form;
      }
    }
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const target = h.past.pop()!;
    h.future.push(form);
    isApplyingRef.current = true;
    setForm(target);
    refreshHistorySizes();
  }

  function redo() {
    if (snapshotTimerRef.current) {
      window.clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const target = h.future.pop()!;
    h.past.push(form);
    isApplyingRef.current = true;
    setForm(target);
    refreshHistorySizes();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  async function load() {
    const { data: evs } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });
    setEvents((evs as EmbossEvent[]) ?? []);
    const { data: tpls } = await supabase.from("event_templates").select("*");
    const map: Record<string, EventTemplate> = {};
    for (const t of (tpls as EventTemplate[]) ?? []) {
      if (!map[t.event_id]) map[t.event_id] = t;
    }
    setTemplates(map);
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setEditingId(null);
    isApplyingRef.current = true;
    setForm(empty);
    resetHistory(empty);
  }

  function startEdit(ev: EmbossEvent) {
    const t = templates[ev.id];
    setEditingId(ev.id);
    const next: FormState = {
      event_name: ev.event_name,
      client_name: ev.client_name ?? "",
      event_date: ev.event_date ?? "",
      venue: ev.venue ?? "",
      product_name: ev.product_name ?? "",
      product_image_url: t?.product_image_url ?? "",
      intro_image_url: t?.intro_image_url ?? "",
      welcome_title: t?.welcome_title ?? "",
      welcome_subtitle: t?.welcome_subtitle ?? "",
      crew_password: ev.crew_password ?? "",
      available_colours: (t?.available_colours ?? []).join(", "),
      available_fonts: (t?.available_fonts ?? []).join(", "),
      preview_name_x: Number(t?.preview_name_x ?? 50),
      preview_name_y: Number(t?.preview_name_y ?? 55),
      preview_name_size: Number(t?.preview_name_size ?? 36),
      preview_name_colour: t?.preview_name_colour ?? "#3B2A1A",
      preview_name_rotation: Number(t?.preview_name_rotation ?? 0),
      preview_name_tilt_x: Number(t?.preview_name_tilt_x ?? 0),
      preview_name_tilt_y: Number(t?.preview_name_tilt_y ?? 0),
      max_name_length: Number(t?.max_name_length ?? 20),
      start_button_text: t?.start_button_text ?? "Start",
      start_button_bg: t?.start_button_bg ?? "#3B2A1A",
      start_button_text_color: t?.start_button_text_color ?? "#FBF8F3",
      start_button_shape:
        (t?.start_button_shape as "rect" | "pill" | "circle" | null) ?? "rect",
      start_button_radius: Number(t?.start_button_radius ?? 16),
      start_button_width: Number(t?.start_button_width ?? 240),
      start_button_height: Number(t?.start_button_height ?? 72),
      start_button_font_size: Number(t?.start_button_font_size ?? 22),
      start_button_pos_x: Number(t?.start_button_pos_x ?? 50),
      start_button_pos_y: Number(t?.start_button_pos_y ?? 85),
      start_button_font: t?.start_button_font ?? "",
      minutes_per_order: Number(t?.minutes_per_order ?? 5),
      auto_reset_enabled: Boolean(t?.auto_reset_enabled ?? false),
      auto_reset_seconds: Number(t?.auto_reset_seconds ?? 30),
      status: (ev.status as "active" | "inactive") ?? "active",
    };
    isApplyingRef.current = true;
    setForm(next);
    resetHistory(next);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      // If marking active, deactivate others
      if (form.status === "active") {
        await supabase
          .from("events")
          .update({ status: "inactive" })
          .neq("id", editingId ?? "00000000-0000-0000-0000-000000000000");
      }

      const eventPayload = {
        event_name: form.event_name,
        client_name: form.client_name || null,
        event_date: form.event_date || null,
        venue: form.venue || null,
        product_name: form.product_name || null,
        status: form.status,
        crew_password: form.crew_password || null,
      };

      let evId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from("events")
          .update(eventPayload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("events")
          .insert(eventPayload)
          .select("id")
          .single();
        if (error) throw error;
        evId = (data as { id: string }).id;
      }

      const tplPayload = {
        event_id: evId,
        product_image_url: form.product_image_url || null,
        intro_image_url: form.intro_image_url || null,
        welcome_title: form.welcome_title || null,
        welcome_subtitle: form.welcome_subtitle || null,
        available_colours: splitList(form.available_colours),
        available_fonts: splitList(form.available_fonts),
        preview_name_x: form.preview_name_x,
        preview_name_y: form.preview_name_y,
        preview_name_size: form.preview_name_size,
        preview_name_colour: form.preview_name_colour,
        preview_name_rotation: form.preview_name_rotation,
        preview_name_tilt_x: form.preview_name_tilt_x,
        preview_name_tilt_y: form.preview_name_tilt_y,
        max_name_length: form.max_name_length,
        start_button_text: form.start_button_text || "Start",
        start_button_bg: form.start_button_bg,
        start_button_text_color: form.start_button_text_color,
        start_button_shape: form.start_button_shape,
        start_button_radius: form.start_button_radius,
        start_button_width: form.start_button_width,
        start_button_height: form.start_button_height,
        start_button_font_size: form.start_button_font_size,
        start_button_pos_x: form.start_button_pos_x,
        start_button_pos_y: form.start_button_pos_y,
        start_button_font: form.start_button_font || null,
        minutes_per_order: form.minutes_per_order,
        auto_reset_enabled: form.auto_reset_enabled,
        auto_reset_seconds: form.auto_reset_seconds,
      };

      if (evId && templates[evId]) {
        const { error } = await supabase
          .from("event_templates")
          .update(tplPayload)
          .eq("id", templates[evId].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_templates").insert(tplPayload);
        if (error) throw error;
      }

      setMsg("Saved.");
      await load();
      if (!editingId && evId) setEditingId(evId);
    } catch (e: any) {
      setMsg(`Error: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(ev: EmbossEvent) {
    if (!confirm(`Delete event "${ev.event_name}" and all its orders?`)) return;
    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    if (error) {
      setMsg(`Error: ${error.message}`);
      return;
    }
    if (editingId === ev.id) startNew();
    await load();
  }

  return (
    <main className="min-h-screen p-4 md:p-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-sand/50">
        <div>
          <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-1">EMBOSS · Setup</p>
          <h1 className="font-serif text-2xl md:text-3xl">Event Templates</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-secondary !py-2 !text-sm">
            ← Dashboard
          </Link>
          <button className="btn-primary !py-2 !text-sm" onClick={startNew}>
            + New Event
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="card p-4 lg:col-span-1">
          <h2 className="font-serif text-xl mb-3">Events</h2>
          <ul className="space-y-2">
            {events.length === 0 && (
              <li className="text-sm text-mocha/60 text-center py-6 italic">No events yet.</li>
            )}
            {events.map((e) => (
              <li
                key={e.id}
                className={`p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                  editingId === e.id
                    ? "border-gold bg-champagne/30 shadow-sm"
                    : "border-sand bg-white hover:border-mocha/30 hover:bg-champagne/10"
                }`}
                onClick={() => startEdit(e)}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-ink truncate">{e.event_name}</p>
                      {e.status === "active" && (
                        <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    {e.event_date && (
                      <p className="text-xs text-mocha/60 mt-0.5">{e.event_date}</p>
                    )}
                  </div>
                  <button
                    className="text-[11px] text-red-400 hover:text-red-700 transition-colors shrink-0 px-1"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      remove(e);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Link
                    onClick={(ev) => ev.stopPropagation()}
                    className="text-[10px] bg-sand/50 hover:bg-champagne text-mocha px-2 py-1 rounded-md transition-colors"
                    href={`/event/${e.id}`}
                  >
                    Guest ↗
                  </Link>
                  <Link
                    onClick={(ev) => ev.stopPropagation()}
                    className="text-[10px] bg-sand/50 hover:bg-champagne text-mocha px-2 py-1 rounded-md transition-colors"
                    href={`/collection/${e.id}`}
                  >
                    Collection ↗
                  </Link>
                  <button
                    className="text-[10px] bg-sand/50 hover:bg-champagne text-mocha px-2 py-1 rounded-md transition-colors"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      const url = `${window.location.origin}/event/${e.id}`;
                      navigator.clipboard.writeText(url);
                      setMsg(`Copied guest URL`);
                    }}
                  >
                    Copy URL
                  </button>
                  <button
                    className="text-[10px] bg-sand/50 hover:bg-champagne text-mocha px-2 py-1 rounded-md transition-colors"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      navigator.clipboard.writeText(e.id);
                      setMsg(`Copied event ID`);
                    }}
                  >
                    Copy ID
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="card p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-5">
            <h2 className="font-serif text-2xl">
              {editingId ? "Edit Event" : "New Event"}
            </h2>
            {editingId && (
              <span className="text-[10px] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full bg-gold/10 text-gold border border-gold/30">
                Editing
              </span>
            )}
          </div>
          <div className="border-t border-sand/50 mb-5" />
          <div className="space-y-4">

            {/* ============ 1. EVENT BASICS ============ */}
            <Section
              title="Event basics"
              subtitle="Name, date, venue, status, and crew access"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Event name">
                  <input
                    className="input"
                    value={form.event_name}
                    onChange={(e) => setForm({ ...form, event_name: e.target.value })}
                  />
                </Field>
                <Field label="Client name">
                  <input
                    className="input"
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  />
                </Field>
                <Field label="Event date">
                  <input
                    type="date"
                    className="input"
                    value={form.event_date}
                    onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  />
                </Field>
                <Field label="Venue">
                  <input
                    className="input"
                    value={form.venue}
                    onChange={(e) => setForm({ ...form, venue: e.target.value })}
                  />
                </Field>
                <Field label="Product name">
                  <input
                    className="input"
                    value={form.product_name}
                    onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="input"
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as "active" | "inactive" })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
                <Field label="Crew password (per-event)" full>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. crew-sarah-2026"
                    value={form.crew_password}
                    onChange={(e) =>
                      setForm({ ...form, crew_password: e.target.value })
                    }
                  />
                  <p className="text-xs text-mocha mt-1">
                    Crew sign in with this password and only see this event.
                    Use a different password for each event so old crews lose access.
                  </p>
                </Field>
              </div>
            </Section>

            {/* ============ 2. WELCOME / INTRO SCREEN ============ */}
            <Section
              title="Welcome / intro screen"
              subtitle="What guests see before they tap Start"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Welcome title">
                  <input
                    className="input"
                    placeholder="(defaults to event name)"
                    value={form.welcome_title}
                    onChange={(e) =>
                      setForm({ ...form, welcome_title: e.target.value })
                    }
                  />
                </Field>
                <Field label="Welcome subtitle">
                  <input
                    className="input"
                    placeholder="(defaults to client name)"
                    value={form.welcome_subtitle}
                    onChange={(e) =>
                      setForm({ ...form, welcome_subtitle: e.target.value })
                    }
                  />
                </Field>
                <Field label="Intro screen background (3:4 or 9:16 image or video)" full>
                  <ImageField
                    value={form.intro_image_url}
                    onChange={(v) => setForm({ ...form, intro_image_url: v })}
                    onError={(m) => setMsg(`Error: ${m}`)}
                    pathPrefix="intro"
                    acceptVideo
                  />
                  <p className="text-xs text-mocha mt-1">
                    Shown full-bleed on the welcome screen before guests tap Start.
                    Designed by you (showing the doorgift, fonts available, where
                    the name will be engraved).
                  </p>
                </Field>
                <Field label="Start button" full>
                  <StartButtonEditor form={form} setForm={setForm} />
                </Field>
              </div>
            </Section>

            {/* ============ 3. PRODUCT & ENGRAVING PREVIEW ============ */}
            <Section
              title="Product & engraving preview"
              subtitle="Product image and where the engraved name appears"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Product image" full>
                  <ImageField
                    value={form.product_image_url}
                    onChange={(v) => setForm({ ...form, product_image_url: v })}
                    onError={(m) => setMsg(`Error: ${m}`)}
                    pathPrefix="product"
                  />
                </Field>
                <Field label="Engraving position & size — click on the preview to set X/Y" full>
                  <PositionPreview
                    imageUrl={form.product_image_url}
                    fontOption={
                      splitList(form.available_fonts)[0] || "Modern"
                    }
                    allFonts={splitList(form.available_fonts)}
                    colour={form.preview_name_colour}
                    x={form.preview_name_x}
                    y={form.preview_name_y}
                    size={form.preview_name_size}
                    rotation={form.preview_name_rotation}
                    tiltX={form.preview_name_tilt_x}
                    tiltY={form.preview_name_tilt_y}
                    onChangeXY={(nx, ny) =>
                      setForm((f) => ({
                        ...f,
                        preview_name_x: Math.round(nx),
                        preview_name_y: Math.round(ny),
                      }))
                    }
                  />
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <SliderField
                      label={`X: ${form.preview_name_x}%`}
                      min={0}
                      max={100}
                      value={form.preview_name_x}
                      onChange={(v) =>
                        setForm({ ...form, preview_name_x: v })
                      }
                    />
                    <SliderField
                      label={`Y: ${form.preview_name_y}%`}
                      min={0}
                      max={100}
                      value={form.preview_name_y}
                      onChange={(v) =>
                        setForm({ ...form, preview_name_y: v })
                      }
                    />
                    <SliderField
                      label={`Size: ${form.preview_name_size}px`}
                      min={10}
                      max={120}
                      value={form.preview_name_size}
                      onChange={(v) =>
                        setForm({ ...form, preview_name_size: v })
                      }
                    />
                    <SliderField
                      label={`Rotate: ${form.preview_name_rotation}°`}
                      min={-180}
                      max={180}
                      value={form.preview_name_rotation}
                      onChange={(v) =>
                        setForm({ ...form, preview_name_rotation: v })
                      }
                    />
                    <SliderField
                      label={`Tilt L/R: ${form.preview_name_tilt_x}°`}
                      min={-60}
                      max={60}
                      value={form.preview_name_tilt_x}
                      onChange={(v) =>
                        setForm({ ...form, preview_name_tilt_x: v })
                      }
                    />
                    <SliderField
                      label={`Tilt T/B: ${form.preview_name_tilt_y}°`}
                      min={-60}
                      max={60}
                      value={form.preview_name_tilt_y}
                      onChange={(v) =>
                        setForm({ ...form, preview_name_tilt_y: v })
                      }
                    />
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          preview_name_rotation: 0,
                          preview_name_tilt_x: 0,
                          preview_name_tilt_y: 0,
                        }))
                      }
                    >
                      Reset rotation & tilt
                    </button>
                  </div>
                </Field>
                <Field label="Preview text colour">
                  <input
                    type="color"
                    className="input h-12"
                    value={form.preview_name_colour}
                    onChange={(e) =>
                      setForm({ ...form, preview_name_colour: e.target.value })
                    }
                  />
                </Field>
                <Field label="Max name length">
                  <input
                    type="number"
                    className="input"
                    value={form.max_name_length}
                    onChange={(e) =>
                      setForm({ ...form, max_name_length: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
            </Section>

            {/* ============ 4. GUEST CHOICES ============ */}
            <Section
              title="Guest choices"
              subtitle="Colours and fonts guests can pick from"
            >
              <div className="space-y-4">
                <Field label="Available colours" full>
                  <ColoursEditor
                    value={form.available_colours}
                    onChange={(v) => setForm({ ...form, available_colours: v })}
                    onError={(m) => setMsg(`Error: ${m}`)}
                  />
                  <p className="text-xs text-mocha mt-2">
                    Add one row per colour. Pick a swatch colour, and optionally
                    upload a product image for that colour — the guest's preview
                    will swap to that image when they select it. Leave the colours
                    list empty if your event has no colour options.
                  </p>
                </Field>
                <Field label="Available fonts" full>
                  <FontsEditor
                    value={form.available_fonts}
                    onChange={(v) => setForm({ ...form, available_fonts: v })}
                  />
                  <p className="text-xs text-mocha mt-2">
                    Pick from built-ins (Modern, Elegant Script, Classic Serif,
                    Times New Roman, Lato, Alex Brush, Kunstler Script, Gabriola,
                    Jonnie Walker, Luxury Modish, Silkscreen) or add a custom
                    Google Font by entering its family name from{" "}
                    <a
                      className="underline"
                      href="https://fonts.google.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      fonts.google.com
                    </a>
                    .
                  </p>
                </Field>
              </div>
            </Section>

            {/* ============ 5. KIOSK & OPERATIONS ============ */}
            <Section
              title="Kiosk & operations"
              subtitle="Engrave-time estimate and kiosk auto-reset behaviour"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Minutes per order (engrave time estimate)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.minutes_per_order}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        minutes_per_order: Number(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-mocha mt-1">
                    Used to show guests an ETA and the crew an estimated wait time.
                    Set based on how long one unit of this event's door gift takes
                    to engrave.
                  </p>
                </Field>
                <Field label="Auto-reset confirmation screen (kiosk mode)" full>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.auto_reset_enabled}
                        onChange={(e) =>
                          setForm({ ...form, auto_reset_enabled: e.target.checked })
                        }
                      />
                      <span>Enable auto-reset</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-mocha">Countdown</span>
                      <input
                        className="input !py-1.5 !px-2 w-20"
                        type="number"
                        min={5}
                        max={300}
                        step={5}
                        disabled={!form.auto_reset_enabled}
                        value={form.auto_reset_seconds}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            auto_reset_seconds:
                              Math.max(5, Number(e.target.value) || 30),
                          })
                        }
                      />
                      <span className="text-mocha">seconds</span>
                    </label>
                  </div>
                  <p className="text-xs text-mocha mt-1">
                    When enabled, the guest confirmation screen returns to the
                    start automatically so the next guest can use the kiosk.
                  </p>
                </Field>
              </div>
            </Section>

          </div>

          {msg && (
            <p className={`text-sm mt-4 px-3 py-2 rounded-lg border ${
              msg.startsWith("Error")
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
            }`}>
              {msg}
            </p>
          )}
          <div className="sticky bottom-0 -mx-6 -mb-6 mt-6 border-t border-sand/60 bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/80 px-6 py-3 flex flex-wrap items-center gap-2 z-10 rounded-b-xl">
            <button
              type="button"
              className="btn-ghost !py-1.5 !px-3 text-sm"
              onClick={undo}
              disabled={historySizes.past === 0}
              title="Undo (Ctrl+Z)"
            >
              ↶ Undo
            </button>
            <button
              type="button"
              className="btn-ghost !py-1.5 !px-3 text-sm"
              onClick={redo}
              disabled={historySizes.future === 0}
              title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            >
              Redo ↷
            </button>
            <span className="flex-1" />
            <button
              type="button"
              className="btn-ghost !py-1.5 !px-3 text-sm"
              onClick={startNew}
            >
              Reset
            </button>
            <button
              className="btn-primary"
              disabled={busy || !form.event_name}
              onClick={save}
            >
              {busy ? "Saving…" : "Save Event"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-sand/70 bg-ivory/40 overflow-hidden open:bg-white/60 transition-colors"
    >
      <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-champagne/30 transition-colors">
        <div className="min-w-0">
          <h3 className="font-serif text-lg text-ink leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-xs text-mocha mt-0.5">{subtitle}</p>
          )}
        </div>
        <span
          className="text-mocha transition-transform group-open:rotate-180 shrink-0 text-lg"
          aria-hidden
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-sand/60 px-4 py-4 bg-white/70">
        {children}
      </div>
    </details>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const dec = () => onChange(clamp(Number((value - step).toFixed(4))));
  const inc = () => onChange(clamp(Number((value + step).toFixed(4))));
  return (
    <label className="block text-xs">
      <span className="text-mocha">{label}</span>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          aria-label="Decrease"
          className="shrink-0 w-7 h-7 rounded-md border border-sand bg-white text-ink leading-none flex items-center justify-center text-base font-medium hover:bg-champagne/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="block leading-none -mt-[1px]">&minus;</span>
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 min-w-0"
        />
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          aria-label="Increase"
          className="shrink-0 w-7 h-7 rounded-md border border-sand bg-white text-ink leading-none flex items-center justify-center text-base font-medium hover:bg-champagne/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="block leading-none -mt-[1px]">+</span>
        </button>
      </div>
    </label>
  );
}

// Hook: percent-based drag with translucent ghost + arrow-key nudging.
// - Pointer down on the element starts a drag; ghost follows the pointer until release.
// - Click on the container background places the element at that point.
// - When selected, ArrowKeys nudge by `step` (default 1%); Shift = `shiftStep` (default 5%).
function useDragPercent(opts: {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  step?: number;
  shiftStep?: number;
  round?: boolean;
}) {
  const { x, y, onChange, step = 1, shiftStep = 5, round = true } = opts;
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  function clamp(v: number) {
    return Math.max(0, Math.min(100, v));
  }
  function commit(nx: number, ny: number) {
    const cx = clamp(nx);
    const cy = clamp(ny);
    onChange(round ? Math.round(cx) : cx, round ? Math.round(cy) : cy);
  }
  function pctFromClient(clientX: number, clientY: number) {
    const el = containerRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp(((clientX - rect.left) / rect.width) * 100),
      y: clamp(((clientY - rect.top) / rect.height) * 100),
    };
  }

  function startDrag(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    setSelected(true);
    containerRef.current?.focus();
    draggedRef.current = false;
    setGhost({ x, y });
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev: PointerEvent) => {
      if (
        !draggedRef.current &&
        Math.hypot(ev.clientX - startX, ev.clientY - startY) > 2
      ) {
        draggedRef.current = true;
      }
      setGhost(pctFromClient(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      if (draggedRef.current) {
        const p = pctFromClient(ev.clientX, ev.clientY);
        commit(p.x, p.y);
      }
      setGhost(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // Reset drag flag on next tick so the container click handler can use it.
      setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onContainerClick(e: React.MouseEvent) {
    if (draggedRef.current) return; // ignore the click that follows a drag
    const p = pctFromClient(e.clientX, e.clientY);
    commit(p.x, p.y);
    setSelected(true);
    containerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const s = e.shiftKey ? shiftStep : step;
    let nx = x;
    let ny = y;
    if (e.key === "ArrowLeft") nx -= s;
    else if (e.key === "ArrowRight") nx += s;
    else if (e.key === "ArrowUp") ny -= s;
    else if (e.key === "ArrowDown") ny += s;
    else return;
    e.preventDefault();
    commit(nx, ny);
  }

  function onContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setSelected(false);
    }
  }

  return {
    containerRef,
    selected,
    ghost,
    startDrag,
    onContainerClick,
    onKeyDown,
    onContainerBlur,
  };
}

function PositionPreview({
  imageUrl,
  fontOption,
  allFonts,
  colour,
  x,
  y,
  size,
  rotation,
  tiltX,
  tiltY,
  onChangeXY,
}: {
  imageUrl: string;
  fontOption: string;
  allFonts: string[];
  colour: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  tiltX: number;
  tiltY: number;
  onChangeXY: (x: number, y: number) => void;
}) {
  const sample = "Sarah";

  const drag = useDragPercent({
    x,
    y,
    onChange: onChangeXY,
  });

  const textTransform = nameTransform(rotation, tiltX, tiltY);
  const baseTextStyle: React.CSSProperties = {
    transform: textTransform,
    transformStyle: "preserve-3d",
    fontSize: `${size}px`,
    color: colour,
    ...fontStyleFor(fontOption),
  };

  return (
    <div>
      <GoogleFontsLoader fonts={allFonts} />
      <div
        ref={drag.containerRef}
        onClick={drag.onContainerClick}
        onKeyDown={drag.onKeyDown}
        onBlur={drag.onContainerBlur}
        tabIndex={0}
        className={`relative w-full max-w-md mx-auto aspect-square bg-ivory rounded-xl border overflow-hidden cursor-crosshair select-none focus:outline-none ${
          drag.selected ? "border-gold ring-2 ring-gold/40" : "border-sand"
        }`}
        title="Click or drag to position. Arrow keys to nudge (Shift = larger step)."
        style={{ perspective: "800px" }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="product preview"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-mocha text-sm">
            Upload a product image to preview
          </div>
        )}
        {/* Crosshair guides at the current (committed) position */}
        <div
          className="absolute top-0 bottom-0 border-l border-gold/60 pointer-events-none"
          style={{ left: `${x}%` }}
        />
        <div
          className="absolute left-0 right-0 border-t border-gold/60 pointer-events-none"
          style={{ top: `${y}%` }}
        />
        {/* The actual draggable text */}
        <div
          onPointerDown={drag.startDrag}
          className={`absolute ${fontClassFor(fontOption)} whitespace-nowrap touch-none`}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            cursor: drag.ghost ? "grabbing" : "grab",
            opacity: drag.ghost ? 0.35 : 1,
            ...baseTextStyle,
          }}
        >
          {sample}
        </div>
        {/* Translucent ghost preview while dragging */}
        {drag.ghost && (
          <div
            className={`absolute ${fontClassFor(fontOption)} pointer-events-none whitespace-nowrap`}
            style={{
              left: `${drag.ghost.x}%`,
              top: `${drag.ghost.y}%`,
              opacity: 0.7,
              ...baseTextStyle,
            }}
          >
            {sample}
          </div>
        )}
      </div>
      <p className="text-xs text-mocha mt-2 text-center">
        Click or drag to position. Use arrow keys for fine-tuning
        (<strong>Shift</strong> for larger steps). Sample shown in{" "}
        <strong>{fontOption}</strong>.
      </p>
    </div>
  );
}

function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(url);
}

function ImageField({
  value,
  onChange,
  onError,
  pathPrefix,
  acceptVideo = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onError: (msg: string) => void;
  pathPrefix: string;
  acceptVideo?: boolean;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${pathPrefix}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("emboss-uploads")
        .upload(path, file, { upsert: false, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("emboss-uploads").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e: any) {
      onError(
        e?.message ??
          "Upload failed. Make sure the 'emboss-uploads' bucket exists (run migration-002.sql)."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="file"
          accept={acceptVideo ? "image/*,video/*" : "image/*"}
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="text-sm"
        />
        {uploading && <span className="text-xs text-mocha">Uploading…</span>}
        {value && (
          <button
            type="button"
            className="btn-ghost !py-1 !px-3 text-xs"
            onClick={() => onChange("")}
          >
            Remove
          </button>
        )}
      </div>
      <input
        className="input text-xs"
        placeholder="https://… (or upload above)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        isVideoUrl(value) ? (
          <video
            src={value}
            className="rounded-lg border border-sand max-h-48 bg-ivory"
            muted
            loop
            autoPlay
            playsInline
            controls
          />
        ) : (
          <img
            src={value}
            alt="preview"
            className="rounded-lg border border-sand max-h-48 object-contain bg-ivory"
          />
        )
      )}
    </div>
  );
}

// ---------- Colours editor ----------

function ColoursEditor({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (commaJoined: string) => void;
  onError: (msg: string) => void;
}) {
  const items = splitList(value).map(parseColour);

  function update(idx: number, next: { name: string; hex: string; imageUrl: string | null }) {
    const newItems = items.map((it, i) =>
      i === idx
        ? { name: next.name, hex: next.hex, imageUrl: next.imageUrl }
        : { name: it.name, hex: it.hex, imageUrl: it.imageUrl }
    );
    onChange(
      newItems
        .map((it) => encodeColour(it.name, it.hex, it.imageUrl))
        .join(", ")
    );
  }

  function remove(idx: number) {
    const newItems = items.filter((_, i) => i !== idx);
    onChange(
      newItems
        .map((it) => encodeColour(it.name, it.hex, it.imageUrl))
        .join(", ")
    );
  }

  function add() {
    const newItems = [
      ...items.map((it) => ({ name: it.name, hex: it.hex, imageUrl: it.imageUrl })),
      { name: "New colour", hex: "#C19A6B", imageUrl: null as string | null },
    ];
    onChange(
      newItems
        .map((it) => encodeColour(it.name, it.hex, it.imageUrl))
        .join(", ")
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-sm text-mocha italic">
          No colour options. Guests will not see a colour picker.
        </p>
      )}
      {items.map((it, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-sand bg-ivory/60 p-3 space-y-2"
        >
          <div className="flex flex-wrap gap-2 items-center">
            <span
              className="inline-block w-7 h-7 rounded-full border border-sand"
              style={{ backgroundColor: it.hex }}
            />
            <input
              className="input !py-1.5 flex-1 min-w-[8rem]"
              placeholder="Name (e.g. Walnut)"
              value={it.name}
              onChange={(e) =>
                update(idx, { name: e.target.value, hex: it.hex, imageUrl: it.imageUrl })
              }
            />
            <input
              type="color"
              className="input !p-0 !h-9 !w-12"
              value={it.hex}
              onChange={(e) =>
                update(idx, { name: it.name, hex: e.target.value, imageUrl: it.imageUrl })
              }
            />
            <button
              type="button"
              className="btn-ghost !py-1 !px-3 text-xs"
              onClick={() => remove(idx)}
            >
              Remove
            </button>
          </div>
          <div>
            <p className="text-[11px] text-mocha mb-1">
              Optional product image for this colour
            </p>
            <ImageField
              value={it.imageUrl ?? ""}
              onChange={(v) =>
                update(idx, { name: it.name, hex: it.hex, imageUrl: v || null })
              }
              onError={onError}
              pathPrefix={`colour/${it.name.toLowerCase().replace(/\s+/g, "-") || "x"}`}
            />
          </div>
        </div>
      ))}
      <button type="button" className="btn-ghost text-sm" onClick={add}>
        + Add colour
      </button>
    </div>
  );
}

// ---------- Fonts editor ----------

const BUILTIN_FONTS = [
  "Modern",
  "Elegant Script",
  "Classic Serif",
  "Times New Roman",
  "Lato",
  "Alex Brush",
  "Kunstler Script",
  "Gabriola",
  "Jonnie Walker",
  "Luxury Modish",
  "Silkscreen",
];

type FontRow = {
  label: string;
  builtinName: string; // which built-in is selected (used when mode === "builtin")
  family: string; // Google Font family (used when mode === "custom")
  weight: number | null;
  italic: boolean;
  mode: "builtin" | "custom";
};

function rowsFromValue(value: string): FontRow[] {
  return splitList(value).map((s) => {
    const p = parseFont(s);
    // If parsed.family matches a registered built-in, this is a label-
    // overridden built-in (e.g. label="Fancy", family="Luxury Modish").
    if (p.family) {
      const matched = BUILTIN_FONTS.find(
        (b) => b.toLowerCase() === p.family!.trim().toLowerCase()
      );
      if (matched) {
        return {
          label: p.displayName,
          builtinName: matched,
          family: "",
          weight: null,
          italic: p.italic,
          mode: "builtin" as const,
        };
      }
      return {
        label: p.displayName,
        builtinName: "Modern",
        family: p.family,
        weight: p.weight,
        italic: p.italic,
        mode: "custom" as const,
      };
    }
    return {
      label: p.displayName,
      builtinName: p.displayName, // label === builtinName for un-customized rows
      family: "",
      weight: null,
      italic: p.italic,
      mode: "builtin" as const,
    };
  });
}

function encodeRows(rows: FontRow[]): string {
  return rows
    .map((r) => {
      const lbl = r.label.trim() || r.builtinName || "Modern";
      if (r.mode === "custom" && r.family.trim()) {
        return encodeFont(lbl, r.family.trim(), r.weight, r.italic);
      }
      // Built-in mode: if user kept the default label, emit just the name
      // (backward-compatible). If the label was customized, emit
      // "Label:BuiltinName" so we can recover the override on next load.
      const builtin = r.builtinName || "Modern";
      if (lbl === builtin) {
        return encodeFont(lbl, null, null, r.italic);
      }
      return encodeFont(lbl, builtin, null, r.italic);
    })
    .join(", ");
}

function FontsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (commaJoined: string) => void;
}) {
  const [rows, setRows] = useState<FontRow[]>(() => rowsFromValue(value));
  // Track what we last emitted so external value changes (e.g. event load)
  // are picked up but our own changes don't ping-pong.
  const lastEmittedRef = useRef<string>(value);

  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setRows(rowsFromValue(value));
      lastEmittedRef.current = value;
    }
  }, [value]);

  function commit(next: FontRow[]) {
    setRows(next);
    const encoded = encodeRows(next);
    lastEmittedRef.current = encoded;
    onChange(encoded);
  }

  function update(idx: number, patch: Partial<FontRow>) {
    commit(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function remove(idx: number) {
    commit(rows.filter((_, i) => i !== idx));
  }

  function addBuiltin(name: string) {
    commit([
      ...rows,
      {
        label: name,
        builtinName: name,
        family: "",
        weight: null,
        italic: false,
        mode: "builtin",
      },
    ]);
  }

  function addCustom() {
    commit([
      ...rows,
      {
        label: "Signature",
        builtinName: "Modern",
        family: "Dancing Script",
        weight: null,
        italic: false,
        mode: "custom",
      },
    ]);
  }

  // Compute the encoded string per row for preview (font sample + Google Fonts loader)
  const encodedRows = rows.map((r) => {
    const lbl = r.label.trim() || "Modern";
    if (r.mode === "custom" && r.family.trim()) {
      return encodeFont(lbl, r.family.trim(), r.weight, r.italic);
    }
    return encodeFont(lbl, null, null, r.italic);
  });

  return (
    <div className="space-y-3">
      <GoogleFontsLoader fonts={encodedRows} />
      {rows.length === 0 && (
        <p className="text-sm text-mocha italic">
          No fonts yet. Add at least one.
        </p>
      )}
      {rows.map((r, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-sand bg-ivory/60 p-3 space-y-2"
        >
          <div className="flex flex-wrap gap-2 items-center">
            <span
              className={`inline-block px-3 py-1.5 rounded-md bg-white border border-sand text-lg ${fontClassFor(encodedRows[idx])}`}
              style={fontStyleFor(encodedRows[idx])}
            >
              Sarah
            </span>
            <input
              className="input !py-1.5 flex-1 min-w-[8rem]"
              placeholder="Label shown to guests"
              value={r.label}
              onChange={(e) => update(idx, { label: e.target.value })}
            />
            <label className="text-xs flex items-center gap-1 px-2 py-1 rounded-md border border-sand bg-white cursor-pointer select-none">
              <input
                type="checkbox"
                checked={r.italic}
                onChange={(e) => update(idx, { italic: e.target.checked })}
              />
              <span className="italic">Italic</span>
            </label>
            <button
              type="button"
              className="btn-ghost !py-1 !px-3 text-xs"
              onClick={() => remove(idx)}
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-xs">
              <span className="text-mocha">Type</span>
              <select
                className="input !py-1.5"
                value={r.mode}
                onChange={(e) => {
                  const mode = e.target.value as "builtin" | "custom";
                  if (mode === "builtin") {
                    update(idx, {
                      mode,
                      weight: null,
                      builtinName: r.builtinName || "Modern",
                    });
                  } else {
                    update(idx, {
                      mode,
                      family: r.family || "Dancing Script",
                    });
                  }
                }}
              >
                <option value="builtin">Built-in</option>
                <option value="custom">Custom (Google Font)</option>
              </select>
            </label>
            {r.mode === "builtin" ? (
              <label className="text-xs sm:col-span-2">
                <span className="text-mocha">Built-in font</span>
                <select
                  className="input !py-1.5"
                  value={
                    BUILTIN_FONTS.includes(r.builtinName) ? r.builtinName : "Modern"
                  }
                  onChange={(e) => {
                    const newName = e.target.value;
                    // If the label still matched the previous built-in name,
                    // sync it to the new pick. Otherwise keep the user's
                    // custom label intact.
                    const labelWasDefault = r.label === r.builtinName;
                    update(idx, {
                      builtinName: newName,
                      label: labelWasDefault ? newName : r.label,
                    });
                  }}
                >
                  {BUILTIN_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="text-xs">
                  <span className="text-mocha">Google Font family</span>
                  <input
                    className="input !py-1.5"
                    placeholder="Dancing Script"
                    value={r.family}
                    onChange={(e) => update(idx, { family: e.target.value })}
                  />
                </label>
                <label className="text-xs">
                  <span className="text-mocha">Weight (optional)</span>
                  <input
                    className="input !py-1.5"
                    type="number"
                    placeholder="400"
                    value={r.weight ?? ""}
                    onChange={(e) =>
                      update(idx, {
                        weight: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {BUILTIN_FONTS.filter(
          (b) => !rows.some((r) => r.mode === "builtin" && r.builtinName === b)
        ).map((b) => (
          <button
            key={b}
            type="button"
            className="btn-ghost text-sm"
            onClick={() => addBuiltin(b)}
          >
            + {b}
          </button>
        ))}
        <button type="button" className="btn-ghost text-sm" onClick={addCustom}>
          + Custom Google Font
        </button>
      </div>
    </div>
  );
}

// ---------- Start button font picker ----------

function StartButtonFontPicker({
  value,
  onChange,
  eventFonts,
}: {
  value: string;
  onChange: (next: string) => void;
  eventFonts: string[];
}) {
  const parsed = value ? parseFont(value) : null;
  const type: "default" | "builtin" | "custom" = !parsed
    ? "default"
    : parsed.family
    ? "custom"
    : "builtin";

  return (
    <div className="space-y-2">
      <span className="text-xs text-mocha block">Font</span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-xs">
          <span className="text-mocha">Type</span>
          <select
            className="input !py-1.5"
            value={type}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "default") onChange("");
              else if (t === "builtin") onChange(eventFonts[0] || "Modern");
              else onChange("Dancing Script:Dancing Script");
            }}
          >
            <option value="default">Default (system sans)</option>
            <option value="builtin">Built-in / event font</option>
            <option value="custom">Custom (Google Font)</option>
          </select>
        </label>

        {type === "builtin" && (
          <label className="text-xs sm:col-span-2">
            <span className="text-mocha">Font</span>
            <select
              className="input !py-1.5"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            >
              {eventFonts.length > 0 && (
                <optgroup label="From this event">
                  {eventFonts.map((f) => {
                    const p = parseFont(f);
                    return (
                      <option key={f} value={f}>
                        {p.displayName}
                        {p.italic ? " (italic)" : ""}
                      </option>
                    );
                  })}
                </optgroup>
              )}
              <optgroup label="Built-in">
                {BUILTIN_FONTS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        )}

        {type === "custom" && parsed && (
          <>
            <label className="text-xs">
              <span className="text-mocha">Google Font family</span>
              <input
                className="input !py-1.5"
                placeholder="Dancing Script"
                value={parsed.family ?? ""}
                onChange={(e) => {
                  const fam = e.target.value;
                  onChange(encodeFont(fam || "Custom", fam, parsed.weight));
                }}
              />
            </label>
            <label className="text-xs">
              <span className="text-mocha">Weight (optional)</span>
              <input
                className="input !py-1.5"
                type="number"
                placeholder="400"
                value={parsed.weight ?? ""}
                onChange={(e) =>
                  onChange(
                    encodeFont(
                      parsed.family || "Custom",
                      parsed.family,
                      e.target.value ? Number(e.target.value) : null
                    )
                  )
                }
              />
            </label>
          </>
        )}
      </div>
      {type === "custom" && (
        <p className="text-xs text-mocha/60">
          Enter any family name from{" "}
          <a
            className="underline hover:text-ink"
            href="https://fonts.google.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            fonts.google.com
          </a>
          .
        </p>
      )}
    </div>
  );
}

// ---------- Start button editor ----------

const PREVIEW_DEVICES = [
  { key: "ipad-portrait", label: "iPad Air (portrait)", w: 820, h: 1180 },
  { key: "ipad-landscape", label: "iPad Air (landscape)", w: 1180, h: 820 },
  { key: "ipad-pro-portrait", label: "iPad Pro 11 (portrait)", w: 834, h: 1194 },
  { key: "phone-portrait", label: "Phone (portrait)", w: 390, h: 844 },
] as const;
type PreviewDeviceKey = (typeof PREVIEW_DEVICES)[number]["key"];

function StartButtonEditor({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const eventFonts = splitList(form.available_fonts);
  const [previewDevice, setPreviewDevice] = useState<PreviewDeviceKey>("ipad-portrait");
  const device =
    PREVIEW_DEVICES.find((d) => d.key === previewDevice) ?? PREVIEW_DEVICES[0];

  // Track the visible wrapper width to compute the scale factor so the inner
  // device-pixel canvas (e.g. 820×1180) shrinks to fit the available space.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setWrapperWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewDevice]);
  const previewScale = wrapperWidth > 0 ? wrapperWidth / device.w : 0;
  const sb = startButtonStyle({
    text: form.start_button_text,
    bg: form.start_button_bg,
    textColor: form.start_button_text_color,
    shape: form.start_button_shape,
    radius: form.start_button_radius,
    width: form.start_button_width,
    height: form.start_button_height,
    fontSize: form.start_button_font_size,
    posX: form.start_button_pos_x,
    posY: form.start_button_pos_y,
    font: form.start_button_font,
  });

  const drag = useDragPercent({
    x: form.start_button_pos_x,
    y: form.start_button_pos_y,
    onChange: (nx, ny) =>
      setForm((f) => ({
        ...f,
        start_button_pos_x: nx,
        start_button_pos_y: ny,
      })),
  });

  // Ghost container style: same as sb.containerStyle but at the dragged %.
  const ghostContainerStyle: React.CSSProperties | null = drag.ghost
    ? {
        ...sb.containerStyle,
        left: `${drag.ghost.x}%`,
        top: `${drag.ghost.y}%`,
      }
    : null;

  return (
    <div className="space-y-3">
      <GoogleFontsLoader fonts={[...eventFonts, ...(form.start_button_font ? [form.start_button_font] : [])]} />

      {/* Device preview selector — match the guest viewport so position is WYSIWYG */}
      <div className="flex flex-wrap items-center gap-2 justify-center">
        <span className="text-xs text-mocha">Preview as:</span>
        {PREVIEW_DEVICES.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setPreviewDevice(d.key)}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              previewDevice === d.key
                ? "bg-ink text-ivory border-ink"
                : "bg-white text-ink border-sand hover:bg-champagne/40"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Live preview — outer wrapper sets visible size; inner canvas is
          rendered at native device pixels and CSS-scaled so the button
          appears at its true on-device proportion. */}
      <div
        ref={wrapperRef}
        className={`relative w-full ${
          previewDevice === "ipad-landscape" ? "max-w-2xl" : "max-w-md"
        } mx-auto rounded-xl border overflow-hidden bg-ink ${
          drag.selected ? "border-gold ring-2 ring-gold/40" : "border-sand"
        }`}
        style={{ aspectRatio: `${device.w} / ${device.h}` }}
      >
      <div
        ref={drag.containerRef}
        onClick={drag.onContainerClick}
        onKeyDown={drag.onKeyDown}
        onBlur={drag.onContainerBlur}
        tabIndex={0}
        className="absolute top-0 left-0 cursor-crosshair select-none focus:outline-none"
        style={{
          width: `${device.w}px`,
          height: `${device.h}px`,
          transform: `scale(${previewScale || 0.0001})`,
          transformOrigin: "top left",
          visibility: previewScale > 0 ? "visible" : "hidden",
          ...(form.intro_image_url && !isVideoUrl(form.intro_image_url)
            ? {
                backgroundImage: `url(${form.intro_image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}),
        }}
        title="Click or drag the button to position. Arrow keys to nudge (Shift = larger step)."
      >
        {form.intro_image_url && isVideoUrl(form.intro_image_url) && (
          <video
            src={form.intro_image_url}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            muted
            loop
            autoPlay
            playsInline
          />
        )}
        {!form.intro_image_url && (
          <div className="absolute inset-0 flex items-center justify-center text-sand text-xs">
            Upload an intro background to preview placement
          </div>
        )}
        {/* Committed button (faded while dragging) */}
        <div style={sb.containerStyle}>
          <button
            type="button"
            onPointerDown={drag.startDrag}
            className={sb.fontClass}
            style={{
              ...sb.buttonStyle,
              cursor: drag.ghost ? "grabbing" : "grab",
              opacity: drag.ghost ? 0.35 : 1,
              touchAction: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {sb.text}
          </button>
        </div>
        {/* Translucent ghost while dragging */}
        {ghostContainerStyle && (
          <div style={ghostContainerStyle}>
            <button
              type="button"
              tabIndex={-1}
              className={sb.fontClass}
              style={{
                ...sb.buttonStyle,
                opacity: 0.7,
                pointerEvents: "none",
              }}
            >
              {sb.text}
            </button>
          </div>
        )}
      </div>
      </div>
      <p className="text-xs text-mocha text-center">
        Click or drag the button. Use arrow keys to nudge (
        <strong>Shift</strong> for larger steps).
      </p>

      {/* Text + colors */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs">
          <span className="text-mocha">Button text</span>
          <input
            className="input !py-1.5"
            value={form.start_button_text}
            onChange={(e) => setForm({ ...form, start_button_text: e.target.value })}
          />
        </label>
        <label className="text-xs">
          <span className="text-mocha">Background colour</span>
          <input
            type="color"
            className="input !p-0 !h-9 w-full"
            value={form.start_button_bg}
            onChange={(e) => setForm({ ...form, start_button_bg: e.target.value })}
          />
        </label>
        <label className="text-xs">
          <span className="text-mocha">Text colour</span>
          <input
            type="color"
            className="input !p-0 !h-9 w-full"
            value={form.start_button_text_color}
            onChange={(e) =>
              setForm({ ...form, start_button_text_color: e.target.value })
            }
          />
        </label>
      </div>

      {/* Font — Type + Built-in or Google Font + Weight */}
      <StartButtonFontPicker
        value={form.start_button_font}
        onChange={(v) => setForm({ ...form, start_button_font: v })}
        eventFonts={eventFonts}
      />

      {/* Shape + radius */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs">
          <span className="text-mocha">Shape</span>
          <select
            className="input !py-1.5"
            value={form.start_button_shape}
            onChange={(e) =>
              setForm({
                ...form,
                start_button_shape: e.target.value as "rect" | "pill" | "circle",
              })
            }
          >
            <option value="rect">Rectangle (custom corner radius)</option>
            <option value="pill">Pill (fully rounded)</option>
            <option value="circle">Circle</option>
          </select>
        </label>
        {form.start_button_shape === "rect" && (
          <SliderField
            label={`Corner radius: ${form.start_button_radius}px`}
            min={0}
            max={64}
            value={form.start_button_radius}
            onChange={(v) => setForm({ ...form, start_button_radius: v })}
          />
        )}
      </div>

      {/* Size sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {form.start_button_shape !== "circle" && (
          <SliderField
            label={
              form.start_button_width === 0
                ? "Width: auto"
                : `Width: ${form.start_button_width}px`
            }
            min={0}
            max={1200}
            value={form.start_button_width}
            onChange={(v) => setForm({ ...form, start_button_width: v })}
          />
        )}
        <SliderField
          label={
            form.start_button_shape === "circle"
              ? `Diameter: ${form.start_button_height}px`
              : `Height: ${form.start_button_height}px`
          }
          min={32}
          max={300}
          value={form.start_button_height}
          onChange={(v) => setForm({ ...form, start_button_height: v })}
        />
        <SliderField
          label={`Font size: ${form.start_button_font_size}px`}
          min={10}
          max={64}
          value={form.start_button_font_size}
          onChange={(v) => setForm({ ...form, start_button_font_size: v })}
        />
      </div>

      {/* Position sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SliderField
          label={`Position X: ${form.start_button_pos_x}%`}
          min={0}
          max={100}
          value={form.start_button_pos_x}
          onChange={(v) => setForm({ ...form, start_button_pos_x: v })}
        />
        <SliderField
          label={`Position Y: ${form.start_button_pos_y}%`}
          min={0}
          max={100}
          value={form.start_button_pos_y}
          onChange={(v) => setForm({ ...form, start_button_pos_y: v })}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={() =>
            setForm((f) => ({
              ...f,
              start_button_text: "Start",
              start_button_bg: "#3B2A1A",
              start_button_text_color: "#FBF8F3",
              start_button_shape: "rect",
              start_button_radius: 16,
              start_button_width: 240,
              start_button_height: 72,
              start_button_font_size: 22,
              start_button_pos_x: 50,
              start_button_pos_y: 85,
              start_button_font: "",
            }))
          }
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
