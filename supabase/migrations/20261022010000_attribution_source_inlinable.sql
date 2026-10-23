-- Make attribution_source() inlinable.
--
-- THE BUG
--
-- The Analytics tab took ~4s. ~2.0s of that was one subquery -- the `sources`
-- block inside get_event_analytics that powers the Traffic sources card:
--
--   Seq Scan on event_interactions (actual time=1.683..1958.768 rows=55064)
--   Execution Time: 2056.511 ms
--
-- The time was not I/O (1,749 shared buffers, all hits) and not a missing
-- index. It was 55,064 function invocations -- one per row.
--
-- attribution_source() is LANGUAGE sql + IMMUTABLE, which normally means the
-- planner INLINES it into the calling query. Two things in the old definition
-- made that impossible, and either one alone is enough:
--
--   1. The body was `WITH n AS (...) SELECT CASE ... FROM n`. A SQL function
--      can only be inlined when its body is a single `SELECT <expression>`
--      with no FROM and no CTE. The CTE existed purely to avoid repeating the
--      three normalisation expressions -- a readability choice that cost
--      ~1.8s per analytics load.
--
--   2. `SET search_path TO 'public'`. A function carrying a SET clause can
--      never be inlined, because the setting has to be applied around the
--      call. This is the subtler of the two: removing the CTE alone would
--      not have fixed anything.
--
-- THE FIX, AND WHY IT IS SAFE WITHOUT SET search_path
--
-- Neither function reads a table, a view or a custom type -- they are pure
-- text manipulation. Every real function call is schema-qualified to
-- pg_catalog so it cannot be shadowed; NULLIF and COALESCE are parser
-- constructs, not functions, so they cannot be shadowed at all. The only
-- caller, get_event_analytics(), is SECURITY DEFINER and pins search_path
-- itself, so the search_path in force during the CASE is already controlled.
--
-- This WILL raise Supabase's `function_search_path_mutable` lint on both
-- functions. That is the deliberate trade: the lint targets SECURITY DEFINER
-- functions that touch tables, which these are not.
--
-- VERIFIED BEFORE APPLYING, on production data:
--   * 78,097 event_interactions rows + 4,303 purchase_intents rows compared
--     old vs new output -- 0 mismatches.
--   * Same query, same event: 2,056 ms -> 226 ms (9.1x), and EXPLAIN shows
--     the CASE expanded inline with no function call remaining.

-- Extracted so the host rule lives in one place. One bare SELECT, no SET, so
-- it inlines into attribution_source, which in turn inlines into the query --
-- the planner does this recursively, confirmed in the resulting plan.
CREATE OR REPLACE FUNCTION public.attribution_host(p_referrer text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT pg_catalog.lower(
           pg_catalog.split_part(
             pg_catalog.split_part(coalesce(p_referrer, ''), '//', 2), '/', 1))
$$;

-- Same branches, same order, same outputs as the version this replaces.
-- The repetition is load-bearing: a local alias would need a CTE, and a CTE
-- is what made this slow.
CREATE OR REPLACE FUNCTION public.attribution_source(p_channel text, p_utm text, p_referrer text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IN ('ig','insta','instagram')           THEN 'instagram'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IN ('fb','facebook','meta','messenger') THEN 'facebook'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IN ('tt','tiktok')                      THEN 'tiktok'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IN ('x','twitter')                      THEN 'twitter'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IN ('yt','youtube')                     THEN 'youtube'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IN ('email','newsletter')               THEN 'email'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_utm), '')) IS NOT NULL                             THEN pg_catalog.lower(pg_catalog.btrim(p_utm))
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)instagram\.com$'                                 THEN 'instagram'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)(facebook|messenger)\.com$'
      OR public.attribution_host(p_referrer) IN ('fb.me','fb.com')                                     THEN 'facebook'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)tiktok\.com$'                                    THEN 'tiktok'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)(twitter|x)\.com$'
      OR public.attribution_host(p_referrer) = 't.co'                                                  THEN 'twitter'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)youtube\.com$'
      OR public.attribution_host(p_referrer) = 'youtu.be'                                              THEN 'youtube'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)google\.'                                        THEN 'google'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)(bing|duckduckgo|yahoo)\.'                       THEN 'search'
    WHEN public.attribution_host(p_referrer) ~ '(^|\.)(linktr\.ee|lnk\.bio|bio\.link|beacons\.ai|taplink\.cc)$'
                                                                                                       THEN 'link_in_bio'
    WHEN pg_catalog.lower(nullif(pg_catalog.btrim(p_channel), '')) IS NOT NULL
     AND pg_catalog.lower(nullif(pg_catalog.btrim(p_channel), '')) NOT IN ('direct','unknown')         THEN pg_catalog.lower(pg_catalog.btrim(p_channel))
    ELSE 'direct'
  END
$$;

-- Re-asserted rather than inherited. CREATE OR REPLACE does keep existing
-- grants, but attribution_host is new and must match, and stating both here
-- means the privileges are readable in one place instead of two migrations.
REVOKE ALL ON FUNCTION public.attribution_source(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.attribution_host(text)               FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attribution_source(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attribution_host(text)               TO authenticated, service_role;

-- NOTE: the scratch function used to A/B this rewrite (attr_src_test) is
-- dropped by the companion migration, so that nothing in THIS file is a
-- destructive operation.
