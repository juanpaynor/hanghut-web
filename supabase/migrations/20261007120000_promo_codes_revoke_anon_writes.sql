-- promo_codes was fully writable by anon: INSERT, UPDATE, DELETE and TRUNCATE
-- all held by the publishable key.
--
-- RLS hid most of it -- the "Organizers can manage promo codes" policy has no
-- anon branch, so row DML was refused -- but **TRUNCATE is table-level and RLS
-- does not gate it**, so the public key could have wiped every promo code on
-- the platform. Same pg_default_acl trap as the badge tables in
-- 20261006180000_badge_tables_revoke_anon_writes.sql.
--
-- anon keeps SELECT: the "Public can view active promo codes" policy is
-- load-bearing for guest checkout, where validatePromoCode() reads the code
-- with the anon key before a buyer has signed in.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.promo_codes FROM anon;

-- authenticated keeps row DML (the organizer manage policy needs it) but has no
-- business truncating the table either.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON public.promo_codes FROM authenticated;
