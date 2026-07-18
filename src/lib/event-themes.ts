/**
 * Art-directed event page themes.
 *
 * Unlike the knob presets (bg/font/color), a THEME restyles the page's actual
 * components — cards, badges, buttons, section headers, hero type — so each
 * theme reads as a different visual world, not the same page in new colors.
 *
 * Mechanism: the public event page sets `data-hh-theme="<id>"` on its root and
 * injects `getEventThemeCss(id)` as a <style> tag (all three page layouts).
 * Theme CSS targets the styling hooks sprinkled through the page:
 *   [data-hh-card]           — content cards (details, organizer, tickets)
 *   [data-hh-badge]          — pill badges (event type / featured)
 *   [data-hh-title]          — big hero titles on dark heroes
 *   [data-hh-section-title]  — section headings (About / Location / Get Tickets)
 *   #tickets                 — the ticket card + its buttons
 *   --hh-accent              — raw theme_color hex, set on the page root
 *
 * Rules of engagement (so themes never break the page):
 * - Restyle SHAPE, BORDERS, SHADOWS, TYPE TREATMENT — not fills. Background
 *   fills stay owned by the existing light/glass logic; exceptions are badges
 *   and buttons, which are small and self-contained.
 * - Alpha tints derive from the accent via color-mix so a theme follows the
 *   organizer's brand color if they change it.
 * - 'classic' is the current look: no CSS at all.
 */

export type EventThemeId =
    | 'classic'
    | 'neon-rave'
    | 'velvet-gala'
    | 'sunset-festival'
    | 'circuit'
    | 'broadsheet'

/** Applies the organizer-chosen heading font to headings in every layout
 *  (the default layout already does this; poster/minimal don't). */
const BASE = `
[data-hh-theme]:not([data-hh-theme="classic"]) h1,
[data-hh-theme]:not([data-hh-theme="classic"]) h2,
[data-hh-theme]:not([data-hh-theme="classic"]) h3,
[data-hh-theme]:not([data-hh-theme="classic"]) h4{font-family:var(--font-heading)}
`

const THEME_CSS: Record<EventThemeId, string> = {
    classic: '',

    /* ── NEON RAVE ─ electric glow, sharp edges, uppercase display type ────── */
    'neon-rave': `
[data-hh-theme="neon-rave"] [data-hh-title]{
  text-transform:uppercase;letter-spacing:.02em;
  text-shadow:0 0 18px color-mix(in srgb,var(--hh-accent) 85%,transparent),
              0 0 70px color-mix(in srgb,var(--hh-accent) 45%,transparent);
}
[data-hh-theme="neon-rave"] [data-hh-badge]{
  border-radius:4px;background:transparent;
  border:1px solid color-mix(in srgb,var(--hh-accent) 75%,white);
  color:var(--hh-accent);
  box-shadow:0 0 12px color-mix(in srgb,var(--hh-accent) 40%,transparent),
             inset 0 0 8px color-mix(in srgb,var(--hh-accent) 20%,transparent);
}
[data-hh-theme="neon-rave"] [data-hh-card]{
  border-radius:10px;
  border:1px solid color-mix(in srgb,var(--hh-accent) 35%,transparent);
  box-shadow:0 0 0 1px rgba(255,255,255,.04),
             0 0 34px color-mix(in srgb,var(--hh-accent) 16%,transparent);
}
[data-hh-theme="neon-rave"] [data-hh-section-title]{
  text-transform:uppercase;letter-spacing:.12em;
}
[data-hh-theme="neon-rave"] [data-hh-section-title]::before{
  content:'✦ ';color:var(--hh-accent);
  text-shadow:0 0 10px var(--hh-accent);
}
[data-hh-theme="neon-rave"] #tickets{
  border:1px solid color-mix(in srgb,var(--hh-accent) 45%,transparent);
  box-shadow:0 0 44px color-mix(in srgb,var(--hh-accent) 22%,transparent);
}
[data-hh-theme="neon-rave"] #tickets>div:first-child{
  border-bottom:1px dashed color-mix(in srgb,var(--hh-accent) 45%,transparent);
}
[data-hh-theme="neon-rave"] #tickets button{
  border-radius:8px;text-transform:uppercase;letter-spacing:.06em;
}
`,

    /* ── VELVET GALA ─ hairline gold frames, small caps, engraved restraint ── */
    'velvet-gala': `
[data-hh-theme="velvet-gala"] [data-hh-title]{
  font-weight:600;letter-spacing:.01em;
}
[data-hh-theme="velvet-gala"] [data-hh-badge]{
  border-radius:0;background:transparent;
  border:1px solid color-mix(in srgb,var(--hh-accent) 65%,transparent);
  color:var(--hh-accent);letter-spacing:.22em;
}
[data-hh-theme="velvet-gala"] [data-hh-card]{
  border-radius:2px;
  border:1px solid color-mix(in srgb,var(--hh-accent) 40%,transparent);
  outline:1px solid color-mix(in srgb,var(--hh-accent) 16%,transparent);
  outline-offset:5px;
  box-shadow:none;
}
[data-hh-theme="velvet-gala"] [data-hh-section-title]{
  text-transform:uppercase;letter-spacing:.18em;font-weight:600;
}
[data-hh-theme="velvet-gala"] [data-hh-section-title]::after{
  content:'';display:block;width:64px;height:1px;margin-top:10px;
  background:linear-gradient(90deg,var(--hh-accent),transparent);
}
[data-hh-theme="velvet-gala"] #tickets button{border-radius:0;letter-spacing:.08em}
`,

    /* ── SUNSET FESTIVAL ─ chunky rounded, sticker badges, wavy underlines ─── */
    'sunset-festival': `
[data-hh-theme="sunset-festival"] [data-hh-badge]{
  background:var(--hh-accent);color:#fff;border:none;border-radius:999px;
  transform:rotate(-2deg);box-shadow:0 3px 0 rgba(0,0,0,.18);
}
[data-hh-theme="sunset-festival"] [data-hh-badge]+[data-hh-badge]{transform:rotate(2deg)}
[data-hh-theme="sunset-festival"] [data-hh-card]{
  border-radius:24px;
  border:2px solid color-mix(in srgb,var(--hh-accent) 30%,transparent);
}
[data-hh-theme="sunset-festival"] [data-hh-section-title]{
  font-weight:800;
  text-decoration:underline wavy var(--hh-accent);
  text-decoration-thickness:2px;text-underline-offset:7px;
}
[data-hh-theme="sunset-festival"] #tickets{
  border-radius:28px;
  border:2px solid color-mix(in srgb,var(--hh-accent) 35%,transparent);
}
[data-hh-theme="sunset-festival"] #tickets button{border-radius:999px;font-weight:800}
`,

    /* ── CIRCUIT ─ corner brackets, square edges, terminal labels ──────────── */
    circuit: `
[data-hh-theme="circuit"] [data-hh-badge]{
  border-radius:2px;background:transparent;
  border:1px solid color-mix(in srgb,var(--hh-accent) 70%,transparent);
  color:var(--hh-accent);
  font-family:ui-monospace,'JetBrains Mono',monospace;letter-spacing:.1em;
}
[data-hh-theme="circuit"] [data-hh-card]{
  position:relative;border-radius:2px;
  border:1px solid color-mix(in srgb,var(--hh-accent) 30%,transparent);
  box-shadow:none;
}
[data-hh-theme="circuit"] [data-hh-card]::before,
[data-hh-theme="circuit"] [data-hh-card]::after{
  content:'';position:absolute;width:14px;height:14px;pointer-events:none;z-index:1;
}
[data-hh-theme="circuit"] [data-hh-card]::before{
  top:0;left:0;border-top:2px solid var(--hh-accent);border-left:2px solid var(--hh-accent);
}
[data-hh-theme="circuit"] [data-hh-card]::after{
  bottom:0;right:0;border-bottom:2px solid var(--hh-accent);border-right:2px solid var(--hh-accent);
}
[data-hh-theme="circuit"] [data-hh-section-title]{
  font-family:ui-monospace,'JetBrains Mono',monospace;
  text-transform:uppercase;letter-spacing:.1em;font-size:1.1rem;
}
[data-hh-theme="circuit"] [data-hh-section-title]::before{
  content:'// ';color:var(--hh-accent);
}
[data-hh-theme="circuit"] #tickets button{
  border-radius:3px;text-transform:uppercase;letter-spacing:.05em;
}
`,

    /* ── BROADSHEET ─ print rules, numbered sections, zero radius ──────────── */
    broadsheet: `
[data-hh-theme="broadsheet"]{counter-reset:hhsec}
[data-hh-theme="broadsheet"] [data-hh-badge]{
  border-radius:0;background:transparent;border:1px solid currentColor;
  color:inherit;text-transform:uppercase;letter-spacing:.16em;
}
[data-hh-theme="broadsheet"] [data-hh-card]{
  border-radius:0;border:none;border-top:2px solid currentColor;
  box-shadow:none;
}
[data-hh-theme="broadsheet"] [data-hh-section-title]{
  counter-increment:hhsec;
  text-transform:uppercase;letter-spacing:.14em;
}
[data-hh-theme="broadsheet"] [data-hh-section-title]::before{
  content:counter(hhsec,decimal-leading-zero) '  ';
  color:color-mix(in srgb,currentColor 45%,transparent);
  font-variant-numeric:tabular-nums;
}
[data-hh-theme="broadsheet"] #tickets{border-top-width:3px}
[data-hh-theme="broadsheet"] #tickets button{border-radius:0}
[data-hh-theme="broadsheet"] main .rounded-2xl,
[data-hh-theme="broadsheet"] main .rounded-xl{border-radius:0}
`,
}

/** Full CSS to inject for a theme ('' for classic/unknown → no style tag). */
export function getEventThemeCss(themeId: string): string {
    const css = THEME_CSS[themeId as EventThemeId]
    if (!css) return ''
    return BASE + css
}
