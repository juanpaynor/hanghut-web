-- Comprehensive Debug for Scanner Events
-- Run this and paste the output!

SELECT '1. Current User' as check_name, auth.uid() as user_id;

SELECT '2. Linked Partners' as check_name, id, business_name 
FROM partners 
WHERE user_id = auth.uid();

SELECT '3. Linked Team Accounts' as check_name, partner_id, role 
FROM partner_team_members 
WHERE user_id = auth.uid();

-- 4. Check Events for these exact IDs
WITH my_partners AS (
    SELECT id FROM partners WHERE user_id = auth.uid()
    UNION
    SELECT partner_id FROM partner_team_members WHERE user_id = auth.uid()
)
SELECT 
    '4. Events Found' as check_name,
    e.id, 
    e.title, 
    e.status, 
    e.organizer_id
FROM events e
WHERE e.organizer_id IN (SELECT id FROM my_partners);
