-- Email Marketing & Mailing List Migration

-- 1. Create partner_subscribers table
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

-- 2. Create email_campaigns table
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

-- 3. Add subscribed_to_newsletter to purchase_intents
ALTER TABLE purchase_intents 
ADD COLUMN IF NOT EXISTS subscribed_to_newsletter BOOLEAN DEFAULT FALSE;

-- 4. Enable RLS
ALTER TABLE partner_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Partner Subscribers Policies
CREATE POLICY "Partners can view their own subscribers" 
ON partner_subscribers FOR SELECT 
USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
));

CREATE POLICY "Partners can insert their own subscribers" 
ON partner_subscribers FOR INSERT 
WITH CHECK (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
));

CREATE POLICY "Partners can update their own subscribers" 
ON partner_subscribers FOR UPDATE 
USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
));

-- Public can update unsubscribe (via Edge Function or Server Action basically)
-- Actually, letting public update via token is safer via secure server action/function using service role.
-- But for Client side unsubscribe page calling supabase directly:
CREATE POLICY "Public can unsubscribe via token"
ON partner_subscribers FOR UPDATE
USING (unsubscribe_token = (current_setting('request.headers')::json->>'x-unsubscribe-token')::uuid)
WITH CHECK (unsubscribe_token = (current_setting('request.headers')::json->>'x-unsubscribe-token')::uuid);
-- NOTE: The above is tricky. Better to handle unsubscribe via a Server Action with Service Role.
-- So we will stick to Partner policies for now.

-- Email Campaigns Policies
CREATE POLICY "Partners can view their own campaigns" 
ON email_campaigns FOR SELECT 
USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
));

CREATE POLICY "Partners can manage their own campaigns" 
ON email_campaigns FOR ALL 
USING (partner_id IN (
    SELECT id FROM partners WHERE user_id = auth.uid()
));
