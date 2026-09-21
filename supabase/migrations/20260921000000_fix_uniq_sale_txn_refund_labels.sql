-- uniq_sale_txn_per_intent exists to stop a SALE being written twice for one
-- purchase intent. Its predicate exempted only fee_basis = 'refund', which is
-- what the two TypeScript writers (xendit-webhook, request-refund) tag their
-- reversal rows with.
--
-- The three SQL refund RPCs added later tag theirs 'manual_refund',
-- 'disbursement_refund' and 'auto_refund'. All three are "DISTINCT FROM
-- 'refund'", so every one of their reversal rows collided with the original
-- sale row and the whole refund aborted. Zero rows carrying those three labels
-- have ever existed in this table -- all three paths have never once completed.
--
-- Widened to exempt any reversal label, so a future writer inventing a fourth
-- one does not silently reintroduce the same outage. The sale guard is
-- unchanged: one non-reversal row per intent, NULL fee_basis still indexed.
drop index if exists uniq_sale_txn_per_intent;

create unique index uniq_sale_txn_per_intent
    on public.transactions (purchase_intent_id)
    where (fee_basis is null or fee_basis not like '%refund%');
