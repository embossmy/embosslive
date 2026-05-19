// Strip emojis and most non-printable symbols. Keeps letters (incl. unicode), numbers, spaces, and common punctuation.
export function sanitizeName(input: string): string {
  // Remove emoji / pictographs / symbols
  const noEmoji = input.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}\u{200D}]/gu,
    ""
  );
  // Collapse internal whitespace, trim
  return noEmoji.replace(/\s+/g, " ").trim();
}

export function hasEmoji(input: string): boolean {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u.test(input);
}

// Registry of built-in fonts that aren't covered by the original three Tailwind
// classes (Modern / Elegant Script / Classic Serif). These render via inline
// fontFamily; the ones with `google` are auto-loaded by the GoogleFontsLoader.
export interface BuiltinFontDef {
  match: string; // lowercase comparison key
  display: string; // canonical display name
  family: string; // CSS font-family stack
  google?: string; // Google Fonts family name (if available)
  weights?: number[];
  italic?: boolean;
}

export const BUILTIN_FONT_DEFS: BuiltinFontDef[] = [
  {
    match: "times new roman",
    display: "Times New Roman",
    family: "'Times New Roman', Times, serif",
  },
  {
    match: "lato",
    display: "Lato",
    family: "'Lato', sans-serif",
    google: "Lato",
    weights: [400, 700],
  },
  {
    match: "alex brush",
    display: "Alex Brush",
    family: "'Alex Brush', 'Brush Script MT', cursive",
    google: "Alex Brush",
    weights: [400],
  },
  {
    match: "kunstler script",
    display: "Kunstler Script",
    // Proprietary (Microsoft). Falls back to a calligraphic system font.
    family:
      "'Kunstler Script', 'Lucida Calligraphy', 'Apple Chancery', cursive",
  },
  {
    match: "gabriola",
    display: "Gabriola",
    // Windows-only. Falls back to a calligraphic system font elsewhere.
    family: "Gabriola, 'Apple Chancery', 'Segoe Script', cursive",
  },
  {
    match: "jonnie walker",
    display: "Jonnie Walker",
    // Commercial display font. Falls back to a brush script.
    family: "'Jonnie Walker', 'Brush Script MT', cursive",
  },
  {
    match: "luxury modish",
    display: "Luxury Modish",
    // Commercial display font. Falls back to a high-contrast serif.
    family: "'Luxury Modish', 'Didot', 'Bodoni 72', serif",
  },
  {
    match: "silkscreen",
    display: "Silkscreen",
    family: "'Silkscreen', monospace",
    google: "Silkscreen",
    weights: [400, 700],
  },
];

function findBuiltin(name: string | null | undefined): BuiltinFontDef | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return (
    BUILTIN_FONT_DEFS.find(
      (f) =>
        f.match === key ||
        f.display.toLowerCase() === key ||
        f.google?.toLowerCase() === key
    ) ?? null
  );
}

export function isBuiltinFamily(family: string | null | undefined): boolean {
  return findBuiltin(family) !== null;
}

export function fontClassFor(font: string | null | undefined): string {
  // Custom fonts use inline style; return empty class so they don't get a builtin override.
  if (font && font.includes(":")) return "";
  // Registered built-ins also use inline style.
  if (findBuiltin(font)) return "";
  switch ((font || "").toLowerCase()) {
    case "elegant script":
      return "font-script";
    case "classic serif":
      return "font-classic";
    case "modern":
      return "font-modern";
    default:
      return "font-modern";
  }
}

// Parse a font option string. Accepts:
//   "Modern"                    → built-in
//   "Signature:Dancing Script"  → custom Google Font, displayed as "Signature"
//   "Royal:Cinzel:600"          → custom Google Font with weight
export interface ParsedFont {
  raw: string;        // original string (used as the value in state)
  displayName: string;
  family: string | null; // null for built-ins
  weight: number | null;
  italic: boolean;
}

export function parseFont(input: string): ParsedFont {
  let raw = input.trim();
  // Italic marker: "*i" suffix anywhere (we strip it before further parsing).
  let italic = false;
  if (raw.endsWith("*i")) {
    italic = true;
    raw = raw.slice(0, -2).trim();
  }
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.length >= 2 && parts[1]) {
    const weight = parts[2] ? Number(parts[2]) || null : null;
    return { raw: input.trim(), displayName: parts[0], family: parts[1], weight, italic };
  }
  return { raw: input.trim(), displayName: raw, family: null, weight: null, italic };
}

// Inline style override for a font option. Custom fonts get a real fontFamily.
// Italic is applied for both built-in and custom fonts when the "*i" marker is set.
export function fontStyleFor(
  font: string | null | undefined
): { fontFamily?: string; fontWeight?: number; fontStyle?: "italic" } | undefined {
  if (!font) return undefined;
  const parsed = parseFont(font);
  const style: { fontFamily?: string; fontWeight?: number; fontStyle?: "italic" } = {};
  if (parsed.family) {
    // If the family is actually a registered built-in (e.g. label-overridden
    // built-in font), reuse the full fallback stack so commercial fonts still
    // degrade gracefully on systems that don't have them installed.
    const builtin = findBuiltin(parsed.family);
    style.fontFamily = builtin ? builtin.family : `'${parsed.family}', serif`;
    if (parsed.weight) style.fontWeight = parsed.weight;
  } else {
    // Built-in lookup: apply the registered fontFamily stack.
    const b = findBuiltin(parsed.displayName);
    if (b) style.fontFamily = b.family;
  }
  if (parsed.italic) style.fontStyle = "italic";
  return Object.keys(style).length ? style : undefined;
}

// Friendly label for a font option in the UI.
export function fontDisplayName(font: string): string {
  return parseFont(font).displayName;
}

export function encodeFont(
  label: string,
  family?: string | null,
  weight?: number | null,
  italic?: boolean
): string {
  const lbl = label.trim();
  const fam = (family || "").trim();
  let out = "";
  if (!fam) {
    out = lbl;
  } else {
    out = `${lbl}:${fam}`;
    if (weight) out += `:${weight}`;
  }
  if (italic) out += "*i";
  return out;
}

// Convert font list into a Google Fonts CSS URL (or null if none need loading).
// Handles both custom (Label:Family) options and registered built-ins that
// have a Google Fonts family.
export function googleFontsHref(fonts: string[]): string | null {
  const specs: { family: string; weights: number[]; italic: boolean }[] = [];

  for (const f of fonts) {
    const p = parseFont(f);
    if (p.family) {
      // Label-overridden built-in: use the registered Google family if any,
      // and skip entirely for built-ins that aren't on Google Fonts.
      const builtin = findBuiltin(p.family);
      if (builtin) {
        if (builtin.google) {
          specs.push({
            family: builtin.google,
            weights: builtin.weights ?? [400, 700],
            italic: p.italic || !!builtin.italic,
          });
        }
        continue;
      }
      specs.push({
        family: p.family,
        weights: p.weight ? [p.weight] : [400, 500, 600, 700],
        italic: p.italic,
      });
      continue;
    }
    const b = findBuiltin(p.displayName);
    if (b?.google) {
      specs.push({
        family: b.google,
        weights: b.weights ?? [400, 700],
        italic: !!b.italic,
      });
    }
  }

  // De-duplicate by family name (keep widest weight set).
  const byFamily = new Map<string, { family: string; weights: Set<number>; italic: boolean }>();
  for (const s of specs) {
    const key = s.family.toLowerCase();
    const existing = byFamily.get(key);
    if (existing) {
      s.weights.forEach((w) => existing.weights.add(w));
      existing.italic = existing.italic || s.italic;
    } else {
      byFamily.set(key, {
        family: s.family,
        weights: new Set(s.weights),
        italic: s.italic,
      });
    }
  }

  const families = Array.from(byFamily.values()).map((s) => {
    const fam = s.family.replace(/\s+/g, "+");
    const weights = Array.from(s.weights).sort((a, b) => a - b);
    const tuples: string[] = [];
    for (const w of weights) tuples.push(`0,${w}`);
    if (s.italic) for (const w of weights) tuples.push(`1,${w}`);
    return `${fam}:ital,wght@${tuples.join(";")}`;
  });

  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
}

// CSS transform for the preview name overlay, including rotation and perspective tilt.
// rotation = Z-axis (clockwise degrees)
// tiltX    = rotation around Y axis (left/right perspective, degrees)
// tiltY    = rotation around X axis (top/bottom perspective, degrees)
export function nameTransform(
  rotation: number | null | undefined,
  tiltX: number | null | undefined,
  tiltY: number | null | undefined
): string {
  const r = rotation ?? 0;
  const tx = tiltX ?? 0;
  const ty = tiltY ?? 0;
  return `translate(-50%, -50%) rotateX(${ty}deg) rotateY(${tx}deg) rotate(${r}deg)`;
}

// Start-button style for the welcome screen, computed from per-event config.
export interface StartButtonStyle {
  text: string;
  // Inline style objects spreadable onto a div / button.
  containerStyle: Record<string, string | number>;
  buttonStyle: Record<string, string | number>;
}

export function startButtonStyle(opts: {
  text?: string | null;
  bg?: string | null;
  textColor?: string | null;
  shape?: "rect" | "pill" | "circle" | null;
  radius?: number | null;
  width?: number | null;
  height?: number | null;
  fontSize?: number | null;
  posX?: number | null;
  posY?: number | null;
  font?: string | null; // font option string, e.g. "Modern" or "Signature:Dancing Script*i"
}): StartButtonStyle & { fontClass: string } {
  const text = (opts.text ?? "Start").trim() || "Start";
  const bg = opts.bg ?? "#3B2A1A";
  const fg = opts.textColor ?? "#FBF8F3";
  const shape = opts.shape ?? "rect";
  const radius = opts.radius ?? 16;
  const width = opts.width ?? 240;
  const height = opts.height ?? 72;
  const fontSize = opts.fontSize ?? 22;
  const posX = opts.posX ?? 50;
  const posY = opts.posY ?? 85;

  let borderRadius: string | number = radius;
  let w: string | number = width > 0 ? `${width}px` : "auto";
  let h: string | number = `${height}px`;
  if (shape === "pill") borderRadius = 9999;
  if (shape === "circle") {
    borderRadius = 9999;
    // For circles, the height slider drives the diameter so it can shrink
    // independently of the rectangular `width` value.
    const d = height;
    w = `${d}px`;
    h = `${d}px`;
  }

  const font = opts.font ?? "";
  const fontInline = font ? fontStyleFor(font) : undefined;
  const fontClass = font ? fontClassFor(font) : "";

  return {
    text,
    fontClass,
    containerStyle: {
      position: "absolute",
      left: `${posX}%`,
      top: `${posY}%`,
      transform: "translate(-50%, -50%)",
    },
    buttonStyle: {
      backgroundColor: bg,
      color: fg,
      borderRadius,
      width: w,
      height: h,
      fontSize: `${fontSize}px`,
      padding: shape === "circle" ? 0 : "0 24px",
      lineHeight: 1.1,
      fontWeight: (fontInline?.fontWeight as number) ?? 600,
      letterSpacing: "0.02em",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      border: "none",
      cursor: "pointer",
      ...(fontInline?.fontFamily ? { fontFamily: fontInline.fontFamily } : {}),
      ...(fontInline?.fontStyle ? { fontStyle: fontInline.fontStyle } : {}),
    },
  };
}

export function pad3(n: number): string {
  return n.toString().padStart(3, "0");
}

export function nextQueueNumber(prevCount: number): string {
  return `A${pad3(prevCount + 1)}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Built-in name → hex lookup for common materials/colours.
// Admins can override or add custom hex via "Name:#RRGGBB" syntax.
const COLOUR_LIBRARY: Record<string, string> = {
  // Woods
  "natural oak": "#C19A6B",
  oak: "#C19A6B",
  walnut: "#5D4037",
  "dark walnut": "#3E2723",
  ebony: "#2B1810",
  mahogany: "#4E1A0E",
  cherry: "#B5651D",
  maple: "#E0C9A6",
  pine: "#D8B789",
  bamboo: "#D2B48C",
  teak: "#A0734D",
  rosewood: "#65000B",
  // Metals
  gold: "#D4AF37",
  "rose gold": "#B76E79",
  silver: "#C0C0C0",
  copper: "#B87333",
  brass: "#B5A642",
  bronze: "#CD7F32",
  // Neutrals
  white: "#FFFFFF",
  ivory: "#FBF8F3",
  cream: "#F5EBDC",
  beige: "#E8D9B5",
  black: "#1A1A1A",
  charcoal: "#36454F",
  grey: "#8A8A8A",
  gray: "#8A8A8A",
  // Tones
  champagne: "#E7D9B5",
  blush: "#F4C2C2",
  navy: "#1B2A4E",
  burgundy: "#6E0D25",
  forest: "#1F3D2B",
  emerald: "#046307",
  red: "#C0392B",
  blue: "#2E5C8A",
};

export interface ParsedColour {
  name: string;
  hex: string; // CSS-valid colour string
  isLight: boolean;
  imageUrl: string | null; // optional product image for this colour
}

// Accepts:
//   "Walnut"                          → hex from library
//   "Walnut:#5D4037"                  → explicit hex
//   "Walnut:#5D4037@https://img.jpg"  → with product image
//   "Walnut@https://img.jpg"          → library hex + image
export function parseColour(input: string): ParsedColour {
  const raw = input.trim();
  // Split off optional image after "@"
  const atIdx = raw.indexOf("@");
  const head = atIdx >= 0 ? raw.slice(0, atIdx).trim() : raw;
  const imageUrl = atIdx >= 0 ? raw.slice(atIdx + 1).trim() || null : null;

  const m = head.match(/^(.+?)\s*[:|]\s*(#?[0-9a-fA-F]{3,8})\s*$/);
  let name = head;
  let hex = "";
  if (m) {
    name = m[1].trim();
    hex = m[2].startsWith("#") ? m[2] : `#${m[2]}`;
  } else {
    const key = head.toLowerCase();
    hex = COLOUR_LIBRARY[key] ?? "#D9D2C6";
  }
  return { name, hex, isLight: isLightColour(hex), imageUrl };
}

// Re-encode parts back into the storage string format.
export function encodeColour(name: string, hex: string, imageUrl?: string | null): string {
  let out = name.trim();
  const cleanHex = (hex || "").trim();
  if (cleanHex) out += `:${cleanHex.startsWith("#") ? cleanHex : `#${cleanHex}`}`;
  if (imageUrl && imageUrl.trim()) out += `@${imageUrl.trim()}`;
  return out;
}

function isLightColour(hex: string): boolean {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length < 6) return true;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.65;
}
