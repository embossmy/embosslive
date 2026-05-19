"use client";

import { useEffect } from "react";
import { googleFontsHref } from "@/lib/utils";

// Injects a Google Fonts <link> tag for any custom fonts (e.g. "Signature:Dancing Script")
// in the provided list. Built-in font names are ignored.
export default function GoogleFontsLoader({ fonts }: { fonts: string[] }) {
  useEffect(() => {
    const href = googleFontsHref(fonts);
    if (!href) return;
    if (document.querySelector(`link[data-emboss-fonts="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.embossFonts = href;
    document.head.appendChild(link);
  }, [fonts]);
  return null;
}
