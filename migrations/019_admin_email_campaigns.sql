-- Admin Email Campaigns tracking table
CREATE TABLE public.admin_email_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  html_content text NOT NULL,
  sender_name text DEFAULT 'HangHut',
  recipient_count integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'partial', 'failed')),
  sent_at timestamp with time zone,
  sent_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_email_campaigns_pkey PRIMARY KEY (id)
);

ALTER TABLE public.admin_email_campaigns ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write
CREATE POLICY "Admin full access" ON public.admin_email_campaigns
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.admin_email_campaigns IS 'Tracks email campaigns sent by HangHut admins to the waitlist.';
