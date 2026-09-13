-- Private bucket for support screenshots. Modelled on `kyc-documents`, which is
-- the existing private-bucket pattern here — support threads carry the same
-- class of content (account details, payout problems, someone's booking), so a
-- public bucket would be the XENDIT-SECCERT mistake a second time.
--
-- Path convention is `<ticket_id>/<uuid>.<ext>`, and the policies below read
-- the ticket id straight out of the first path segment. They compare it as
-- TEXT against t.id::text rather than casting the segment to uuid: the segment
-- is attacker-controlled, and a failed ::uuid cast inside a policy raises
-- instead of simply denying.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'support-attachments', 'support-attachments', false, 10485760,
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Read support attachments on visible threads" ON storage.objects;
CREATE POLICY "Read support attachments on visible threads" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'support-attachments'
        AND EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id::text = (storage.foldername(name))[1]
              AND (
                  t.user_id = auth.uid()
                  OR public.is_partner_owner(t.partner_id)
                  OR public.is_support_agent()
              )
        )
    );

DROP POLICY IF EXISTS "Upload support attachments to open threads" ON storage.objects;
CREATE POLICY "Upload support attachments to open threads" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'support-attachments'
        AND EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id::text = (storage.foldername(name))[1]
              AND (
                  public.is_support_agent()
                  OR (t.status <> 'closed' AND (t.user_id = auth.uid() OR public.is_partner_owner(t.partner_id)))
              )
        )
    );

-- No UPDATE or DELETE policy: an attachment is part of the record, same as the
-- messages it hangs off.
