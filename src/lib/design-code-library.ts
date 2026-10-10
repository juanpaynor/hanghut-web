/**
 * What an organizer can actually target, and starting points for doing it.
 *
 * The Custom CSS box and the Rich Content box were both a bare <textarea>. The
 * complaint is not that people can't write CSS — it's that nothing on the screen
 * told them WHAT to write it against. Every styling hook on the public event
 * page ([data-hh-title], [data-hh-card], --hh-accent, …) existed only in the
 * page source, so the only discoverable move was the one "Maximalist" preset,
 * which replaces the whole look and is useless if you wanted to round a button.
 *
 * This module is the single source of truth for both the editor UI and the AI
 * assistant's prompt. The edge function restates it (Deno can't import from
 * src/), so if a hook changes here, change it there too — a model that invents a
 * selector produces CSS that silently does nothing, which is the worst possible
 * failure for someone who already isn't sure what they're doing.
 */

export type CodeSnippet = {
    id: string
    label: string
    /** One line, written for someone who does not read CSS. */
    blurb: string
    code: string
}

export type StyleTarget = {
    selector: string
    label: string
    hint: string
}

/* ────────────────────────────────────────────────────────────────────────────
   CSS
   ──────────────────────────────────────────────────────────────────────────── */

/** Every hook the public event page actually puts in the DOM, verified against
 *  src/app/events/[id]/page.tsx. Shown in the editor as a click-to-insert list. */
export const STYLE_TARGETS: StyleTarget[] = [
    { selector: '[data-hh-title]', label: 'Event title', hint: 'The big headline at the top of the page.' },
    { selector: '[data-hh-section-title]', label: 'Section headings', hint: '"About this Event", "Event Gallery", and the rest.' },
    { selector: '[data-hh-card]', label: 'Panels & cards', hint: 'The date/venue box, organizer card, ticket box.' },
    { selector: '[data-hh-badge]', label: 'Badges', hint: 'The small chips — event type, Featured, tier labels.' },
    { selector: '[data-hh-event] button', label: 'Buttons', hint: 'Every button, including Proceed to Checkout.' },
    { selector: '[data-hh-event] a', label: 'Links', hint: 'Text links anywhere on the page.' },
    { selector: '[data-hh-event]', label: 'The whole page', hint: 'Use for page background and default text colour.' },
    { selector: '[data-hh-event] img', label: 'Images', hint: 'Poster, gallery photos, organizer avatar.' },
]

/** Variables the page sets for you — reading them keeps a skin in step with the
 *  colour and font pickers above instead of hard-coding a second palette. */
export const STYLE_VARIABLES: StyleTarget[] = [
    { selector: 'var(--hh-accent)', label: 'Your brand colour', hint: 'Whatever is set in the colour picker above.' },
    { selector: 'var(--font-heading)', label: 'Your heading font', hint: 'Follows the font picker above.' },
    { selector: 'var(--font-body)', label: 'Your body font', hint: 'Follows the font picker above.' },
]

/** A commented skeleton. Loading this leaves the page looking identical — every
 *  rule is commented out — so a nervous first-timer can press it safely and
 *  uncomment one line at a time. That is the whole point of it. */
export const STARTER_CSS = `/* Your page's own stylesheet.
   Everything here only ever touches THIS event page — never the rest of HangHut.
   Nothing below is switched on yet. To switch a block on, delete the comment
   markers wrapping it (the slash-star at the top and star-slash at the bottom).
   Live preview is on the right, so you'll see each change as you type. */

/* ---- The big title at the top ---------------------------------------- */
/*
[data-hh-title] {
  text-transform: uppercase;
  letter-spacing: -0.02em;
  color: var(--hh-accent);
}
*/

/* ---- Section headings ("About this Event", …) ------------------------- */
/*
[data-hh-section-title] {
  border-bottom: 2px solid var(--hh-accent);
  padding-bottom: 6px;
}
*/

/* ---- The panels: date/venue, organizer, tickets ----------------------- */
/*
[data-hh-card] {
  border-radius: 20px;
  border: 1px solid var(--hh-accent);
}
*/

/* ---- Buttons ----------------------------------------------------------- */
/*
[data-hh-event] button {
  border-radius: 999px;
  letter-spacing: 0.02em;
}
*/
`

export const CSS_SNIPPETS: CodeSnippet[] = [
    {
        id: 'pill-buttons',
        label: 'Pill buttons',
        blurb: 'Rounds every button, including Buy / Checkout.',
        code: `[data-hh-event] button,
[data-hh-event] a[role="button"] {
  border-radius: 999px !important;
}`,
    },
    {
        id: 'accent-title',
        label: 'Title in your brand colour',
        blurb: 'Paints the headline with the colour picked above.',
        code: `[data-hh-title] {
  color: var(--hh-accent) !important;
}`,
    },
    {
        id: 'gradient-title',
        label: 'Gradient title',
        blurb: 'Fades the headline between two colours.',
        code: `[data-hh-title] {
  background: linear-gradient(135deg, var(--hh-accent), #ffb648) !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  color: transparent !important;
}`,
    },
    {
        id: 'uppercase-title',
        label: 'Shout the title',
        blurb: 'Uppercase, tight, poster-style.',
        code: `[data-hh-title] {
  text-transform: uppercase;
  letter-spacing: -0.03em;
  line-height: 0.95;
}`,
    },
    {
        id: 'soft-cards',
        label: 'Softer panels',
        blurb: 'Bigger corners and a light shadow on every card.',
        code: `[data-hh-card] {
  border-radius: 22px !important;
  box-shadow: 0 18px 50px -24px rgba(0,0,0,0.45) !important;
}`,
    },
    {
        id: 'outline-cards',
        label: 'Outlined panels',
        blurb: 'Flat cards with a brand-coloured hairline.',
        code: `[data-hh-card] {
  background: transparent !important;
  box-shadow: none !important;
  border: 1px solid color-mix(in srgb, var(--hh-accent) 45%, transparent) !important;
}`,
    },
    {
        id: 'accent-badges',
        label: 'Brand-coloured badges',
        blurb: 'Makes the small chips match your colour.',
        code: `[data-hh-badge] {
  background: var(--hh-accent) !important;
  color: #fff !important;
  border-color: transparent !important;
}`,
    },
    {
        id: 'poster-frame',
        label: 'Frame the poster',
        blurb: 'Adds a border and rounded corners to images.',
        code: `[data-hh-event] img {
  border-radius: 16px;
}`,
    },
    {
        id: 'wider-text',
        label: 'Roomier text',
        blurb: 'More line spacing in the description.',
        code: `[data-hh-event] p,
[data-hh-event] li {
  line-height: 1.8;
}`,
    },
    {
        id: 'page-background',
        label: 'Flat page colour',
        blurb: 'Replaces the background with one solid colour.',
        code: `[data-hh-event] {
  background: #0d0618 !important;
  color: #f6efe4 !important;
}`,
    },
]

/* ────────────────────────────────────────────────────────────────────────────
   HTML  (the About section — see SANITIZE_OPTIONS in src/lib/sanitize.ts)
   ──────────────────────────────────────────────────────────────────────────── */

/** Plain-English statement of what survives the sanitizer. Shown to the
 *  organizer, and restated to the model, because HTML that gets stripped looks
 *  to the author exactly like HTML that didn't save. */
export const HTML_RULES = [
    'Text, headings, lists, tables, links, images and YouTube/Vimeo embeds are all fine.',
    'Style things with a style="..." attribute on the tag itself.',
    'Scripts, forms and <style> blocks are removed — this is content, not code.',
    'Leave this empty to use the normal description from the event form.',
] as const

export const HTML_STARTER = `<h3 style="margin-bottom:8px;">What to expect</h3>
<p>Two sentences on why someone should come. Keep it short — people skim.</p>

<ul>
  <li>Doors at 7:00 PM, show at 8:00 PM</li>
  <li>Bar and food available all night</li>
  <li>18+ — bring a valid ID</li>
</ul>

<p><strong>Heads up:</strong> tickets are non-refundable but transferable.</p>`

export const HTML_BLOCKS: CodeSnippet[] = [
    {
        id: 'highlight',
        label: 'Highlight box',
        blurb: 'A tinted callout for the one thing people must read.',
        code: `<div style="background:#fff7ed;border-left:4px solid #f97316;padding:14px 18px;border-radius:8px;margin:18px 0;">
  <strong>Important:</strong> Gates close at 8:30 PM sharp. Late entry is not permitted.
</div>`,
    },
    {
        id: 'run-of-show',
        label: 'Run of show',
        blurb: 'A clean two-column time/what table.',
        code: `<h3>Run of show</h3>
<table style="width:100%;">
  <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;width:110px;"><strong>7:00 PM</strong></td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Doors open</td></tr>
  <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;"><strong>8:00 PM</strong></td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">Opening set</td></tr>
  <tr><td style="padding:8px 0;"><strong>9:30 PM</strong></td><td style="padding:8px 0;">Headliner</td></tr>
</table>`,
    },
    {
        id: 'faq',
        label: 'Collapsible FAQ',
        blurb: 'Questions that expand when tapped.',
        code: `<h3>Questions</h3>
<details style="border-bottom:1px solid #e5e7eb;padding:10px 0;">
  <summary style="font-weight:600;">Is there parking?</summary>
  <p style="margin:8px 0 0;">Yes — paid parking in the building, ₱50 flat rate.</p>
</details>
<details style="border-bottom:1px solid #e5e7eb;padding:10px 0;">
  <summary style="font-weight:600;">Can I transfer my ticket?</summary>
  <p style="margin:8px 0 0;">Yes, message us before the event date.</p>
</details>`,
    },
    {
        id: 'two-col',
        label: 'Two columns',
        blurb: 'Side-by-side on desktop, stacked on a phone.',
        code: `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin:18px 0;">
  <div>
    <h4 style="margin:0 0 6px;">Getting there</h4>
    <p style="margin:0;">Five minutes from the MRT station. Grab drop-off at the lobby.</p>
  </div>
  <div>
    <h4 style="margin:0 0 6px;">House rules</h4>
    <p style="margin:0;">No outside drinks. No flash photography during the set.</p>
  </div>
</div>`,
    },
    {
        id: 'lineup',
        label: 'Lineup strip',
        blurb: 'Names as chips in a row.',
        code: `<h3>Lineup</h3>
<p style="margin:0;">
  <span style="display:inline-block;background:#f3f4f6;border-radius:999px;padding:6px 14px;margin:0 6px 6px 0;">Act One</span>
  <span style="display:inline-block;background:#f3f4f6;border-radius:999px;padding:6px 14px;margin:0 6px 6px 0;">Act Two</span>
  <span style="display:inline-block;background:#f3f4f6;border-radius:999px;padding:6px 14px;margin:0 6px 6px 0;">Act Three</span>
</p>`,
    },
    {
        id: 'youtube',
        label: 'YouTube embed',
        blurb: 'Drop in a trailer or last year’s recap.',
        code: `<div style="aspect-ratio:16/9;overflow:hidden;border-radius:12px;margin:18px 0;">
  <iframe src="https://www.youtube.com/embed/VIDEO_ID" title="Event video" allowfullscreen style="width:100%;height:100%;border:0;"></iframe>
</div>`,
    },
    {
        id: 'map',
        label: 'Map embed',
        blurb: 'An embedded Google map of the venue.',
        code: `<div style="border-radius:12px;overflow:hidden;margin:18px 0;">
  <iframe src="https://www.google.com/maps?q=YOUR+VENUE+NAME&output=embed" title="Venue map" width="100%" height="300" style="border:0;"></iframe>
</div>`,
    },
    {
        id: 'quote',
        label: 'Pull quote',
        blurb: 'A review or testimonial, set apart.',
        code: `<blockquote style="border-left:3px solid #d1d5db;margin:18px 0;padding:4px 0 4px 18px;font-size:1.05em;font-style:italic;color:#4b5563;">
  “Best night out I've had all year.”
  <span style="display:block;font-style:normal;font-size:0.85em;margin-top:6px;">— a regular</span>
</blockquote>`,
    },
]

/* ────────────────────────────────────────────────────────────────────────────
   Full makeovers — these REPLACE the box rather than adding to it.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A loud dark starter skin, adapted from the "maximalist" storefront concept.
 * Scoped under [data-hh-theme] so it only skins the storefront. It's a starting
 * point — partners tweak the --skin-* variables and add their own rules.
 *
 * Lives here rather than beside the sanitizer so that offering it in the UI
 * does not pull postcss into the client bundle.
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

export const CSS_PRESETS: CodeSnippet[] = [
    {
        id: 'maximalist',
        label: 'Maximalist',
        blurb: 'A complete dark, neon makeover. Replaces everything in the box.',
        code: MAXIMALIST_PRESET_CSS,
    },
]
