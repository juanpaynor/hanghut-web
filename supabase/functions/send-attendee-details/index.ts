// Email each buyer the link that lets them fill in details for everyone they
// bought for.
//
// SECURITY -- the thing that must not be got wrong:
// the caller never names a recipient. They name an EVENT, and
// claim_attendee_detail_emails decides -- running as the USER, so
// is_partner_owner applies to whoever is actually clicking -- who is eligible
// and what each one's token is. A client-supplied recipient list would turn
// this into "mail any address a working attendee-detail link", which is an
// editing credential for someone else's medical information.
//
// Why this is not the campaign path: see the migration. Short version, this is
// transactional mail about the buyer's own order, so marketing unsubscribes
// must not gate it, no unsubscribe footer belongs on it, and it must not show
// up in the organizer's dashboard as a campaign they sent.
//
// Resend is pinned to 2.112.0 like every other function here: the floating
// `@supabase/supabase-js@2` on esm.sh resolves to 2.113.0, which 404s and
// blocks the deploy outright.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

// Resend's batch endpoint takes at most 100 messages per call.
const BATCH_SIZE = 100;
// Spacing between batch calls, matching process-email-queue.
const SPACING_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Recipient {
    send_id: string;
    email: string;
    name: string | null;
    token: string;
    slots_missing: number;
}

const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;");

/**
 * The message. Deliberately plain and short: it is a request for an action, and
 * the only thing that matters is that the link is obvious and the reason for it
 * is in one sentence. Brand tokens match send-ticket-email so a buyer who got
 * their ticket from us recognises this as the same sender.
 */
function buildHtml(opts: {
    buyerName: string | null;
    eventTitle: string;
    organizerName: string;
    url: string;
    slotsMissing: number;
    eventDate: string | null;
}): string {
    const C = {
        brand: "#4f46e5",
        ink: "#17152f",
        muted: "#5b5878",
        dim: "#8a87a4",
        ground: "#f6f6fb",
        card: "#ffffff",
        line: "#e4e3ec",
    };
    const DISPLAY = `'Poppins','Bricolage Grotesque',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;
    const BODY = `'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;

    const hello = opts.buyerName ? `Hi ${esc(opts.buyerName.split(" ")[0])},` : "Hi,";
    const who = opts.slotsMissing === 1
        ? "one of your attendees still needs their details filled in"
        : `${opts.slotsMissing} of your attendees still need their details filled in`;
    const dateLine = opts.eventDate
        ? `<p style="margin:0;color:${C.dim};font-size:13px;font-family:${BODY}">${esc(opts.eventDate)}</p>`
        : "";

    return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:${C.ground}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:32px">
      <p style="margin:0 0 4px;color:${C.dim};font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-family:${BODY}">${esc(opts.organizerName)}</p>
      <h1 style="margin:0 0 6px;font-size:21px;line-height:1.3;color:${C.ink};font-family:${DISPLAY};font-weight:600">${esc(opts.eventTitle)}</h1>
      ${dateLine}
      <p style="margin:24px 0 0;font-size:15px;line-height:1.6;color:${C.ink};font-family:${BODY}">${hello}</p>
      <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${C.muted};font-family:${BODY}">
        Thanks for booking. Before the event, ${who} &mdash; things like emergency contact and shirt size.
      </p>
      <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${C.muted};font-family:${BODY}">
        One link covers everyone on your booking, so you can fill them all in at once.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 0">
        <tr><td style="background:${C.brand};border-radius:10px">
          <a href="${opts.url}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;font-family:${BODY}">Fill in attendee details</a>
        </td></tr>
      </table>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:${C.dim};font-family:${BODY}">
        Or paste this into your browser:<br>
        <span style="color:${C.muted};word-break:break-all">${esc(opts.url)}</span>
      </p>
      <p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${C.line};font-size:12px;line-height:1.6;color:${C.dim};font-family:${BODY}">
        This link is personal to your booking &mdash; please don't forward it.
        Replies go straight to ${esc(opts.organizerName)}.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
        const APP_URL = Deno.env.get("APP_URL") || "https://hanghut.com";
        const FROM_ADDRESS = Deno.env.get("ATTENDEE_DETAILS_FROM")
            || "HangHut <details@hanghut.com>";

        if (!RESEND_API_KEY) return json({ error: "Email provider is not configured." }, 500);

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return json({ error: "Not authenticated." }, 401);

        const { event_id, emails, cooldown_hours, dry_run } = await req.json();
        if (!event_id) return json({ error: "event_id is required." }, 400);
        const dryRun = dry_run === true;

        // The USER's client, not a service client: is_partner_owner inside the
        // RPC reads auth.uid(), and that is the whole authorisation check.
        const db = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        });

        // Claims the rows (status 'queued') and hands back the links. After
        // this point every recipient is reserved, so a second click sends
        // nothing even if this run then fails. With dry_run the RPC claims
        // nothing and we return the preview below without touching Resend.
        const { data: claim, error: claimErr } = await db.rpc("claim_attendee_detail_emails", {
            p_event_id: event_id,
            p_emails: Array.isArray(emails) && emails.length ? emails : null,
            p_cooldown_hours: typeof cooldown_hours === "number" ? cooldown_hours : 24,
            p_dry_run: dryRun,
        });

        if (claimErr) {
            console.error("claim_attendee_detail_emails failed:", claimErr.message);
            return json({ error: "Could not work out who to email." }, 500);
        }
        if (claim?.error === "forbidden") return json({ error: "Not your event." }, 403);
        if (claim?.error === "not_found") return json({ error: "Event not found." }, 404);

        const recipients: Recipient[] = claim?.recipients ?? [];
        const skipped = claim?.skipped ?? [];
        const eventTitle: string = claim?.event?.title ?? "your event";
        const organizerName: string = claim?.organizer?.name ?? "The organiser";
        const replyTo: string | null = claim?.organizer?.reply_to ?? null;
        const startsAt: string | null = claim?.event?.start_datetime ?? null;

        const eventDate = startsAt
            ? new Date(startsAt).toLocaleDateString("en-PH", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
                timeZone: "Asia/Manila",
            })
            : null;

        // Preview for the confirm dialog: who would go, who would not, and why.
        // Nothing was claimed, so the organiser can cancel freely.
        if (dryRun) {
            return json({ dry_run: true, would_send: recipients.length, skipped });
        }

        if (recipients.length === 0) {
            return json({ sent: 0, failed: 0, skipped });
        }

        const subject = `Please complete attendee details for ${eventTitle}`;
        const updates: { send_id: string; resend_id: string | null; status: string }[] = [];
        let sent = 0;
        let failed = 0;

        for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const chunk = recipients.slice(i, i + BATCH_SIZE);
            if (i > 0) await sleep(SPACING_MS);

            const payloads = chunk.map((r) => ({
                from: FROM_ADDRESS,
                to: r.email.trim(),
                // Replies reach the organiser, not us. They are the ones who
                // will be asked "which shirt size did you mean?".
                ...(replyTo ? { reply_to: replyTo } : {}),
                subject,
                html: buildHtml({
                    buyerName: r.name,
                    eventTitle,
                    organizerName,
                    url: `${APP_URL}/d/${r.token}`,
                    slotsMissing: r.slots_missing,
                    eventDate,
                }),
            }));

            try {
                const res = await fetch("https://api.resend.com/emails/batch", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${RESEND_API_KEY}`,
                        "Content-Type": "application/json",
                        // Resend dedups identical keys for 24h. Keyed on the
                        // claimed send ids, so a retried invocation with the
                        // same claim cannot double-deliver.
                        "Idempotency-Key": `ad:${event_id}:${chunk[0].send_id}`,
                    },
                    body: JSON.stringify(payloads),
                });

                if (!res.ok) {
                    const err = await res.text().catch(() => "");
                    throw new Error(`Resend ${res.status}: ${err.slice(0, 300)}`);
                }

                const result = await res.json();
                chunk.forEach((r, idx) => {
                    updates.push({
                        send_id: r.send_id,
                        resend_id: result?.data?.[idx]?.id ?? null,
                        status: "sent",
                    });
                });
                sent += chunk.length;
            } catch (e) {
                // Mark this chunk failed rather than abandoning it as 'queued'.
                // A 'failed' row does NOT start the cooldown, so the organiser
                // can retry immediately -- which is the behaviour you want when
                // the provider, not the address, was the problem.
                console.error("attendee-details batch failed:", (e as Error).message);
                chunk.forEach((r) => {
                    updates.push({ send_id: r.send_id, resend_id: null, status: "failed" });
                });
                failed += chunk.length;
            }
        }

        const { error: finErr } = await db.rpc("finalize_attendee_detail_sends", {
            p_updates: updates,
        });
        if (finErr) {
            // The mail went out; only the bookkeeping failed. Say so rather
            // than reporting a failure the organiser would act on by resending.
            console.error("finalize_attendee_detail_sends failed:", finErr.message);
            return json({ sent, failed, skipped, warning: "ledger_not_updated" });
        }

        return json({ sent, failed, skipped });
    } catch (e) {
        console.error("send-attendee-details error:", (e as Error).message);
        return json({ error: "Could not send those emails." }, 500);
    }
});
