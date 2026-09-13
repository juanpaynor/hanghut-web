// Emails an organizer about their support thread.
//
// Two kinds:
//   kind:"reply"      (default) — support has answered, here is the answer
//   kind:"transcript"           — the conversation was wrapped up, here is the
//                                 whole thing for their records
//   kind:"appeal"               — an admin answered an ACCOUNT APPEAL. Different
//                                 system, same table: the text lives in the
//                                 legacy admin_response column and there is no
//                                 thread. This is the only channel a suspended
//                                 user has — their app holds them on a screen
//                                 with two choices, appeal or sign out — so
//                                 before this existed, an admin's reply reached
//                                 literally nobody.
//
// The caller supplies ONE thing: a ticket id. The recipient address and the
// message body are both resolved here, with the service role, from the row.
// That is deliberate — `send-otp-code` takes the address AND the code from
// whoever calls it, which makes it a branded-phishing primitive, and this
// function is not going to be the second one.
//
// It is also internal-only: the bearer must be the service-role key, so this
// is reachable from a server action and from nothing a browser can do. A
// plain verify_jwt would have let any signed-in user fire a notification at
// any ticket's owner. Fails closed — no key configured means no callers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = Deno.env.get("APP_URL") ?? "https://hanghut.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Constant-time-ish compare so the guard does not leak the key a byte at a time.
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Server configuration error");

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer || !sameSecret(bearer, SERVICE_ROLE_KEY)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { ticket_id, kind = "reply" } = await req.json();
    if (!ticket_id) throw new Error("ticket_id is required");
    if (kind !== "reply" && kind !== "transcript" && kind !== "appeal") throw new Error("unknown kind");

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: ticket, error: ticketErr } = await db
      .from("support_tickets")
      .select("id, reference, subject, user_id, last_sender, status, created_at, organizer_unread, ticket_type, admin_response, account_status")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) throw new Error("Ticket not found");

    // An appeal is answered from a different console and carries its text in a
    // different column, so it skips every thread rule below.
    if (kind === "appeal") {
      if (ticket.ticket_type !== "account_appeal") {
        throw new Error("not an account appeal");
      }
      if (!ticket.admin_response) {
        return new Response(JSON.stringify({ success: true, skipped: "no admin response yet" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Only an agent reply is worth an email. An organizer's own message coming
    // back to them would be noise, and a system note is not correspondence.
    // A transcript is sent on wrap-up regardless of who spoke last.
    if (kind === "reply" && ticket.last_sender !== "agent") {
      return new Response(JSON.stringify({ success: true, skipped: "last sender is not an agent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ONE EMAIL PER UNREAD RUN, not one per reply.
    //
    // organizer_unread counts agent messages the requester has not opened yet,
    // and the trigger has already incremented it for the message that triggered
    // this call. So 1 means "they had nothing waiting and now they do" — the
    // moment worth an email. 2+ means we already mailed them about this run and
    // they have not been back; a second mail adds nothing they do not already
    // know. 0 means they read it between the insert and this call, so they are
    // looking at the thread right now.
    //
    // Deliberately NOT "only ever the first reply of a thread": that would drop
    // the follow-up an agent sends the next day with the actual answer. This
    // rule re-arms every time the requester comes back and reads, so a
    // conversation that keeps moving keeps pulling them in.
    if (kind === "reply" && ticket.organizer_unread !== 1) {
      return new Response(
        JSON.stringify({ success: true, skipped: `already notified (unread=${ticket.organizer_unread})` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    let latest: { body: string; created_at: string } | null = null;
    // eslint-disable-next-line prefer-const
    let transcript: Array<{ body: string; sender: string; created_at: string }> = [];

    if (kind === "appeal") {
      // Nothing to fetch: the text is on the ticket row.
    } else if (kind === "reply") {
      const { data } = await db
        .from("support_messages")
        .select("body, created_at")
        .eq("ticket_id", ticket_id)
        .eq("sender", "agent")
        .eq("internal", false)
        .is("deleted_at", null)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      latest = data;
      if (!latest) throw new Error("No agent reply to send");
    } else if (kind === "transcript") {
      // Two filters, both load-bearing.
      //
      // internal = false: an internal note is written on the assumption the
      // requester never sees it, and mailing the transcript is exactly the
      // moment that assumption gets tested.
      //
      // deleted_at is null: a retraction exists because someone pasted a key or
      // a password. Mailing it back to them in the wrap-up would hand the secret
      // to their inbox — and to anyone they forward the transcript to — after
      // they had already taken it back.
      const { data } = await db
        .from("support_messages")
        .select("body, sender, created_at")
        .eq("ticket_id", ticket_id)
        .eq("internal", false)
        .is("deleted_at", null)
        .order("seq", { ascending: true });
      transcript = data ?? [];
      if (transcript.length === 0) throw new Error("Nothing to transcribe");
    }

    const { data: recipient } = await db
      .from("users")
      .select("email, display_name, status")
      .eq("id", ticket.user_id)
      .maybeSingle();

    if (!recipient?.email) {
      // Not worth retrying — some accounts genuinely have no email on the row.
      // Say so plainly rather than failing the agent's reply behind them.
      return new Response(JSON.stringify({ success: true, skipped: "no recipient email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const threadUrl = `${APP_URL}/organizer`;

    const footerReason = kind === "appeal"
      ? "You're receiving this because you filed an account appeal on HangHut."
      : "You're receiving this because you opened a support conversation on HangHut.";

    function shell(inner: string): string {
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:520px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#18181b;padding:32px 40px;text-align:center;">
<h1 style="margin:0;font-size:24px;font-weight:800;color:white;letter-spacing:-0.5px;">HANGHUT</h1></td></tr>
<tr><td style="padding:40px;">
<p style="margin:0 0 4px;font-size:12px;color:#a1a1aa;font-family:ui-monospace,monospace;">${esc(ticket.reference ?? "")}</p>
${inner}
</td></tr>
<tr><td style="padding:20px 40px 28px;border-top:1px solid #f4f4f5;text-align:center;">
<p style="margin:0;font-size:12px;color:#a1a1aa;">${footerReason}</p>
</td></tr>
</table></td></tr></table></body></html>`;
    }

    function when(iso: string): string {
      // Manila, because that is where every organizer reading this is.
      return new Date(iso).toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      });
    }

    let html: string;
    let subject: string;

    if (kind === "appeal") {
      // The user's CURRENT status, not the snapshot taken on the ticket when
      // they filed. approveAppeal reactivates the account but never writes back
      // to support_tickets.account_status, so the snapshot still says suspended
      // and a restored user would have been told "we've reviewed your appeal"
      // while being told nothing about the one thing they wanted to know.
      const approved = recipient.status === "active";
      subject = `Your HangHut account appeal (${ticket.reference ?? ""})`;
      // NO "open your dashboard" button. The recipient is suspended — a link to
      // a place they cannot reach is worse than no link, because it reads as
      // being brushed off. Everything they need is in the message itself.
      html = shell(`
<h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#18181b;">${approved ? "Your account has been restored" : "We've reviewed your appeal"}</h2>
<p style="margin:0 0 24px;font-size:13px;color:#71717a;">Submitted ${esc(when(ticket.created_at))}</p>
<div style="background:#f4f4f5;border-radius:12px;padding:18px 20px;margin-bottom:24px;">
<p style="margin:0;font-size:15px;color:#18181b;line-height:1.6;white-space:pre-wrap;">${esc(ticket.admin_response)}</p>
</div>
<p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;">${approved
        ? "You can sign in again as normal."
        : "If you have more to add, reply to this email and it will reach the team."}</p>`);
    } else if (kind === "reply") {
      subject = `Re: ${ticket.subject ?? "your question"} (${ticket.reference ?? ""})`;
      html = shell(`
<h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#18181b;">We replied to your question</h2>
<p style="margin:0 0 8px;font-size:13px;color:#71717a;">${esc(ticket.subject ?? "")}</p>
<div style="background:#f4f4f5;border-radius:12px;padding:18px 20px;margin-bottom:28px;">
<p style="margin:0;font-size:15px;color:#18181b;line-height:1.6;white-space:pre-wrap;">${esc(latest!.body)}</p>
</div>
<a href="${threadUrl}" style="display:block;text-align:center;background:#18181b;color:white;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;">Reply in your dashboard</a>`);
    } else {
      // Wrap-up. The whole conversation, in order, so it survives outside the
      // dashboard — this is the copy an organizer forwards to their accountant
      // or keeps for a dispute, and it is the reason the transcript exists at
      // all rather than a "your ticket was closed" one-liner.
      const closed = ticket.status === "closed";
      subject = `Your conversation with HangHut Support (${ticket.reference ?? ""})`;
      const rows = transcript.map((m) => {
        const mine = m.sender === "requester";
        // "You", not their name: this email is addressed to the requester, so
        // their own lines read as theirs.
        const who = mine ? "You" : "HangHut Support";
        return `<div style="margin-bottom:18px;">
<p style="margin:0 0 4px;font-size:12px;color:#a1a1aa;"><strong style="color:${mine ? "#71717a" : "#18181b"};">${who}</strong> &middot; ${esc(when(m.created_at))}</p>
<div style="background:${mine ? "#ffffff" : "#f4f4f5"};border:1px solid ${mine ? "#e4e4e7" : "transparent"};border-radius:12px;padding:14px 16px;">
<p style="margin:0;font-size:14px;color:#18181b;line-height:1.6;white-space:pre-wrap;">${esc(m.body)}</p>
</div></div>`;
      }).join("");

      html = shell(`
<h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#18181b;">${closed ? "This conversation is closed" : "We've marked this resolved"}</h2>
<p style="margin:0 0 24px;font-size:13px;color:#71717a;">${esc(ticket.subject ?? "")} &middot; opened ${esc(when(ticket.created_at))} &middot; ${transcript.length} message${transcript.length === 1 ? "" : "s"}</p>
${rows}
<p style="margin:24px 0 20px;font-size:13px;color:#71717a;line-height:1.6;">${closed
        ? "If you need anything else, start a new conversation and we'll pick it up from there."
        : "If this isn't sorted, just reply in your dashboard and the thread reopens."}</p>
<a href="${threadUrl}" style="display:block;text-align:center;background:#18181b;color:white;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;">${closed ? "Open your dashboard" : "Reply in your dashboard"}</a>`);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HangHut Support <noreply@hanghut.com>",
        to: recipient.email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      throw new Error("Failed to send email");
    }

    const result = await res.json();
    return new Response(JSON.stringify({ success: true, email_id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("send-support-notification:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
