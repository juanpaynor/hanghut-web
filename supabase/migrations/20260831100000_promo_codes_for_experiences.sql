-- Promo codes on experiences.
--
-- promo_codes was built for events only. An experience is a row in `tables`, so
-- it gets its own column rather than overloading event_id — a code must never be
-- ambiguous about what it discounts.
--
-- Applied to prod 2026-08-31 as: promo_codes_for_experiences,
-- reserve_experience_with_promo, preview_experience_promo,
-- fix_promo_usage_count_status. Kept here so a fresh database matches.

ALTER TABLE public.promo_codes
    ADD COLUMN IF NOT EXISTS experience_id uuid REFERENCES public.tables(id) ON DELETE CASCADE;

-- Exactly one target. Without this, a code with both set validates against
-- whichever query looks first, and a code with neither applies everywhere.
ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_one_target;
ALTER TABLE public.promo_codes ADD CONSTRAINT promo_codes_one_target CHECK (
    (event_id IS NOT NULL AND experience_id IS NULL) OR
    (event_id IS NULL AND experience_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS promo_codes_experience_idx
    ON public.promo_codes (experience_id) WHERE experience_id IS NOT NULL;

COMMENT ON COLUMN public.promo_codes.experience_id IS
  'The experience (tables.id) this code discounts. Mutually exclusive with event_id — see promo_codes_one_target.';

ALTER TABLE public.experience_purchase_intents
    ADD COLUMN IF NOT EXISTS promo_code_id   uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS experience_intents_promo_idx
    ON public.experience_purchase_intents (promo_code_id) WHERE promo_code_id IS NOT NULL;


-- ── usage_count must count BOTH kinds of sale ────────────────────────────────
-- The original trigger recomputed usage_count from purchase_intents alone, so
-- once experiences shared the counter the next event booking would reset it and
-- silently hand back every experience use — a 100-use cap that never stops
-- anyone.
--
-- It also matched status IN ('completed','confirmed'). 'confirmed' is not a
-- label of the purchase_intent_status enum and never has been; it survived only
-- because it was never evaluated. Folding both tables into one SELECT forced
-- evaluation and it failed with "invalid input value for enum". Compared as
-- text now, because this trigger runs inside the buyer's INSERT — a counting bug
-- must not become a failed checkout.
CREATE OR REPLACE FUNCTION public.update_promo_usage_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_promo_id UUID;
    v_usage_count INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_promo_id := OLD.promo_code_id;
    ELSE
        v_promo_id := COALESCE(NEW.promo_code_id, OLD.promo_code_id);
    END IF;

    IF v_promo_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT (SELECT COUNT(*) FROM purchase_intents
            WHERE promo_code_id = v_promo_id AND status::text = 'completed')
         + (SELECT COUNT(*) FROM experience_purchase_intents
            WHERE promo_code_id = v_promo_id AND status::text = 'completed')
    INTO v_usage_count;

    UPDATE promo_codes SET usage_count = v_usage_count WHERE id = v_promo_id;

    RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trigger_update_promo_usage_count ON public.experience_purchase_intents;
CREATE TRIGGER trigger_update_promo_usage_count
    AFTER INSERT OR DELETE OR UPDATE OF promo_code_id, status
    ON public.experience_purchase_intents
    FOR EACH ROW EXECUTE FUNCTION public.update_promo_usage_count();
