"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import {
  supabase,
  type EmbossEvent,
  type EventTemplate,
  type Order,
} from "@/lib/supabase";
import {
  fontClassFor,
  fontDisplayName,
  fontStyleFor,
  hasEmoji,
  nameTransform,
  nextQueueNumber,
  parseColour,
  sanitizeName,
  startButtonStyle,
} from "@/lib/utils";
import Footer from "@/components/Footer";
import GoogleFontsLoader from "@/components/GoogleFontsLoader";

const DEFAULT_FONTS = ["Modern", "Elegant Script", "Classic Serif"];

export default function GuestEventPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params.eventId;

  const [event, setEvent] = useState<EmbossEvent | null>(null);
  const [tpl, setTpl] = useState<EventTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [font, setFont] = useState<string>("Modern");
  const [colour, setColour] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  // Gift dropoff step: null = not yet answered, true = guest has gift,
  // false = guest will hand gift to crew. Only used when tpl.gift_required.
  const [giftAnswer, setGiftAnswer] = useState<boolean | null>(null);
  // Gift items the guest has chosen to have engraved (subset of
  // tpl.gift_items). Only relevant when the event has 2+ gift items.
  const [giftItemsSelected, setGiftItemsSelected] = useState<string[]>([]);
  // Live tally of orders per colour name (status != cancelled), used to disable
  // colours that have hit their stock cap.
  const [colourUsage, setColourUsage] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const { data: ev, error: e1 } = await supabase
          .from("events")
          .select("*")
          .eq("id", eventId)
          .single();
        if (e1) throw e1;
        setEvent(ev as EmbossEvent);

        const { data: t } = await supabase
          .from("event_templates")
          .select("*")
          .eq("event_id", eventId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setTpl(t as EventTemplate | null);

        const fonts =
          (t?.available_fonts as string[] | null) ?? DEFAULT_FONTS;
        setFont(fonts[0] ?? "Modern");
        const cols = (t?.available_colours as string[] | null) ?? [];
        setColour(cols[0] ?? "");
      } catch (e: any) {
        setErr(e.message ?? "Failed to load event");
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  const fonts = (tpl?.available_fonts as string[] | null) ?? DEFAULT_FONTS;
  const colours = (tpl?.available_colours as string[] | null) ?? [];
  const maxLen = tpl?.max_name_length ?? 20;
  // When enabled, the same engraving name is rendered at a second position
  // on the product (e.g. front + back, or two slots on a luggage tag) using
  // the preview_name2_* placement/style fields.
  const name2Enabled = !!tpl?.name2_enabled;
  const giftItems = (tpl?.gift_items as string[] | null) ?? [];
  const hasMultipleGifts = giftItems.length >= 2;

  // When the gift step first opens, default to all items selected.
  useEffect(() => {
    if (hasMultipleGifts && giftItemsSelected.length === 0) {
      setGiftItemsSelected(giftItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl?.id, hasMultipleGifts]);

  // Live count of how many orders have selected each colour. Drives the
  // “out of stock” state so guests can’t pick a colour past its cap.
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    async function refresh() {
      const { data } = await supabase
        .from("orders")
        .select("selected_colour,status")
        .eq("event_id", eventId)
        .neq("status", "cancelled");
      if (!alive) return;
      const map: Record<string, number> = {};
      for (const row of (data as { selected_colour: string | null }[]) ?? []) {
        if (!row.selected_colour) continue;
        const key = parseColour(row.selected_colour).name;
        map[key] = (map[key] ?? 0) + 1;
      }
      setColourUsage(map);
    }
    refresh();
    const channel = supabase
      .channel(`event-stock-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `event_id=eq.${eventId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  function remainingForColour(c: string): number | null {
    const p = parseColour(c);
    if (p.stock == null) return null;
    const used = colourUsage[p.name] ?? 0;
    return Math.max(0, p.stock - used);
  }

  // If the currently-selected colour just went out of stock, switch to the
  // first available one (or clear it).
  useEffect(() => {
    if (!colour) return;
    const remaining = remainingForColour(colour);
    if (remaining !== null && remaining <= 0) {
      const firstAvail = colours.find((c) => {
        const r = remainingForColour(c);
        return r === null || r > 0;
      });
      setColour(firstAvail ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colourUsage]);

  const cleanName = useMemo(() => sanitizeName(name), [name]);
  const tooLong = cleanName.length > maxLen;
  const containsEmoji = hasEmoji(name);
  const canSubmit =
    cleanName.length > 0 && !tooLong && !containsEmoji && !submitting;

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      const queue = nextQueueNumber(count ?? 0);

      const giftRequired = !!tpl?.gift_required;
      const giftReceivedValue: boolean | null = giftRequired
        ? giftAnswer === true
        : null;
      // Persist the gift item(s) the order is for. For multi-gift events
      // this is the guest's chosen subset; for single-gift events we
      // record the lone item so the crew dashboard can show its name on
      // the Pending/Received toggle. Empty when no gift items are configured.
      const giftItemsToSave: string[] | null = hasMultipleGifts
        ? giftItemsSelected
        : giftItems.length === 1
        ? [giftItems[0]]
        : null;
      const giftNote =
        giftRequired && giftAnswer === false
          ? hasMultipleGifts
            ? `⚠️ Pending dropoff. Engrave: ${giftItemsSelected.join(", ")}`
            : "⚠️ Gift not yet handed to crew — wait for dropoff before engraving."
          : null;
      const { data, error } = await supabase
        .from("orders")
        .insert({
          event_id: eventId,
          queue_number: queue,
          guest_name: cleanName,
          guest_name2: null,
          selected_font: font,
          selected_colour: colour || null,
          status: "waiting",
          gift_received: giftReceivedValue,
          gift_items_selected: giftItemsToSave,
          notes: giftNote,
        })
        .select("*")
        .single();
      if (error) throw error;
      const order = data as Order;
      setSubmitted(order);

      await supabase.from("order_activity").insert({
        order_id: order.id,
        action: "created",
        new_status: "waiting",
      });

      const url = `${window.location.origin}/status/${order.id}`;
      const qr = await QRCode.toDataURL(url, { width: 320, margin: 1 });
      setQrDataUrl(qr);
    } catch (e: any) {
      setErr(e.message ?? "Could not submit order");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-10 max-w-md w-full text-center">
          <div className="w-8 h-8 border-2 border-sand border-t-gold rounded-full animate-spin mx-auto mb-4" />
          <p className="font-serif text-2xl text-mocha">Loading event…</p>
        </div>
      </main>
    );
  }
  if (err && !event) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="card p-10 max-w-md w-full text-center">
          <p className="text-3xl mb-3">&#x26A0;&#xFE0F;</p>
          <h1 className="font-serif text-3xl mb-2">Event not found</h1>
          <p className="text-mocha text-sm">{err}</p>
        </div>
      </main>
    );
  }
  if (!event) return null;

  // Welcome / intro screen — must be tapped before showing the form.
  if (!started && !submitted) {
    const introUrl = tpl?.intro_image_url;
    const sb = startButtonStyle({
      text: tpl?.start_button_text,
      bg: tpl?.start_button_bg,
      textColor: tpl?.start_button_text_color,
      shape: tpl?.start_button_shape,
      radius: tpl?.start_button_radius,
      width: tpl?.start_button_width,
      height: tpl?.start_button_height,
      fontSize: tpl?.start_button_font_size,
      posX: tpl?.start_button_pos_x,
      posY: tpl?.start_button_pos_y,
      font: tpl?.start_button_font,
    });
    const introIsVideo = !!introUrl && /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(introUrl);
    return (
      <main
        className="min-h-screen flex flex-col bg-ink relative overflow-hidden"
        style={
          introUrl && !introIsVideo
            ? {
                backgroundImage: `url(${introUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {introIsVideo && (
          <video
            src={introUrl!}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            muted
            loop
            autoPlay
            playsInline
          />
        )}
        <GoogleFontsLoader fonts={tpl?.start_button_font ? [...fonts, tpl.start_button_font] : fonts} />
        {/* Background fade-in: lets the intro image breathe before the CTA arrives. */}
        <div
          className="absolute inset-0 animate-fade-in pointer-events-none"
          style={{ animationDuration: "var(--dur-stage)" }}
        />
        <div className="absolute inset-0">
          <div style={sb.containerStyle}>
            <button
              onClick={() => setStarted(true)}
              className={sb.fontClass}
              style={{
                ...sb.buttonStyle,
                /* Orchestrated settle: 1s expo-out, 220ms after the bg starts.
                   Respects prefers-reduced-motion via the global override. */
                animation:
                  "fadeUp var(--dur-stage) var(--ease-out) 220ms backwards",
              }}
            >
              {sb.text}
            </button>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // Optional door-gift dropoff step — informational screen shown after the
  // welcome and before the personalization form. Guests are told to drop off
  // their door gift with the crew after personalizing. When the event has
  // 2+ gift items, the guest also picks which one(s) to engrave here.
  if (started && !submitted && tpl?.gift_required && giftAnswer === null) {
    const canContinue = !hasMultipleGifts || giftItemsSelected.length > 0;
    return (
      <main className="min-h-screen flex flex-col p-5">
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="card max-w-xl w-full p-8 md:p-10 text-center">
            <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-3">
              {event.event_name}
            </p>
            <p className="text-4xl mb-2">🎁</p>
            <h1 className="font-serif text-3xl md:text-4xl mb-3 leading-tight">
              {hasMultipleGifts
                ? "Which gift would you like engraved?"
                : "Don't forget your door gift!"}
            </h1>
            <p className="text-mocha text-sm md:text-base mb-6 leading-relaxed">
              {hasMultipleGifts ? (
                <>
                  Select the item(s) you'd like us to engrave, then drop them
                  off with our crew <strong>after personalizing</strong>.
                </>
              ) : (
                <>
                  Please drop off your door gift with our crew{" "}
                  <strong>after you finish personalizing</strong> so we can engrave it for you.
                </>
              )}
            </p>

            {hasMultipleGifts && (
              <div className="flex flex-col gap-2 mb-6 text-left">
                {giftItems.map((item) => {
                  const checked = giftItemsSelected.includes(item);
                  return (
                    <label
                      key={item}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        checked
                          ? "border-gold bg-champagne/30"
                          : "border-sand bg-white hover:border-mocha/30"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-5 h-5 accent-gold"
                        checked={checked}
                        onChange={(e) => {
                          setGiftItemsSelected((prev) =>
                            e.target.checked
                              ? [...prev, item]
                              : prev.filter((x) => x !== item)
                          );
                        }}
                      />
                      <span className="text-base font-medium text-ink">
                        {item}
                      </span>
                    </label>
                  );
                })}
                {giftItemsSelected.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    Please pick at least one gift to engrave.
                  </p>
                )}
              </div>
            )}

            <button
              className="btn-primary w-full text-lg py-5 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => canContinue && setGiftAnswer(false)}
              disabled={!canContinue}
            >
              Continue to personalize
            </button>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  if (submitted) {
    return (
      <ConfirmationScreen
        eventName={event.event_name}
        submitted={submitted}
        qrDataUrl={qrDataUrl}
        autoResetEnabled={Boolean(tpl?.auto_reset_enabled)}
        autoResetSeconds={Number(tpl?.auto_reset_seconds ?? 30)}
        onReset={() => {
          setSubmitted(null);
          setQrDataUrl(null);
          setName("");
          setGiftAnswer(null);
          setGiftItemsSelected(hasMultipleGifts ? giftItems : []);
          setStarted(false);
        }}
      />
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 flex flex-col">
      <GoogleFontsLoader fonts={fonts} />
      <div className="max-w-3xl mx-auto w-full flex-1">
        <header className="text-center mb-5 md:mb-7">
          <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-1">
            EMBOSS · Live Personalization
          </p>
          <h1 className="font-serif text-3xl md:text-4xl leading-tight">
            {event.event_name}
          </h1>
          {event.client_name && (
            <p className="text-mocha text-sm mt-1 opacity-80">{event.client_name}</p>
          )}
        </header>

        {/* Preview — top, prominent */}
        <div className="card p-4 md:p-5 mb-5 overflow-hidden">
          <PreviewCanvas
            imageUrl={
              (colour && parseColour(colour).imageUrl) ||
              tpl?.product_image_url ||
              null
            }
            name={cleanName || "Your Name"}
            font={font}
            x={tpl?.preview_name_x ?? 50}
            y={tpl?.preview_name_y ?? 50}
            size={tpl?.preview_name_size ?? 32}
            colour={tpl?.preview_name_colour ?? "#111111"}
            rotation={tpl?.preview_name_rotation ?? 0}
            tiltX={tpl?.preview_name_tilt_x ?? 0}
            tiltY={tpl?.preview_name_tilt_y ?? 0}
            secondary={
              name2Enabled
                ? {
                    text: cleanName || "Your Name",
                    x: Number(tpl?.preview_name2_x ?? 50),
                    y: Number(tpl?.preview_name2_y ?? 70),
                    size: Number(tpl?.preview_name2_size ?? 28),
                    colour: tpl?.preview_name2_colour ?? "#3B2A1A",
                    rotation: Number(tpl?.preview_name2_rotation ?? 0),
                    tiltX: Number(tpl?.preview_name2_tilt_x ?? 0),
                    tiltY: Number(tpl?.preview_name2_tilt_y ?? 0),
                    placeholder: !cleanName,
                  }
                : null
            }
          />
          {event.product_name && (
            <p className="text-center text-sm font-medium text-mocha mt-3">
              {event.product_name}
            </p>
          )}
          <p className="text-center text-[11px] text-mocha/60 mt-1.5">
            Maximum {maxLen} characters
          </p>
        </div>

        {/* Form — bottom */}
        <div className="card p-5 md:p-7 mb-2">
          <label className="label">Your Name</label>
          <input
            className="input text-2xl md:text-3xl py-4 font-medium"
            autoFocus
            placeholder="e.g. Sarah"
            value={name}
            onChange={(e) => {
              // Hard cap at maxLen — sanitizeName preserves spaces, so spaces
              // count toward the limit. Trim the raw input first so users
              // can't bypass via leading whitespace, but keep internal spaces.
              const next = e.target.value;
              const sanitizedLen = sanitizeName(next).length;
              if (sanitizedLen <= maxLen) {
                setName(next);
              } else {
                // Allow deletion / no-op if pasted text exceeds limit:
                // truncate to fit.
                let truncated = next;
                while (truncated.length > 0 && sanitizeName(truncated).length > maxLen) {
                  truncated = truncated.slice(0, -1);
                }
                setName(truncated);
              }
            }}
            maxLength={maxLen}
          />
          <div className="flex justify-between text-xs mt-1.5">
            <span className={containsEmoji || tooLong ? "text-red-500 font-medium" : "text-mocha/60"}>
              {containsEmoji
                ? "⚠️ Please remove emojis."
                : tooLong
                ? `⚠️ Maximum ${maxLen} characters`
                : "Letters and spaces only"}
            </span>
            <span className={`tabular-nums ${
              cleanName.length >= maxLen ? "text-red-500 font-semibold" : "text-mocha/60"
            }`}>
              {cleanName.length}/{maxLen}
            </span>
          </div>

          {fonts.length > 1 && (
          <div className="mt-6">
            <p className="label">Font Style</p>
            <div className={`grid gap-3 ${fonts.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {fonts.map((f) => {
                const previewText = cleanName || "Your Name";
                const isActive = font === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFont(f)}
                    className={`relative flex flex-col items-center justify-center rounded-xl border-2 px-3 pt-6 pb-4 transition-all duration-150 select-none
                      ${isActive
                        ? "border-gold bg-champagne/30 shadow-sm"
                        : "border-sand bg-white hover:border-mocha/30 hover:bg-champagne/10"
                      }`}
                  >
                    {isActive && (
                      <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gold flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4" />
                        </svg>
                      </span>
                    )}
                    <span
                      className={`block text-3xl leading-tight text-center w-full overflow-hidden ${fontClassFor(f)}`}
                      style={{ ...fontStyleFor(f), color: "#1A1A1A" }}
                    >
                      {previewText}
                    </span>
                    <span className="block text-[10px] uppercase tracking-[0.1em] text-mocha/60 mt-3 font-sans">
                      {fontDisplayName(f)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {colours.length > 0 && (
            <div className="mt-5">
              <p className="label">Gift Colour</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {colours.map((c) => {
                  const parsed = parseColour(c);
                  const active = colour === c;
                  const textColor = parsed.isLight ? "#1A1A1A" : "#FBF8F3";
                  const remaining = remainingForColour(c);
                  const outOfStock = remaining !== null && remaining <= 0;
                  return (
                    <button
                      key={c}
                      disabled={outOfStock}
                      onClick={() => !outOfStock && setColour(c)}
                      className={`relative flex items-center justify-center rounded-xl px-4 py-4 transition-all duration-150 select-none ${
                        outOfStock ? "cursor-not-allowed" : ""
                      }`}
                      style={{
                        backgroundColor: parsed.hex,
                        color: textColor,
                        boxShadow: active
                          ? `0 0 0 3px ${parsed.hex}, 0 0 0 5px #1A1A1A`
                          : "0 1px 3px rgba(0,0,0,0.12)",
                        opacity: outOfStock ? 0.4 : 1,
                        filter: outOfStock ? "grayscale(0.4)" : undefined,
                      }}
                    >
                      {active && !outOfStock && (
                        <span
                          className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: textColor }}
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 10 10" stroke={parsed.hex} strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4" />
                          </svg>
                        </span>
                      )}
                      <span className="text-sm font-semibold tracking-wide flex flex-col items-center">
                        <span>{parsed.name}</span>
                        {outOfStock && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-widest mt-0.5"
                            style={{ color: textColor }}
                          >
                            Out of stock
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            disabled={!canSubmit}
            onClick={() => setShowConfirm(true)}
            className="btn-primary w-full text-xl mt-7 py-5 tracking-wide"
          >
            Submit
          </button>
          {err && (
            <p className="flex items-center gap-2 text-red-600 text-sm mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="shrink-0">⚠</span> {err}
            </p>
          )}
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="card max-w-md w-full p-8 text-center shadow-card">
            <h2 className="font-serif text-2xl mb-1">Confirm Spelling</h2>
            <p className="text-mocha text-sm mb-5 leading-relaxed">
              Please check your name carefully. It will be engraved exactly as shown.
            </p>
            <div className="bg-ivory rounded-2xl p-6 mb-6 border border-sand/60">
              <p className="text-[10px] uppercase tracking-widest text-mocha mb-3">Preview</p>
              <p
                className={`${fontClassFor(font)} text-4xl leading-tight`}
                style={{
                  color: tpl?.preview_name_colour ?? "#111",
                  ...fontStyleFor(font),
                }}
              >
                {cleanName}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                className="btn-secondary flex-1 py-3.5"
                onClick={() => setShowConfirm(false)}
              >
                Edit
              </button>
              <button
                className="btn-primary flex-1 py-3.5"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Confirm & Engrave"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </main>
  );
}

function PreviewCanvas({
  imageUrl,
  name,
  font,
  x,
  y,
  size,
  colour,
  rotation,
  tiltX,
  tiltY,
  secondary,
}: {
  imageUrl: string | null;
  name: string;
  font: string;
  x: number;
  y: number;
  size: number;
  colour: string;
  rotation: number;
  tiltX: number;
  tiltY: number;
  secondary?: {
    text: string;
    x: number;
    y: number;
    size: number;
    colour: string;
    rotation: number;
    tiltX: number;
    tiltY: number;
    // When true, render at lower opacity to indicate it's a placeholder.
    placeholder?: boolean;
  } | null;
}) {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden bg-ivory border border-sand/60 aspect-[4/3]"
      style={{ perspective: "800px" }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="product"
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-mocha">
          (Product image)
        </div>
      )}
      <div
        className={`absolute ${fontClassFor(font)} pointer-events-none whitespace-nowrap`}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: nameTransform(rotation, tiltX, tiltY),
          transformStyle: "preserve-3d",
          fontSize: `${size}px`,
          color: colour,
          ...fontStyleFor(font),
        }}
      >
        {name}
      </div>
      {secondary && (
        <div
          className={`absolute ${fontClassFor(font)} pointer-events-none whitespace-nowrap`}
          style={{
            left: `${secondary.x}%`,
            top: `${secondary.y}%`,
            transform: nameTransform(
              secondary.rotation,
              secondary.tiltX,
              secondary.tiltY
            ),
            transformStyle: "preserve-3d",
            fontSize: `${secondary.size}px`,
            color: secondary.colour,
            opacity: secondary.placeholder ? 0.35 : 1,
            ...fontStyleFor(font),
          }}
        >
          {secondary.text}
        </div>
      )}
    </div>
  );
}

function CenterMessage({ title, body }: { title: string; body?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-10 max-w-md w-full text-center">
        <h1 className="font-serif text-3xl mb-2">{title}</h1>
        {body && <p className="text-mocha text-sm leading-relaxed">{body}</p>}
      </div>
    </main>
  );
}

function ConfirmationScreen({
  eventName,
  submitted,
  qrDataUrl,
  autoResetEnabled,
  autoResetSeconds,
  onReset,
}: {
  eventName: string;
  submitted: Order;
  qrDataUrl: string | null;
  autoResetEnabled: boolean;
  autoResetSeconds: number;
  onReset: () => void;
}) {
  const [remaining, setRemaining] = useState(autoResetSeconds);

  useEffect(() => {
    if (!autoResetEnabled) return;
    setRemaining(autoResetSeconds);
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          onReset();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // Re-arm whenever a new submission renders this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted.id, autoResetEnabled, autoResetSeconds]);

  const progressPct = autoResetEnabled
    ? Math.max(0, Math.min(100, (remaining / autoResetSeconds) * 100))
    : 0;

  return (
    <main className="min-h-screen flex flex-col p-5">
      <div className="flex-1 flex items-center justify-center py-8">
        <div className="card max-w-xl w-full p-8 md:p-10 text-center">
          <p className="text-[10px] tracking-[0.5em] text-mocha uppercase mb-3">
            {eventName}
          </p>
          <h1 className="font-serif text-4xl md:text-5xl mb-1">Thank you!</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-mocha mt-5 mb-1">
            Engraving for
          </p>
          <p className="font-serif text-3xl md:text-4xl mb-6 text-ink">
            {submitted.guest_name}
          </p>

          <div className="bg-ivory rounded-2xl p-5 mb-6 border border-sand/60">
            <p className="text-[10px] uppercase tracking-[0.3em] text-mocha mb-1">
              Your queue number
            </p>
            <p className="font-serif text-7xl md:text-8xl text-ink leading-none py-2">
              {submitted.queue_number}
            </p>
          </div>

          {submitted.gift_received === false && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 mb-6 text-left">
              <p className="text-2xl text-center mb-1">🎁</p>
              <p className="text-base font-bold text-amber-800 text-center">
                Please drop off your door gift with our crew now.
              </p>
              {submitted.gift_items_selected &&
                submitted.gift_items_selected.length > 0 && (
                  <ul className="text-sm text-amber-800 text-center mt-2 font-semibold list-none">
                    {submitted.gift_items_selected.map((g) => (
                      <li key={g}>· {g}</li>
                    ))}
                  </ul>
                )}
              <p className="text-sm text-amber-700 text-center mt-1 leading-relaxed">
                We'll only start engraving once we receive your gift.
              </p>
            </div>
          )}

          {qrDataUrl && (
            <div className="flex flex-col items-center mb-6">
              <div className="relative inline-block">
                <img
                  src={qrDataUrl}
                  alt="Status QR"
                  className="w-48 h-48 rounded-xl border border-sand/60 shadow-sm"
                />
                {/* Animated scan hint pointing down at the QR */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center pointer-events-none select-none">
                  <span className="text-3xl animate-bounce" aria-hidden="true">
                    👇
                  </span>
                </div>
                {/* Animated corner brackets to draw the eye */}
                <span className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-gold rounded-tl-md animate-pulse-soft" />
                <span className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-gold rounded-tr-md animate-pulse-soft" />
                <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-gold rounded-bl-md animate-pulse-soft" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-gold rounded-br-md animate-pulse-soft" />
              </div>
              <p className="text-base font-semibold text-ink mt-4">
                📲 Scan with your phone camera
              </p>
              <p className="text-xs text-mocha mt-1">
                Scan to track your order on your phone.
              </p>
            </div>
          )}

          <button
            className="btn-primary w-full text-base py-4 relative overflow-hidden"
            onClick={onReset}
          >
            <span className="relative z-10">
              {autoResetEnabled ? `Next Guest (auto in ${remaining}s)` : "Next Guest"}
            </span>
            {autoResetEnabled && (
              <span
                className="absolute left-0 bottom-0 h-1 bg-gold transition-[width] duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            )}
          </button>
          {autoResetEnabled && (
            <p className="text-[11px] text-mocha/60 mt-2">
              Tap anywhere on the button to reset now.
            </p>
          )}
        </div>
      </div>
      <Footer />
    </main>
  );
}
