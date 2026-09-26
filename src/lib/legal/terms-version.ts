/**
 * The version of the HangHut buyer Terms of Service, as its Last Updated date.
 *
 * This is recorded against every paid order in
 * purchase_intents.accepted_platform_terms_version, so it has to mean something
 * a human can act on: given this string, someone handling a dispute must be
 * able to find the exact document the buyer ticked. An opaque counter ("v3")
 * cannot do that. A date can.
 *
 * The /terms page renders its Last Updated line FROM this constant rather than
 * repeating the date, so the page and the audit trail cannot drift apart. When
 * the terms change, change it here — that is the whole edit.
 *
 * The same string is mirrored in supabase/functions/create-purchase-intent as
 * the fallback for a client that does not report a version. Deno cannot import
 * from src/, so the two are kept in sync by hand, as with the pricing constants
 * in that function.
 */
export const PLATFORM_TERMS_VERSION = '2026-05-08'

/** The same date written the way it is shown to a reader. */
export const PLATFORM_TERMS_UPDATED_LABEL = 'May 8, 2026'
