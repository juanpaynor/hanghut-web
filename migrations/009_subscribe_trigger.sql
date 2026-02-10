-- 009_subscribe_trigger.sql
-- Automate subscription on checkout

-- Fix for: invalid input value for enum purchase_intent_status: "paid"
-- The previous version of this function tried to compare status = 'paid', 
-- which triggers a casting error because 'paid' is not a valid enum value.

CREATE OR REPLACE FUNCTION public.handle_checkout_subscription()
RETURNS TRIGGER AS $$
DECLARE
    v_partner_id UUID;
    v_email TEXT;
    v_name TEXT;
BEGIN
    -- Only proceed if subscription is requested and status is completed
    -- Fixed: Removed "OR NEW.status = 'paid'" to avoid enum cast error
    IF NEW.subscribed_to_newsletter = TRUE AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
        
        -- Get email and name from guest details first
        v_email := NEW.guest_email;
        v_name := NEW.guest_name;
        
        -- Fallback to user table if guest info is missing but user_id is present
        IF v_email IS NULL AND NEW.user_id IS NOT NULL THEN
            SELECT email, display_name 
            INTO v_email, v_name 
            FROM public.users
            WHERE id = NEW.user_id;
        END IF;

        -- Get Partner ID from Event
        SELECT organizer_id INTO v_partner_id FROM public.events WHERE id = NEW.event_id;

        IF v_partner_id IS NOT NULL AND v_email IS NOT NULL THEN
            INSERT INTO public.partner_subscribers (partner_id, email, full_name, source, is_active)
            VALUES (v_partner_id, v_email, v_name, 'checkout', TRUE)
            ON CONFLICT (partner_id, email) 
            DO UPDATE SET 
                is_active = TRUE, 
                source = 'checkout', -- Updated source to reflect most recent opt-in
                unsubscribed_at = NULL; -- Reactivate if previously unsubscribed
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_purchase_subscribe ON public.purchase_intents;

CREATE TRIGGER on_purchase_subscribe
AFTER UPDATE ON public.purchase_intents
FOR EACH ROW
EXECUTE FUNCTION public.handle_checkout_subscription();
