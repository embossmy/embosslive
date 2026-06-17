export default function Footer({ hideBranding = false }: { hideBranding?: boolean }) {
  return (
    <footer className={`text-center pt-5 pb-4 mt-6 border-t border-sand/40 text-[10px] tracking-[0.3em] text-mocha/50 uppercase ${hideBranding ? "opacity-0 pointer-events-none" : ""}`}>
      Powered by{" "}
      <a
        href="https://emboss.my"
        target="_blank"
        rel="noreferrer"
        className="text-mocha/70 hover:text-ink transition-colors duration-150"
      >
        EMBOSS.MY
      </a>
    </footer>
  );
}
