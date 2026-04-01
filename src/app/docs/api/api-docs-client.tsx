'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Lang } from './code-samples'
import * as samples from './code-samples'
import { CodeBlock, ResponseBlock, MethodBadge, ParamTable, StatusTable, AlertBox, LanguageSwitcher } from './api-doc-components'

/* ─── Sidebar config ─── */
const SECTIONS = [
    { group: 'Getting Started', items: [{ id: 'overview', label: 'Overview' }, { id: 'authentication', label: 'Authentication' }, { id: 'rate-limits', label: 'Rate Limits' }, { id: 'errors', label: 'Errors' }] },
    { group: 'Events', items: [{ id: 'list-events', label: 'List Events' }, { id: 'get-event', label: 'Get Event' }, { id: 'create-event', label: 'Create Event' }, { id: 'update-event', label: 'Update Event' }, { id: 'list-attendees', label: 'List Attendees' }] },
    { group: 'Checkout', items: [{ id: 'create-checkout', label: 'Create Session' }] },
    { group: 'Tickets', items: [{ id: 'verify-ticket', label: 'Verify Ticket' }, { id: 'check-in', label: 'Check In' }, { id: 'refund-ticket', label: 'Refund' }] },
    { group: 'Orders', items: [{ id: 'list-orders', label: 'List Orders' }] },
    { group: 'Webhooks', items: [{ id: 'webhooks', label: 'Overview' }, { id: 'register-webhook', label: 'Register' }] },
    { group: 'More', items: [{ id: 'analytics', label: 'Analytics' }, { id: 'promo-codes', label: 'Promo Codes' }] },
]

/* ─── JSON responses ─── */
const listEventsRes = `{
  "data": {
    "events": [
      {
        "id": "8db0f243-2e64-...",
        "title": "S10MAIC",
        "status": "active",
        "start_datetime": "2026-03-27T19:00:00+00:00",
        "venue_name": "Mow's",
        "capacity": 100,
        "tickets_sold": 100,
        "ticket_tiers": [
          {
            "name": "General Admission",
            "price": 1000,
            "quantity_total": 100,
            "quantity_sold": 100
          }
        ]
      }
    ],
    "meta": {
      "page": 1,
      "per_page": 10,
      "total": 7,
      "total_pages": 1,
      "has_more": false
    }
  }
}`

const verifyTicketRes = `{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "sold",
    "checked_in_at": null,
    "purchased_at": "2026-03-21T10:30:00Z",
    "event": {
      "id": "8db0f243-...",
      "title": "S10MAIC",
      "start_datetime": "2026-03-27T19:00:00+00:00",
      "venue_name": "Mow's"
    },
    "tier": {
      "name": "General Admission",
      "price": 1000
    },
    "customer": {
      "name": "Juan Dela Cruz",
      "email": "juan@example.com"
    }
  }
}`

const checkInRes = `{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "used",
    "checked_in_at": "2026-03-27T19:15:00Z",
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "customer": { "name": "Juan Dela Cruz" }
  }
}`

const refundRes = `{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "refunded",
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "tier": { "name": "General Admission", "price": 1000 }
  }
}`

const createEventRes = `{
  "data": {
    "id": "f47ac10b-58cc-...",
    "title": "Friday Night Comedy",
    "status": "draft",
    "start_datetime": "2026-04-10T20:00:00+08:00",
    "venue_name": "Comedy Bar Manila",
    "capacity": 150,
    "ticket_price": 800
  }
}`

const checkoutRes = `{
  "data": {
    "checkout_id": "pi_abc123def456",
    "checkout_url": "https://checkout.hanghut.com/...",
    "expires_at": "2026-03-22T00:00:00Z"
  }
}`

const listOrdersRes = `{
  "data": {
    "orders": [
      {
        "id": "pi_abc123-...",
        "event": { "id": "8db0f243-...", "title": "S10MAIC" },
        "customer": { "name": "Juan Dela Cruz", "email": "juan@example.com" },
        "quantity": 2,
        "total_amount": 2000,
        "status": "completed",
        "payment_method": "gcash",
        "paid_at": "2026-03-21T10:30:00Z"
      }
    ],
    "meta": { "page": 1, "total": 42, "has_more": true }
  }
}`

const webhookPayloadRes = `{
  "id": "evt_abc123...",
  "type": "ticket.purchased",
  "created_at": "2026-03-21T10:30:00Z",
  "data": {
    "ticket_id": "a1b2c3d4-...",
    "event_id": "8db0f243-...",
    "customer": { "name": "Juan Dela Cruz" },
    "amount": 1000
  }
}`

const registerWebhookRes = `{
  "data": {
    "id": "wh_abc123...",
    "url": "https://your-site.com/webhook",
    "events": ["ticket.purchased", "ticket.refunded"],
    "secret": "whsec_a1b2c3d4e5f6...",
    "is_active": true
  }
}`

const analyticsRes = `{
  "data": {
    "total_revenue": 150000,
    "total_tickets_sold": 212,
    "total_orders": 189,
    "total_discounts": 5000,
    "events": [
      {
        "id": "8db0f243-...",
        "title": "S10MAIC",
        "revenue": 100000,
        "tickets_sold": 100,
        "orders": 95
      }
    ]
  }
}`

const promoRes = `{
  "data": {
    "id": "pc_abc123...",
    "code": "EARLYBIRD",
    "discount_type": "percentage",
    "discount_amount": 20,
    "usage_limit": 50,
    "usage_count": 0,
    "is_active": true
  }
}`

const attendeesRes = `{
  "data": {
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "attendees": [
      {
        "ticket_id": "a1b2c3d4-...",
        "ticket_number": "TK-00042",
        "status": "sold",
        "checked_in_at": null,
        "customer": {
          "name": "Juan Dela Cruz",
          "email": "juan@example.com"
        },
        "tier": { "name": "General Admission", "price": 1000 }
      }
    ],
    "meta": { "page": 1, "total": 85, "has_more": true }
  }
}`

/* ═══════════════════════════════════════════
   Main API Docs Client
   ═══════════════════════════════════════════ */
export function ApiDocsClient() {
    const [lang, setLang] = useState<Lang>('curl')
    const [activeSection, setActiveSection] = useState('overview')
    const [mobileNav, setMobileNav] = useState(false)
    const mainRef = useRef<HTMLDivElement>(null)

    // Scroll tracking
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible.length > 0) setActiveSection(visible[0].target.id)
            },
            { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
        )
        const ids = SECTIONS.flatMap(s => s.items.map(i => i.id))
        ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el) })
        return () => observer.disconnect()
    }, [])

    const SidebarContent = () => (
        <div className="space-y-6 py-6">
            {SECTIONS.map(section => (
                <div key={section.group}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600 mb-2 px-3">{section.group}</p>
                    <ul className="space-y-0.5">
                        {section.items.map(item => (
                            <li key={item.id}>
                                <a
                                    href={`#${item.id}`}
                                    onClick={() => setMobileNav(false)}
                                    className={`block text-[13px] px-3 py-1.5 rounded-lg transition-all ${activeSection === item.id
                                        ? 'text-white bg-[#6c5ce7]/15 border-l-2 border-[#6c5ce7] font-medium'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
                                        }`}
                                >
                                    {item.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    )

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-zinc-300">
            {/* ── Header ── */}
            <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-[#0a0a0f]/95 backdrop-blur-xl">
                <div className="max-w-[1500px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button className="xl:hidden p-1.5 text-zinc-400 hover:text-white" onClick={() => setMobileNav(!mobileNav)}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <Link href="/" className="flex items-center gap-2.5">
                            <div className="bg-[#6c5ce7] px-2.5 py-1 rounded transform -rotate-1">
                                <span className="font-bold text-sm text-white tracking-tight">HANGHUT</span>
                            </div>
                        </Link>
                        <div className="h-4 w-px bg-zinc-800" />
                        <span className="text-sm font-medium text-zinc-400">API Reference</span>
                        <span className="text-[10px] font-mono bg-zinc-800/80 border border-zinc-700/50 px-2 py-0.5 rounded-full text-zinc-500">v1.0</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden md:block">
                            <LanguageSwitcher active={lang} onChange={setLang} />
                        </div>
                        <Link href="/organizer/developers" className="text-[13px] bg-[#6c5ce7] hover:bg-[#5a4bd1] text-white px-3.5 py-1.5 rounded-lg transition-colors font-medium shadow-lg shadow-[#6c5ce7]/10">
                            Get API Key
                        </Link>
                    </div>
                </div>
                {/* Mobile language switcher */}
                <div className="md:hidden border-t border-zinc-800/60 px-4 py-2 overflow-x-auto">
                    <LanguageSwitcher active={lang} onChange={setLang} />
                </div>
            </header>

            {/* Mobile nav overlay */}
            {mobileNav && (
                <div className="fixed inset-0 z-40 xl:hidden">
                    <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
                    <div className="absolute left-0 top-14 bottom-0 w-64 bg-[#0d1117] border-r border-zinc-800/60 overflow-y-auto px-3">
                        <SidebarContent />
                    </div>
                </div>
            )}

            <div className="max-w-[1500px] mx-auto flex">
                {/* ── Sidebar ── */}
                <nav className="hidden xl:block w-56 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto pl-6 pr-2 border-r border-zinc-800/40">
                    <SidebarContent />
                </nav>

                {/* ── Main ── */}
                <main ref={mainRef} className="flex-1 min-w-0">

                    {/* ═══ OVERVIEW ═══ */}
                    <section id="overview" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="inline-flex items-center gap-2 bg-[#6c5ce7]/10 border border-[#6c5ce7]/20 rounded-full px-3 py-1 mb-4">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[11px] font-medium text-[#6c5ce7]">API v1.0 — Live</span>
                                </div>
                                <h1 className="text-3xl font-bold tracking-tight text-white mb-4">HangHut API</h1>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-8">
                                    Integrate event ticketing directly into your website or mobile app. List events, sell tickets through hosted checkout, and verify tickets at the door — all with simple REST calls.
                                </p>
                                <div className="space-y-3">
                                    {[
                                        { icon: '🔗', text: 'RESTful JSON API' },
                                        { icon: '🔐', text: 'Bearer token authentication' },
                                        { icon: '💳', text: 'Hosted checkout (GCash, Maya, cards)' },
                                        { icon: '⚡', text: '100 requests/minute rate limit' },
                                        { icon: '🌐', text: '5 language SDKs (curl, JS, Python, PHP, Ruby)' },
                                    ].map(f => (
                                        <div key={f.text} className="flex items-center gap-3 text-sm">
                                            <span className="text-base">{f.icon}</span>
                                            <span className="text-zinc-400">{f.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 border-l border-zinc-800/40">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Base URL</p>
                                <div className="bg-[#161b22] border border-zinc-800/60 rounded-xl px-4 py-3 mb-8">
                                    <pre className="text-[15px] font-mono text-emerald-400">https://api.hanghut.com/v1</pre>
                                </div>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Endpoints</p>
                                <div className="space-y-1.5 font-mono text-[13px]">
                                    {[
                                        ['GET', '/events'], ['GET', '/events/:id'], ['POST', '/events'], ['PUT', '/events/:id'],
                                        ['GET', '/events/:id/attendees'], ['POST', '/checkouts'], ['GET', '/tickets/:id'],
                                        ['POST', '/tickets/:id/check-in'], ['POST', '/tickets/:id/refund'], ['GET', '/orders'],
                                        ['POST', '/webhooks'], ['GET', '/analytics/sales'], ['POST', '/promo-codes'],
                                    ].map(([method, path]) => {
                                        const color = method === 'GET' ? 'text-blue-400' : method === 'POST' ? 'text-emerald-400' : 'text-amber-400'
                                        return (
                                            <div key={`${method}${path}`} className="flex items-center gap-3 py-0.5">
                                                <span className={`${color} w-12 text-[11px] font-bold`}>{method}</span>
                                                <span className="text-zinc-400">{path}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ═══ AUTHENTICATION ═══ */}
                    <section id="authentication" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-white mb-3">Authentication</h2>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">
                                    Authenticate every request with your API key in the <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">Authorization</code> header as a Bearer token.
                                </p>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">
                                    Keys are generated from your <Link href="/organizer/developers" className="text-[#6c5ce7] hover:underline">Organizer Dashboard</Link>. All keys begin with <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">hh_live_</code>.
                                </p>
                                <AlertBox type="warning"><strong>Keep your keys secret.</strong> Never expose them in client-side code or public repositories.</AlertBox>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Header</p>
                                    <div className="bg-[#161b22] border border-zinc-800/60 rounded-xl px-4 py-3">
                                        <pre className="text-[13px] font-mono"><span className="text-zinc-500">Authorization:</span> <span className="text-emerald-400">Bearer hh_live_3dd28059a859bddb...</span></pre>
                                    </div>
                                </div>
                                <CodeBlock samples={samples.authSamples} activeLang={lang} label="Example Request" />
                            </div>
                        </div>
                    </section>

                    {/* ═══ RATE LIMITS ═══ */}
                    <section id="rate-limits" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-white mb-3">Rate Limits</h2>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">
                                    Requests are rate limited per API key using a sliding window. Exceeding returns <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">429</code>.
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { value: '100', label: 'Requests', gradient: 'from-blue-500/20 to-blue-600/5' },
                                        { value: '60s', label: 'Window', gradient: 'from-emerald-500/20 to-emerald-600/5' },
                                        { value: '429', label: 'Exceeded', gradient: 'from-red-500/20 to-red-600/5' },
                                    ].map(({ value, label, gradient }) => (
                                        <div key={label} className={`bg-gradient-to-b ${gradient} border border-zinc-800/60 rounded-xl p-4 text-center`}>
                                            <div className="text-2xl font-bold text-white">{value}</div>
                                            <div className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wider">{label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 border-l border-zinc-800/40">
                                <ResponseBlock status={429} json={`{
  "error": {
    "message": "Rate limit exceeded. Max 100 requests per minute.",
    "status": 429
  }
}`} />
                                <p className="text-[13px] text-zinc-500 mt-4">Wait for the window to reset (60 seconds) before retrying.</p>
                            </div>
                        </div>
                    </section>

                    {/* ═══ ERRORS ═══ */}
                    <section id="errors" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-white mb-3">Errors</h2>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">All errors return a consistent JSON structure.</p>
                                <div className="border border-zinc-800/60 rounded-xl overflow-hidden bg-[#0d1117]/50">
                                    <table className="w-full text-[13px]">
                                        <thead><tr className="bg-zinc-800/30"><th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Code</th><th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">Description</th></tr></thead>
                                        <tbody className="divide-y divide-zinc-800/40">
                                            {[['400', 'Bad request — invalid parameters'], ['401', 'Unauthorized — bad or missing API key'], ['404', 'Not found'], ['409', 'Conflict — sold out or unavailable'], ['429', 'Rate limit exceeded'], ['500', 'Internal server error']].map(([code, desc]) => (
                                                <tr key={code} className="hover:bg-zinc-800/30"><td className="px-4 py-2.5 font-mono text-red-400 font-medium">{code}</td><td className="px-4 py-2.5 text-zinc-400">{desc}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 border-l border-zinc-800/40">
                                <ResponseBlock status={404} json={`{
  "error": {
    "message": "Event not found",
    "status": 404
  }
}`} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ LIST EVENTS ═══ */}
                    <section id="list-events" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="GET" />
                                    <code className="font-mono text-white text-lg">/events</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Returns a paginated list of events for your organization. Includes ticket tiers and real-time sold counts.</p>
                                <ParamTable title="Query Parameters" params={[
                                    { name: 'page', type: 'integer', description: 'Page number', default: '1' },
                                    { name: 'per_page', type: 'integer', description: 'Results per page (max 50)', default: '20' },
                                    { name: 'status', type: 'string', description: 'Filter: active, draft, cancelled', default: 'active' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.listEventsSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={listEventsRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ GET EVENT ═══ */}
                    <section id="get-event" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="GET" />
                                    <code className="font-mono text-white text-lg">/events/:id</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Returns full event details including description, venue, images, and ticket tiers with real-time <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[12px]">available</code> counts per tier.</p>
                                <ParamTable title="Path Parameters" params={[{ name: 'id', type: 'uuid', required: true, description: 'Event ID' }]} />
                                <p className="text-[15px] text-zinc-400 leading-relaxed mt-6">Each tier includes an <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[12px]">available</code> field (<code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[12px]">quantity_total - quantity_sold</code>).</p>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.getEventSamples} activeLang={lang} label="Request" />
                            </div>
                        </div>
                    </section>

                    {/* ═══ CREATE EVENT ═══ */}
                    <section id="create-event" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="POST" />
                                    <code className="font-mono text-white text-lg">/events</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Create a new event. Events are created in <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">draft</code> status by default.</p>
                                <ParamTable title="Request Body" params={[
                                    { name: 'title', type: 'string', required: true, description: 'Event name' },
                                    { name: 'start_datetime', type: 'ISO 8601', required: true, description: 'Start date/time' },
                                    { name: 'end_datetime', type: 'ISO 8601', description: 'End date/time' },
                                    { name: 'venue_name', type: 'string', description: 'Venue name' },
                                    { name: 'city', type: 'string', description: 'City' },
                                    { name: 'capacity', type: 'integer', description: 'Max attendees' },
                                    { name: 'ticket_price', type: 'number', description: 'Base price in PHP' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.createEventSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={201} json={createEventRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ UPDATE EVENT ═══ */}
                    <section id="update-event" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="PUT" />
                                    <code className="font-mono text-white text-lg">/events/:id</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed">Update event details. Only include fields you want to change. Set <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">status</code> to <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">active</code> to publish.</p>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.updateEventSamples} activeLang={lang} label="Request" />
                            </div>
                        </div>
                    </section>

                    {/* ═══ LIST ATTENDEES ═══ */}
                    <section id="list-attendees" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="GET" />
                                    <code className="font-mono text-white text-lg">/events/:id/attendees</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Paginated list of attendees. Filter by ticket status for guest lists or export.</p>
                                <ParamTable title="Query Parameters" params={[
                                    { name: 'page', type: 'integer', description: 'Page number', default: '1' },
                                    { name: 'per_page', type: 'integer', description: 'Results per page (max 100)' },
                                    { name: 'status', type: 'string', description: 'Filter: sold, checked_in, refunded' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.listAttendeesSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={attendeesRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ CREATE CHECKOUT ═══ */}
                    <section id="create-checkout" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="POST" />
                                    <code className="font-mono text-white text-lg">/checkouts</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">Creates a hosted checkout session. Redirect your customer to the returned URL to complete payment via GCash, Maya, bank transfer, or card.</p>
                                <AlertBox type="warning"><strong>Always use webhooks</strong> to confirm payment — the customer may close the browser before being redirected.</AlertBox>
                                <div className="mt-6">
                                    <ParamTable title="Request Body" params={[
                                        { name: 'event_id', type: 'uuid', required: true, description: 'Event to buy tickets for' },
                                        { name: 'tier_id', type: 'uuid', description: 'Ticket tier (default if omitted)' },
                                        { name: 'quantity', type: 'integer', required: true, description: 'Number of tickets (min 1)' },
                                        { name: 'customer.name', type: 'string', required: true, description: 'Customer full name' },
                                        { name: 'customer.email', type: 'string', required: true, description: 'Email for ticket delivery' },
                                        { name: 'customer.phone', type: 'string', description: 'Phone number' },
                                        { name: 'success_url', type: 'string', required: true, description: 'Redirect after payment' },
                                        { name: 'cancel_url', type: 'string', description: 'Redirect if cancelled' },
                                    ]} />
                                </div>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.createCheckoutSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={201} json={checkoutRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ VERIFY TICKET ═══ */}
                    <section id="verify-ticket" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="GET" />
                                    <code className="font-mono text-white text-lg">/tickets/:id</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Verify a ticket&apos;s status, check-in state, and associated event/customer details.</p>
                                <ParamTable title="Path Parameters" params={[{ name: 'id', type: 'uuid', required: true, description: 'Ticket ID' }]} />
                                <div className="mt-6">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Ticket Statuses</p>
                                    <StatusTable rows={[
                                        { status: 'sold', desc: 'Valid, ready for check-in', color: 'bg-emerald-500' },
                                        { status: 'checked_in', desc: 'Already scanned', color: 'bg-blue-500' },
                                        { status: 'refunded', desc: 'Refunded', color: 'bg-amber-500' },
                                        { status: 'cancelled', desc: 'Cancelled', color: 'bg-red-500' },
                                    ]} />
                                </div>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.verifyTicketSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={verifyTicketRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ CHECK IN ═══ */}
                    <section id="check-in" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="POST" />
                                    <code className="font-mono text-white text-lg">/tickets/:id/check-in</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">Mark a ticket as checked in. Returns <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">409</code> if already used, refunded, or cancelled.</p>
                                <AlertBox type="success">Build your own QR scanner — scan the ticket ID, call this endpoint, and show the result.</AlertBox>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.checkInSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={checkInRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ REFUND TICKET ═══ */}
                    <section id="refund-ticket" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="POST" />
                                    <code className="font-mono text-white text-lg">/tickets/:id/refund</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">Mark a ticket as refunded. Updates status and decrements sold count.</p>
                                <AlertBox type="warning"><strong>Note:</strong> This only updates the ticket status. The actual payment refund must be processed separately through your payment provider.</AlertBox>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.refundTicketSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={refundRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ LIST ORDERS ═══ */}
                    <section id="list-orders" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="GET" />
                                    <code className="font-mono text-white text-lg">/orders</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Paginated purchase orders across all events. Filter by <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">event_id</code>.</p>
                                <ParamTable title="Query Parameters" params={[
                                    { name: 'page', type: 'integer', description: 'Page number', default: '1' },
                                    { name: 'per_page', type: 'integer', description: 'Results per page (max 50)' },
                                    { name: 'event_id', type: 'uuid', description: 'Filter by event' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.listOrdersSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={listOrdersRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ WEBHOOKS ═══ */}
                    <section id="webhooks" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-white mb-3">Webhooks</h2>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">Receive real-time notifications when events happen. Register an HTTPS endpoint and we&apos;ll POST signed payloads.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Available Events</p>
                                <div className="border border-zinc-800/60 rounded-xl overflow-hidden bg-[#0d1117]/50 mb-4">
                                    <table className="w-full text-[13px]">
                                        <tbody className="divide-y divide-zinc-800/40">
                                            {[['ticket.purchased', 'A ticket was purchased'], ['ticket.refunded', 'A ticket was refunded'], ['ticket.checked_in', 'A ticket was scanned'], ['event.updated', 'Event details changed']].map(([e, d]) => (
                                                <tr key={e} className="hover:bg-zinc-800/30"><td className="px-4 py-2.5 font-mono text-emerald-400">{e}</td><td className="px-4 py-2.5 text-zinc-400">{d}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed">Each delivery includes an <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">X-HangHut-Signature</code> header (HMAC-SHA256) for verification.</p>
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <ResponseBlock status={200} json={webhookPayloadRes} />
                                <CodeBlock samples={samples.webhookVerifySamples} activeLang={lang} label="Verify Signature" />
                            </div>
                        </div>
                    </section>

                    {/* ═══ REGISTER WEBHOOK ═══ */}
                    <section id="register-webhook" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="POST" />
                                    <code className="font-mono text-white text-lg">/webhooks</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Register a webhook endpoint. The response includes a <code className="text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded text-[13px]">secret</code> for signature verification — save it, it&apos;s only shown once.</p>
                                <ParamTable title="Request Body" params={[
                                    { name: 'url', type: 'string', required: true, description: 'HTTPS endpoint URL' },
                                    { name: 'events', type: 'string[]', required: true, description: 'Event types to subscribe to' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.registerWebhookSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={201} json={registerWebhookRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ ANALYTICS ═══ */}
                    <section id="analytics" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="GET" />
                                    <code className="font-mono text-white text-lg">/analytics/sales</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Revenue analytics with per-event breakdown. Optionally filter by event and date range.</p>
                                <ParamTable title="Query Parameters" params={[
                                    { name: 'event_id', type: 'uuid', description: 'Filter to specific event' },
                                    { name: 'from', type: 'ISO 8601', description: 'Start of date range' },
                                    { name: 'to', type: 'ISO 8601', description: 'End of date range' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.analyticsSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={200} json={analyticsRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ PROMO CODES ═══ */}
                    <section id="promo-codes" className="scroll-mt-16 border-b border-zinc-800/40">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <MethodBadge method="POST" />
                                    <code className="font-mono text-white text-lg">/promo-codes</code>
                                </div>
                                <p className="text-[15px] text-zinc-400 leading-relaxed mb-6">Create a promo code with percentage or fixed amount discounts, optional usage limits, and expiry.</p>
                                <ParamTable title="Request Body" params={[
                                    { name: 'event_id', type: 'uuid', required: true, description: 'Target event' },
                                    { name: 'code', type: 'string', required: true, description: 'Promo code (min 3 chars)' },
                                    { name: 'discount_type', type: 'string', required: true, description: '"percentage" or "fixed_amount"' },
                                    { name: 'discount_amount', type: 'number', required: true, description: 'Discount value' },
                                    { name: 'usage_limit', type: 'integer', description: 'Max uses (unlimited if omitted)' },
                                    { name: 'expires_at', type: 'ISO 8601', description: 'Expiry date' },
                                ]} />
                            </div>
                            <div className="bg-[#0d1117] p-8 lg:p-12 space-y-6 border-l border-zinc-800/40">
                                <CodeBlock samples={samples.createPromoSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={201} json={promoRes} />
                            </div>
                        </div>
                    </section>

                    {/* ═══ FOOTER ═══ */}
                    <div className="p-8 lg:p-12 text-center border-t border-zinc-800/40 bg-[#0d1117]/50">
                        <p className="text-sm text-zinc-500">
                            Need help integrating? Contact <a href="mailto:support@hanghut.com" className="text-[#6c5ce7] hover:underline">support@hanghut.com</a>
                        </p>
                        <p className="text-[11px] text-zinc-600 mt-2">© {new Date().getFullYear()} HangHut. All rights reserved.</p>
                    </div>
                </main>
            </div>
        </div>
    )
}
