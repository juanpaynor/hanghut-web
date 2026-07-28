/**
 * Custom-CSS support for event storefronts (HelixPay-style "css" skin).
 *
 * The value is stored in events.layout_config.custom_css and injected into the
 * public event page inside the [data-hh-theme] storefront wrapper. Partners can
 * write anything; we only guard against breaking OUT of the <style> tag (CSS
 * itself can't execute JS). Rules are conventionally scoped under
 * [data-hh-theme] so a skin only ever touches its own storefront.
 */

/** Strip any attempt to close the <style> element or open a script tag. */
export function sanitizeCustomCss(css: string | null | undefined): string {
    if (!css) return ''
    return css.replace(/<\/?(style|script)\b[^>]*>/gi, '').slice(0, 40000)
}

/**
 * A loud dark starter skin, adapted from the "maximalist" storefront concept.
 * Scoped under [data-hh-theme] so it only skins the storefront. It's a starting
 * point — partners tweak the --skin-* variables and add their own rules.
 */
export const MAXIMALIST_PRESET_CSS = `/* ✦ HangHut — Maximalist starter skin.
   Everything is scoped to [data-hh-theme] so it only touches your storefront,
   never the rest of HangHut. Change the --skin-* colors and make it yours. */
[data-hh-theme] {
  --skin-ink: #150a26;
  --skin-ink-2: #0d0618;
  --skin-a: #ff5e8a;   /* neon 1 */
  --skin-b: #ffb648;   /* neon 2 */
  --skin-c: #6d5efc;   /* HangHut indigo */
  --skin-paper: #f6efe4;
  background:
    radial-gradient(1100px 560px at 80% -10%, rgba(160,120,255,0.20), transparent 60%),
    linear-gradient(180deg, var(--skin-ink), var(--skin-ink-2)) !important;
  color: var(--skin-paper) !important;
  position: relative;
}
/* concentric ripple field behind everything */
[data-hh-theme]::before {
  content: ""; position: fixed; inset: -30vmax; z-index: 0; pointer-events: none;
  background:
    repeating-radial-gradient(circle at 22% 18%, transparent 0 38px, rgba(160,120,255,0.06) 38px 40px),
    repeating-radial-gradient(circle at 82% 72%, transparent 0 46px, rgba(120,240,190,0.05) 46px 48px);
}
[data-hh-theme] > * { position: relative; z-index: 1; }

/* headings become gradient wordmarks */
[data-hh-theme] h1,
[data-hh-theme] h2 {
  font-weight: 900 !important;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  background: linear-gradient(135deg, var(--skin-a), var(--skin-b)) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
  filter: drop-shadow(0 6px 26px rgba(255,94,138,0.28));
}

/* round + glow the primary calls-to-action */
[data-hh-theme] button,
[data-hh-theme] a[role="button"] { border-radius: 999px !important; }
[data-hh-theme] [class*="bg-primary"] {
  background: linear-gradient(135deg, var(--skin-a), var(--skin-b)) !important;
  color: #1a0b2e !important;
  box-shadow: 0 14px 40px -12px var(--skin-a) !important;
}

/* soften card / panel borders to match the dark ground */
[data-hh-theme] [class*="rounded"] { border-color: rgba(246,239,228,0.14) !important; }
`
