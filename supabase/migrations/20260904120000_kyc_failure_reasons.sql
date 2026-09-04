-- Xendit returns KYC rejections as a PER-FIELD list (kyc.failure_reasons):
--   [{ field: "LATEST_GIS_DOCUMENT", message: "Please provide the 2026 GIS" }, ...]
--
-- We had nowhere to put it. kyc_rejection_reason is a single text column, so six
-- distinct document problems collapsed into one sentence or — as actually happened
-- to THE KOOLPALS on 2026-08-23 — into nothing at all: Xendit bounced the
-- submission, the webhook never landed, and twelve days later our record still read
-- 'submitted' with a null reason. The partner was never told which documents to fix,
-- because we never held the answer.
--
-- Stored as jsonb rather than text so the form can render one line per failing
-- field next to the upload slot it belongs to, instead of a paragraph the partner
-- has to decode.
ALTER TABLE partners
    ADD COLUMN IF NOT EXISTS kyc_failure_reasons jsonb;

COMMENT ON COLUMN partners.kyc_failure_reasons IS
    'Per-field KYC failures from the payment provider: [{field, message}]. Null when there are none. Cleared on each resubmission.';
