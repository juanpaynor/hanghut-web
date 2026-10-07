// Retrieve one email we actually sent, so an organizer can see exactly what a
// buyer received -- or that nothing was received at all.
//
// Resend keeps the rendered message and its delivery state; GET /emails/{id}
// returns both (`html` and `last_event`). We hold the id in email_sends (from
// process-payment-queue, going forward) or in email_events (for anything that
// bounced, which the webhook has always captured). get_order_email_log unions
// the two.
//
// SECURITY -- the one thing that must not be got wrong:
// the caller never gets to name an arbitrary resend_id. A Resend id is an
// account-wide handle, so trusting a client-supplied one would turn this into
// "read any email HangHut has ever sent to anybody". Instead the caller names an
// ORDER, the RPC decides (under can_sell_at_door, as the user) which ids belong
// to it, and we refuse anything not in that set.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) return json({ error: "Email provider is not configured." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated." }, 401);

    const { intent_id, resend_id } = await req.json();
    if (!intent_id || !resend_id) {
      return json({ error: "intent_id and resend_id are required." }, 400);
    }

    // The USER's client, not a service client: can_sell_at_door inside the RPC
    // reads auth.uid(), and that is the whole authorisation check.
    const db = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: log, error: logErr } = await db.rpc("get_order_email_log", {
      p_intent_id: intent_id,
    });
    if (logErr) {
      console.error("get_order_email_log failed:", logErr.message);
      return json({ error: "Could not read this order's email history." }, 500);
    }

    // Empty covers both "not your event" and "no such order" -- deliberately
    // indistinguishable to the caller.
    const permitted = (log ?? []) as { resend_id: string | null }[];
    if (!permitted.some((r) => r.resend_id === resend_id)) {
      return json({ error: "That email does not belong to this order." }, 403);
    }

    const res = await fetch(`https://api.resend.com/emails/${resend_id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    if (res.status === 404) {
      // Resend does not keep messages forever. An organizer looking at an old
      // order should be told that plainly rather than shown an empty dialog
      // that reads as a bug.
      return json({ error: "NOT_RETAINED", message: "Resend no longer has this email." }, 404);
    }
    if (!res.ok) {
      const detail = await res.text();
      console.error(`Resend retrieve failed (${res.status}):`, detail);
      return json({ error: "Could not load this email from the provider." }, 502);
    }

    const email = await res.json();

    // Only what the dialog renders. The full payload carries headers and
    // provider internals an organizer has no use for.
    return json({
      id: email.id,
      subject: email.subject ?? null,
      to: email.to ?? [],
      from: email.from ?? null,
      created_at: email.created_at ?? null,
      last_event: email.last_event ?? null,
      html: email.html ?? null,
      text: email.text ?? null,
    });
  } catch (e) {
    console.error("get-sent-email error:", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
