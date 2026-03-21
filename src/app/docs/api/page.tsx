import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'API Documentation | HangHut',
    description: 'HangHut Public API v1 — integrate event ticketing into your website or app.',
}

export default function ApiDocsPage() {
    return (
        <div className="min-h-screen bg-white text-zinc-900">
            {/* ── Header ── */}
            <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-xl">
                <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="flex items-center gap-2.5">
                            <div className="bg-[#6c5ce7] px-2.5 py-1 rounded transform -rotate-1">
                                <span className="font-bold text-sm text-white tracking-tight">HANGHUT</span>
                            </div>
                        </Link>
                        <div className="h-4 w-px bg-zinc-200" />
                        <span className="text-sm font-medium text-zinc-500">API Reference</span>
                        <span className="text-[10px] font-mono bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full text-zinc-500">v1.0</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/organizer/developers" className="text-[13px] text-zinc-500 hover:text-zinc-900 transition-colors">
                            Dashboard
                        </Link>
                        <Link href="/organizer/developers" className="text-[13px] bg-[#6c5ce7] hover:bg-[#5a4bd1] text-white px-3.5 py-1.5 rounded-lg transition-colors font-medium">
                            Get API Key
                        </Link>
                    </div>
                </div>
            </header>

            <div className="max-w-[1400px] mx-auto flex">
                {/* ── Sidebar ── */}
                <nav className="hidden xl:block w-52 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pl-6 pr-2">
                    <div className="space-y-6">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">Getting Started</p>
                            <ul className="space-y-0.5">
                                {['Overview', 'Authentication', 'Rate Limits', 'Errors'].map(item => (
                                    <li key={item}>
                                        <a href={`#${item.toLowerCase().replace(' ', '-')}`} className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">{item}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">Events</p>
                            <ul className="space-y-0.5">
                                <li><a href="#list-events" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">List Events</a></li>
                                <li><a href="#get-event" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Get Event</a></li>
                                <li><a href="#create-event" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Create Event</a></li>
                                <li><a href="#update-event" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Update Event</a></li>
                                <li><a href="#list-attendees" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">List Attendees</a></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">Checkout</p>
                            <ul className="space-y-0.5">
                                <li><a href="#create-checkout" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Create Session</a></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">Tickets</p>
                            <ul className="space-y-0.5">
                                <li><a href="#verify-ticket" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Verify Ticket</a></li>
                                <li><a href="#check-in" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Check In</a></li>
                                <li><a href="#refund-ticket" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Refund</a></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">Orders</p>
                            <ul className="space-y-0.5">
                                <li><a href="#list-orders" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">List Orders</a></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">Webhooks</p>
                            <ul className="space-y-0.5">
                                <li><a href="#webhooks" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Overview</a></li>
                                <li><a href="#register-webhook" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Register</a></li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2 px-3">More</p>
                            <ul className="space-y-0.5">
                                <li><a href="#analytics" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Analytics</a></li>
                                <li><a href="#promo-codes" className="block text-[13px] px-3 py-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-all">Promo Codes</a></li>
                            </ul>
                        </div>
                    </div>
                </nav>

                {/* ── Main Content ── */}
                <main className="flex-1 min-w-0">

                    {/* ===== OVERVIEW ===== */}
                    <div id="overview" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-4">HangHut API</h1>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">
                                    The HangHut API lets you integrate event ticketing directly into your website or mobile app. List your events, sell tickets through hosted checkout, and verify tickets at the door — all with simple REST calls.
                                </p>
                                <div className="space-y-3">
                                    {[
                                        'RESTful JSON API',
                                        'Bearer token authentication',
                                        'Hosted checkout (GCash, Maya, cards)',
                                        '100 requests/minute rate limit',
                                    ].map(feature => (
                                        <div key={feature} className="flex items-center gap-3 text-sm">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-zinc-600">{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 lg:rounded-none rounded-none">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Base URL</p>
                                <pre className="text-[15px] font-mono text-emerald-400 mb-8">https://api.hanghut.com/v1</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Available Endpoints</p>
                                <div className="space-y-2 font-mono text-[13px]">
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/events</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/events/:id</span></div>
                                    <div className="flex items-center gap-2"><span className="text-emerald-400 w-12">POST</span><span className="text-zinc-400">/events</span></div>
                                    <div className="flex items-center gap-2"><span className="text-amber-400 w-12">PUT</span><span className="text-zinc-400">/events/:id</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/events/:id/attendees</span></div>
                                    <div className="flex items-center gap-2"><span className="text-emerald-400 w-12">POST</span><span className="text-zinc-400">/checkouts</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/tickets/:id</span></div>
                                    <div className="flex items-center gap-2"><span className="text-emerald-400 w-12">POST</span><span className="text-zinc-400">/tickets/:id/check-in</span></div>
                                    <div className="flex items-center gap-2"><span className="text-emerald-400 w-12">POST</span><span className="text-zinc-400">/tickets/:id/refund</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/orders</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/webhooks</span></div>
                                    <div className="flex items-center gap-2"><span className="text-emerald-400 w-12">POST</span><span className="text-zinc-400">/webhooks</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/analytics/sales</span></div>
                                    <div className="flex items-center gap-2"><span className="text-blue-400 w-12">GET</span><span className="text-zinc-400">/promo-codes</span></div>
                                    <div className="flex items-center gap-2"><span className="text-emerald-400 w-12">POST</span><span className="text-zinc-400">/promo-codes</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ===== AUTHENTICATION ===== */}
                    <div id="authentication" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-zinc-900 mb-3">Authentication</h2>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">
                                    Authenticate every request by including your API key in the <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">Authorization</code> header as a Bearer token.
                                </p>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">
                                    API keys are generated from your <Link href="/organizer/developers" className="text-[#6c5ce7] hover:underline">Organizer Dashboard</Link>. All keys begin with <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">hh_live_</code> and are scoped to your organization.
                                </p>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[13px] text-amber-700">
                                    <strong>Keep your keys secret.</strong> Never expose them in client-side code or public repositories. Use them only in server-to-server calls.
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Header</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
<span className="text-zinc-500">Authorization:</span> <span className="text-emerald-400">Bearer hh_live_3dd28059a859bddb...</span></pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Example · curl</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`curl https://api.hanghut.com/v1/events \\
  `}<span className="text-emerald-400">{`-H "Authorization: Bearer hh_live_your_key"`}</span></pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Example · JavaScript</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`const res = await `}<span className="text-blue-400">fetch</span>{`(
  `}<span className="text-amber-300">{`'https://api.hanghut.com/v1/events'`}</span>{`,
  {
    headers: {
      `}<span className="text-zinc-400">{`'Authorization'`}</span>{`: `}<span className="text-emerald-400">{`\`Bearer \${API_KEY}\``}</span>{`
    }
  }
);
const { data } = await res.`}<span className="text-blue-400">json</span>{`();`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Example · Python</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`import `}<span className="text-blue-400">requests</span>{`

response = requests.`}<span className="text-blue-400">get</span>{`(
    `}<span className="text-amber-300">{`"https://api.hanghut.com/v1/events"`}</span>{`,
    headers={`}<span className="text-amber-300">{`"Authorization"`}</span>{`: `}<span className="text-emerald-400">{`f"Bearer {api_key}"`}</span>{`}
)
events = response.`}<span className="text-blue-400">json</span>{`()[`}<span className="text-amber-300">{`"data"`}</span>{`]`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== RATE LIMITS ===== */}
                    <div id="rate-limits" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-zinc-900 mb-3">Rate Limits</h2>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">
                                    API requests are rate limited per API key using a sliding window. Exceeding the limit returns a <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">429</code> response.
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { value: '100', label: 'Requests' },
                                        { value: '60s', label: 'Window' },
                                        { value: '429', label: 'Exceeded' },
                                    ].map(({ value, label }) => (
                                        <div key={label} className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-center">
                                            <div className="text-2xl font-bold text-zinc-900">{value}</div>
                                            <div className="text-[11px] text-zinc-400 mt-1 uppercase tracking-wider">{label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">429 Response</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`{
  `}<span className="text-zinc-500">{`"error"`}</span>{`: {
    `}<span className="text-zinc-500">{`"message"`}</span>{`: `}<span className="text-amber-300">{`"Rate limit exceeded. Max 100 requests per minute."`}</span>{`,
    `}<span className="text-zinc-500">{`"status"`}</span>{`: `}<span className="text-blue-400">429</span>{`
  }
}`}</pre>
                                <p className="text-[13px] text-zinc-500 mt-4">Wait for the window to reset (60 seconds) before retrying.</p>
                            </div>
                        </div>
                    </div>

                    {/* ===== ERRORS ===== */}
                    <div id="errors" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-zinc-900 mb-3">Errors</h2>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">
                                    All errors return a consistent JSON structure with an HTTP status code.
                                </p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]">
                                        <thead><tr className="bg-zinc-50"><th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Code</th><th className="text-left px-4 py-2.5 text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">Description</th></tr></thead>
                                        <tbody className="divide-y divide-zinc-100">
                                            {[['400','Bad request — invalid parameters'],['401','Unauthorized — bad or missing API key'],['404','Not found'],['409','Conflict — sold out or unavailable'],['429','Rate limit exceeded'],['500','Internal server error']].map(([code, desc]) => (
                                                <tr key={code} className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-red-600 font-medium">{code}</td><td className="px-4 py-2.5 text-zinc-500">{desc}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Error format</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`{
  `}<span className="text-zinc-500">{`"error"`}</span>{`: {
    `}<span className="text-zinc-500">{`"message"`}</span>{`: `}<span className="text-amber-300">{`"Event not found"`}</span>{`,
    `}<span className="text-zinc-500">{`"status"`}</span>{`: `}<span className="text-blue-400">404</span>{`
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== LIST EVENTS ===== */}
                    <div id="list-events" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">GET</span>
                                    <code className="font-mono text-zinc-900 text-lg">/events</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">
                                    Returns a paginated list of events for your organization. Includes ticket tiers and real-time sold counts.
                                </p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Query Parameters</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]">
                                        <tbody className="divide-y divide-zinc-100">
                                            {[
                                                ['page', 'integer', '1', 'Page number'],
                                                ['per_page', 'integer', '20', 'Results per page (max 50)'],
                                                ['status', 'string', 'active', 'Filter: active, draft, cancelled'],
                                            ].map(([name, type, def, desc]) => (
                                                <tr key={name} className="hover:bg-zinc-50">
                                                    <td className="px-4 py-2.5 font-mono text-zinc-700 w-28">{name}</td>
                                                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px] w-20">{type}</td>
                                                    <td className="px-4 py-2.5 text-zinc-500">{desc} <span className="text-zinc-400 text-[11px]">Default: {def}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Request</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`curl `}<span className="text-amber-300">{`"https://api.hanghut.com/v1/events?page=1&per_page=10"`}</span>{` \\
  -H `}<span className="text-emerald-400">{`"Authorization: Bearer hh_live_your_key"`}</span></pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`{
  `}<span className="text-zinc-500">{`"data"`}</span>{`: {
    `}<span className="text-zinc-500">{`"events"`}</span>{`: [
      {
        `}<span className="text-zinc-500">{`"id"`}</span>{`: `}<span className="text-amber-300">{`"8db0f243-2e64-..."`}</span>{`,
        `}<span className="text-zinc-500">{`"title"`}</span>{`: `}<span className="text-amber-300">{`"S10MAIC"`}</span>{`,
        `}<span className="text-zinc-500">{`"status"`}</span>{`: `}<span className="text-amber-300">{`"active"`}</span>{`,
        `}<span className="text-zinc-500">{`"start_datetime"`}</span>{`: `}<span className="text-amber-300">{`"2026-03-27T19:00:00+00:00"`}</span>{`,
        `}<span className="text-zinc-500">{`"venue_name"`}</span>{`: `}<span className="text-amber-300">{`"Mow's"`}</span>{`,
        `}<span className="text-zinc-500">{`"capacity"`}</span>{`: `}<span className="text-blue-400">100</span>{`,
        `}<span className="text-zinc-500">{`"tickets_sold"`}</span>{`: `}<span className="text-blue-400">100</span>{`,
        `}<span className="text-zinc-500">{`"ticket_tiers"`}</span>{`: [
          {
            `}<span className="text-zinc-500">{`"name"`}</span>{`: `}<span className="text-amber-300">{`"General Admission"`}</span>{`,
            `}<span className="text-zinc-500">{`"price"`}</span>{`: `}<span className="text-blue-400">1000</span>{`,
            `}<span className="text-zinc-500">{`"quantity_total"`}</span>{`: `}<span className="text-blue-400">100</span>{`,
            `}<span className="text-zinc-500">{`"quantity_sold"`}</span>{`: `}<span className="text-blue-400">100</span>{`
          }
        ]
      }
    ],
    `}<span className="text-zinc-500">{`"meta"`}</span>{`: {
      `}<span className="text-zinc-500">{`"page"`}</span>{`: `}<span className="text-blue-400">1</span>{`,
      `}<span className="text-zinc-500">{`"per_page"`}</span>{`: `}<span className="text-blue-400">10</span>{`,
      `}<span className="text-zinc-500">{`"total"`}</span>{`: `}<span className="text-blue-400">7</span>{`,
      `}<span className="text-zinc-500">{`"total_pages"`}</span>{`: `}<span className="text-blue-400">1</span>{`,
      `}<span className="text-zinc-500">{`"has_more"`}</span>{`: `}<span className="text-blue-400">false</span>{`
    }
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== GET EVENT ===== */}
                    <div id="get-event" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">GET</span>
                                    <code className="font-mono text-zinc-900 text-lg">/events/:id</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">
                                    Returns full event details including description, venue, images, and ticket tiers with real-time <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[12px]">available</code> counts per tier.
                                </p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Path Parameters</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]">
                                        <tbody>
                                            <tr className="hover:bg-zinc-50">
                                                <td className="px-4 py-2.5 font-mono text-zinc-700">id</td>
                                                <td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">uuid</td>
                                                <td className="px-4 py-2.5 text-zinc-500">Event ID <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mt-6">
                                    Each ticket tier includes an <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[12px]">available</code> field calculated as <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[12px]">quantity_total - quantity_sold</code>. Use this to show availability on your site.
                                </p>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Request</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`curl `}<span className="text-amber-300">{`"https://api.hanghut.com/v1/events/8db0f243-..."`}</span>{` \\
  -H `}<span className="text-emerald-400">{`"Authorization: Bearer hh_live_your_key"`}</span></pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Example · JavaScript integration</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`// Display event on your website
const res = await `}<span className="text-blue-400">fetch</span>{`(
  `}<span className="text-amber-300">{`\`https://api.hanghut.com/v1/events/\${eventId}\``}</span>{`,
  { headers: { Authorization: `}<span className="text-emerald-400">{`\`Bearer \${API_KEY}\``}</span>{` } }
);
const { data: event } = await res.`}<span className="text-blue-400">json</span>{`();

// Show each tier
event.ticket_tiers.`}<span className="text-blue-400">forEach</span>{`(tier => {
  console.log(
    `}<span className="text-amber-300">{`\`\${tier.name}: ₱\${tier.price} — \${tier.available} left\``}</span>{`
  );
});`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== CREATE CHECKOUT ===== */}
                    <div id="create-checkout" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">POST</span>
                                    <code className="font-mono text-zinc-900 text-lg">/checkouts</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">
                                    Creates a hosted checkout session. Redirect your customer to the returned URL to complete payment via GCash, Maya, bank transfer, or card.
                                </p>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[13px] text-amber-700 mb-6">
                                    <strong>Always use webhooks</strong> to confirm payment — the customer may close the browser before being redirected.
                                </div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Request Body</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]">
                                        <tbody className="divide-y divide-zinc-100">
                                            {[
                                                ['event_id', 'uuid', true, 'Event to buy tickets for'],
                                                ['tier_id', 'uuid', false, 'Ticket tier (default if omitted)'],
                                                ['quantity', 'integer', true, 'Number of tickets (min 1)'],
                                                ['customer.name', 'string', true, 'Customer full name'],
                                                ['customer.email', 'string', true, 'Email for ticket delivery'],
                                                ['customer.phone', 'string', false, 'Phone number'],
                                                ['success_url', 'string', true, 'Redirect after payment'],
                                                ['cancel_url', 'string', false, 'Redirect if cancelled'],
                                            ].map(([name, type, req, desc]) => (
                                                <tr key={name as string} className="hover:bg-zinc-50">
                                                    <td className="px-4 py-2.5 font-mono text-zinc-700 whitespace-nowrap">{name as string}</td>
                                                    <td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px] w-16">{type as string}</td>
                                                    <td className="px-4 py-2.5 text-zinc-500">
                                                        {desc as string}
                                                        {req && <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Request · curl</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`curl -X POST `}<span className="text-amber-300">{`"https://api.hanghut.com/v1/checkouts"`}</span>{` \\
  -H `}<span className="text-emerald-400">{`"Authorization: Bearer hh_live_your_key"`}</span>{` \\
  -H `}<span className="text-emerald-400">{`"Content-Type: application/json"`}</span>{` \\
  -d '{
    `}<span className="text-zinc-500">{`"event_id"`}</span>{`: `}<span className="text-amber-300">{`"8db0f243-2e64-..."`}</span>{`,
    `}<span className="text-zinc-500">{`"tier_id"`}</span>{`: `}<span className="text-amber-300">{`"66a5cdd3-d097-..."`}</span>{`,
    `}<span className="text-zinc-500">{`"quantity"`}</span>{`: `}<span className="text-blue-400">2</span>{`,
    `}<span className="text-zinc-500">{`"customer"`}</span>{`: {
      `}<span className="text-zinc-500">{`"name"`}</span>{`: `}<span className="text-amber-300">{`"Juan Dela Cruz"`}</span>{`,
      `}<span className="text-zinc-500">{`"email"`}</span>{`: `}<span className="text-amber-300">{`"juan@example.com"`}</span>{`
    },
    `}<span className="text-zinc-500">{`"success_url"`}</span>{`: `}<span className="text-amber-300">{`"https://your-site.com/success"`}</span>{`,
    `}<span className="text-zinc-500">{`"cancel_url"`}</span>{`: `}<span className="text-amber-300">{`"https://your-site.com/cancel"`}</span>{`
  }'`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 201</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`{
  `}<span className="text-zinc-500">{`"data"`}</span>{`: {
    `}<span className="text-zinc-500">{`"checkout_id"`}</span>{`: `}<span className="text-amber-300">{`"pi_abc123def456"`}</span>{`,
    `}<span className="text-zinc-500">{`"checkout_url"`}</span>{`: `}<span className="text-amber-300">{`"https://checkout.xendit.co/web/..."`}</span>{`,
    `}<span className="text-zinc-500">{`"expires_at"`}</span>{`: `}<span className="text-amber-300">{`"2026-03-22T00:00:00Z"`}</span>{`
  }
}`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Full example · Node.js Express</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`// Server-side: create checkout and redirect
app.`}<span className="text-blue-400">post</span>{`(`}<span className="text-amber-300">{`'/buy-ticket'`}</span>{`, async (req, res) => {
  const response = await `}<span className="text-blue-400">fetch</span>{`(
    `}<span className="text-amber-300">{`'https://api.hanghut.com/v1/checkouts'`}</span>{`,
    {
      method: `}<span className="text-amber-300">{`'POST'`}</span>{`,
      headers: {
        `}<span className="text-amber-300">{`'Authorization'`}</span>{`: `}<span className="text-emerald-400">{`\`Bearer \${API_KEY}\``}</span>{`,
        `}<span className="text-amber-300">{`'Content-Type'`}</span>{`: `}<span className="text-amber-300">{`'application/json'`}</span>{`
      },
      body: JSON.`}<span className="text-blue-400">stringify</span>{`({
        event_id: req.body.event_id,
        tier_id: req.body.tier_id,
        quantity: req.body.quantity,
        customer: {
          name: req.body.name,
          email: req.body.email
        },
        success_url: `}<span className="text-amber-300">{`'https://your-site.com/thank-you'`}</span>{`,
        cancel_url: `}<span className="text-amber-300">{`'https://your-site.com/events'`}</span>{`
      })
    }
  );
  const { data } = await response.`}<span className="text-blue-400">json</span>{`();
  res.`}<span className="text-blue-400">redirect</span>{`(data.checkout_url);
});`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== VERIFY TICKET ===== */}
                    <div id="verify-ticket" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">GET</span>
                                    <code className="font-mono text-zinc-900 text-lg">/tickets/:id</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">
                                    Verify a ticket's current status, check-in state, and associated event/customer details. Useful for door scanning or customer support.
                                </p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Path Parameters</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden mb-6">
                                    <table className="w-full text-[13px]">
                                        <tbody>
                                            <tr className="hover:bg-zinc-50">
                                                <td className="px-4 py-2.5 font-mono text-zinc-700">id</td>
                                                <td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">uuid</td>
                                                <td className="px-4 py-2.5 text-zinc-500">Ticket ID <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Ticket Statuses</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]">
                                        <tbody className="divide-y divide-zinc-100">
                                            {[
                                                ['sold', 'Valid, ready for check-in', 'bg-emerald-500'],
                                                ['checked_in', 'Already scanned', 'bg-blue-500'],
                                                ['refunded', 'Refunded', 'bg-amber-500'],
                                                ['cancelled', 'Cancelled', 'bg-red-500'],
                                            ].map(([status, desc, dot]) => (
                                                <tr key={status} className="hover:bg-zinc-50">
                                                    <td className="px-4 py-2.5 w-32"><span className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${dot}`}/><code className="font-mono">{status}</code></span></td>
                                                    <td className="px-4 py-2.5 text-zinc-500">{desc}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Request</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`curl `}<span className="text-amber-300">{`"https://api.hanghut.com/v1/tickets/a1b2c3d4-..."`}</span>{` \\
  -H `}<span className="text-emerald-400">{`"Authorization: Bearer hh_live_your_key"`}</span></pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`{
  `}<span className="text-zinc-500">{`"data"`}</span>{`: {
    `}<span className="text-zinc-500">{`"id"`}</span>{`: `}<span className="text-amber-300">{`"a1b2c3d4-..."`}</span>{`,
    `}<span className="text-zinc-500">{`"status"`}</span>{`: `}<span className="text-amber-300">{`"sold"`}</span>{`,
    `}<span className="text-zinc-500">{`"checked_in_at"`}</span>{`: `}<span className="text-blue-400">null</span>{`,
    `}<span className="text-zinc-500">{`"purchased_at"`}</span>{`: `}<span className="text-amber-300">{`"2026-03-21T10:30:00Z"`}</span>{`,
    `}<span className="text-zinc-500">{`"event"`}</span>{`: {
      `}<span className="text-zinc-500">{`"id"`}</span>{`: `}<span className="text-amber-300">{`"8db0f243-..."`}</span>{`,
      `}<span className="text-zinc-500">{`"title"`}</span>{`: `}<span className="text-amber-300">{`"S10MAIC"`}</span>{`,
      `}<span className="text-zinc-500">{`"start_datetime"`}</span>{`: `}<span className="text-amber-300">{`"2026-03-27T19:00:00+00:00"`}</span>{`,
      `}<span className="text-zinc-500">{`"venue_name"`}</span>{`: `}<span className="text-amber-300">{`"Mow's"`}</span>{`
    },
    `}<span className="text-zinc-500">{`"tier"`}</span>{`: {
      `}<span className="text-zinc-500">{`"name"`}</span>{`: `}<span className="text-amber-300">{`"General Admission"`}</span>{`,
      `}<span className="text-zinc-500">{`"price"`}</span>{`: `}<span className="text-blue-400">1000</span>{`
    },
    `}<span className="text-zinc-500">{`"customer"`}</span>{`: {
      `}<span className="text-zinc-500">{`"name"`}</span>{`: `}<span className="text-amber-300">{`"Juan Dela Cruz"`}</span>{`,
      `}<span className="text-zinc-500">{`"email"`}</span>{`: `}<span className="text-amber-300">{`"juan@example.com"`}</span>{`
    }
  }
}`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Example · Door check-in (Python)</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">
{`import `}<span className="text-blue-400">requests</span>{`

def `}<span className="text-blue-400">verify_ticket</span>{`(ticket_id):
    r = requests.`}<span className="text-blue-400">get</span>{`(
        `}<span className="text-amber-300">{`f"https://api.hanghut.com/v1/tickets/{ticket_id}"`}</span>{`,
        headers={`}<span className="text-amber-300">{`"Authorization"`}</span>{`: `}<span className="text-emerald-400">{`f"Bearer {API_KEY}"`}</span>{`}
    )
    ticket = r.`}<span className="text-blue-400">json</span>{`()[`}<span className="text-amber-300">{`"data"`}</span>{`]
    
    if ticket[`}<span className="text-amber-300">{`"status"`}</span>{`] == `}<span className="text-amber-300">{`"sold"`}</span>{`:
        print(`}<span className="text-amber-300">{`f"✅ VALID — {ticket['customer']['name']}"`}</span>{`)
    elif ticket[`}<span className="text-amber-300">{`"status"`}</span>{`] == `}<span className="text-amber-300">{`"checked_in"`}</span>{`:
        print(`}<span className="text-amber-300">{`f"⚠️ ALREADY USED at {ticket['checked_in_at']}"`}</span>{`)
    else:
        print(`}<span className="text-amber-300">{`f"❌ INVALID — status: {ticket['status']}"`}</span>{`)`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== CREATE EVENT ===== */}
                    <div id="create-event" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">POST</span>
                                    <code className="font-mono text-zinc-900 text-lg">/events</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">Create a new event. Events are created in <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">draft</code> status by default.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Request Body</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        {[['title','string',true,'Event name'],['start_datetime','ISO 8601',true,'Start date/time'],['end_datetime','ISO 8601',false,'End date/time'],['venue_name','string',false,'Venue name'],['city','string',false,'City'],['capacity','integer',false,'Max attendees'],['ticket_price','number',false,'Base price in PHP']].map(([n,t,r,d])=>(<tr key={n as string} className="hover:bg-zinc-50"><td className="px-4 py-2 font-mono text-zinc-700">{n as string}</td><td className="px-4 py-2 text-zinc-400 font-mono text-[11px]">{t as string}</td><td className="px-4 py-2 text-zinc-500">{d as string}{r && <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span>}</td></tr>))}
                                    </tbody></table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Request</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl -X POST "https://api.hanghut.com/v1/events" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Friday Night Comedy",
    "start_datetime": "2026-04-10T20:00:00+08:00",
    "venue_name": "Comedy Bar Manila",
    "city": "Manila",
    "capacity": 150,
    "ticket_price": 800
  }'`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 201</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
  "data": {
    "id": "f47ac10b-58cc-...",
    "title": "Friday Night Comedy",
    "status": "draft",
    "start_datetime": "2026-04-10T20:00:00+08:00",
    "venue_name": "Comedy Bar Manila",
    "capacity": 150,
    "ticket_price": 800
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== UPDATE EVENT ===== */}
                    <div id="update-event" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">PUT</span>
                                    <code className="font-mono text-zinc-900 text-lg">/events/:id</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">Update an event&apos;s details. Only include the fields you want to change. Set <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">status</code> to <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">active</code> to publish.</p>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl -X PUT "https://api.hanghut.com/v1/events/f47ac10b-..." \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "active", "capacity": 200}'`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== LIST ATTENDEES ===== */}
                    <div id="list-attendees" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">GET</span>
                                    <code className="font-mono text-zinc-900 text-lg">/events/:id/attendees</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">Returns a paginated list of attendees for an event. Filter by ticket status to manage guest lists or export check-in data.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Query Parameters</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        {[['page','integer','Page number (default: 1)'],['per_page','integer','Results per page (max 100)'],['status','string','Filter: sold, checked_in, refunded']].map(([n,t,d])=>(<tr key={n} className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-zinc-700">{n}</td><td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">{t}</td><td className="px-4 py-2.5 text-zinc-500">{d}</td></tr>))}
                                    </tbody></table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl "https://api.hanghut.com/v1/events/8db0f243-.../attendees?status=sold" \\
  -H "Authorization: Bearer hh_live_your_key"`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
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
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== CHECK IN ===== */}
                    <div id="check-in" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">POST</span>
                                    <code className="font-mono text-zinc-900 text-lg">/tickets/:id/check-in</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">Mark a ticket as checked in. Returns <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">409</code> if already used, refunded, or cancelled.</p>
                                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[13px] text-emerald-700">Build your own QR scanner — scan the ticket ID, call this endpoint, and show the result.</div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl -X POST "https://api.hanghut.com/v1/tickets/a1b2c3d4-.../check-in" \\
  -H "Authorization: Bearer hh_live_your_key"`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "used",
    "checked_in_at": "2026-03-27T19:15:00Z",
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "customer": { "name": "Juan Dela Cruz" }
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== REFUND TICKET ===== */}
                    <div id="refund-ticket" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">POST</span>
                                    <code className="font-mono text-zinc-900 text-lg">/tickets/:id/refund</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">Mark a ticket as refunded. This updates the ticket status and decrements the tier sold count.</p>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[13px] text-amber-700"><strong>Note:</strong> This only updates the ticket status. The actual payment refund must be processed separately through your payment provider.</div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl -X POST "https://api.hanghut.com/v1/tickets/a1b2c3d4-.../refund" \\
  -H "Authorization: Bearer hh_live_your_key"`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
  "data": {
    "id": "a1b2c3d4-...",
    "status": "refunded",
    "event": { "id": "8db0f243-...", "title": "S10MAIC" },
    "tier": { "name": "General Admission", "price": 1000 }
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== LIST ORDERS ===== */}
                    <div id="list-orders" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">GET</span>
                                    <code className="font-mono text-zinc-900 text-lg">/orders</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">Returns paginated purchase orders across all your events. Filter by specific event with <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">event_id</code>.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Query Parameters</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        {[['page','integer','Page number (default: 1)'],['per_page','integer','Results per page (max 50)'],['event_id','uuid','Filter by event']].map(([n,t,d])=>(<tr key={n} className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-zinc-700">{n}</td><td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">{t}</td><td className="px-4 py-2.5 text-zinc-500">{d}</td></tr>))}
                                    </tbody></table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl "https://api.hanghut.com/v1/orders?event_id=8db0f243-..." \\
  -H "Authorization: Bearer hh_live_your_key"`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
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
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== WEBHOOKS ===== */}
                    <div id="webhooks" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <h2 className="text-xl font-bold text-zinc-900 mb-3">Webhooks</h2>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-4">Receive real-time notifications when events happen. Register an HTTPS endpoint and we&apos;ll POST signed payloads to it.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Available Events</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        {[['ticket.purchased','A ticket was purchased'],['ticket.refunded','A ticket was refunded'],['ticket.checked_in','A ticket was scanned'],['event.updated','Event details changed']].map(([e,d])=>(<tr key={e} className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-zinc-700">{e}</td><td className="px-4 py-2.5 text-zinc-500">{d}</td></tr>))}
                                    </tbody></table>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mt-4">Each delivery includes an <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">X-HangHut-Signature</code> header (HMAC-SHA256 of the body using your webhook secret) for verification.</p>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Payload format</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
  "id": "evt_abc123...",
  "type": "ticket.purchased",
  "created_at": "2026-03-21T10:30:00Z",
  "data": {
    "ticket_id": "a1b2c3d4-...",
    "event_id": "8db0f243-...",
    "customer": { "name": "Juan Dela Cruz" },
    "amount": 1000
  }
}`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Verify signature (Node.js)</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`const crypto = require('crypto');

function verifySignature(body, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return signature === expected;
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== REGISTER WEBHOOK ===== */}
                    <div id="register-webhook" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">POST</span>
                                    <code className="font-mono text-zinc-900 text-lg">/webhooks</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">Register a new webhook endpoint. The response includes a <code className="text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded text-[13px]">secret</code> for signature verification — save it, it&apos;s only shown once.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Request Body</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        <tr className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-zinc-700">url</td><td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">string</td><td className="px-4 py-2.5 text-zinc-500">HTTPS endpoint URL <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span></td></tr>
                                        <tr className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-zinc-700">events</td><td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">string[]</td><td className="px-4 py-2.5 text-zinc-500">Event types to subscribe to <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span></td></tr>
                                    </tbody></table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl -X POST "https://api.hanghut.com/v1/webhooks" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-site.com/webhook",
    "events": ["ticket.purchased", "ticket.refunded"]
  }'`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 201</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
  "data": {
    "id": "wh_abc123...",
    "url": "https://your-site.com/webhook",
    "events": ["ticket.purchased", "ticket.refunded"],
    "secret": "whsec_a1b2c3d4e5f6...",
    "is_active": true
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== ANALYTICS ===== */}
                    <div id="analytics" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">GET</span>
                                    <code className="font-mono text-zinc-900 text-lg">/analytics/sales</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">Revenue analytics with per-event breakdown. Optionally filter by event and date range.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Query Parameters</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        {[['event_id','uuid','Filter to specific event'],['from','ISO 8601','Start of date range'],['to','ISO 8601','End of date range']].map(([n,t,d])=>(<tr key={n} className="hover:bg-zinc-50"><td className="px-4 py-2.5 font-mono text-zinc-700">{n}</td><td className="px-4 py-2.5 text-zinc-400 font-mono text-[11px]">{t}</td><td className="px-4 py-2.5 text-zinc-500">{d}</td></tr>))}
                                    </tbody></table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl "https://api.hanghut.com/v1/analytics/sales" \\
  -H "Authorization: Bearer hh_live_your_key"`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 200</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
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
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== PROMO CODES ===== */}
                    <div id="promo-codes" className="scroll-mt-16 border-b border-zinc-200">
                        <div className="grid lg:grid-cols-2">
                            <div className="p-8 lg:p-12">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">POST</span>
                                    <code className="font-mono text-zinc-900 text-lg">/promo-codes</code>
                                </div>
                                <p className="text-[15px] text-zinc-500 leading-relaxed mb-6">Create a promo code for an event. Supports percentage or fixed amount discounts with optional usage limits and expiry.</p>
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-3">Request Body</p>
                                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-[13px]"><tbody className="divide-y divide-zinc-100">
                                        {[['event_id','uuid',true,'Target event'],['code','string',true,'Promo code (min 3 chars)'],['discount_type','string',true,'"percentage" or "fixed_amount"'],['discount_amount','number',true,'Discount value'],['usage_limit','integer',false,'Max uses (unlimited if omitted)'],['expires_at','ISO 8601',false,'Expiry date']].map(([n,t,r,d])=>(<tr key={n as string} className="hover:bg-zinc-50"><td className="px-4 py-2 font-mono text-zinc-700">{n as string}</td><td className="px-4 py-2 text-zinc-400 font-mono text-[11px]">{t as string}</td><td className="px-4 py-2 text-zinc-500">{d as string}{r && <span className="text-red-500 text-[10px] font-semibold ml-1">REQUIRED</span>}</td></tr>))}
                                    </tbody></table>
                                </div>
                            </div>
                            <div className="bg-zinc-950 p-8 lg:p-12 space-y-4">
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`curl -X POST "https://api.hanghut.com/v1/promo-codes" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_id": "8db0f243-...",
    "code": "EARLYBIRD",
    "discount_type": "percentage",
    "discount_amount": 20,
    "usage_limit": 50,
    "expires_at": "2026-04-01T00:00:00Z"
  }'`}</pre>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mt-6 mb-2">Response · 201</p>
                                <pre className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-[13px] font-mono leading-relaxed overflow-x-auto text-zinc-300">{`{
  "data": {
    "id": "pc_abc123...",
    "code": "EARLYBIRD",
    "discount_type": "percentage",
    "discount_amount": 20,
    "usage_limit": 50,
    "usage_count": 0,
    "is_active": true
  }
}`}</pre>
                            </div>
                        </div>
                    </div>

                    {/* ===== FOOTER ===== */}
                    <div className="p-8 lg:p-12 text-center bg-zinc-50 border-t border-zinc-200">
                        <p className="text-sm text-zinc-500">
                            Need help integrating? Contact <a href="mailto:support@hanghut.com" className="text-[#6c5ce7] hover:underline">support@hanghut.com</a>
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-2">© {new Date().getFullYear()} HangHut. All rights reserved.</p>
                    </div>

                </main>
            </div>
        </div>
    )
}
