-- Migration: Fix ticket tier quantity_sold and promo code usage_count counters
-- These counters were never being updated on ticket purchase

-- ═══════════════════════════════════════════════════════════════════════
-- 1. TRIGGER: Auto-update ticket_tiers.quantity_sold when tickets change status
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_tier_quantity_sold()
RETURNS TRIGGER AS $$
DECLARE
    v_tier_id UUID;
    v_sold_count INTEGER;
BEGIN
    -- Determine which tier to update
    IF TG_OP = 'DELETE' THEN
        v_tier_id := OLD.tier_id;
    ELSE
        v_tier_id := COALESCE(NEW.tier_id, OLD.tier_id);
    END IF;

    -- Skip if no tier_id (e.g. general admission without tiers)
    IF v_tier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Count actual sold tickets for this tier
    -- "sold" = any status except 'available', 'cancelled', 'refunded'
    SELECT COUNT(*) INTO v_sold_count
    FROM tickets
    WHERE tier_id = v_tier_id
      AND status NOT IN ('available', 'cancelled', 'refunded');

    -- Update the tier's quantity_sold
    UPDATE ticket_tiers
    SET quantity_sold = v_sold_count
    WHERE id = v_tier_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_update_tier_quantity_sold ON tickets;

-- Create trigger on INSERT, UPDATE (status or tier_id changes), DELETE
CREATE TRIGGER trigger_update_tier_quantity_sold
AFTER INSERT OR UPDATE OF status, tier_id OR DELETE
ON tickets
FOR EACH ROW
EXECUTE FUNCTION update_tier_quantity_sold();


-- ═══════════════════════════════════════════════════════════════════════
-- 2. TRIGGER: Auto-update promo_codes.usage_count when purchase_intents use a promo
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_promo_usage_count()
RETURNS TRIGGER AS $$
DECLARE
    v_promo_id UUID;
    v_usage_count INTEGER;
BEGIN
    -- Determine which promo to update
    IF TG_OP = 'DELETE' THEN
        v_promo_id := OLD.promo_code_id;
    ELSE
        v_promo_id := COALESCE(NEW.promo_code_id, OLD.promo_code_id);
    END IF;

    -- Skip if no promo_code_id
    IF v_promo_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Count actual uses of this promo code
    SELECT COUNT(*) INTO v_usage_count
    FROM purchase_intents
    WHERE promo_code_id = v_promo_id
      AND status = 'completed';

    -- Update the promo's usage_count
    UPDATE promo_codes
    SET usage_count = v_usage_count
    WHERE id = v_promo_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trigger_update_promo_usage_count ON purchase_intents;

-- Create trigger on INSERT, UPDATE, DELETE
CREATE TRIGGER trigger_update_promo_usage_count
AFTER INSERT OR UPDATE OF promo_code_id, status OR DELETE
ON purchase_intents
FOR EACH ROW
EXECUTE FUNCTION update_promo_usage_count();


-- ═══════════════════════════════════════════════════════════════════════
-- 3. BACKFILL: Fix existing counters from current data
-- ═══════════════════════════════════════════════════════════════════════

-- Backfill ticket tier quantity_sold
UPDATE ticket_tiers tt
SET quantity_sold = COALESCE(sub.sold_count, 0)
FROM (
    SELECT tier_id, COUNT(*) as sold_count
    FROM tickets
    WHERE status NOT IN ('available', 'cancelled', 'refunded')
      AND tier_id IS NOT NULL
    GROUP BY tier_id
) sub
WHERE tt.id = sub.tier_id;

-- Also zero out tiers with no sales (in case they had stale values)
UPDATE ticket_tiers
SET quantity_sold = 0
WHERE id NOT IN (
    SELECT DISTINCT tier_id FROM tickets
    WHERE status NOT IN ('available', 'cancelled', 'refunded')
      AND tier_id IS NOT NULL
);

-- Backfill promo code usage_count
UPDATE promo_codes pc
SET usage_count = COALESCE(sub.use_count, 0)
FROM (
    SELECT promo_code_id, COUNT(*) as use_count
    FROM purchase_intents
    WHERE promo_code_id IS NOT NULL
      AND status = 'completed'
    GROUP BY promo_code_id
) sub
WHERE pc.id = sub.promo_code_id;

-- Also zero out promos with no uses
UPDATE promo_codes
SET usage_count = 0
WHERE id NOT IN (
    SELECT DISTINCT promo_code_id FROM purchase_intents
    WHERE promo_code_id IS NOT NULL
      AND status = 'completed'
);
