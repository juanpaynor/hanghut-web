-- Create partner_subscribers table
CREATE TABLE IF NOT EXISTS partner_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    source TEXT DEFAULT 'checkout',  -- 'checkout', 'manual', 'import'
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    unsubscribe_token UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(partner_id, email)
);

CREATE INDEX IF NOT EXISTS idx_partner_subscribers_partner ON partner_subscribers(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_subscribers_active ON partner_subscribers(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_partner_subscribers_token ON partner_subscribers(unsubscribe_token);

-- Create email_campaigns table
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    recipient_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
    sent_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- Create storage bucket for email images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('email-images', 'email-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'email-images');

-- Allow public access to view images
CREATE POLICY "Allow public viewing" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'email-images');
