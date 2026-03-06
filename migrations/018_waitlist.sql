-- Waitlist / Email collection table
CREATE TABLE public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  source text DEFAULT 'landing_page',
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT waitlist_pkey PRIMARY KEY (id),
  CONSTRAINT waitlist_email_unique UNIQUE (email)
);

-- Allow anonymous inserts (public landing page)
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON public.waitlist
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow admin reads" ON public.waitlist
  FOR SELECT
  USING (true);

COMMENT ON TABLE public.waitlist IS 'Collects emails and names from the landing page waitlist modal.';
