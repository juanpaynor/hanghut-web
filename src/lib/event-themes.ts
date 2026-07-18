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
    | 'fiesta'

/** Shared theme foundation:
 *  - applies the organizer-chosen heading font to headings in every layout
 *    (the default layout already does this; poster/minimal don't)
 *  - orchestrated entrance: badges → title → meta rise in sequence on load
 *  - gentle lift on card hover so the page feels alive
 *  All scoped :not(classic) so the classic look stays byte-identical, and all
 *  disabled under prefers-reduced-motion. */
const BASE = `
[data-hh-theme]:not([data-hh-theme="classic"]) h1,
[data-hh-theme]:not([data-hh-theme="classic"]) h2,
[data-hh-theme]:not([data-hh-theme="classic"]) h3,
[data-hh-theme]:not([data-hh-theme="classic"]) h4{font-family:var(--font-heading)}
@keyframes hhRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
[data-hh-theme]:not([data-hh-theme="classic"]) [data-hh-badge]{
  animation:hhRise .5s cubic-bezier(.2,.7,.3,1) both}
[data-hh-theme]:not([data-hh-theme="classic"]) [data-hh-badge]:nth-child(2){animation-delay:.08s}
[data-hh-theme]:not([data-hh-theme="classic"]) [data-hh-title]{
  animation:hhRise .7s cubic-bezier(.2,.7,.3,1) .12s both}
[data-hh-theme]:not([data-hh-theme="classic"]) [data-hh-title]+*{
  animation:hhRise .6s cubic-bezier(.2,.7,.3,1) .26s both}
[data-hh-theme]:not([data-hh-theme="classic"]) [data-hh-card]{
  transition:transform .25s ease,box-shadow .25s ease}
[data-hh-theme]:not([data-hh-theme="classic"]) [data-hh-card]:hover{
  transform:translateY(-2px)}
@media (prefers-reduced-motion:reduce){
  [data-hh-theme] [data-hh-badge],[data-hh-theme] [data-hh-title],[data-hh-theme] [data-hh-title]+*{animation:none}
  [data-hh-theme] [data-hh-card]:hover{transform:none}
}
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
[data-hh-theme="neon-rave"] #tickets button,
[data-hh-theme="neon-rave"][data-hh-modal] button{
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
[data-hh-theme="velvet-gala"] #tickets button,
[data-hh-theme="velvet-gala"][data-hh-modal] button{border-radius:0;letter-spacing:.08em}
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
[data-hh-theme="sunset-festival"] #tickets button,
[data-hh-theme="sunset-festival"][data-hh-modal] button{border-radius:999px;font-weight:800}
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
[data-hh-theme="circuit"] #tickets button,
[data-hh-theme="circuit"][data-hh-modal] button{
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
[data-hh-theme="broadsheet"] #tickets button,
[data-hh-theme="broadsheet"][data-hh-modal] button{border-radius:0}
[data-hh-theme="broadsheet"] main .rounded-2xl,
[data-hh-theme="broadsheet"] main .rounded-xl{border-radius:0}
`,

    /* ── FIESTA ─ banderitas bunting, bright and light, PH street-party ────── */
    fiesta: `
[data-hh-theme="fiesta"]{position:relative}
/* Banderitas: a fixed pennant string just below the navbar, page-wide */
[data-hh-theme="fiesta"]::before{
  content:'';position:fixed;top:64px;left:0;right:0;height:14px;z-index:40;
  pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='14'%3E%3Cpath d='M0 0h24L12 13z' fill='%23F43F5E'/%3E%3Cpath d='M24 0h24L36 13z' fill='%23FBBF24'/%3E%3Cpath d='M48 0h24L60 13z' fill='%2322C55E'/%3E%3Cpath d='M72 0h24L84 13z' fill='%233B82F6'/%3E%3C/svg%3E");
  background-repeat:repeat-x;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.15));
}
[data-hh-theme="fiesta"] [data-hh-badge]{
  background:var(--hh-accent);color:#fff;border:none;border-radius:999px;
  transform:rotate(-2deg);box-shadow:0 2px 0 rgba(0,0,0,.15);
}
[data-hh-theme="fiesta"] [data-hh-badge]+[data-hh-badge]{
  transform:rotate(2deg);background:#FBBF24;color:#78350F;
}
[data-hh-theme="fiesta"] [data-hh-card]{
  border-radius:20px;
  border:2px solid color-mix(in srgb,var(--hh-accent) 25%,transparent);
}
[data-hh-theme="fiesta"] [data-hh-section-title]{
  font-weight:800;
}
[data-hh-theme="fiesta"] [data-hh-section-title]::after{
  content:'';display:block;height:5px;width:76px;margin-top:8px;border-radius:3px;
  background:linear-gradient(90deg,#F43F5E 0 25%,#FBBF24 25% 50%,#22C55E 50% 75%,#3B82F6 75% 100%);
}
[data-hh-theme="fiesta"] #tickets{
  border-radius:24px;
  border:2px dashed color-mix(in srgb,var(--hh-accent) 45%,transparent);
}
[data-hh-theme="fiesta"] #tickets button,
[data-hh-theme="fiesta"][data-hh-modal] button{border-radius:999px;font-weight:800}
`,
}

/** Full CSS to inject for a theme ('' for classic/unknown → no style tag). */
export function getEventThemeCss(themeId: string): string {
    const css = THEME_CSS[themeId as EventThemeId]
    if (!css) return ''
    return BASE + css
}
