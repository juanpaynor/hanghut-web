-- Trigger to populate tickets.guest_name/email from purchase_intents
-- This ensures that even if the application logic misses copying these fields,
-- the database ensures consistency.

CREATE OR REPLACE FUNCTION public.populate_ticket_guest_info()
RETURNS TRIGGER AS $$
DECLARE
    v_guest_name text;
    v_guest_email text;
BEGIN
    -- Only run if user_id is null (Guest Ticket) AND guest_name is missing
    IF NEW.user_id IS NULL AND (NEW.guest_name IS NULL OR NEW.guest_email IS NULL) THEN
        
        -- Fetch from purchase_intents
        SELECT guest_name, guest_email 
        INTO v_guest_name, v_guest_email
        FROM public.purchase_intents
        WHERE id = NEW.purchase_intent_id;
        
        -- Update the NEW record
        IF v_guest_name IS NOT NULL THEN
            NEW.guest_name := v_guest_name;
        END IF;
        
        IF v_guest_email IS NOT NULL THEN
            NEW.guest_email := v_guest_email;
        END IF;
        
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply Trigger
DROP TRIGGER IF EXISTS trigger_populate_ticket_guest_info ON public.tickets;
CREATE TRIGGER trigger_populate_ticket_guest_info
BEFORE INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.populate_ticket_guest_info();

-- Retroactive Fix (Optional - safe to run)
UPDATE public.tickets t
SET 
    guest_name = pi.guest_name,
    guest_email = pi.guest_email
FROM public.purchase_intents pi
WHERE t.purchase_intent_id = pi.id
AND t.user_id IS NULL
AND (t.guest_name IS NULL OR t.guest_email IS NULL)
AND (pi.guest_name IS NOT NULL OR pi.guest_email IS NOT NULL);
