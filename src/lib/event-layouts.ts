/**
 * Art-directed PAGE LAYOUTS — the "bones" layer.
 *
 * A theme (see event-themes.ts) repaints the components; a LAYOUT changes the
 * page's actual composition. Each layout has two halves:
 *   1. A dedicated render branch in events/[id]/page.tsx that provides its own
 *      HERO + page chrome (header, background treatment, sticky bars).
 *   2. This CSS module, which reshapes the SHARED body sections (details card,
 *      about, lineup, tickets, section titles) so they match the skeleton —
 *      keyed off `data-hh-layout="<id>"` on the page root.
 *
 * Why a second CSS layer instead of folding it into themes: layout owns
 * STRUCTURE (radius, borders, shadow, rules, rhythm) while a theme owns PAINT
 * (accent, glow, badges, buttons). They compose — pick any layout × any theme.
 * Injection order in the page is: layout base tailwind → THEME css → LAYOUT css
 * → custom css, so on a tie the skeleton wins structure but the theme keeps its
 * accents (which this module deliberately never touches).
 *
 * Attribute selectors are 0,2,0 — they beat Tailwind utility classes (0,1,0)
 * like `rounded-2xl` / `shadow-xl` on the shared cards, so no !important needed.
 *
 * classic/default/poster/minimal return '' — they keep their established looks.
 */

export type EventLayoutId =
    | 'default'
    | 'poster'
    | 'minimal'
    | 'broadside'
    | 'editorial'
    | 'cinematic'
    | 'boutique'

/** The four skeletons that ship their own bespoke hero branch. */
export const NEW_LAYOUTS: EventLayoutId[] = ['broadside', 'editorial', 'cinematic', 'boutique']

const LAYOUT_CSS: Record<string, string> = {
    default: '',
    poster: '',
    minimal: '',

    /* ── BROADSIDE ─ brutalist gig poster: no cards, hard rules, flat edges ── */
    broadside: `
[data-hh-layout="broadside"] [data-hh-card]{
  border-radius:0;box-shadow:none;border:0;
  border-top:2px solid currentColor;
  background:transparent;
}
[data-hh-layout="broadside"] [data-hh-section-title]{
  text-transform:uppercase;letter-spacing:-.01em;font-weight:900;
  line-height:.95;
}
/* details grid: strip the pill icon chrome, go structural */
[data-hh-layout="broadside"] [data-hh-card] .rounded-2xl{border-radius:0}
[data-hh-layout="broadside"] #tickets{
  border-radius:0;border:2px solid currentColor;box-shadow:none;
}
[data-hh-layout="broadside"] #tickets button{border-radius:0;text-transform:uppercase;letter-spacing:.04em;font-weight:800}
[data-hh-layout="broadside"] main .rounded-2xl,
[data-hh-layout="broadside"] main .rounded-xl{border-radius:0}
`,

    /* ── EDITORIAL ─ magazine spread: hairline rules, serif titles, air ────── */
    editorial: `
[data-hh-layout="editorial"] [data-hh-card]{
  border-radius:0;box-shadow:none;border:0;
  border-top:1px solid color-mix(in srgb,currentColor 22%,transparent);
  background:transparent;
}
[data-hh-layout="editorial"] [data-hh-section-title]{
  font-family:var(--font-heading);font-weight:600;letter-spacing:-.01em;
}
[data-hh-layout="editorial"] [data-hh-section-title]::before{
  content:'';display:block;width:34px;height:2px;margin-bottom:16px;
  background:var(--hh-accent);
}
[data-hh-layout="editorial"] #tickets{
  border-radius:0;border:0;border-top:2px solid var(--hh-accent);box-shadow:none;
}
[data-hh-layout="editorial"] #tickets button{border-radius:2px}
`,

    /* ── CINEMATIC ─ content floats in glass over a full-bleed poster ──────── */
    cinematic: `
[data-hh-layout="cinematic"]{color:#f1f5f9}
[data-hh-layout="cinematic"] .text-foreground,
[data-hh-layout="cinematic"] .text-muted-foreground{color:rgba(226,232,240,.85)}
[data-hh-layout="cinematic"] [class*=prose] p,
[data-hh-layout="cinematic"] [class*=prose] li{color:rgba(226,232,240,.9)}
[data-hh-layout="cinematic"] [data-hh-card] .text-muted-foreground{color:rgba(203,213,225,.8)}
[data-hh-layout="cinematic"] [data-hh-card]{
  border-radius:18px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(20,18,26,.55);
  backdrop-filter:blur(16px);
  box-shadow:0 20px 60px -30px rgba(0,0,0,.7);
}
[data-hh-layout="cinematic"] [data-hh-section-title]{letter-spacing:.01em}
[data-hh-layout="cinematic"] #tickets{
  border-radius:20px;border:1px solid rgba(255,255,255,.12);
  background:rgba(20,18,26,.6);backdrop-filter:blur(16px);
}
`,

    /* ── BOUTIQUE ─ centered invitation: hairline dividers, serif, all air ─── */
    boutique: `
[data-hh-layout="boutique"] [data-hh-card]{
  border-radius:0;box-shadow:none;border:0;background:transparent;
}
[data-hh-layout="boutique"] main > div{
  border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);
}
[data-hh-layout="boutique"] main > div:first-child{border-top:0}
[data-hh-layout="boutique"] [data-hh-section-title]{
  text-align:center;font-family:var(--font-heading);font-weight:500;
  letter-spacing:.01em;
}
[data-hh-layout="boutique"] .prose{text-align:center;max-width:34rem;margin-inline:auto}
[data-hh-layout="boutique"] #tickets{
  border-radius:14px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);
  box-shadow:none;
}
[data-hh-layout="boutique"] #tickets button{border-radius:999px}
`,
}

/** Full CSS to inject for a layout ('' for the classic three → no style tag). */
export function getEventLayoutCss(layoutId: string): string {
    return LAYOUT_CSS[layoutId] || ''
}
