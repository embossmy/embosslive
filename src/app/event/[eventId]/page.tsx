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

  const cleanName = useMemo(() => sanitizeName(name), [name]);
  const tooLong = cleanName.length > maxLen;
  const containsEmoji = hasEmoji(name);
  const canSubmit = cleanName.length > 0 && !tooLong && !containsEmoji && !submitting;

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);
      const queue = nextQueueNumber(count ?? 0);

      const { data, error } = await supabase
        .from("orders")
        .insert({
          event_id: eventId,
          queue_number: queue,
          guest_name: cleanName,
          selected_font: font,
          selected_colour: colour || null,
          status: "waiting",
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
                  return (
                    <button
                      key={c}
                      onClick={() => setColour(c)}
                      className="relative flex items-center justify-center rounded-xl px-4 py-4 transition-all duration-150 select-none"
                      style={{
                        backgroundColor: parsed.hex,
                        color: textColor,
                        boxShadow: active
                          ? `0 0 0 3px ${parsed.hex}, 0 0 0 5px #1A1A1A`
                          : "0 1px 3px rgba(0,0,0,0.12)",
                      }}
                    >
                      {active && (
                        <span
                          className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: textColor }}
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 10 10" stroke={parsed.hex} strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 5l2.5 2.5 4.5-4" />
                          </svg>
                        </span>
                      )}
                      <span className="text-sm font-semibold tracking-wide">
                        {parsed.name}
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
