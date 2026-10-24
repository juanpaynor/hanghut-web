import { ReactNode } from 'react'
import { Lang } from './code-samples'
import * as samples from './code-samples'
import { CodeBlock, ResponseBlock, MethodBadge, ParamTable, StatusTable, AlertBox } from './api-doc-components'
import { Sandbox } from './sandbox'
import { analyticsRes, attendeesRes, checkInRes, checkoutRes, createEventRes, listEventsRes, listOrdersRes, promoRes, refundRes, registerWebhookRes, sectionsRes, sectionsUnseatedRes, subscriptionTiersRes, subscriptionWriteUnavailableRes, subscriptionsRes, verifyTicketRes, webhookPayloadRes } from './fixtures'

/**
 * The right-hand column, one entry per reference section.
 *
 * These were the second half of each section's two-column grid. In a
 * three-column layout the code panel is page-level and sticky, so it has to be
 * addressable by section id rather than nested inside the prose it belongs to —
 * the shell renders whichever entry matches the heading you are currently
 * reading.
 *
 * Each panel reads top to bottom as request → example response → try it. The
 * example response stays even though the sandbox prints the same fixture: a
 * reader skimming the shape of a call should not have to press a button to see
 * what comes back.
 */
export function Panel({ id, lang }: { id: string; lang: Lang }): ReactNode {
    switch (id) {
        case 'overview':
            return (
                <>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Base URL</p>
                                <div className="bg-[#161b22] border border-zinc-800/60 rounded-xl px-4 py-3 mb-8">
                                    <pre className="text-[15px] font-mono text-emerald-400">https://www.hanghut.com/api/v1</pre>
                                </div>
                                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-3">Endpoints</p>
                                <div className="space-y-1.5 font-mono text-[13px]">
                                    {[
                                        ['GET', '/events'], ['GET', '/events/:id'], ['POST', '/events'], ['PUT', '/events/:id'],
                                        ['GET', '/events/:id/attendees'], ['GET', '/events/:id/sections'],
                                        ['POST', '/checkouts'], ['GET', '/tickets/:id'],
                                        ['POST', '/tickets/:id/check-in'], ['POST', '/tickets/:id/refund'], ['GET', '/orders'],
                                        ['POST', '/webhooks'], ['GET', '/analytics/sales'], ['POST', '/promo-codes'],
                                        ['GET', '/subscription-tiers'], ['GET', '/subscriptions'],
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
                </>
            )
        case 'authentication':
            return (
                <>
                    <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Header</p>
                                    <div className="bg-[#161b22] border border-zinc-800/60 rounded-xl px-4 py-3">
                                        <pre className="text-[13px] font-mono"><span className="text-zinc-500">Authorization:</span> <span className="text-emerald-400">Bearer hh_live_3dd28059a859bddb...</span></pre>
                                    </div>
                                </div>
                                <CodeBlock samples={samples.authSamples} activeLang={lang} label="Example Request" />
                </>
            )
        case 'rate-limits':
            return (
                <>
                    <ResponseBlock status={429} json={`{
  "error": {
    "message": "Rate limit exceeded. Max 100 requests per minute.",
    "status": 429
  }
}`} />
                                <p className="text-[13px] text-zinc-500 mt-4">Wait for the window to reset (60 seconds) before retrying.</p>
                </>
            )
        case 'errors':
            return (
                <>
                    <ResponseBlock status={404} json={`{
  "error": {
    "message": "Event not found",
    "status": 404
  }
}`} />
                </>
            )
        case 'list-events':
            return (
                <>
                    <CodeBlock samples={samples.listEventsSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/events" queryParams={[
                                    { name: 'status', value: 'active' },
                                    { name: 'per_page', value: '5' },
                                    { name: 'page', placeholder: '1' },
                                ]}  response={listEventsRes} />
                                <ResponseBlock status={200} json={listEventsRes} />
                </>
            )
        case 'get-event':
            return (
                <>
                    <CodeBlock samples={samples.getEventSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/events/:id" pathParams={[
                                    { name: 'id', placeholder: 'Event UUID — copy one from List Events above' },
                                ]} response={createEventRes} />
                </>
            )
        case 'create-event':
            return (
                <>
                    <AlertBox type="info">
                                    <strong>Formatting a description?</strong> Send{' '}
                                    <code className="font-mono">description_html</code>. Putting HTML in the plain{' '}
                                    <code className="font-mono">description</code> field works, but it is the field the
                                    dashboard editor writes back to — so the next person who opens the event in the UI
                                    and saves it can flatten your markup.
                                </AlertBox>
                                <CodeBlock samples={samples.createEventSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="POST"
                                    path="/events"
                                    risk="write"
                                    body={`{
  "title": "API test event",
  "start_datetime": "2030-01-01T19:00:00+08:00",
  "venue_name": "Test Venue",
  "city": "Manila",
  "capacity": 10,
  "ticket_price": 0
}`}
                                 response={createEventRes} status={201} />
                                <ResponseBlock status={201} json={createEventRes} />
                </>
            )
        case 'update-event':
            return (
                <>
                    <CodeBlock samples={samples.updateEventSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="PUT"
                                    path="/events/:id"
                                    risk="write"
                                    pathParams={[{ name: 'id', placeholder: 'Event UUID' }]}
                                    body={`{
  "title": "Updated title"
}`}
                                     response={createEventRes}
                                 />
                </>
            )
        case 'list-attendees':
            return (
                <>
                    <CodeBlock samples={samples.listAttendeesSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/events/:id/attendees"
                                    pathParams={[{ name: 'id', placeholder: 'Event UUID' }]}
                                    queryParams={[
                                        { name: 'status', placeholder: 'valid · checked_in · refunded' },
                                        { name: 'per_page', value: '5' },
                                    ]}  response={attendeesRes} />
                                <ResponseBlock status={200} json={attendeesRes} />
                </>
            )
        case 'list-sections':
            return (
                <>
                    <CodeBlock samples={samples.listSectionsSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/events/:id/sections" pathParams={[
                                    { name: 'id', placeholder: 'Event UUID' },
                                ]}  response={sectionsRes} />
                                <ResponseBlock status={200} json={sectionsRes} />
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">General admission event</p>
                                    <ResponseBlock status={200} json={sectionsUnseatedRes} />
                                </div>
                </>
            )
        case 'create-checkout':
            return (
                <>
                    <CodeBlock samples={samples.createCheckoutSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="POST"
                                    path="/checkouts"
                                    risk="write"
                                    body={`{
  "event_id": "",
  "quantity": 1,
  "customer": {
    "name": "API Test",
    "email": "test@example.com"
  },
  "success_url": "https://example.com/thanks"
}`}
                                 response={checkoutRes} status={201} />
                                <ResponseBlock status={201} json={checkoutRes} />
                </>
            )
        case 'verify-ticket':
            return (
                <>
                    <CodeBlock samples={samples.verifyTicketSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/tickets/:id" pathParams={[
                                    { name: 'id', placeholder: 'Ticket UUID — from List Attendees' },
                                ]}  response={verifyTicketRes} />
                                <ResponseBlock status={200} json={verifyTicketRes} />
                </>
            )
        case 'check-in':
            return (
                <>
                    <CodeBlock samples={samples.checkInSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="POST"
                                    path="/tickets/:id/check-in"
                                    risk="destructive"
                                    pathParams={[{ name: 'id', placeholder: 'Ticket UUID' }]}
                                 response={checkInRes} />
                                <ResponseBlock status={200} json={checkInRes} />
                </>
            )
        case 'refund-ticket':
            return (
                <>
                    <CodeBlock samples={samples.refundTicketSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="POST"
                                    path="/tickets/:id/refund"
                                    risk="destructive"
                                    pathParams={[{ name: 'id', placeholder: 'Ticket UUID' }]}
                                 response={refundRes} />
                                <ResponseBlock status={200} json={refundRes} />
                </>
            )
        case 'list-orders':
            return (
                <>
                    <CodeBlock samples={samples.listOrdersSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/orders" queryParams={[
                                    { name: 'event_id', placeholder: 'Optional — filter to one event' },
                                    { name: 'per_page', value: '5' },
                                ]}  response={listOrdersRes} />
                                <ResponseBlock status={200} json={listOrdersRes} />
                </>
            )
        case 'webhooks':
            return (
                <>
                    <ResponseBlock status={200} json={webhookPayloadRes} />
                                <CodeBlock samples={samples.webhookVerifySamples} activeLang={lang} label="Verify Signature" />
                </>
            )
        case 'register-webhook':
            return (
                <>
                    <CodeBlock samples={samples.registerWebhookSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="POST"
                                    path="/webhooks"
                                    risk="write"
                                    body={`{
  "url": "https://example.com/hanghut-webhook",
  "events": ["order.completed"]
}`}
                                 response={registerWebhookRes} status={201} />
                                <ResponseBlock status={201} json={registerWebhookRes} />
                </>
            )
        case 'analytics':
            return (
                <>
                    <CodeBlock samples={samples.analyticsSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/analytics/sales" queryParams={[
                                    { name: 'event_id', placeholder: 'Optional — one event' },
                                    { name: 'from', placeholder: 'Optional — ISO date' },
                                    { name: 'to', placeholder: 'Optional — ISO date' },
                                ]}  response={analyticsRes} />
                                <ResponseBlock status={200} json={analyticsRes} />
                </>
            )
        case 'list-subscription-tiers':
            return (
                <>
                    <CodeBlock samples={samples.listSubscriptionTiersSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/subscription-tiers"  response={subscriptionTiersRes} />
                                <ResponseBlock status={200} json={subscriptionTiersRes} />
                </>
            )
        case 'list-subscriptions':
            return (
                <>
                    <CodeBlock samples={samples.listSubscriptionsSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/subscriptions" queryParams={[
                                    { name: 'status', placeholder: 'active · cancelled' },
                                    { name: 'per_page', value: '5' },
                                ]}  response={subscriptionsRes} />
                                <ResponseBlock status={200} json={subscriptionsRes} />
                </>
            )
        case 'get-subscription':
            return (
                <>
                    <CodeBlock samples={samples.listSubscriptionsSamples} activeLang={lang} label="Request" />
                                <Sandbox method="GET" path="/subscriptions/:id" pathParams={[
                                    { name: 'id', placeholder: 'Subscription UUID' },
                                ]}  response={subscriptionsRes} />
                                <ResponseBlock status={200} json={subscriptionsRes} />
                </>
            )
        case 'cancel-subscription':
            return (
                <>
                    <CodeBlock samples={samples.cancelSubscriptionSamples} activeLang={lang} label="Request" />
                                <ResponseBlock status={503} json={subscriptionWriteUnavailableRes} />
                </>
            )
        case 'promo-codes':
            return (
                <>
                    <CodeBlock samples={samples.createPromoSamples} activeLang={lang} label="Request" />
                                <Sandbox
                                    method="POST"
                                    path="/promo-codes"
                                    risk="write"
                                    body={`{
  "event_id": "",
  "code": "APITEST10",
  "discount_type": "percentage",
  "discount_amount": 10,
  "usage_limit": 1
}`}
                                 response={promoRes} status={201} />
                                <ResponseBlock status={201} json={promoRes} />
                </>
            )
        default:
            return null
    }
}
