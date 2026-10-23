-- Clean-up only.
--
-- attr_src_test() was created directly on production while A/B-ing the
-- attribution_source() rewrite against real rows (78,097 event_interactions
-- + 4,303 purchase_intents, 0 mismatches). It is referenced by nothing and
-- exists only as leftover scratch.
--
-- Separated from the rewrite migration so that one contains no destructive
-- statement and this one does exactly one thing.
DROP FUNCTION IF EXISTS public.attr_src_test(text, text, text);
