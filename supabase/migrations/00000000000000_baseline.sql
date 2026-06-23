-- ============================================================
-- BASELINE — full prod public-schema snapshot (squash baseline)
-- Source: prod (PostgreSQL 17.6), pg_dump --schema-only --schema=public --no-owner
-- Extensions prepended so a fresh branch builds the schema from empty.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgmq;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: activity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.activity_type AS ENUM (
    'dinner',
    'drinks',
    'coffee',
    'brunch',
    'activity',
    'other'
);


--
-- Name: auth_provider_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.auth_provider_type AS ENUM (
    'email',
    'google',
    'apple'
);


--
-- Name: discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.discount_type AS ENUM (
    'percentage',
    'fixed_amount'
);


--
-- Name: event_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_status AS ENUM (
    'draft',
    'active',
    'sold_out',
    'cancelled',
    'completed',
    'paused',
    'hidden'
);


--
-- Name: event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_type AS ENUM (
    'concert',
    'workshop',
    'conference',
    'sports',
    'social',
    'other',
    'food',
    'nightlife',
    'art'
);


--
-- Name: gender_filter_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_filter_type AS ENUM (
    'women_only',
    'men_only',
    'mix',
    'none'
);


--
-- Name: gender_preference_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender_preference_type AS ENUM (
    'women_only',
    'men_only',
    'mix_preferred',
    'no_preference'
);


--
-- Name: goal_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goal_type AS ENUM (
    'friends',
    'romance',
    'casual'
);


--
-- Name: interest_category_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interest_category_type AS ENUM (
    'food',
    'activities',
    'hobbies',
    'music',
    'sports',
    'arts',
    'tech',
    'travel',
    'other'
);


--
-- Name: kyc_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.kyc_status_type AS ENUM (
    'not_started',
    'pending_review',
    'submitted',
    'resubmission_required',
    'verified',
    'rejected'
);


--
-- Name: meetup_mode_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meetup_mode_type AS ENUM (
    'matched',
    'create_own',
    'both'
);


--
-- Name: member_role_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_role_type AS ENUM (
    'host',
    'member'
);


--
-- Name: member_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_status_type AS ENUM (
    'pending',
    'approved',
    'joined',
    'declined',
    'left',
    'no_show',
    'attended',
    'invited'
);


--
-- Name: message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_type AS ENUM (
    'text',
    'image',
    'system'
);


--
-- Name: partner_pricing_model; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partner_pricing_model AS ENUM (
    'standard',
    'custom',
    'tiered'
);


--
-- Name: partner_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partner_role AS ENUM (
    'owner',
    'manager',
    'scanner',
    'finance',
    'marketing'
);


--
-- Name: TYPE partner_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.partner_role IS 'owner=full access, manager=ops without financials, scanner=check-in only';


--
-- Name: partner_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.partner_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'suspended'
);


--
-- Name: payout_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payout_status AS ENUM (
    'pending_request',
    'approved',
    'processing',
    'completed',
    'failed',
    'rejected',
    'cancelled'
);


--
-- Name: purchase_intent_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_intent_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'expired',
    'cancelled'
);


--
-- Name: queue_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.queue_status_type AS ENUM (
    'pending',
    'matched',
    'expired'
);


--
-- Name: report_reason_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_reason_type AS ENUM (
    'harassment',
    'fake_profile',
    'no_show',
    'inappropriate',
    'other'
);


--
-- Name: report_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_status_type AS ENUM (
    'pending',
    'reviewed',
    'actioned',
    'dismissed'
);


--
-- Name: table_mode_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.table_mode_type AS ENUM (
    'matched',
    'public',
    'private'
);


--
-- Name: table_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.table_status_type AS ENUM (
    'draft',
    'open',
    'full',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: ticket_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ticket_status AS ENUM (
    'valid',
    'used',
    'cancelled',
    'refunded',
    'available',
    'reserved',
    'pending_approval',
    'approved'
);


--
-- Name: timeframe_preference_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.timeframe_preference_type AS ENUM (
    'today',
    'tomorrow',
    'this_week',
    'weekend',
    'custom'
);


--
-- Name: transaction_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'refunded'
);


--
-- Name: travel_match_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.travel_match_status_type AS ENUM (
    'active',
    'archived'
);


--
-- Name: travel_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.travel_status_type AS ENUM (
    'planning',
    'confirmed',
    'in_progress',
    'completed'
);


--
-- Name: trip_purpose_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trip_purpose_type AS ENUM (
    'vacation',
    'work',
    'moving',
    'visiting',
    'other'
);


--
-- Name: user_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_status_type AS ENUM (
    'active',
    'suspended',
    'banned'
);


--
-- Name: _cluster_grid_size(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._cluster_grid_size(zoom integer) RETURNS double precision
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN zoom <= 7  THEN 0.5      -- ~55km cells (country/region)
    WHEN zoom <= 9  THEN 0.1      -- ~11km cells (metro)
    WHEN zoom <= 11 THEN 0.02     -- ~2.2km cells (district)
    WHEN zoom <= 13 THEN 0.005    -- ~550m cells (neighborhood)
    WHEN zoom <= 15 THEN 0.001    -- ~110m cells (block)
    ELSE 0.0001                   -- ~11m cells (effectively raw)
  END;
$$;


--
-- Name: assign_direct_message_sequence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_direct_message_sequence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.chat_id::text));
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO NEW.sequence_number
    FROM direct_messages
    WHERE chat_id = NEW.chat_id;
    IF NEW.sequence_number IS NULL THEN
      NEW.sequence_number := 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: assign_message_sequence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_message_sequence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(COALESCE(NEW.group_id, NEW.table_id)::text));

  IF NEW.group_id IS NOT NULL THEN
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO NEW.sequence_number
    FROM messages
    WHERE group_id = NEW.group_id;
  ELSE
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO NEW.sequence_number
    FROM messages
    WHERE table_id = NEW.table_id;
  END IF;

  IF NEW.sequence_number IS NULL THEN
    NEW.sequence_number := 1;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: assign_seats_to_intent(uuid, uuid, integer, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_seats_to_intent(p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[] DEFAULT NULL::uuid[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_event_id uuid;
  v_candidates RECORD;
  v_chosen uuid[];
  v_run uuid[];
  v_best_run uuid[];
  v_prev_section uuid;
  v_prev_row text;
  v_prev_num integer;
  v_held integer;
  v_result json;
BEGIN
  SELECT event_id INTO v_event_id FROM purchase_intents WHERE id = p_intent_id;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'INTENT_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.event_id = v_event_id
      AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_seat_ids IS NOT NULL AND array_length(p_seat_ids, 1) > 0 THEN
    IF array_length(p_seat_ids, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEAT_COUNT_MISMATCH';
    END IF;

    WITH locked AS (
      SELECT s.id
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE s.id = ANY(p_seat_ids)
        AND s.event_id = v_event_id
        AND s.status = 'available'
        AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
        AND NOT EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.seat_id = s.id AND h.expires_at > now()
            AND h.session_id != p_intent_id::text
        )
      FOR UPDATE OF s SKIP LOCKED
    )
    SELECT array_agg(id) INTO v_chosen FROM locked;

    IF v_chosen IS NULL OR array_length(v_chosen, 1) != p_quantity THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    END IF;
  ELSE
    v_run := '{}';
    v_best_run := NULL;
    v_prev_section := NULL;
    v_prev_row := NULL;
    v_prev_num := NULL;
    v_chosen := '{}';

    FOR v_candidates IN
      SELECT s.id, s.section_id, s.row_label, s.seat_number
      FROM seats s
      JOIN event_sections sec ON sec.id = s.section_id
      WHERE s.event_id = v_event_id
        AND s.status = 'available'
        AND COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id) = p_tier_id
        AND NOT EXISTS (
          SELECT 1 FROM seat_holds h
          WHERE h.seat_id = s.id AND h.expires_at > now()
        )
      ORDER BY sec.sort_order, s.row_label, s.seat_number
      FOR UPDATE OF s SKIP LOCKED
    LOOP
      IF v_prev_section IS DISTINCT FROM v_candidates.section_id
         OR v_prev_row IS DISTINCT FROM v_candidates.row_label
         OR v_candidates.seat_number != v_prev_num + 1 THEN
        v_run := '{}';
      END IF;
      v_run := v_run || v_candidates.id;
      v_prev_section := v_candidates.section_id;
      v_prev_row := v_candidates.row_label;
      v_prev_num := v_candidates.seat_number;

      IF v_best_run IS NULL AND array_length(v_run, 1) >= p_quantity THEN
        v_best_run := v_run[(array_length(v_run,1) - p_quantity + 1) : array_length(v_run,1)];
      END IF;

      IF array_length(v_chosen, 1) IS NULL OR array_length(v_chosen, 1) < p_quantity THEN
        v_chosen := v_chosen || v_candidates.id;
      END IF;
    END LOOP;

    IF v_best_run IS NOT NULL THEN
      v_chosen := v_best_run;
    ELSIF v_chosen IS NULL OR array_length(v_chosen, 1) < p_quantity THEN
      RAISE EXCEPTION 'SEATS_UNAVAILABLE';
    ELSE
      v_chosen := v_chosen[1:p_quantity];
    END IF;
  END IF;

  INSERT INTO seat_holds (seat_id, session_id, user_id, expires_at)
  SELECT unnest(v_chosen), p_intent_id::text,
         (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
         now() + interval '10 minutes'
  ON CONFLICT (seat_id) DO NOTHING;

  SELECT count(*) INTO v_held FROM seat_holds
  WHERE session_id = p_intent_id::text AND seat_id = ANY(v_chosen);

  IF v_held != p_quantity THEN
    DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
    RAISE EXCEPTION 'SEATS_UNAVAILABLE';
  END IF;

  WITH ordered_tickets AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM tickets
    WHERE purchase_intent_id = p_intent_id AND status = 'reserved'
  ),
  ordered_seats AS (
    SELECT s.id AS seat_id,
           jsonb_build_object(
             'section', sec.label,
             'row', s.row_label,
             'seat', s.seat_number,
             'label', s.label
           ) AS info,
           row_number() OVER (ORDER BY sec.sort_order, s.row_label, s.seat_number) AS rn
    FROM seats s
    JOIN event_sections sec ON sec.id = s.section_id
    WHERE s.id = ANY(v_chosen)
  )
  UPDATE tickets t
  SET seat_id = os.seat_id, seat_info = os.info
  FROM ordered_tickets ot
  JOIN ordered_seats os ON os.rn = ot.rn
  WHERE t.id = ot.id;

  SELECT json_agg(jsonb_build_object(
    'seat_id', s.id,
    'section', sec.label,
    'row', s.row_label,
    'seat', s.seat_number,
    'label', s.label
  ) ORDER BY sec.sort_order, s.row_label, s.seat_number)
  INTO v_result
  FROM seats s
  JOIN event_sections sec ON sec.id = s.section_id
  WHERE s.id = ANY(v_chosen);

  RETURN v_result;
END;
$$;


--
-- Name: assign_trip_message_sequence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_trip_message_sequence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.sequence_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.chat_id::text));
    SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO NEW.sequence_number
    FROM trip_messages
    WHERE chat_id = NEW.chat_id;
    IF NEW.sequence_number IS NULL THEN
      NEW.sequence_number := 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: atomic_decrement_tickets_sold(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE events
    SET tickets_sold = GREATEST(0, tickets_sold - p_quantity)
    WHERE id = p_event_id;
END;
$$;


--
-- Name: FUNCTION atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer) IS 'Atomically decrements tickets_sold for an event, clamping at 0. Used by webhook handlers to avoid read-then-write race conditions.';


--
-- Name: auto_activate_current_trips(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_activate_current_trips() RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE public.user_trips
  SET status = 'active'
  WHERE status = 'upcoming'
    AND start_date <= CURRENT_DATE
    AND end_date >= CURRENT_DATE;
$$;


--
-- Name: auto_complete_past_trips(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_complete_past_trips() RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE public.user_trips
  SET status = 'completed'
  WHERE status IN ('upcoming', 'active')
    AND end_date < CURRENT_DATE;
$$;


--
-- Name: auto_follow_organizer_on_ticket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_follow_organizer_on_ticket() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_organizer_user_id UUID;
BEGIN
  -- Only run when a real user buys a ticket
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the user_id of the organizer linked to this event's partner
  SELECT p.user_id INTO v_organizer_user_id
  FROM events e
  JOIN partners p ON p.id = e.organizer_id
  WHERE e.id = NEW.event_id
    AND p.user_id IS NOT NULL;

  IF v_organizer_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't follow yourself
  IF v_organizer_user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Upsert follow (ignore if already following)
  INSERT INTO follows (follower_id, following_id, created_at)
  VALUES (NEW.user_id, v_organizer_user_id, NOW())
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: auto_match_trip(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_match_trip(p_trip_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_trip RECORD;
    v_bucket_id TEXT;
    v_chat_id UUID;
    v_month_start DATE;
    v_month_end DATE;
    v_match RECORD;
    v_match_count INT := 0;
BEGIN
    -- 1. Get the new trip details
    SELECT * INTO v_trip FROM user_trips WHERE id = p_trip_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trip not found');
    END IF;

    -- 2. Build bucket ID: CITY_COUNTRY_YYYY_MM
    v_bucket_id := UPPER(REGEXP_REPLACE(v_trip.destination_city, '[^A-Za-z]', '', 'g'))
        || '_' || UPPER(REGEXP_REPLACE(v_trip.destination_country, '[^A-Za-z]', '', 'g'))
        || '_' || TO_CHAR(v_trip.start_date, 'YYYY_MM');

    v_month_start := DATE_TRUNC('month', v_trip.start_date)::DATE;
    v_month_end := (DATE_TRUNC('month', v_trip.start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- 3. Find or create the bucket group chat
    SELECT id INTO v_chat_id
    FROM trip_group_chats
    WHERE ably_channel_id = v_bucket_id
    LIMIT 1;

    IF v_chat_id IS NULL THEN
        INSERT INTO trip_group_chats (destination_city, destination_country, start_date, end_date, ably_channel_id)
        VALUES (v_trip.destination_city, v_trip.destination_country, v_month_start, v_month_end, v_bucket_id)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_chat_id;

        -- Handle race condition
        IF v_chat_id IS NULL THEN
            SELECT id INTO v_chat_id FROM trip_group_chats WHERE ably_channel_id = v_bucket_id LIMIT 1;
        END IF;
    END IF;

    -- 4. Add the trip creator to the chat
    INSERT INTO trip_chat_participants (chat_id, user_id, last_read_at)
    VALUES (v_chat_id, v_trip.user_id, NOW())
    ON CONFLICT (chat_id, user_id) DO NOTHING;

    -- 5. Find all matching trips and auto-add those users + send notifications
    FOR v_match IN
        SELECT ut.user_id, u.display_name
        FROM user_trips ut
        JOIN users u ON ut.user_id = u.id
        WHERE ut.destination_city = v_trip.destination_city
          AND ut.destination_country = v_trip.destination_country
          AND ut.id != p_trip_id
          AND ut.user_id != v_trip.user_id
          AND ut.status IN ('upcoming', 'active')
          AND ut.start_date <= v_trip.end_date
          AND ut.end_date >= v_trip.start_date
          AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_user_id = v_trip.user_id AND b.blocked_user_id = ut.user_id)
                 OR (b.blocker_user_id = ut.user_id AND b.blocked_user_id = v_trip.user_id)
          )
    LOOP
        v_match_count := v_match_count + 1;

        -- Auto-add matched user to the chat
        INSERT INTO trip_chat_participants (chat_id, user_id, last_read_at)
        VALUES (v_chat_id, v_match.user_id, NOW())
        ON CONFLICT (chat_id, user_id) DO NOTHING;

        -- Notify the matched user: "Someone is also heading to your destination!"
        INSERT INTO notifications (user_id, actor_id, type, entity_id, title, body, is_read, metadata)
        VALUES (
            v_match.user_id,
            v_trip.user_id,
            'trip_match',
            v_chat_id,
            'Trip Match! 🎉',
            (SELECT display_name FROM users WHERE id = v_trip.user_id)
                || ' is also heading to ' || v_trip.destination_city || '!',
            false,
            jsonb_build_object(
                'trip_id', p_trip_id,
                'chat_id', v_chat_id,
                'channel_id', v_bucket_id,
                'destination_city', v_trip.destination_city,
                'destination_country', v_trip.destination_country
            )
        );

        -- Also notify the trip creator about each match
        INSERT INTO notifications (user_id, actor_id, type, entity_id, title, body, is_read, metadata)
        VALUES (
            v_trip.user_id,
            v_match.user_id,
            'trip_match',
            v_chat_id,
            'Trip Match! 🎉',
            v_match.display_name || ' is also heading to ' || v_trip.destination_city || '!',
            false,
            jsonb_build_object(
                'trip_id', p_trip_id,
                'chat_id', v_chat_id,
                'channel_id', v_bucket_id,
                'destination_city', v_trip.destination_city,
                'destination_country', v_trip.destination_country
            )
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'chat_id', v_chat_id,
        'channel_id', v_bucket_id,
        'matches_found', v_match_count
    );
END;
$$;


--
-- Name: auto_post_event_to_feed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_post_event_to_feed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_organizer_user_id UUID;
  v_existing_post_id UUID;
BEGIN
  -- Condition 1: Event must be 'active'
  -- Condition 2: It must be a NEW event OR the status just changed to 'active'
  IF (NEW.status = 'active') AND (TG_OP = 'INSERT' OR OLD.status != 'active') THEN
    
    -- 1. Get the User ID of the partner/organizer
    SELECT user_id INTO v_organizer_user_id
    FROM partners
    WHERE id = NEW.organizer_id;

    -- 2. Check if a post already exists for this event (prevent duplicates)
    SELECT id INTO v_existing_post_id
    FROM posts
    WHERE event_id = NEW.id
    LIMIT 1;

    -- 3. If no post exists, create one!
    IF v_existing_post_id IS NULL AND v_organizer_user_id IS NOT NULL THEN
      INSERT INTO posts (
        user_id,
        content,
        event_id,
        created_at
      ) VALUES (
        v_organizer_user_id,
        '🎉 I just published a new event! Check it out below 👇',
        NEW.id,
        NOW()
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: auto_suspend_on_report_threshold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_suspend_on_report_threshold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    report_count INTEGER;
    target_user_id UUID;
    current_user_status TEXT;
BEGIN
    -- Only process user-type reports
    IF NEW.target_type != 'user' THEN
        RETURN NEW;
    END IF;

    target_user_id := NEW.target_id;

    -- Check current user status (skip if already suspended/banned)
    SELECT status::text INTO current_user_status
    FROM users
    WHERE id = target_user_id;

    IF current_user_status IN ('suspended', 'banned', 'deleted') THEN
        RETURN NEW;
    END IF;

    -- Count pending reports against this user
    SELECT COUNT(*) INTO report_count
    FROM reports
    WHERE target_id = target_user_id
      AND target_type = 'user'
      AND status = 'pending';

    -- If 3 or more pending reports, auto-suspend
    IF report_count >= 3 THEN
        -- Suspend the user
        UPDATE users
        SET status = 'suspended',
            status_reason = 'Auto-suspended: ' || report_count || ' pending reports received',
            status_changed_at = NOW(),
            updated_at = NOW()
        WHERE id = target_user_id;

        -- Mark all pending reports for this user as 'reviewed'
        UPDATE reports
        SET status = 'reviewed',
            updated_at = NOW()
        WHERE target_id = target_user_id
          AND target_type = 'user'
          AND status = 'pending';

        -- Log the auto-action in admin_actions (admin_id = NULL for system actions)
        INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason, metadata)
        VALUES (
            target_user_id, -- use target as placeholder since admin_id is NOT NULL
            'auto_suspend',
            target_user_id,
            'Auto-suspended after ' || report_count || ' pending reports',
            jsonb_build_object(
                'trigger', 'report_threshold',
                'report_count', report_count,
                'triggering_report_id', NEW.id
            )
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: award_xp(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.award_xp(p_user_id uuid, p_xp integer) RETURNS TABLE(new_total_xp integer, new_level integer, leveled_up boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_old_xp    INTEGER;
  v_old_level INTEGER;
  v_new_xp    INTEGER;
  v_new_level INTEGER;
BEGIN
  -- Upsert stats row if missing
  INSERT INTO user_gamification_stats (user_id, total_xp, level, updated_at)
  VALUES (p_user_id, 0, 1, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current values
  SELECT total_xp, level INTO v_old_xp, v_old_level
  FROM user_gamification_stats WHERE user_id = p_user_id;

  v_new_xp    := COALESCE(v_old_xp, 0) + p_xp;
  v_new_level := compute_level(v_new_xp);

  UPDATE user_gamification_stats
  SET total_xp = v_new_xp,
      level    = v_new_level,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT v_new_xp, v_new_level, v_new_level > COALESCE(v_old_level, 1);
END;
$$;


--
-- Name: book_seats_for_intent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_seats_for_intent(p_intent_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE seats
  SET status = 'booked'
  WHERE id IN (
    SELECT seat_id FROM tickets
    WHERE purchase_intent_id = p_intent_id AND seat_id IS NOT NULL
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
  RETURN v_count;
END;
$$;


--
-- Name: calculate_distance(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) RETURNS double precision
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  R CONSTANT integer := 6371000; -- Earth radius in meters
  dLat double precision;
  dLon double precision;
  a double precision;
  c double precision;
BEGIN
  dLat := radians(lat2 - lat1);
  dLon := radians(lon2 - lon1);
  a := sin(dLat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLon/2)^2;
  c := 2 * asin(sqrt(a));
  RETURN R * c;
END;
$$;


--
-- Name: check_in_ticket(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_in_ticket(p_ticket_id uuid, p_event_id uuid, p_scanner_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_ticket RECORD;
    v_attendee_name TEXT;
    v_tier_name TEXT;
    v_scanner_name TEXT;
BEGIN
    -- 1. Fetch Ticket & Validate Event
    SELECT 
        t.id, 
        t.event_id, 
        t.status, 
        t.checked_in_at,
        t.checked_in_by,
        u.display_name as guest_name,
        ti.name as tier_name
    INTO v_ticket
    FROM tickets t
    LEFT JOIN users u ON t.user_id = u.id  -- Assuming user_id links to public.users
    LEFT JOIN ticket_tiers ti ON t.tier_id = ti.id -- Assuming tier_id exists
    WHERE t.id = p_ticket_id;

    -- Handle Case: Ticket Not Found
    IF v_ticket.id IS NULL THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'TICKET_NOT_FOUND',
            'message', 'Ticket does not exist.'
        );
    END IF;

    -- Handle Case: Wrong Event
    IF v_ticket.event_id != p_event_id THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'WRONG_EVENT',
            'message', 'Ticket is for a different event.'
        );
    END IF;

    -- Handle Case: Already Checked In
    IF v_ticket.checked_in_at IS NOT NULL THEN
        -- Try to get scanner name
        SELECT display_name INTO v_scanner_name 
        FROM users WHERE id = v_ticket.checked_in_by;

        RETURN jsonb_build_object(
            'valid', false,
            'error', 'ALREADY_CHECKED_IN',
            'message', 'Ticket already used.',
            'checked_in_at', v_ticket.checked_in_at,
            'checked_in_by_name', COALESCE(v_scanner_name, 'Unknown Scanner'),
            'attendee_name', v_ticket.guest_name,
            'tier_name', v_ticket.tier_name
        );
    END IF;

    -- Handle Case: Ticket Invalid/Refunded/Cancelled
    IF v_ticket.status NOT IN ('valid', 'paid') THEN -- Adjust status check as needed
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'INVALID_STATUS',
            'message', 'Ticket status is ' || v_ticket.status,
            'status', v_ticket.status
        );
    END IF;

    -- 2. Execute Check-In
    UPDATE tickets 
    SET 
        checked_in_at = NOW(),
        checked_in_by = p_scanner_id,
        status = 'used' -- Update status to used
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object(
        'valid', true,
        'attendee_name', v_ticket.guest_name,
        'tier_name', v_ticket.tier_name,
        'message', 'Check-in successful'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'valid', false,
        'error', 'INTERNAL_ERROR',
        'message', SQLERRM
    );
END;
$$;


--
-- Name: check_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$;


--
-- Name: check_user_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_user_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- This would ideally be called on login, but needs to integrate with Supabase Auth
  -- For now, apps should check user status after successful auth
  RETURN NEW;
END;
$$;


--
-- Name: check_username_available(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_username_available(p_username text, p_exclude_user_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.users 
    WHERE LOWER(username) = LOWER(p_username)
    AND (p_exclude_user_id IS NULL OR id != p_exclude_user_id)
  );
END;
$$;


--
-- Name: cleanup_expired_seat_holds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_seat_holds() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM seat_holds WHERE expires_at < now();
END;
$$;


--
-- Name: cleanup_expired_story_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_story_views() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  DELETE FROM public.story_views sv
  WHERE sv.post_id IN (
    SELECT p.id FROM public.posts p
    WHERE p.is_story = true
    AND p.created_at < (NOW() - INTERVAL '24 hours')
  );
$$;


--
-- Name: compute_level(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_level(p_xp integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  thresholds INTEGER[] := ARRAY[0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500];
  i INTEGER;
BEGIN
  FOR i IN REVERSE array_length(thresholds, 1)..1 LOOP
    IF p_xp >= thresholds[i] THEN
      RETURN i;
    END IF;
  END LOOP;
  RETURN 1;
END;
$$;


--
-- Name: confirm_experience_booking(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_experience_booking(p_intent_id uuid, p_payment_method text, p_xendit_id text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_intent RECORD;
    v_host_id UUID;
    
    v_real_platform_revenue DECIMAL(10,2);
    v_host_payout DECIMAL(10,2);
BEGIN
    -- Fetch Intent
    SELECT * INTO v_intent FROM public.experience_purchase_intents WHERE id = p_intent_id;
    
    IF v_intent IS NULL OR v_intent.status = 'completed' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Intent not found or already completed');
    END IF;

    -- Update Intent
    UPDATE public.experience_purchase_intents
    SET status = 'completed',
        paid_at = NOW(),
        payment_method = p_payment_method
    WHERE id = p_intent_id;

    -- Add to Table Participants
    INSERT INTO public.table_participants (
        table_id,
        user_id,
        status
    ) VALUES (
        v_intent.table_id,
        v_intent.user_id,
        'confirmed'
    ) ON CONFLICT (table_id, user_id) DO NOTHING; 

    -- Fetch Host ID
    SELECT host_id INTO v_host_id FROM public.tables WHERE id = v_intent.table_id;

    -- Calculate Payout & Revenue based on stored logic
    -- Logic: 
    -- If passed to customer, Revenue = collected platform_fee. Payout = Subtotal.
    -- If absorbed by host, Revenue = Subtotal * %. Payout = Subtotal - Revenue.
    
    IF v_intent.fees_passed_to_customer THEN
        v_real_platform_revenue := v_intent.platform_fee; -- We collected it on top
        v_host_payout := v_intent.subtotal; -- Host gets full ticket price
    ELSE
        -- Host pays: Fee is inside the subtotal
        -- Recalculate fee amount using stored percentage
        v_real_platform_revenue := v_intent.subtotal * (COALESCE(v_intent.fee_percentage, 15.00) / 100.0);
        v_host_payout := v_intent.subtotal - v_real_platform_revenue;
    END IF;

    -- Create Transaction
    INSERT INTO public.experience_transactions (
        purchase_intent_id,
        table_id,
        host_id,
        user_id,
        gross_amount,
        platform_fee,
        host_payout,
        xendit_transaction_id,
        status,
        partner_id -- Ensure partner_id is filled (it was added in add_host_partner_link.sql)
    ) VALUES (
        v_intent.id,
        v_intent.table_id,
        v_host_id,
        v_intent.user_id,
        v_intent.subtotal,       -- Gross sales (ticket sales only, excluding customer-paid fees? Or Total?)
                                 -- Standard accounting: Gross Volume = What customer paid. 
                                 -- But 'gross_amount' usually means the Ticket Value.
                                 -- Let's stick to Ticket Sales Volume for 'gross_amount' for consistency with host expectations.
        v_real_platform_revenue, -- Our actual revenue
        v_host_payout,           -- What we send to host
        p_xendit_id,
        'completed',
        (SELECT partner_id FROM public.tables WHERE id = v_intent.table_id)
    );

    RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: create_trip_creator_participant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_trip_creator_participant() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO trip_participants (trip_id, user_id, role)
    VALUES (NEW.id, NEW.user_id, 'creator');
    RETURN NEW;
END;
$$;


--
-- Name: decrement_experience_guests(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_experience_guests(p_schedule_id uuid, p_quantity integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.experience_schedules
    SET current_guests = GREATEST(0, current_guests - p_quantity)
    WHERE id = p_schedule_id;
END;
$$;


--
-- Name: delete_dm_chat(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_dm_chat(p_chat_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_count INT;
BEGIN
  -- 1. Remove the calling user from the chat
  DELETE FROM direct_chat_participants
  WHERE chat_id = p_chat_id
    AND user_id = auth.uid();

  -- 2. Check if anyone else is still in this chat
  SELECT COUNT(*) INTO remaining_count
  FROM direct_chat_participants
  WHERE chat_id = p_chat_id;

  -- 3. If no participants remain, nuke the whole chat + messages
  IF remaining_count = 0 THEN
    DELETE FROM direct_chats WHERE id = p_chat_id;
  END IF;
END;
$$;


--
-- Name: delete_table_marker_image(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_table_marker_image() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Delete image if table is being deleted or status changed to completed/cancelled
    IF (TG_OP = 'DELETE' OR 
        (NEW.status IN ('completed', 'cancelled') AND OLD.status NOT IN ('completed', 'cancelled'))) THEN
        
        -- Extract filename from URL and delete from storage
        IF COALESCE(OLD.marker_image_url, NEW.marker_image_url) IS NOT NULL THEN
            -- Note: Actual file deletion needs to be done via Supabase client
            -- This trigger just marks for cleanup
            NULL; -- Placeholder for storage deletion logic
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: detect_message_gaps(uuid, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint) RETURNS TABLE(missing_sequence bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT seq
  FROM generate_series(p_start_seq, p_end_seq) seq
  WHERE NOT EXISTS (
    SELECT 1 FROM messages
    WHERE table_id = p_table_id
      AND sequence_number = seq
  );
END;
$$;


--
-- Name: FUNCTION detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint) IS 'Detects missing sequence numbers in a range, useful for sync gap detection';


--
-- Name: enforce_report_rate_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_report_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    reports_last_hour INTEGER;
    reports_last_day INTEGER;
BEGIN
    -- Count reports in the last hour
    SELECT COUNT(*) INTO reports_last_hour
    FROM public.reports
    WHERE reporter_id = NEW.reporter_id
    AND created_at > NOW() - INTERVAL '1 hour';

    -- Count reports in the last 24 hours
    SELECT COUNT(*) INTO reports_last_day
    FROM public.reports
    WHERE reporter_id = NEW.reporter_id
    AND created_at > NOW() - INTERVAL '24 hours';

    -- Enforce hourly limit (10 reports)
    IF reports_last_hour >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded. You can only submit 10 reports per hour. Please try again later.'
            USING HINT = 'Wait at least 1 hour before submitting more reports';
    END IF;

    -- Enforce daily limit (50 reports)
    IF reports_last_day >= 50 THEN
        RAISE EXCEPTION 'Daily report limit exceeded. You can only submit 50 reports per day.'
            USING HINT = 'Your report limit will reset in 24 hours';
    END IF;

    -- Allow the insert if limits are not exceeded
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION enforce_report_rate_limit(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_report_rate_limit() IS 'Prevents report spam by limiting submissions to 10/hour and 50/day per user';


--
-- Name: enqueue_new_event_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_new_event_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
    IF NEW.status = 'active'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
       AND NEW.organizer_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.email_automations a
           WHERE a.partner_id = NEW.organizer_id AND a.trigger_type = 'new_event' AND a.enabled = true
       ) THEN
        PERFORM pgmq.send('email_automation_events', jsonb_build_object(
            'trigger', 'new_event',
            'partner_id', NEW.organizer_id,
            'event_id', NEW.id
        ));
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: enqueue_welcome_automation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_welcome_automation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pgmq'
    AS $$
BEGIN
    IF NEW.is_active = true AND EXISTS (
        SELECT 1 FROM public.email_automations a
        WHERE a.partner_id = NEW.partner_id AND a.trigger_type = 'welcome' AND a.enabled = true
    ) THEN
        PERFORM pgmq.send('email_automation_events', jsonb_build_object(
            'trigger', 'welcome',
            'partner_id', NEW.partner_id,
            'email', lower(NEW.email),
            'full_name', NEW.full_name
        ));
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: events_search_vector_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.events_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.title), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.description), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.event_type::text), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.venue_name), '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: expire_stale_experience_intents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_stale_experience_intents() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_exp RECORD;
BEGIN
    FOR v_exp IN
        SELECT id, schedule_id, quantity
        FROM experience_purchase_intents
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < now()
    LOOP
        UPDATE experience_purchase_intents
           SET status = 'expired'
         WHERE id = v_exp.id;

        IF v_exp.schedule_id IS NOT NULL THEN
            PERFORM public.decrement_experience_guests(v_exp.schedule_id, v_exp.quantity);
        END IF;

        RAISE LOG 'Expired experience intent %, released % slot(s) from schedule %',
            v_exp.id, v_exp.quantity, v_exp.schedule_id;
    END LOOP;
END;
$$;


--
-- Name: expire_stale_purchase_intents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_stale_purchase_intents() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_expired RECORD;
BEGIN
    FOR v_expired IN
        SELECT id, event_id, quantity
        FROM purchase_intents
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < now()
    LOOP
        -- Mark as expired
        UPDATE purchase_intents
           SET status = 'expired'
         WHERE id = v_expired.id;

        -- Release reserved tickets back to available
        UPDATE tickets
           SET status = 'available',
               user_id = NULL,
               purchase_intent_id = NULL,
               updated_at = now()
         WHERE purchase_intent_id = v_expired.id
           AND status = 'reserved';

        -- Decrement tickets_sold on the event
        UPDATE events
           SET tickets_sold = GREATEST(0, tickets_sold - v_expired.quantity)
         WHERE id = v_expired.event_id;

        RAISE LOG 'Expired stale intent % for event %, released % tickets',
            v_expired.id, v_expired.event_id, v_expired.quantity;
    END LOOP;
END;
$$;


--
-- Name: finalize_email_batch(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_email_batch(p_campaign_id uuid, p_sent integer, p_failed integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_rec integer;
  v_sent integer;
  v_failed integer;
BEGIN
  UPDATE public.email_campaigns
  SET sent_count   = sent_count + p_sent,
      failed_count = failed_count + p_failed,
      updated_at   = now()
  WHERE id = p_campaign_id
  RETURNING recipient_count, sent_count, failed_count
  INTO v_rec, v_sent, v_failed;

  IF v_rec IS NULL THEN
    RETURN; -- campaign vanished; nothing to do
  END IF;

  IF (v_sent + v_failed) >= v_rec THEN
    UPDATE public.email_campaigns
    SET status = CASE
                   WHEN failed_count = 0 THEN 'sent'
                   WHEN sent_count > 0  THEN 'partial_failure'
                   ELSE 'failed'
                 END,
        sent_at = COALESCE(sent_at, now()),
        updated_at = now()
    WHERE id = p_campaign_id;
  END IF;
END;
$$;


--
-- Name: find_direct_chat(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_direct_chat(user_id_1 uuid, user_id_2 uuid) RETURNS TABLE(chat_id uuid)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT dcp1.chat_id
  FROM direct_chat_participants dcp1
  INNER JOIN direct_chat_participants dcp2 
    ON dcp1.chat_id = dcp2.chat_id
  WHERE dcp1.user_id = user_id_1 
    AND dcp2.user_id = user_id_2
  LIMIT 1;
END;
$$;


--
-- Name: generate_qr_code(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_qr_code(ticket_id uuid, event_id uuid, user_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Format: ticket_id:event_id:user_indicator:checksum
  -- If user_id is null, use 'GUEST'
  RETURN ticket_id::TEXT || ':' || event_id::TEXT || ':' || COALESCE(user_id::TEXT, 'GUEST');
END;
$$;


--
-- Name: generate_table_channel_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_table_channel_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.ably_channel_id IS NULL THEN
        NEW.ably_channel_id := 'table:' || NEW.id::text || ':chat';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_ticket_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ticket_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN 'TK-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
END;
$$;


--
-- Name: generate_travel_match_channel(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_travel_match_channel() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.ably_channel_id IS NULL THEN
        NEW.ably_channel_id := 'travel:' || NEW.id::text || ':chat';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_unique_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_username(base_name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  candidate TEXT;
  suffix INT := 0;
BEGIN
  -- Sanitize: lowercase, replace spaces with underscores, strip non-alphanumeric
  candidate := LOWER(REGEXP_REPLACE(TRIM(base_name), '[^a-zA-Z0-9]', '', 'g'));
  
  -- Ensure minimum length
  IF LENGTH(candidate) < 3 THEN
    candidate := candidate || 'user';
  END IF;
  
  -- Truncate to 16 chars to leave room for suffix
  candidate := LEFT(candidate, 16);
  
  -- Check for conflicts and append numbers if needed
  WHILE EXISTS (SELECT 1 FROM public.users WHERE LOWER(username) = candidate) LOOP
    suffix := suffix + 1;
    candidate := LEFT(REGEXP_REPLACE(LOWER(TRIM(base_name)), '[^a-zA-Z0-9]', '', 'g'), 16) || suffix::TEXT;
  END LOOP;
  
  RETURN candidate;
END;
$$;


--
-- Name: geo_checkin(uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.geo_checkin(p_table_id uuid, p_user_lat double precision, p_user_lng double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_table_location GEOGRAPHY(POINT, 4326);
  v_distance FLOAT;
  v_is_member BOOLEAN;
  v_already_checked_in BOOLEAN;
BEGIN
  -- 1. Check membership
  SELECT EXISTS(
    SELECT 1 FROM public.table_members
    WHERE table_id = p_table_id AND user_id = v_user_id
      AND status IN ('approved', 'joined', 'attended')
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this activity');
  END IF;

  -- 2. Check if already checked in
  SELECT EXISTS(
    SELECT 1 FROM public.activity_checkins
    WHERE table_id = p_table_id AND user_id = v_user_id
  ) INTO v_already_checked_in;

  IF v_already_checked_in THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already checked in', 'already', true);
  END IF;

  -- 3. Validate distance (100m for geo check-in)
  SELECT location INTO v_table_location FROM public.tables WHERE id = p_table_id;

  IF v_table_location IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Activity has no location');
  END IF;

  v_distance := ST_Distance(
    v_table_location,
    ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography
  );

  IF v_distance > 100 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Too far (%sm). Must be within 100m.', round(v_distance::numeric, 0)),
      'distance', round(v_distance::numeric, 0)
    );
  END IF;

  -- 4. Insert check-in record
  INSERT INTO public.activity_checkins (table_id, user_id, checkin_type, latitude, longitude)
  VALUES (p_table_id, v_user_id, 'geo', p_user_lat, p_user_lng);

  -- 5. Update arrival status
  UPDATE public.table_members
  SET arrival_status = 'checked_in'
  WHERE table_id = p_table_id AND user_id = v_user_id;

  -- 6. Increment gamification stats (upsert)
  INSERT INTO public.user_gamification_stats (user_id, total_checkins, updated_at)
  VALUES (v_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
  SET total_checkins = user_gamification_stats.total_checkins + 1,
      updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Checked in!', 'distance', round(v_distance::numeric, 0));
END;
$$;


--
-- Name: get_active_user_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_user_count() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT count(*) 
    FROM users 
    WHERE last_active_at > (now() - interval '10 minutes')
  );
END;
$$;


--
-- Name: get_active_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_users() RETURNS TABLE(id uuid, display_name text, avatar_url text, last_active_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id, 
    u.display_name, 
    (
      SELECT photo_url 
      FROM user_photos up 
      WHERE up.user_id = u.id AND up.is_primary = true 
      LIMIT 1
    ) as avatar_url,
    u.last_active_at
  FROM users u
  WHERE u.last_active_at > (now() - interval '10 minutes')
  ORDER BY u.last_active_at DESC;
END;
$$;


--
-- Name: get_active_users(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_users(page_size integer DEFAULT 20, page_number integer DEFAULT 0) RETURNS TABLE(id uuid, display_name text, avatar_url text, last_active_at timestamp with time zone, user_photos jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.display_name,
    u.avatar_url,
    u.last_active_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('photo_url', sub.photo_url))
        FROM (
          SELECT p.photo_url
          FROM user_photos p
          WHERE p.user_id = u.id
          ORDER BY p.is_primary DESC NULLS LAST, p.display_order
          LIMIT 1
        ) sub
      ),
      '[]'::jsonb
    ) as user_photos
  FROM users u
  WHERE 
    u.last_active_at > NOW() - INTERVAL '10 minutes'
    AND (u.status = 'active' OR u.status IS NULL)
  ORDER BY u.last_active_at DESC
  LIMIT page_size
  OFFSET (page_number * page_size);
END;
$$;


--
-- Name: get_active_users(integer, integer, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_users(page_size integer DEFAULT 20, page_number integer DEFAULT 0, user_lat double precision DEFAULT NULL::double precision, user_lng double precision DEFAULT NULL::double precision, radius_km double precision DEFAULT 5.0) RETURNS TABLE(id uuid, display_name text, avatar_url text, last_active_at timestamp with time zone, user_photos jsonb)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.display_name,
    u.avatar_url,
    u.last_active_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('photo_url', p.photo_url))
        FROM user_photos p
        WHERE p.user_id = u.id
        ORDER BY p.is_primary DESC, p.display_order
        LIMIT 1
      ),
      '[]'::jsonb
    ) as user_photos
  FROM users u
  WHERE 
    u.last_active_at > NOW() - INTERVAL '10 minutes'
    AND u.status = 'active'
    -- Add location filtering if coordinates provided
    AND (
      user_lat IS NULL 
      OR user_lng IS NULL
      OR (
        u.home_location_lat IS NOT NULL 
        AND u.home_location_lng IS NOT NULL
        AND (
          6371 * acos(
            cos(radians(user_lat)) * 
            cos(radians(u.home_location_lat)) * 
            cos(radians(u.home_location_lng) - radians(user_lng)) + 
            sin(radians(user_lat)) * 
            sin(radians(u.home_location_lat))
          )
        ) <= radius_km
      )
    )
  ORDER BY u.last_active_at DESC
  LIMIT page_size
  OFFSET (page_number * page_size);
END;
$$;


--
-- Name: get_active_users_in_viewport(double precision, double precision, double precision, double precision, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_users_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, page_size integer DEFAULT 20, page_number integer DEFAULT 0) RETURNS TABLE(id uuid, display_name text, avatar_url text, last_active_at timestamp with time zone, user_photos jsonb, current_lat double precision, current_lng double precision)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id, u.display_name, u.avatar_url, u.last_active_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('photo_url', sub.photo_url))
       FROM (
         SELECT p.photo_url FROM public.user_photos p
         WHERE p.user_id = u.id
         ORDER BY p.is_primary DESC NULLS LAST, p.display_order
         LIMIT 1
       ) sub),
      '[]'::jsonb
    ) AS user_photos,
    u.current_lat, u.current_lng
  FROM public.users u
  WHERE
    u.last_active_at > NOW() - INTERVAL '10 minutes'
    AND u.current_location IS NOT NULL
    AND ST_Intersects(
      u.current_location,
      ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    )
    AND (u.status = 'active' OR u.status IS NULL)
  ORDER BY u.last_active_at DESC
  LIMIT page_size
  OFFSET (page_number * page_size);
END;
$$;


--
-- Name: get_active_users_philippines(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_users_philippines(page_size integer DEFAULT 20, page_number integer DEFAULT 0) RETURNS TABLE(id uuid, display_name text, avatar_url text, last_active_at timestamp with time zone, user_photos jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Hard cap: never return more than 50 rows regardless of what the caller asks
  page_size := LEAST(page_size, 50);

  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.avatar_url,
    u.last_active_at,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('photo_url', sub.photo_url))
        FROM (
          SELECT p.photo_url
          FROM user_photos p
          WHERE p.user_id = u.id
          ORDER BY p.is_primary DESC NULLS LAST, p.display_order
          LIMIT 1
        ) sub
      ),
      '[]'::jsonb
    ) AS user_photos
  FROM users u
  WHERE
    u.last_active_at > NOW() - INTERVAL '10 minutes'
    AND (u.status = 'active' OR u.status IS NULL)
  ORDER BY u.last_active_at DESC
  LIMIT page_size
  OFFSET (page_number * page_size);
END;
$$;


--
-- Name: get_active_users_philippines_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_users_philippines_count() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT count(*) 
    FROM users 
    WHERE 
      last_active_at > (now() - interval '15 minutes')
      AND (status = 'active' OR status IS NULL)
  );
END;
$$;


--
-- Name: get_admin_accounting_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_accounting_stats() RETURNS TABLE(total_revenue numeric, platform_fees numeric, partner_payouts numeric, pending_payouts numeric, transaction_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Total Revenue (Gross Transaction Volume)
    COALESCE(SUM(t.gross_amount), 0) as total_revenue,
    
    -- Platform Fees (Platform Fee + Fixed Fee)
    -- Assuming fixed_fee is also platform revenue
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as platform_fees,
    
    -- Partner Payouts (Processed)
    COALESCE(SUM(t.organizer_payout), 0) as partner_payouts,
    
    -- Pending Payouts (from payouts table)
    (SELECT COALESCE(SUM(amount), 0) FROM payouts WHERE status IN ('pending_request', 'approved')) as pending_payouts,
    
    -- Transaction Count
    COUNT(t.id) as transaction_count
  FROM transactions t
  WHERE t.status = 'completed';
END;
$$;


--
-- Name: get_admin_partner_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_partner_stats() RETURNS TABLE(partner_id uuid, business_name text, total_gmv numeric, total_platform_fees numeric, total_payouts numeric, pending_balance numeric, last_payout_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as partner_id,
    p.business_name,
    
    -- Total GMV
    COALESCE(SUM(t.gross_amount), 0) as total_gmv,
    
    -- Total Platform Fees
    COALESCE(SUM(t.platform_fee + COALESCE(t.fixed_fee, 0)), 0) as total_platform_fees,
    
    -- Total Payouts (from payouts table)
    (
      SELECT COALESCE(SUM(amount), 0)
      FROM payouts pay
      WHERE pay.partner_id = p.id
      AND pay.status = 'completed'
    ) as total_payouts,
    
    -- Pending Balance
    (
      SELECT COALESCE(SUM(organizer_payout), 0)
      FROM transactions t2
      WHERE t2.partner_id = p.id
      AND t2.status = 'completed'
      AND t2.payout_id IS NULL
    ) as pending_balance,
    
    -- Last Payout Date
    (
      SELECT MAX(completed_at)
      FROM payouts pay
      WHERE pay.partner_id = p.id
      AND pay.status = 'completed'
    ) as last_payout_at

  FROM partners p
  LEFT JOIN transactions t ON p.id = t.partner_id AND t.status = 'completed'
  GROUP BY p.id, p.business_name
  ORDER BY total_gmv DESC;
END;
$$;


--
-- Name: get_blocked_user_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_blocked_user_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT blocked_user_id FROM blocks WHERE blocker_user_id = auth.uid()
  UNION
  SELECT blocker_user_id FROM blocks WHERE blocked_user_id = auth.uid();
$$;


--
-- Name: get_daily_sales_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_daily_sales_stats() RETURNS TABLE(date text, amount numeric, count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
    COALESCE(SUM(gross_amount), 0) as amount,
    COUNT(id) as count
  FROM transactions
  WHERE status = 'completed'
    AND created_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1
  ORDER BY 1 ASC;
END;
$$;


--
-- Name: get_due_event_automations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_due_event_automations() RETURNS TABLE(automation_id uuid, partner_id uuid, trigger_type text, subject text, html_content text, offset_minutes integer, event_id uuid, event_title text, event_start timestamp with time zone, event_end timestamp with time zone, business_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT a.id, a.partner_id, a.trigger_type, a.subject, a.html_content, a.offset_minutes,
           e.id, e.title, e.start_datetime, e.end_datetime, p.business_name
    FROM public.email_automations a
    JOIN public.events e
        ON e.organizer_id = a.partner_id AND e.status = 'active'
    JOIN public.partners p ON p.id = a.partner_id
    WHERE a.enabled = true
      AND a.trigger_type IN ('pre_event', 'post_event')
      AND a.subject IS NOT NULL AND a.html_content IS NOT NULL
      AND (
        (a.trigger_type = 'pre_event'
            AND (e.start_datetime - make_interval(mins => COALESCE(a.offset_minutes, 0))) <= now()
            AND (e.start_datetime - make_interval(mins => COALESCE(a.offset_minutes, 0))) > now() - interval '6 hours')
        OR
        (a.trigger_type = 'post_event'
            AND (e.end_datetime + make_interval(mins => COALESCE(a.offset_minutes, 0))) <= now()
            AND (e.end_datetime + make_interval(mins => COALESCE(a.offset_minutes, 0))) > now() - interval '6 hours')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.email_automation_runs r
        WHERE r.automation_id = a.id AND r.dedup_key = e.id::text
      );
$$;


--
-- Name: get_event_seat_map(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_event_seat_map(p_event_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM event_seat_maps m WHERE m.event_id = p_event_id
  ) THEN NULL ELSE json_build_object(
    'event_id', p_event_id,
    'canvas_width', (SELECT canvas_width FROM event_seat_maps WHERE event_id = p_event_id),
    'canvas_height', (SELECT canvas_height FROM event_seat_maps WHERE event_id = p_event_id),
    'background_shapes', (
      SELECT COALESCE(canvas_data->'backgroundShapes', '[]'::jsonb)
      FROM event_seat_maps WHERE event_id = p_event_id
    ),
    'tiers', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', t.id,
        'name', t.name,
        'price', t.price,
        'sort_order', t.sort_order
      ) ORDER BY t.sort_order), '[]'::json)
      FROM ticket_tiers t
      WHERE t.event_id = p_event_id AND t.is_active = true
    ),
    'sections', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', sec.id,
        'label', sec.label,
        'color', sec.color,
        'section_type', sec.section_type,
        'polygon_points', sec.polygon_points,
        'tier_id', sec.tier_id,
        'row_tier_overrides', sec.row_tier_overrides,
        'available_count', (
          SELECT count(*) FROM seats s
          WHERE s.section_id = sec.id
            AND s.status = 'available'
            AND NOT EXISTS (
              SELECT 1 FROM seat_holds h
              WHERE h.seat_id = s.id AND h.expires_at > now()
            )
        ),
        'seats', (
          SELECT COALESCE(json_agg(json_build_object(
            'id', s.id,
            'row', s.row_label,
            'seat', s.seat_number,
            'label', s.label,
            'x', s.x,
            'y', s.y,
            'tier_id', COALESCE(s.tier_id, NULLIF(sec.row_tier_overrides->>s.row_label, '')::uuid, sec.tier_id),
            'status', CASE
              WHEN s.status IN ('booked', 'disabled') THEN s.status
              WHEN EXISTS (
                SELECT 1 FROM seat_holds h
                WHERE h.seat_id = s.id AND h.expires_at > now()
              ) THEN 'held'
              ELSE 'available'
            END
          ) ORDER BY s.row_label, s.seat_number), '[]'::json)
          FROM seats s WHERE s.section_id = sec.id
        )
      ) ORDER BY sec.sort_order), '[]'::json)
      FROM event_sections sec
      WHERE sec.event_id = p_event_id AND sec.is_active = true
    )
  ) END;
$$;


--
-- Name: get_event_sold_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_event_sold_count(p_event_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM tickets
  WHERE event_id = p_event_id
    AND status != 'available';

  RETURN v_count;
END;
$$;


--
-- Name: FUNCTION get_event_sold_count(p_event_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_event_sold_count(p_event_id uuid) IS 'Returns actual sold ticket count for an event (bypasses RLS)';


--
-- Name: get_events_clusters_in_viewport(double precision, double precision, double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_events_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer DEFAULT 12) RETURNS TABLE(cluster_key text, centroid_lat double precision, centroid_lng double precision, event_count bigint, earliest_start_datetime timestamp with time zone, sample_event_id uuid, sample_event_title text, sample_cover_image_url text, sample_organizer_id uuid, sample_organizer_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_grid double precision := public._cluster_grid_size(zoom);
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      e.id, e.title, e.cover_image_url, e.start_datetime, e.organizer_id,
      e.latitude, e.longitude,
      ST_SnapToGrid(ST_MakePoint(e.longitude, e.latitude), v_grid) AS snapped
    FROM public.events e
    WHERE e.status = 'active'
      AND e.start_datetime > NOW()
      AND e.latitude IS NOT NULL AND e.longitude IS NOT NULL
      AND e.latitude BETWEEN min_lat AND max_lat
      AND e.longitude BETWEEN min_lng AND max_lng
  ),
  ranked AS (
    SELECT
      b.*,
      ROW_NUMBER() OVER (PARTITION BY b.snapped ORDER BY b.start_datetime ASC) AS rn,
      COUNT(*)    OVER (PARTITION BY b.snapped) AS cluster_count,
      MIN(b.start_datetime) OVER (PARTITION BY b.snapped) AS earliest_start,
      AVG(b.latitude)   OVER (PARTITION BY b.snapped) AS avg_lat,
      AVG(b.longitude)  OVER (PARTITION BY b.snapped) AS avg_lng
    FROM base b
  )
  SELECT
    ST_AsText(r.snapped) AS cluster_key,
    r.avg_lat::double precision,
    r.avg_lng::double precision,
    r.cluster_count::bigint,
    r.earliest_start,
    r.id, r.title, r.cover_image_url,
    r.organizer_id,
    p.business_name
  FROM ranked r
  LEFT JOIN public.partners p ON p.id = r.organizer_id
  WHERE r.rn = 1
  ORDER BY r.cluster_count DESC, r.earliest_start ASC
  LIMIT 300;
END;
$$;


--
-- Name: get_events_in_viewport(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_events_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) RETURNS TABLE(id uuid, title text, description text, venue_name text, venue_address text, latitude double precision, longitude double precision, start_datetime timestamp with time zone, end_datetime timestamp with time zone, cover_image_url text, ticket_price numeric, capacity integer, tickets_sold integer, category text, organizer_id uuid, organizer_name text, organizer_photo_url text, organizer_verified boolean, created_at timestamp with time zone, is_external boolean, external_ticket_url text, external_provider_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.title, e.description, e.venue_name,
    e.address AS venue_address, e.latitude, e.longitude,
    e.start_datetime, e.end_datetime, e.cover_image_url,
    e.ticket_price, e.capacity, e.tickets_sold,
    e.event_type::TEXT AS category, e.organizer_id,
    p.business_name AS organizer_name,
    p.profile_photo_url AS organizer_photo_url,
    p.verified AS organizer_verified,
    e.created_at, e.is_external, e.external_ticket_url, e.external_provider_name
  FROM events e
  LEFT JOIN partners p ON e.organizer_id = p.id
  WHERE (
    (e.location IS NOT NULL AND ST_Intersects(
      e.location,
      ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    ))
    OR
    (e.location IS NULL
      AND e.latitude  BETWEEN min_lat AND max_lat
      AND e.longitude BETWEEN min_lng AND max_lng)
  )
    AND e.status = 'active'
    AND e.start_datetime > NOW()
    AND COALESCE(e.is_subscriber_only, false) = false
  ORDER BY e.start_datetime ASC
  LIMIT 500;
END;
$$;


--
-- Name: get_following_feed(integer, timestamp with time zone, uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_following_feed(p_limit integer DEFAULT 21, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_posts JSONB;
BEGIN
  v_user_id := auth.uid();

  SELECT jsonb_agg(row_data)
  INTO v_posts
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'user_id', p.user_id,
      'content', p.content,
      'image_url', p.image_url,
      'image_urls', p.image_urls,
      'gif_url', p.gif_url,
      'video_url', p.video_url,
      'event_id', p.event_id,
      'post_type', p.post_type,
      'metadata', p.metadata,
      'created_at', p.created_at,
      'is_story', COALESCE(p.is_story, false),
      'external_place_name', p.external_place_name,
      'latitude', p.latitude,
      'longitude', p.longitude,
      'city', p.city,
      'vibe_tag', p.vibe_tag,
      'user_data', (
        SELECT jsonb_build_object(
          'id', u.id,
          'display_name', u.display_name,
          'avatar_url', COALESCE(
            u.avatar_url,
            (SELECT photo_url FROM public.user_photos up WHERE up.user_id = u.id AND up.is_primary = true LIMIT 1),
            (SELECT photo_url FROM public.user_photos up WHERE up.user_id = u.id ORDER BY up.uploaded_at DESC LIMIT 1)
          )
        )
        FROM public.users u
        WHERE u.id = p.user_id
      ),
      'likes_count', (SELECT COUNT(*) FROM public.post_likes pl WHERE pl.post_id = p.id),
      'comment_count', (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id),
      'user_has_liked', (
        CASE WHEN v_user_id IS NOT NULL THEN
          EXISTS(SELECT 1 FROM public.post_likes pl WHERE pl.post_id = p.id AND pl.user_id = v_user_id)
        ELSE false END
      ),
      'user_has_bookmarked', (
        CASE WHEN v_user_id IS NOT NULL THEN
          EXISTS(SELECT 1 FROM public.post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = v_user_id)
        ELSE false END
      ),
      'distance_meters', (
        CASE 
          WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
            public.calculate_distance(p.latitude, p.longitude, p_user_lat, p_user_lng)
          ELSE NULL 
        END
      )
    ) AS row_data
    FROM public.posts p
    WHERE 
      (
        p.user_id IN (SELECT following_id FROM public.follows WHERE follower_id = v_user_id) 
        OR 
        p.user_id = v_user_id
      )
      AND (p.visibility = 'public' OR p.user_id = v_user_id)
      AND (p.is_story IS NOT TRUE)
      AND (p_cursor IS NULL OR (p.created_at < p_cursor OR (p.created_at = p_cursor AND p.id < p_cursor_id)))
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_user_id = v_user_id AND b.blocked_user_id = p.user_id)
           OR (b.blocker_user_id = p.user_id AND b.blocked_user_id = v_user_id)
      )
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT p_limit
  ) sub;

  RETURN COALESCE(v_posts, '[]'::jsonb);
END;
$$;


--
-- Name: get_following_ids(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_following_ids(user_id uuid) RETURNS TABLE(following_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT f.following_id
  FROM follows f
  WHERE f.follower_id = user_id;
END;
$$;


--
-- Name: get_friends_at_table(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_friends_at_table(p_table_id uuid) RETURNS TABLE(id uuid, display_name text, photo_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT u.id, u.display_name,
    (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id AND up.is_primary = true LIMIT 1)
  FROM table_members tm
  JOIN follows f ON f.following_id = tm.user_id
  JOIN users u ON u.id = tm.user_id
  WHERE tm.table_id = p_table_id
    AND tm.status = 'joined'
    AND f.follower_id = auth.uid()
    AND tm.user_id != auth.uid()
    AND u.hide_activity_from_friends IS NOT TRUE
  ORDER BY u.display_name;
END;
$$;


--
-- Name: get_friends_going_to_event(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_friends_going_to_event(p_event_id uuid) RETURNS TABLE(id uuid, display_name text, photo_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT u.id, u.display_name,
    (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id AND up.is_primary = true LIMIT 1)
  FROM tickets t
  JOIN follows f ON f.following_id = t.user_id
  JOIN users u ON u.id = t.user_id
  WHERE t.event_id = p_event_id
    AND t.status = 'valid'
    AND f.follower_id = auth.uid()
    AND t.user_id != auth.uid()
    AND u.hide_activity_from_friends IS NOT TRUE
  ORDER BY u.display_name;
END;
$$;


--
-- Name: get_friends_in_experience(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_friends_in_experience(p_table_id uuid) RETURNS TABLE(id uuid, display_name text, photo_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT u.id, u.display_name,
    (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id AND up.is_primary = true LIMIT 1)
  FROM experience_purchase_intents epi
  JOIN follows f ON f.following_id = epi.user_id
  JOIN users u ON u.id = epi.user_id
  WHERE epi.table_id = p_table_id
    AND epi.status = 'completed'
    AND f.follower_id = auth.uid()
    AND epi.user_id != auth.uid()
    AND u.hide_activity_from_friends IS NOT TRUE
  ORDER BY u.display_name;
END;
$$;


--
-- Name: get_main_feed(integer, integer, double precision, double precision, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_main_feed(p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_h3_cells text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, content text, image_url text, image_urls text[], gif_url text, created_at timestamp with time zone, user_id uuid, post_type text, metadata jsonb, visibility text, city text, h3_cell text, latitude double precision, longitude double precision, user_data jsonb, like_count bigint, comment_count bigint, is_liked boolean, has_more boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_current_user_id UUID := auth.uid();
    v_following_ids UUID[];
    v_total_count INT;
BEGIN
    -- Cache following IDs
    SELECT COALESCE(array_agg(following_id), '{}') INTO v_following_ids
    FROM follows 
    WHERE follower_id = v_current_user_id;

    RETURN QUERY
    WITH filtered_posts AS (
        SELECT p.id
        FROM posts p
        WHERE 
            -- Location Filter
            (
                p_h3_cells IS NULL 
                OR p.h3_cell = ANY(p_h3_cells)
                OR p.h3_cell IS NULL
            )
            AND
            -- Visibility Filter
            (
                (v_current_user_id IS NOT NULL AND p.user_id = v_current_user_id)
                OR (p.visibility = 'public')
                OR (p.visibility = 'followers' AND p.user_id = ANY(v_following_ids))
            )
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT p_limit + 1  -- Fetch one extra to check if there are more
        OFFSET p_offset
    ),
    paginated_posts AS (
        SELECT fp.id, ROW_NUMBER() OVER () as rn
        FROM filtered_posts fp
    )
    SELECT 
        p.id,
        p.content,
        p.image_url,
        p.image_urls::TEXT[],
        p.gif_url,
        p.created_at,
        p.user_id,
        p.post_type,
        p.metadata,
        p.visibility,
        p.city,
        p.h3_cell,
        p.latitude,
        p.longitude,
        
        -- User Object
        jsonb_build_object(
            'id', u.id,
            'display_name', u.display_name,
            'avatar_url', COALESCE(
                 u.avatar_url,
                 (SELECT photo_url FROM user_photos up 
                  WHERE up.user_id = u.id 
                  ORDER BY is_primary DESC LIMIT 1)
            )
        ) as user_data,
        
        -- Aggregated Stats (NO SUBQUERIES!)
        COALESCE(COUNT(DISTINCT pl.user_id), 0)::BIGINT as like_count,
        COALESCE(COUNT(DISTINCT c.id), 0)::BIGINT as comment_count,
        
        -- Is Liked Check
        CASE 
            WHEN v_current_user_id IS NULL THEN FALSE
            ELSE EXISTS (
                SELECT 1 FROM post_likes pll
                WHERE pll.post_id = p.id AND pll.user_id = v_current_user_id
            )
        END as is_liked,
        
        -- Has More flag
        (pp.rn <= p_limit) as has_more
        
    FROM paginated_posts pp
    JOIN posts p ON pp.id = p.id
    JOIN users u ON p.user_id = u.id
    LEFT JOIN post_likes pl ON p.id = pl.post_id
    LEFT JOIN comments c ON p.id = c.post_id
    WHERE pp.rn <= p_limit  -- Only return requested limit
    GROUP BY p.id, u.id, u.display_name, u.avatar_url, pp.rn
    ORDER BY p.created_at DESC, p.id DESC;
END;
$$;


--
-- Name: FUNCTION get_main_feed(p_limit integer, p_offset integer, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_main_feed(p_limit integer, p_offset integer, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) IS 'Optimized feed query with LEFT JOINs instead of subqueries - eliminates N+1 problem';


--
-- Name: get_main_feed_cursor(integer, timestamp without time zone, uuid, double precision, double precision, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_main_feed_cursor(p_limit integer DEFAULT 20, p_cursor timestamp without time zone DEFAULT NULL::timestamp without time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision, p_h3_cells text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, content text, image_url text, image_urls text[], gif_url text, created_at timestamp with time zone, user_id uuid, post_type text, metadata jsonb, visibility text, city text, h3_cell text, latitude double precision, longitude double precision, user_data jsonb, like_count bigint, comment_count bigint, is_liked boolean, has_more boolean, next_cursor timestamp with time zone, next_cursor_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_following_ids UUID[];
BEGIN
  SELECT COALESCE(array_agg(following_id), '{}') INTO v_following_ids
  FROM public.follows
  WHERE follower_id = v_current_user_id;

  RETURN QUERY
  WITH filtered_posts AS (
    SELECT p.id, p.created_at
    FROM public.posts p
    WHERE
      (p_cursor IS NULL OR p.created_at < p_cursor OR (p.created_at = p_cursor AND p.id < p_cursor_id))
      AND (p_h3_cells IS NULL OR p.h3_cell = ANY(p_h3_cells) OR p.h3_cell IS NULL)
      AND (
        (v_current_user_id IS NOT NULL AND p.user_id = v_current_user_id)
        OR (p.visibility = 'public')
        OR (p.visibility = 'followers' AND p.user_id = ANY(v_following_ids))
      )
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT p_limit + 1
  ),
  paginated_posts AS (
    SELECT fp.id, fp.created_at, ROW_NUMBER() OVER () AS rn
    FROM filtered_posts fp
  )
  SELECT
    p.id, p.content, p.image_url, p.image_urls::TEXT[], p.gif_url, p.created_at, p.user_id,
    p.post_type, p.metadata, p.visibility, p.city, p.h3_cell, p.latitude, p.longitude,
    jsonb_build_object(
      'id', u.id,
      'display_name', u.display_name,
      'avatar_url', COALESCE(
        u.avatar_url,
        (SELECT photo_url FROM public.user_photos up
         WHERE up.user_id = u.id ORDER BY is_primary DESC LIMIT 1)
      )
    ) AS user_data,
    p.like_count::BIGINT,
    p.comment_count::BIGINT,
    CASE
      WHEN v_current_user_id IS NULL THEN FALSE
      ELSE EXISTS (
        SELECT 1 FROM public.post_likes pll
        WHERE pll.post_id = p.id AND pll.user_id = v_current_user_id
      )
    END AS is_liked,
    (pp.rn > p_limit) AS has_more,
    p.created_at AS next_cursor,
    p.id AS next_cursor_id
  FROM paginated_posts pp
  JOIN public.posts p ON pp.id = p.id
  JOIN public.users u ON p.user_id = u.id
  WHERE pp.rn <= p_limit
  ORDER BY p.created_at DESC, p.id DESC;
END;
$$;


--
-- Name: FUNCTION get_main_feed_cursor(p_limit integer, p_cursor timestamp without time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_main_feed_cursor(p_limit integer, p_cursor timestamp without time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) IS 'Cursor-based pagination feed - constant performance, no duplicates with real-time updates';


--
-- Name: get_nearby_tables(double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_nearby_tables(lat double precision, lng double precision, radius_meters double precision DEFAULT 5000) RETURNS TABLE(id uuid, title text, latitude double precision, longitude double precision, distance_meters double precision, datetime timestamp with time zone, current_capacity integer, max_guests integer, status text, ticket_price numeric, is_user_joined boolean, is_user_ticket_holder boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    COALESCE(t.title, t.location_name, 'Event') as title,
    t.latitude,
    t.longitude,
    st_distance(
      t.location,
      st_point(lng, lat)::geography
    ) as distance_meters,
    t.datetime,
    COALESCE(t.current_capacity, 0) as current_capacity,
    COALESCE(t.max_guests, 4) as max_guests,
    t.status,
    COALESCE(t.price_per_person, 0)::numeric as ticket_price,
    -- FIX Bug 2: Use table_members instead of table_participants
    EXISTS (
      SELECT 1 FROM table_members tm 
      WHERE tm.table_id = t.id 
        AND tm.user_id = auth.uid() 
        AND tm.status IN ('approved', 'joined', 'attended')
    ) as is_user_joined,
    EXISTS (
      SELECT 1 FROM tickets tk 
      WHERE tk.event_id = t.id 
        AND tk.user_id = auth.uid() 
        AND tk.status = 'valid'
    ) as is_user_ticket_holder
  FROM
    tables t
  WHERE
    t.status = 'open'
    AND st_dwithin(
      t.location,
      st_point(lng, lat)::geography,
      radius_meters
    )
    AND (
      COALESCE(t.current_capacity, 0) < COALESCE(t.max_guests, 4)
      OR
      EXISTS (
        SELECT 1 FROM table_members tm 
        WHERE tm.table_id = t.id 
          AND tm.user_id = auth.uid() 
          AND tm.status IN ('approved', 'joined', 'attended')
      )
      OR
      EXISTS (
        SELECT 1 FROM tickets tk 
        WHERE tk.event_id = t.id 
          AND tk.user_id = auth.uid() 
          AND tk.status = 'valid'
      )
    )
    AND t.datetime > NOW()
  ORDER BY distance_meters ASC
  LIMIT 100;
END;
$$;


--
-- Name: get_or_create_dm_chat(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_dm_chat(target_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    existing_chat_id UUID;
    new_chat_id UUID;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();
    
    -- Check for existing chat with these participants
    -- We assume direct chats only have 2 participants
    SELECT c.id INTO existing_chat_id
    FROM direct_chats c
    JOIN direct_chat_participants p1 ON c.id = p1.chat_id AND p1.user_id = current_user_id
    JOIN direct_chat_participants p2 ON c.id = p2.chat_id AND p2.user_id = target_user_id
    LIMIT 1;

    IF existing_chat_id IS NOT NULL THEN
        RETURN existing_chat_id;
    END IF;

    -- Create new chat
    INSERT INTO direct_chats DEFAULT VALUES RETURNING id INTO new_chat_id;

    -- Add participants
    INSERT INTO direct_chat_participants (chat_id, user_id)
    VALUES 
        (new_chat_id, current_user_id),
        (new_chat_id, target_user_id);

    RETURN new_chat_id;
END;
$$;


--
-- Name: get_organizer_public_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_organizer_public_profile(p_user_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_partner RECORD;
  v_events  JSON;
  v_social  JSONB;
  v_tiers   JSON;
BEGIN
  SELECT
    id,
    business_name,
    description,
    profile_photo_url,
    verified,
    social_links,
    slug,
    show_membership_tab
  INTO v_partner
  FROM partners
  WHERE user_id = p_user_id
    AND status   = 'approved'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(
    json_build_object(
      'id',             e.id,
      'title',          e.title,
      'cover_image_url',e.cover_image_url,
      'start_datetime', e.start_datetime,
      'venue_name',     e.venue_name,
      'ticket_price',   e.ticket_price,
      'tickets_sold',   e.tickets_sold,
      'capacity',       e.capacity,
      'event_type',     e.event_type
    )
    ORDER BY e.start_datetime ASC
  )
  INTO v_events
  FROM events e
  WHERE e.organizer_id = v_partner.id
    AND e.status       = 'active'
    AND e.start_datetime > NOW();

  SELECT json_agg(
    json_build_object(
      'id',            st.id,
      'name',          st.name,
      'price_monthly', st.price_monthly,
      'perks',         st.perks,
      'image_url',     st.image_url
    )
    ORDER BY st.price_monthly ASC
  )
  INTO v_tiers
  FROM subscription_tiers st
  WHERE st.partner_id = v_partner.id
    AND st.is_active   = true;

  v_social := COALESCE(v_partner.social_links, '{}'::jsonb);

  RETURN json_build_object(
    'partner_id',          v_partner.id,
    'business_name',       v_partner.business_name,
    'description',         v_partner.description,
    'profile_photo_url',   v_partner.profile_photo_url,
    'verified',            COALESCE(v_partner.verified, false),
    'slug',                v_partner.slug,
    'show_membership_tab', COALESCE(v_partner.show_membership_tab, false),
    'instagram',           v_social->>'instagram',
    'facebook',            v_social->>'facebook',
    'website',             v_social->>'website',
    'tiktok',              v_social->>'tiktok',
    'twitter',             v_social->>'twitter',
    'events',              COALESCE(v_events, '[]'::json),
    'tiers',               COALESCE(v_tiers, '[]'::json)
  );
END;
$$;


--
-- Name: FUNCTION get_organizer_public_profile(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_organizer_public_profile(p_user_id uuid) IS 'Returns approved partner public profile + active upcoming events for a given user_id. Returns NULL if the user is not an approved organizer.';


--
-- Name: get_partner_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_partner_role(p_partner_id uuid) RETURNS public.partner_role
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  user_role partner_role;
BEGIN
  -- Check if direct owner (legacy)
  IF EXISTS (
    SELECT 1 FROM partners 
    WHERE id = p_partner_id AND user_id = auth.uid()
  ) THEN
    RETURN 'owner'::partner_role;
  END IF;
  
  -- Check team membership
  SELECT role INTO user_role
  FROM partner_team_members
  WHERE partner_id = p_partner_id
  AND user_id = auth.uid()
  LIMIT 1;
  
  RETURN user_role;
END;
$$;


--
-- Name: get_philippines_feed(integer, timestamp with time zone, uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_philippines_feed(p_limit integer DEFAULT 21, p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_user_lat double precision DEFAULT NULL::double precision, p_user_lng double precision DEFAULT NULL::double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_posts JSONB;
BEGIN
  v_user_id := auth.uid();

  SELECT jsonb_agg(row_data)
  INTO v_posts
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'user_id', p.user_id,
      'content', p.content,
      'image_url', p.image_url,
      'image_urls', p.image_urls,
      'gif_url', p.gif_url,
      'video_url', p.video_url,
      'event_id', p.event_id,
      'post_type', p.post_type,
      'metadata', p.metadata,
      'created_at', p.created_at,
      'is_story', COALESCE(p.is_story, false),
      'external_place_name', p.external_place_name,
      'latitude', p.latitude,
      'longitude', p.longitude,
      'city', p.city,
      'vibe_tag', p.vibe_tag,
      'user_data', (
        SELECT jsonb_build_object(
          'id', u.id,
          'display_name', u.display_name,
          'avatar_url', COALESCE(
            u.avatar_url,
            (SELECT photo_url FROM public.user_photos up WHERE up.user_id = u.id AND up.is_primary = true LIMIT 1),
            (SELECT photo_url FROM public.user_photos up WHERE up.user_id = u.id ORDER BY up.uploaded_at DESC LIMIT 1)
          )
        )
        FROM public.users u
        WHERE u.id = p.user_id
      ),
      'likes_count', (SELECT COUNT(*) FROM public.post_likes pl WHERE pl.post_id = p.id),
      'comment_count', (SELECT COUNT(*) FROM public.comments c WHERE c.post_id = p.id),
      'user_has_liked', (
        CASE WHEN v_user_id IS NOT NULL THEN
          EXISTS(SELECT 1 FROM public.post_likes pl WHERE pl.post_id = p.id AND pl.user_id = v_user_id)
        ELSE false END
      ),
      'user_has_bookmarked', (
        CASE WHEN v_user_id IS NOT NULL THEN
          EXISTS(SELECT 1 FROM public.post_bookmarks pb WHERE pb.post_id = p.id AND pb.user_id = v_user_id)
        ELSE false END
      ),
      'distance_meters', (
        CASE 
          WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL AND p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
            public.calculate_distance(p.latitude, p.longitude, p_user_lat, p_user_lng)
          ELSE NULL 
        END
      )
    ) AS row_data
    FROM public.posts p
    WHERE 
      (p.is_story IS NOT TRUE)
      AND (p.visibility = 'public' OR p.user_id = v_user_id)
      AND (p_cursor IS NULL OR (p.created_at < p_cursor OR (p.created_at = p_cursor AND p.id < p_cursor_id)))
      AND (v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_user_id = v_user_id AND b.blocked_user_id = p.user_id)
           OR (b.blocker_user_id = p.user_id AND b.blocked_user_id = v_user_id)
      ))
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT p_limit
  ) sub;

  RETURN COALESCE(v_posts, '[]'::jsonb);
END;
$$;


--
-- Name: get_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_secret(secret_name text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = secret_name LIMIT 1;
$$;


--
-- Name: get_stories_clusters_in_viewport(double precision, double precision, double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_stories_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer DEFAULT 12) RETURNS TABLE(cluster_key text, centroid_lat double precision, centroid_lng double precision, story_count bigint, latest_story_time timestamp with time zone, sample_post_id uuid, sample_image_url text, sample_video_url text, sample_author_id uuid, sample_author_name text, sample_author_avatar_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_grid double precision := public._cluster_grid_size(zoom);
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.id, p.user_id, p.image_url, p.video_url, p.created_at,
      p.latitude, p.longitude,
      ST_SnapToGrid(ST_MakePoint(p.longitude, p.latitude), v_grid) AS snapped
    FROM public.posts p
    WHERE p.is_story = true
      AND p.created_at > NOW() - INTERVAL '24 hours'
      AND p.latitude BETWEEN min_lat AND max_lat
      AND p.longitude BETWEEN min_lng AND max_lng
  ),
  ranked AS (
    SELECT
      b.*,
      ROW_NUMBER() OVER (PARTITION BY b.snapped ORDER BY b.created_at DESC) AS rn,
      COUNT(*)    OVER (PARTITION BY b.snapped) AS cluster_count,
      MAX(b.created_at) OVER (PARTITION BY b.snapped) AS latest_time,
      AVG(b.latitude)   OVER (PARTITION BY b.snapped) AS avg_lat,
      AVG(b.longitude)  OVER (PARTITION BY b.snapped) AS avg_lng
    FROM base b
  )
  SELECT
    ST_AsText(r.snapped) AS cluster_key,
    r.avg_lat::double precision,
    r.avg_lng::double precision,
    r.cluster_count::bigint,
    r.latest_time,
    r.id, r.image_url, r.video_url, r.user_id,
    u.display_name,
    COALESCE(
      u.avatar_url,
      (SELECT photo_url FROM public.user_photos up
       WHERE up.user_id = r.user_id ORDER BY is_primary DESC LIMIT 1)
    )
  FROM ranked r
  LEFT JOIN public.users u ON u.id = r.user_id
  WHERE r.rn = 1
  ORDER BY r.cluster_count DESC, r.latest_time DESC
  LIMIT 300;
END;
$$;


--
-- Name: get_stories_in_viewport(double precision, double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) RETURNS TABLE(event_id uuid, table_id uuid, external_place_id text, external_place_name text, latitude double precision, longitude double precision, story_count bigint, latest_story_time timestamp with time zone, id uuid, image_url text, author_id uuid, author_name text, author_avatar_url text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.event_id,
    s.table_id,
    s.external_place_id,
    s.external_place_name,
    s.latitude,
    s.longitude,
    s.story_count,
    s.latest_story_time,
    s.id,
    s.image_url,
    s.author_id,
    s.author_name,
    s.author_avatar_url
  FROM public.map_live_stories_view s
  WHERE (
    (s.location IS NOT NULL AND ST_Intersects(
      s.location,
      ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    ))
    OR
    (s.location IS NULL
      AND s.latitude BETWEEN min_lat AND max_lat
      AND s.longitude BETWEEN min_lng AND max_lng)
  )
  LIMIT 100;
END;
$$;


--
-- Name: FUNCTION get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) IS 'Fetches live stories using PostGIS spatial index with flat lat/lng fallback';


--
-- Name: get_story_tray(boolean, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_story_tray(p_following_only boolean DEFAULT false, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(author_id uuid, author_name text, author_avatar_url text, story_count bigint, latest_story_time timestamp with time zone, latest_image_url text, latest_video_url text, latest_event_id uuid, latest_table_id uuid, latest_external_place_id text, latest_external_place_name text, latest_latitude double precision, latest_longitude double precision, is_seen boolean, is_own boolean, closeness_score integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cutoff TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH story_authors AS (
    SELECT
      p.user_id AS author_id,
      COUNT(p.id) AS story_count,
      MAX(p.created_at) AS latest_story_time,
      (array_agg(p.image_url ORDER BY p.created_at DESC))[1] AS latest_image_url,
      (array_agg(p.video_url ORDER BY p.created_at DESC))[1] AS latest_video_url,
      (array_agg(p.event_id ORDER BY p.created_at DESC))[1] AS latest_event_id,
      (array_agg(p.table_id ORDER BY p.created_at DESC))[1] AS latest_table_id,
      (array_agg(p.external_place_id ORDER BY p.created_at DESC))[1] AS latest_external_place_id,
      (array_agg(p.external_place_name ORDER BY p.created_at DESC))[1] AS latest_external_place_name,
      (array_agg(p.latitude ORDER BY p.created_at DESC))[1] AS latest_latitude,
      (array_agg(p.longitude ORDER BY p.created_at DESC))[1] AS latest_longitude
    FROM public.posts p
    WHERE p.is_story = true
      AND p.created_at > v_cutoff
      AND (
        NOT p_following_only
        OR p.user_id = v_user_id
        OR p.user_id IN (SELECT f.following_id FROM public.follows f WHERE f.follower_id = v_user_id)
      )
    GROUP BY p.user_id
  ),
  -- Derive per-author "last viewed at" from the per-post story_views table
  author_seen AS (
    SELECT
      sp.user_id AS author_id,
      MAX(sv2.viewed_at) AS last_viewed_at
    FROM public.story_views sv2
    JOIN public.posts sp ON sv2.post_id = sp.id
    WHERE sv2.viewer_id = v_user_id
      AND sp.is_story = true
      AND sp.created_at > v_cutoff
    GROUP BY sp.user_id
  ),
  closeness AS (
    SELECT
      sa.author_id,
      (
        CASE WHEN EXISTS(
          SELECT 1 FROM public.follows f
          WHERE f.follower_id = sa.author_id AND f.following_id = v_user_id
        ) THEN 3 ELSE 0 END
        +
        LEAST(
          (SELECT COUNT(*) FROM public.direct_messages dm
           WHERE dm.created_at > NOW() - INTERVAL '7 days'
             AND dm.chat_id IN (
               SELECT p1.chat_id
               FROM public.direct_chat_participants p1
               JOIN public.direct_chat_participants p2 ON p1.chat_id = p2.chat_id
               WHERE p1.user_id = v_user_id AND p2.user_id = sa.author_id
             )
          ),
          4
        )
        +
        LEAST(
          (SELECT COUNT(*) FROM public.post_likes pl
           JOIN public.posts lp ON pl.post_id = lp.id
           WHERE pl.user_id = v_user_id AND lp.user_id = sa.author_id
             AND pl.created_at > NOW() - INTERVAL '7 days'
          ),
          3
        )
        +
        LEAST(
          (SELECT COUNT(*) FROM public.comments c
           JOIN public.posts cp ON c.post_id = cp.id
           WHERE c.user_id = v_user_id AND cp.user_id = sa.author_id
             AND c.created_at > NOW() - INTERVAL '7 days'
          ),
          3
        )
      )::INTEGER AS score
    FROM story_authors sa
    WHERE sa.author_id != v_user_id
  )
  SELECT
    sa.author_id,
    COALESCE(u.display_name, 'Friend')::TEXT AS author_name,
    COALESCE(
      u.avatar_url,
      (SELECT up.photo_url FROM public.user_photos up
       WHERE up.user_id = sa.author_id
       ORDER BY up.is_primary DESC, up.sort_order ASC
       LIMIT 1)
    )::TEXT AS author_avatar_url,
    sa.story_count,
    sa.latest_story_time,
    sa.latest_image_url::TEXT,
    sa.latest_video_url::TEXT,
    sa.latest_event_id,
    sa.latest_table_id,
    sa.latest_external_place_id::TEXT,
    sa.latest_external_place_name::TEXT,
    sa.latest_latitude,
    sa.latest_longitude,
    CASE
      WHEN sa.author_id = v_user_id THEN false
      WHEN asn.last_viewed_at IS NULL THEN false
      WHEN sa.latest_story_time > asn.last_viewed_at THEN false
      ELSE true
    END AS is_seen,
    (sa.author_id = v_user_id) AS is_own,
    COALESCE(cl.score, 0)::INTEGER AS closeness_score
  FROM story_authors sa
  LEFT JOIN public.users u ON sa.author_id = u.id
  LEFT JOIN author_seen asn ON asn.author_id = sa.author_id
  LEFT JOIN closeness cl ON cl.author_id = sa.author_id
  ORDER BY
    (sa.author_id = v_user_id) DESC,
    CASE
      WHEN sa.author_id = v_user_id THEN false
      WHEN asn.last_viewed_at IS NULL THEN false
      WHEN sa.latest_story_time > asn.last_viewed_at THEN false
      ELSE true
    END ASC,
    COALESCE(cl.score, 0) DESC,
    sa.latest_story_time DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


--
-- Name: FUNCTION get_story_tray(p_following_only boolean, p_limit integer, p_offset integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_story_tray(p_following_only boolean, p_limit integer, p_offset integer) IS 'Fetches story tray with closeness ranking, seen/unseen state, and pagination. Instagram-style sorting.';


--
-- Name: get_subscriber_event_discount(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_subscriber_event_discount(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_partner_id uuid;
    v_sub fan_subscriptions%ROWTYPE;
    v_discount event_subscription_discounts%ROWTYPE;
    v_base_price numeric;
    v_discounted_price numeric;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('has_discount', false);
    END IF;

    -- Get the event's organizer (partner_id)
    SELECT e.organizer_id, e.ticket_price
    INTO v_partner_id, v_base_price
    FROM events e
    WHERE e.id = p_event_id;

    IF v_partner_id IS NULL THEN
        RETURN jsonb_build_object('has_discount', false);
    END IF;

    -- Get the user's active subscription to this partner
    SELECT * INTO v_sub
    FROM fan_subscriptions
    WHERE fan_id = v_user_id
      AND partner_id = v_partner_id
      AND status IN ('active', 'grace_period')
      AND current_period_end > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_discount', false);
    END IF;

    -- Get the discount for their subscription tier on this event
    SELECT * INTO v_discount
    FROM event_subscription_discounts
    WHERE event_id = p_event_id
      AND subscription_tier_id = v_sub.tier_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('has_discount', false);
    END IF;

    -- Calculate discounted price
    IF v_discount.discount_type = 'fixed_price' THEN
        v_discounted_price := v_discount.discount_value;
    ELSE
        v_discounted_price := ROUND(v_base_price * (1 - v_discount.discount_value / 100), 2);
    END IF;

    RETURN jsonb_build_object(
        'has_discount',        true,
        'discount_type',       v_discount.discount_type,
        'discount_value',      v_discount.discount_value,
        'original_price',      v_base_price,
        'discounted_price',    v_discounted_price,
        'max_tickets',         v_discount.max_tickets,
        'subscription_tier_id', v_sub.tier_id
    );
END;
$$;


--
-- Name: get_ticket_counts_by_events(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ticket_counts_by_events(p_event_ids uuid[]) RETURNS TABLE(event_id uuid, sold_count bigint)
    LANGUAGE sql STABLE
    AS $$
    SELECT t.event_id, COUNT(*) as sold_count
    FROM tickets t
    WHERE t.event_id = ANY(p_event_ids)
      AND t.status NOT IN ('available', 'cancelled', 'refunded')
    GROUP BY t.event_id;
$$;


--
-- Name: get_ticket_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ticket_order(p_token uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT CASE WHEN pi.id IS NULL THEN NULL ELSE json_build_object(
    'order_id', pi.id,
    'buyer_name', COALESCE(pi.guest_name, u.display_name),
    'event', json_build_object(
      'id', e.id,
      'title', e.title,
      'venue_name', e.venue_name,
      'start_datetime', e.start_datetime,
      'cover_image_url', e.cover_image_url
    ),
    'organizer', json_build_object(
      'name', p.business_name,
      'logo_url', p.profile_photo_url,
      'branding', p.branding
    ),
    'tickets', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', t.id,
        'ticket_number', t.ticket_number,
        'qr_code', t.qr_code,
        'status', t.status,
        'tier', COALESCE(tt.name, t.tier),
        'tier_sort', tt.sort_order,
        'seat_info', t.seat_info
      ) ORDER BY t.created_at, t.id), '[]'::json)
      FROM tickets t
      LEFT JOIN ticket_tiers tt ON tt.id = t.tier_id
      WHERE t.purchase_intent_id = pi.id
        AND t.status::text IN ('valid','used','confirmed','approved')
    )
  ) END
  FROM purchase_intents pi
  JOIN events e ON e.id = pi.event_id
  LEFT JOIN partners p ON p.id = e.organizer_id
  LEFT JOIN users u ON u.id = pi.user_id
  WHERE pi.access_token = p_token;
$$;


--
-- Name: get_trip_matches(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_trip_matches(target_trip_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, match_score integer, start_date date, end_date date, ingredients text[], overlap_days integer)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    t_city TEXT;
    t_country TEXT;
    t_start DATE;
    t_end DATE;
    t_uid UUID;
BEGIN
    SELECT ut.destination_city, ut.destination_country, ut.start_date, ut.end_date, ut.user_id
    INTO t_city, t_country, t_start, t_end, t_uid
    FROM user_trips ut
    WHERE ut.id = target_trip_id;

    IF NOT FOUND THEN RETURN; END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.display_name,
        (
            SELECT up.photo_url
            FROM user_photos up
            WHERE up.user_id = u.id
            ORDER BY up.is_primary DESC, up.sort_order ASC
            LIMIT 1
        ) AS avatar_url,
        LEAST(
            50 + (LEAST(ut.end_date, t_end) - GREATEST(ut.start_date, t_start)) * 10,
            95
        )::INTEGER AS match_score,
        ut.start_date,
        ut.end_date,
        ut.interests,
        (LEAST(ut.end_date, t_end) - GREATEST(ut.start_date, t_start) + 1)::INTEGER AS overlap_days
    FROM user_trips ut
    JOIN users u ON ut.user_id = u.id
    WHERE ut.destination_city    = t_city
      AND ut.destination_country = t_country
      AND ut.id                 != target_trip_id
      AND ut.user_id            != t_uid
      AND ut.status IN ('upcoming', 'active')
      AND ut.start_date         <= t_end
      AND ut.end_date           >= t_start
      AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_user_id = t_uid AND b.blocked_user_id = ut.user_id)
             OR (b.blocker_user_id = ut.user_id AND b.blocked_user_id = t_uid)
      )
    ORDER BY overlap_days DESC
    LIMIT 50;
END;
$$;


--
-- Name: get_unique_checkin_locations(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unique_checkin_locations(p_user_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(COUNT(DISTINCT t.id), 0)::int
  FROM public.activity_checkins ac
  JOIN public.tables t ON t.id = ac.table_id
  WHERE ac.user_id = p_user_id;
$$;


--
-- Name: get_unique_people_met(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_unique_people_met(p_user_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(COUNT(DISTINCT ac2.user_id), 0)::int
  FROM public.activity_checkins ac1
  JOIN public.activity_checkins ac2
    ON ac1.table_id = ac2.table_id
   AND ac2.user_id != p_user_id
  WHERE ac1.user_id = p_user_id;
$$;


--
-- Name: get_user_tickets(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_tickets(user_id_param uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, ticket_number text, qr_code text, status public.ticket_status, event_id uuid, event_title text, event_venue text, event_start timestamp with time zone, event_end timestamp with time zone, event_cover_image text, checked_in_at timestamp with time zone, purchase_date timestamp with time zone, price_paid numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.ticket_number,
    t.qr_code,
    t.status,
    e.id AS event_id,
    e.title AS event_title,
    e.venue_name AS event_venue,
    e.start_datetime AS event_start,
    e.end_datetime AS event_end,
    e.cover_image_url AS event_cover_image,
    t.checked_in_at,
    t.created_at AS purchase_date,
    COALESCE(pi.unit_price, e.ticket_price) AS price_paid
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  LEFT JOIN purchase_intents pi ON t.purchase_intent_id = pi.id
  WHERE t.user_id = COALESCE(user_id_param, auth.uid())
  ORDER BY t.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


--
-- Name: handle_checkout_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_checkout_subscription() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: handle_join_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_join_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_table_title TEXT;
BEGIN
    -- Only notify when status changes from pending to approved
    IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
        SELECT title INTO v_table_title
        FROM public.tables WHERE id = NEW.table_id;

        INSERT INTO public.notifications (
            user_id, actor_id, type, title, body, entity_id, metadata
        ) VALUES (
            NEW.user_id,
            (SELECT host_id FROM public.tables WHERE id = NEW.table_id),
            'approved',
            'You''re in! 🎉',
            'Your request to join ' || COALESCE(v_table_title, 'the table') || ' has been approved!',
            NEW.table_id,
            jsonb_build_object('table_id', NEW.table_id)
        );

        -- Send push notification
        PERFORM net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
            ),
            body := jsonb_build_object(
                'user_id', NEW.user_id,
                'title', 'You''re in! 🎉',
                'body', 'Your request to join ' || COALESCE(v_table_title, 'the table') || ' has been approved!',
                'data', jsonb_build_object('type', 'approved', 'table_id', NEW.table_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_join_approval(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_join_approval() IS 'Notifies users when their join requests are approved by host';


--
-- Name: handle_join_decline(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_join_decline() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_table_title TEXT;
BEGIN
    IF OLD.status = 'pending' AND NEW.status = 'declined' THEN
        SELECT title INTO v_table_title
        FROM public.tables WHERE id = NEW.table_id;

        INSERT INTO public.notifications (
            user_id, actor_id, type, title, body, entity_id, metadata
        ) VALUES (
            NEW.user_id,
            (SELECT host_id FROM public.tables WHERE id = NEW.table_id),
            'system',
            'Request Declined',
            'Your request to join ' || COALESCE(v_table_title, 'the table') || ' was not accepted.',
            NEW.table_id,
            jsonb_build_object('table_id', NEW.table_id)
        );

        -- Send push notification
        PERFORM net.http_post(
            url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
            ),
            body := jsonb_build_object(
                'user_id', NEW.user_id,
                'title', 'Request Update',
                'body', 'Your request to join ' || COALESCE(v_table_title, 'the table') || ' was not accepted.',
                'data', jsonb_build_object('type', 'declined', 'table_id', NEW.table_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_join_decline(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_join_decline() IS 'Notifies users when their join requests are declined by host';


--
-- Name: handle_new_comment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_comment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_owner_userid uuid;
  v_commenter_name text;
BEGIN
  -- 1. Get the name of the person who commented
  SELECT display_name INTO v_commenter_name 
  FROM public.users 
  WHERE id = NEW.user_id;

  IF v_commenter_name IS NULL OR v_commenter_name = '' THEN
      v_commenter_name := 'Someone';
  END IF;

  -- 2. Determine who to notify based on if it's a reply or a top-level comment
  IF NEW.parent_id IS NOT NULL THEN
    -- It's a reply to another comment
    SELECT user_id INTO v_owner_userid 
    FROM public.comments 
    WHERE id = NEW.parent_id;

    IF FOUND AND v_owner_userid != NEW.user_id THEN
      INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id, metadata)
      VALUES (
        v_owner_userid,
        NEW.user_id,
        'comment',
        v_commenter_name || ' replied',
        v_commenter_name || ' replied to your comment',
        NEW.post_id,
        jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id)
      );
    END IF;

  ELSE
    -- It's a direct comment on a post
    SELECT user_id INTO v_owner_userid 
    FROM public.posts 
    WHERE id = NEW.post_id;

    IF FOUND AND v_owner_userid != NEW.user_id THEN
      INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id, metadata)
      VALUES (
        v_owner_userid,
        NEW.user_id,
        'comment',
        v_commenter_name || ' commented',
        v_commenter_name || ' commented on your post',
        NEW.post_id,
        jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_new_comment(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_new_comment() IS 'Automatically creates notifications for comments and replies';


--
-- Name: handle_new_like(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_like() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_post_owner uuid;
  v_liker_name text;
BEGIN
  -- 1. Get the owner of the post
  SELECT user_id INTO v_post_owner 
  FROM public.posts 
  WHERE id = NEW.post_id;

  -- 2. Get the name of the person who just liked it
  SELECT display_name INTO v_liker_name 
  FROM public.users 
  WHERE id = NEW.user_id;

  -- If no name found, fallback to "Someone"
  IF v_liker_name IS NULL OR v_liker_name = '' THEN
      v_liker_name := 'Someone';
  END IF;

  -- 3. Create the notification only if they didn't like their own post
  IF FOUND AND v_post_owner != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id, metadata)
    VALUES (
      v_post_owner,
      NEW.user_id,
      'like',
      v_liker_name || ' New Like',
      v_liker_name || ' liked your post', -- <--- Now dynamically says "John liked your post"
      NEW.post_id,
      jsonb_build_object('post_id', NEW.post_id)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_new_like(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_new_like() IS 'Automatically creates notifications when users like posts';


--
-- Name: handle_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_recipient_id UUID;
    v_sender_name TEXT;
    v_entity_id UUID;
    v_chat_sub_type TEXT;
    v_last_pushed_at TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT display_name INTO v_sender_name FROM public.users WHERE id = NEW.sender_id;
    IF v_sender_name IS NULL THEN
        v_sender_name := 'Someone';
    END IF;

    -- 1. DIRECT Messages (No Cooldown)
    IF TG_TABLE_NAME = 'direct_messages' THEN
        v_entity_id := NEW.chat_id;
        v_chat_sub_type := 'direct';

        FOR v_recipient_id IN
            SELECT user_id FROM public.direct_chat_participants
            WHERE chat_id = v_entity_id AND user_id != NEW.sender_id
        LOOP
            INSERT INTO public.notifications (
                user_id, actor_id, type, title, body, entity_id, metadata
            ) VALUES (
                v_recipient_id, NEW.sender_id, 'chat',
                v_sender_name,
                substring(NEW.content from 1 for 100),
                v_entity_id,
                jsonb_build_object('chat_type', v_chat_sub_type)
            );
        END LOOP;

    -- 2. TRIP Messages (30s Cooldown)
    ELSIF TG_TABLE_NAME = 'trip_messages' THEN
        v_entity_id := NEW.chat_id;
        v_chat_sub_type := 'trip';

        FOR v_recipient_id IN
            SELECT user_id FROM public.trip_chat_participants
            WHERE chat_id = v_entity_id AND user_id != NEW.sender_id
        LOOP
            SELECT created_at INTO v_last_pushed_at FROM public.notifications
            WHERE user_id = v_recipient_id AND entity_id = v_entity_id AND type = 'chat'
            ORDER BY created_at DESC LIMIT 1;

            IF v_last_pushed_at IS NULL OR (NOW() - v_last_pushed_at) > INTERVAL '30 seconds' THEN
                INSERT INTO public.notifications (
                    user_id, actor_id, type, title, body, entity_id, metadata
                ) VALUES (
                    v_recipient_id, NEW.sender_id, 'chat',
                    v_sender_name,
                    substring(NEW.content from 1 for 100),
                    v_entity_id,
                    jsonb_build_object('chat_type', v_chat_sub_type)
                );
            END IF;
        END LOOP;

    -- 3. TABLE or GROUP Messages (30s Cooldown)
    ELSIF TG_TABLE_NAME = 'messages' THEN
        -- Determine if this is a group or table message
        IF NEW.group_id IS NOT NULL THEN
            v_entity_id := NEW.group_id;
            v_chat_sub_type := 'group';

            FOR v_recipient_id IN
                SELECT user_id FROM public.group_members
                WHERE group_id = v_entity_id
                  AND status = 'approved'
                  AND user_id != NEW.sender_id
            LOOP
                SELECT created_at INTO v_last_pushed_at FROM public.notifications
                WHERE user_id = v_recipient_id AND entity_id = v_entity_id AND type = 'chat'
                ORDER BY created_at DESC LIMIT 1;

                IF v_last_pushed_at IS NULL OR (NOW() - v_last_pushed_at) > INTERVAL '30 seconds' THEN
                    INSERT INTO public.notifications (
                        user_id, actor_id, type, title, body, entity_id, metadata
                    ) VALUES (
                        v_recipient_id, NEW.sender_id, 'chat',
                        v_sender_name,
                        substring(NEW.content from 1 for 100),
                        v_entity_id,
                        jsonb_build_object('chat_type', v_chat_sub_type)
                    );
                END IF;
            END LOOP;
        ELSE
            v_entity_id := NEW.table_id;
            v_chat_sub_type := 'table';

            FOR v_recipient_id IN
                SELECT user_id FROM public.table_members
                WHERE table_id = v_entity_id
                  AND status IN ('approved', 'joined', 'attended')
                  AND user_id != NEW.sender_id
            LOOP
                SELECT created_at INTO v_last_pushed_at FROM public.notifications
                WHERE user_id = v_recipient_id AND entity_id = v_entity_id AND type = 'chat'
                ORDER BY created_at DESC LIMIT 1;

                IF v_last_pushed_at IS NULL OR (NOW() - v_last_pushed_at) > INTERVAL '30 seconds' THEN
                    INSERT INTO public.notifications (
                        user_id, actor_id, type, title, body, entity_id, metadata
                    ) VALUES (
                        v_recipient_id, NEW.sender_id, 'chat',
                        v_sender_name,
                        substring(NEW.content from 1 for 100),
                        v_entity_id,
                        jsonb_build_object('chat_type', v_chat_sub_type)
                    );
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: handle_new_payout(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_payout() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  -- TODO: Replace with your actual Anon Key or Service Role Key
  -- It is recommended to use Supabase Dashboard > Database > Webhooks for secure secret management
  service_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhaGhlenF0a3B2a2lhbG5kdWZ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMzOTY0MCwiZXhwIjoyMDc5OTE1NjQwfQ.NoVlj898H0ffUHIYJVYsTfHKNq1cjEyUKvTTnn4ThEE'; 
  func_url text := 'https://api.hanghut.com/functions/v1/send-payout-confirmation';
begin
  perform
    net.http_post(
      url := func_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', row_to_json(NEW)
      )
    );
  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  _display_name text;
begin
  -- Extract display name, fallback to email prefix
  _display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  insert into public.users (
    id,
    email,
    display_name,
    created_at,
    updated_at
    -- REMOVED: role, status (Rely on table defaults to avoid 'active' string vs Enum type errors)
  )
  values (
    new.id,
    new.email,
    _display_name,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    updated_at = now();

  return new;
end;
$$;


--
-- Name: handle_notifications_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_notifications_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Enqueue the push notification payload for batch processing
    PERFORM pgmq.send(
        'push_notifications',
        jsonb_build_object(
            'user_id', NEW.user_id,
            'title', NEW.title,
            'body', NEW.body,
            'data', jsonb_build_object(
                'type', NEW.type,
                'notification_id', NEW.id,
                'entity_id', NEW.entity_id
            )
        )
    );
    RETURN NEW;
END;
$$;


--
-- Name: handle_post_mentions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_post_mentions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  mentioned_id UUID;
  actor_name TEXT;
BEGIN
  -- Only process if there are mentioned users
  IF NEW.mentioned_user_ids IS NULL OR array_length(NEW.mentioned_user_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get actor display name
  SELECT display_name INTO actor_name FROM public.users WHERE id = NEW.user_id;

  -- Create a notification for each mentioned user
  FOREACH mentioned_id IN ARRAY NEW.mentioned_user_ids
  LOOP
    -- Don't notify yourself
    IF mentioned_id != NEW.user_id THEN
      INSERT INTO public.notifications (
        user_id,
        actor_id,
        type,
        title,
        body,
        entity_id,
        metadata
      ) VALUES (
        mentioned_id,
        NEW.user_id,
        'mention',
        'New Mention',
        COALESCE(actor_name, 'Someone') || ' mentioned you in a post',
        NEW.id,
        jsonb_build_object('post_id', NEW.id)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: handle_table_join(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_table_join() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_host_id UUID;
    v_table_title TEXT;
    v_joiner_name TEXT;
BEGIN
    -- Fire when a new member is inserted with pending status
    IF NEW.status = 'pending' THEN
        -- Get table host and title
        SELECT t.host_id, t.title INTO v_host_id, v_table_title
        FROM public.tables t
        WHERE t.id = NEW.table_id;

        -- Get joiner's name
        SELECT display_name INTO v_joiner_name
        FROM public.users
        WHERE id = NEW.user_id;

        -- Notify host if someone else wants to join
        IF v_host_id IS NOT NULL AND v_host_id != NEW.user_id THEN
            INSERT INTO public.notifications (
                user_id, actor_id, type, title, body, entity_id, metadata
            ) VALUES (
                v_host_id,
                NEW.user_id,
                'join_request',
                'New Join Request',
                COALESCE(v_joiner_name, 'Someone') || ' wants to join ' || COALESCE(v_table_title, 'your table'),
                NEW.table_id,
                jsonb_build_object('table_id', NEW.table_id, 'user_id', NEW.user_id)
            );

            -- Send push notification via Edge Function
            PERFORM net.http_post(
                url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/send-push',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
                ),
                body := jsonb_build_object(
                    'user_id', v_host_id,
                    'title', 'New Join Request 🙋',
                    'body', COALESCE(v_joiner_name, 'Someone') || ' wants to join ' || COALESCE(v_table_title, 'your table'),
                    'data', jsonb_build_object('type', 'join_request', 'table_id', NEW.table_id)
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_table_join(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_table_join() IS 'Notifies hosts when users request to join their tables (pending status)';


--
-- Name: has_partner_role(uuid, public.partner_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_partner_role(p_partner_id uuid, p_role public.partner_role) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partner_team_members
    WHERE partner_id = p_partner_id
    AND user_id = auth.uid()
    AND role = p_role
  );
END;
$$;


--
-- Name: hold_seat(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_held boolean;
BEGIN
  -- Clean expired holds first
  DELETE FROM seat_holds WHERE expires_at < now();

  -- Check seat is available
  IF NOT EXISTS (
    SELECT 1 FROM seats WHERE id = p_seat_id AND status = 'available'
  ) THEN
    RETURN false;
  END IF;

  -- Try to insert hold (UNIQUE constraint prevents doubles)
  INSERT INTO seat_holds (seat_id, session_id, user_id)
  VALUES (p_seat_id, p_session_id, p_user_id)
  ON CONFLICT (seat_id) DO NOTHING;

  -- Check if WE got the hold
  SELECT EXISTS (
    SELECT 1 FROM seat_holds
    WHERE seat_id = p_seat_id AND session_id = p_session_id
  ) INTO v_held;

  RETURN v_held;
END;
$$;


--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_unaccent(input text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
  SELECT public.unaccent('public.unaccent', input)
$$;


--
-- Name: is_active_subscriber(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_subscriber(p_partner_id uuid, p_min_tier_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_tier_id uuid;
    v_period_end timestamptz;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT tier_id, current_period_end
    INTO v_tier_id, v_period_end
    FROM fan_subscriptions
    WHERE fan_id = v_user_id
      AND partner_id = p_partner_id
      AND status IN ('active', 'grace_period')
      AND current_period_end > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- No minimum tier — any active sub passes
    IF p_min_tier_id IS NULL THEN
        RETURN true;
    END IF;

    -- Exact tier match
    IF v_tier_id = p_min_tier_id THEN
        RETURN true;
    END IF;

    -- Higher-priced tiers also unlock lower-tier content
    RETURN EXISTS (
        SELECT 1
        FROM subscription_tiers st_fan
        JOIN subscription_tiers st_req ON st_req.id = p_min_tier_id
        WHERE st_fan.id = v_tier_id
          AND st_fan.partner_id = p_partner_id
          AND st_fan.price_monthly >= st_req.price_monthly
    );
END;
$$;


--
-- Name: is_direct_chat_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_direct_chat_member(target_chat_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM direct_chat_participants
    WHERE chat_id = target_chat_id AND user_id = auth.uid()
  );
END;
$$;


--
-- Name: is_email_invited(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_email_invited(p_event_id uuid, p_email text) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT status
  FROM public.event_invites
  WHERE event_id = p_event_id
    AND lower(email) = lower(p_email)
  LIMIT 1;
$$;


--
-- Name: is_group_admin(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
      AND status = 'approved'
  );
$$;


--
-- Name: is_group_member(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND status = 'approved'
  );
$$;


--
-- Name: is_group_moderator(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_moderator(p_group_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin', 'moderator')
      AND status = 'approved'
  );
$$;


--
-- Name: is_partner_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_partner_member(p_partner_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partner_team_members
    WHERE partner_id = p_partner_id
    AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM partners
    WHERE id = p_partner_id
    AND user_id = auth.uid()
  );
END;
$$;


--
-- Name: is_partner_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_partner_owner(p_partner_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partner_team_members
    WHERE partner_id = p_partner_id
    AND user_id = auth.uid()
    AND role = 'owner'
  );
END;
$$;


--
-- Name: is_team_member_of_partner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_team_member_of_partner(p_partner_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partner_team_members
    WHERE partner_id = p_partner_id
    AND user_id = auth.uid()
  );
END;
$$;


--
-- Name: is_user_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_user_admin() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT admin_role
    FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$;


--
-- Name: issue_tickets(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_tickets(p_intent_id uuid, p_registration_id uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_tickets JSON;
BEGIN
  IF p_registration_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM tickets
    WHERE registration_id = p_registration_id
      AND status::text IN ('valid', 'used')
  ) THEN
    -- Already ticketed for this registration — release these reserved rows and
    -- issue nothing (caller treats empty result as "no new tickets, no email").
    UPDATE tickets
    SET status = 'available', purchase_intent_id = NULL, held_until = NULL, updated_at = NOW()
    WHERE purchase_intent_id = p_intent_id AND status = 'reserved';
    RETURN '[]'::json;
  END IF;

  UPDATE tickets
  SET
    status = 'valid',
    user_id = (SELECT user_id FROM purchase_intents WHERE id = p_intent_id),
    qr_code = generate_qr_code(id, event_id, (SELECT user_id FROM purchase_intents WHERE id = p_intent_id)),
    registration_id = COALESCE(p_registration_id, registration_id),
    created_at = NOW(),
    updated_at = NOW()
  WHERE purchase_intent_id = p_intent_id AND status = 'reserved';

  SELECT json_agg(json_build_object(
    'ticket_number', ticket_number,
    'qr_code', qr_code,
    'seat_info', seat_info
  ))
  INTO v_tickets
  FROM tickets
  WHERE purchase_intent_id = p_intent_id;

  RETURN v_tickets;
END;
$$;


--
-- Name: mark_chat_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_chat_read(p_chat_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE chat_inbox
  SET 
    unread_count = 0,
    has_unread = FALSE,
    last_read_at = NOW(),
    updated_at = NOW()
  WHERE chat_id = p_chat_id 
    AND user_id = auth.uid();
END;
$$;


--
-- Name: mark_stories_viewed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_stories_viewed(p_author_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- With per-post story_views, mark all unseen stories by this author as viewed
  INSERT INTO public.story_views (post_id, viewer_id, viewed_at)
  SELECT p.id, auth.uid(), NOW()
  FROM public.posts p
  WHERE p.user_id = p_author_id
    AND p.is_story = true
    AND p.created_at > NOW() - INTERVAL '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.story_views sv
      WHERE sv.post_id = p.id AND sv.viewer_id = auth.uid()
    )
  ON CONFLICT (post_id, viewer_id) DO UPDATE SET viewed_at = NOW();
END;
$$;


--
-- Name: FUNCTION mark_stories_viewed(p_author_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_stories_viewed(p_author_id uuid) IS 'Marks a users stories as viewed by the current user (upsert)';


--
-- Name: mint_event_tickets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mint_event_tickets() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INTEGER;
  i INTEGER;
BEGIN
  -- Skip minting entirely for external events (no internal ticketing)
  IF NEW.is_external = TRUE THEN
    RETURN NEW;
  END IF;

  -- If new event or capacity increased
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.capacity > OLD.capacity) THEN
    
    -- Calculate how many new tickets to mint
    IF TG_OP = 'INSERT' THEN
      v_count := NEW.capacity;
    ELSE
      v_count := NEW.capacity - OLD.capacity;
    END IF;

    -- Batch Insert (Loop is fine for <10k, otherwise use generate_series)
    INSERT INTO tickets (
      event_id, 
      ticket_number, 
      status, 
      tier
    )
    SELECT 
      NEW.id,
      'TK-' || UPPER(SUBSTRING(MD5(NEW.id::text || generate_series::text || RANDOM()::text) FROM 1 FOR 8)),
      'available',
      'general_admission'
    FROM generate_series(1, v_count);
    
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_followers_new_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_followers_new_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_organizer_name TEXT;
  v_service_key    TEXT;
  v_follower_ids   UUID[];
BEGIN
  -- Only when the event is (or just became) active.
  IF NOT (NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')) THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_service_key FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
  SELECT business_name INTO v_organizer_name FROM partners WHERE id = NEW.organizer_id;

  SELECT ARRAY_AGG(DISTINCT pf.user_id)
  INTO v_follower_ids
  FROM partner_followers pf
  JOIN users u ON u.id = pf.user_id
  WHERE pf.partner_id = NEW.organizer_id
    AND u.fcm_token IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tickets t
      JOIN events e ON e.id = t.event_id
      WHERE e.organizer_id = NEW.organizer_id
        AND t.user_id = pf.user_id
        AND t.status = 'valid'
    );

  IF v_follower_ids IS NOT NULL AND array_length(v_follower_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'user_ids', v_follower_ids,
        'title', v_organizer_name || ' has a new event! 🎟️',
        'body', NEW.title,
        'data', jsonb_build_object('type', 'new_event', 'event_id', NEW.id::text)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_followers_new_hangout(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_followers_new_hangout() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_host_name TEXT;
  v_service_key TEXT;
  v_follower_ids UUID[];
BEGIN
  IF NEW.status NOT IN ('active', 'open') THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_service_key FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
  SELECT display_name INTO v_host_name FROM users WHERE id = NEW.host_id;

  -- Collect all follower IDs with FCM tokens in one query
  SELECT ARRAY_AGG(f.follower_id)
  INTO v_follower_ids
  FROM follows f
  JOIN users u ON u.id = f.follower_id
  WHERE f.following_id = NEW.host_id
    AND u.fcm_token IS NOT NULL;

  -- Only make the HTTP call if there are followers to notify
  IF v_follower_ids IS NOT NULL AND array_length(v_follower_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'user_ids', v_follower_ids,
        'title', v_host_name || ' created a hangout 🍽️',
        'body', NEW.title,
        'data', jsonb_build_object(
          'type', 'new_hangout',
          'table_id', NEW.id::text
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_host_member_joined(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_host_member_joined() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_joiner_name TEXT;
  v_host_id UUID;
  v_table_title TEXT;
BEGIN
  IF NEW.status NOT IN ('joined', 'approved') THEN
    RETURN NEW;
  END IF;

  SELECT host_id, title INTO v_host_id, v_table_title FROM tables WHERE id = NEW.table_id;

  IF v_host_id IS NULL OR v_host_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_joiner_name FROM users WHERE id = NEW.user_id;

  -- Insert into notifications — handle_notifications_webhook will enqueue the push automatically
  INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id, metadata)
  VALUES (
    v_host_id,
    NEW.user_id,
    'member_joined',
    COALESCE(v_joiner_name, 'Someone') || ' joined your hangout 🙌',
    COALESCE(v_table_title, 'Your hangout'),
    NEW.table_id,
    jsonb_build_object('table_id', NEW.table_id::text)
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_host_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_host_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_fcm_token TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  -- Only trigger if status has changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get User's FCM Token
  SELECT fcm_token INTO v_user_fcm_token
  FROM public.users
  WHERE id = NEW.user_id;

  IF v_user_fcm_token IS NULL THEN
    RETURN NEW; -- No token to send to
  END IF;

  -- Prepare Notification Content
  IF NEW.status = 'approved' THEN
    v_title := 'Host Application Approved! 🎉';
    v_body := 'Congratulations! You can now create and host experiences on Hanghut.';
  ELSIF NEW.status = 'rejected' THEN
    v_title := 'Host Application Update';
    v_body := 'There was an update regarding your host application. Please check your email for details.';
  ELSE
    RETURN NEW; -- Ignore other status changes
  END IF;

  -- Send Notification via Edge Function
  PERFORM net.http_post(
    url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'type', 'host_status_update',
        'status', NEW.status
      )
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_internal_alert(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_internal_alert(p_type text, p_subject text, p_body_html text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_url    text := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-internal-alert';
  v_secret text := 'hh-alert-secret-2026';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'secret',    v_secret,
                 'type',      p_type,
                 'subject',   p_subject,
                 'body_html', p_body_html,
                 'metadata',  p_metadata
               ),
    headers := '{"Content-Type":"application/json"}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[notify_internal_alert] failed: %', SQLERRM;
END;
$$;


--
-- Name: notify_new_follower(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_follower() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_follower_name TEXT;
BEGIN
  SELECT display_name INTO v_follower_name FROM public.users WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id, metadata)
  VALUES (
    NEW.following_id,
    NEW.follower_id,
    'new_follower',
    COALESCE(v_follower_name, 'Someone') || ' followed you',
    COALESCE(v_follower_name, 'Someone') || ' is now following you',
    NEW.follower_id,
    jsonb_build_object('follower_id', NEW.follower_id::text)
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_new_subscriber_post(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_subscriber_post() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_partner_name text;
  v_recipient_id uuid;
BEGIN
  -- Only fire on first publish (published_at going from NULL → value)
  IF NOT (
    (TG_OP = 'INSERT' AND NEW.published_at IS NOT NULL) OR
    (TG_OP = 'UPDATE' AND OLD.published_at IS NULL AND NEW.published_at IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.business_name INTO v_partner_name FROM partners p WHERE p.id = NEW.partner_id;

  FOR v_recipient_id IN
    SELECT fan_id FROM fan_subscriptions
    WHERE tier_id       = NEW.tier_id
      AND partner_id    = NEW.partner_id
      AND status        IN ('active', 'grace_period')
      AND current_period_end > now()
  LOOP
    INSERT INTO notifications (user_id, actor_id, type, title, body, entity_id, metadata)
    VALUES (
      v_recipient_id, NULL,
      'new_subscriber_post',
      COALESCE(v_partner_name, 'New members post'),
      COALESCE(NEW.title, 'New exclusive content available'),
      NEW.id,
      jsonb_build_object('post_id', NEW.id, 'partner_id', NEW.partner_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: notify_organizer_on_registration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_organizer_on_registration() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_secret text;
BEGIN
  v_secret := current_setting('app.settings.organizer_notify_secret', true);

  -- pg_net executes AFTER the current transaction commits, so registration_answers
  -- will be fully committed and fetchable by the edge function.
  PERFORM net.http_post(
    url     := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/notify-organizer-on-registration',
    body    := jsonb_build_object(
                 'registration_id', NEW.id,
                 'event_id',        NEW.event_id
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', COALESCE(v_secret, '')
               )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the registration insert on email failure
  RETURN NEW;
END;
$$;


--
-- Name: notify_past_buyers_new_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_past_buyers_new_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_organizer_name TEXT;
  v_service_key TEXT;
  v_buyer_ids UUID[];
BEGIN
  -- Only when the event is (or just became) active.
  IF NOT (NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')) THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_service_key FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY';
  SELECT business_name INTO v_organizer_name FROM partners WHERE id = NEW.organizer_id;

  SELECT ARRAY_AGG(DISTINCT t.user_id)
  INTO v_buyer_ids
  FROM tickets t
  JOIN events e ON e.id = t.event_id
  JOIN users u ON u.id = t.user_id
  WHERE e.organizer_id = NEW.organizer_id
    AND t.user_id IS NOT NULL
    AND u.fcm_token IS NOT NULL
    AND t.status = 'valid';

  IF v_buyer_ids IS NOT NULL AND array_length(v_buyer_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'user_ids', v_buyer_ids,
        'title', v_organizer_name || ' has a new event! 🎟️',
        'body', NEW.title,
        'data', jsonb_build_object('type', 'new_event', 'event_id', NEW.id::text)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_purchase_confirmation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_purchase_confirmation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_event_title TEXT;
  v_buyer_id UUID;
BEGIN
  -- Only fire when status changes to completed
  IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
    
    SELECT title INTO v_event_title FROM events WHERE id = NEW.event_id;
    v_buyer_id := NEW.user_id;

    -- Send Push via Edge Function
    -- Uses the existing 'send-push' function
    PERFORM net.http_post(
      url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := jsonb_build_object(
        'user_id', v_buyer_id,
        'title', 'Ticket Confirmed! 🎟️',
        'body', 'You are going to ' || v_event_title || '! Tap to view tickets.',
        'data', jsonb_build_object(
          'type', 'ticket_purchase',
          'intent_id', NEW.id::TEXT,
          'event_id', NEW.event_id::TEXT
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_subscription_claim(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_subscription_claim() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_partner_name      text;
  v_organizer_user_id uuid;
  v_fan_name          text;
BEGIN
  SELECT p.business_name, p.user_id INTO v_partner_name, v_organizer_user_id
  FROM partners p WHERE p.id = NEW.partner_id;

  -- New claim submitted → notify organizer
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT display_name INTO v_fan_name FROM users WHERE id = NEW.fan_id;

    IF v_organizer_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, actor_id, type, title, body, entity_id, metadata)
      VALUES (
        v_organizer_user_id, NEW.fan_id,
        'new_claim_received',
        'New ' || NEW.perk_type || ' claim',
        COALESCE(v_fan_name, 'A subscriber') || ' claimed their ' || COALESCE(NEW.perk_label, 'perk'),
        NEW.id,
        jsonb_build_object('claim_id', NEW.id, 'partner_id', NEW.partner_id, 'perk_type', NEW.perk_type)
      );
    END IF;
  END IF;

  -- Claim fulfilled → notify fan
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'fulfilled' AND NEW.status = 'fulfilled' THEN
    INSERT INTO notifications (user_id, actor_id, type, title, body, entity_id, metadata)
    VALUES (
      NEW.fan_id, NULL,
      'claim_fulfilled',
      'Your ' || COALESCE(NEW.perk_label, 'perk') || ' is ready!',
      'Your claim from ' || COALESCE(v_partner_name, 'the organizer') || ' has been fulfilled.',
      NEW.id,
      jsonb_build_object('claim_id', NEW.id, 'partner_id', NEW.partner_id, 'perk_type', NEW.perk_type)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_subscription_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_subscription_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_partner_name text;
  v_tier_name    text;
BEGIN
  SELECT p.business_name INTO v_partner_name FROM partners p WHERE p.id = NEW.partner_id;
  SELECT st.name         INTO v_tier_name    FROM subscription_tiers st WHERE st.id = NEW.tier_id;

  -- Subscription became active (new or reactivated)
  IF (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') AND NEW.status = 'active' THEN
    INSERT INTO notifications (user_id, actor_id, type, title, body, entity_id, metadata)
    VALUES (
      NEW.fan_id, NULL,
      'subscription_confirmed',
      'Welcome to ' || COALESCE(v_partner_name, 'the membership') || '!',
      'You''re now a ' || COALESCE(v_tier_name, 'member') || '. Check your perks.',
      NEW.partner_id,
      jsonb_build_object('partner_id', NEW.partner_id, 'subscription_id', NEW.id)
    );
  END IF;

  -- Subscription expired
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'expired' AND NEW.status = 'expired' THEN
    INSERT INTO notifications (user_id, actor_id, type, title, body, entity_id, metadata)
    VALUES (
      NEW.fan_id, NULL,
      'subscription_expired',
      'Your membership has expired',
      'Your ' || COALESCE(v_partner_name, 'membership') || ' has expired. Renew to keep your perks.',
      NEW.partner_id,
      jsonb_build_object('partner_id', NEW.partner_id, 'subscription_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_table_join_simple(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_table_join_simple() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  host_id UUID;
  table_name TEXT;
  joiner_name TEXT;
  joiner_photo TEXT;
BEGIN
  -- Only send notification for approved joins
  IF NEW.status != 'approved' THEN
    RETURN NEW;
  END IF;

  -- Get table host and title
  SELECT t.host_id, COALESCE(t.title, t.venue_name, 'Event')
  INTO host_id, table_name
  FROM tables t
  WHERE t.id = NEW.table_id;

  -- Don't notify if the host is joining their own table
  IF host_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get the joiner's display name and photo
  SELECT u.display_name, up.photo_url 
  INTO joiner_name, joiner_photo
  FROM users u
  LEFT JOIN user_photos up ON up.user_id = u.id AND up.is_primary = true
  WHERE u.id = NEW.user_id;

  -- Simple call to send-push (like purchase notification)
  -- Let the Edge Function handle FCM token lookup and preferences
  PERFORM net.http_post(
    url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body := jsonb_build_object(
      'user_id', host_id,
      'title', joiner_name || ' joined your event! 🎉',
      'body', 'They just joined "' || table_name || '"',
      'image', joiner_photo,
      'data', jsonb_build_object(
        'type', 'table_join',
        'table_id', NEW.table_id::TEXT,
        'user_id', NEW.user_id::TEXT
      )
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_ticket_confirmed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_ticket_confirmed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_event_title TEXT;
BEGIN
  -- Only fire when status transitions to 'completed'
  IF OLD.status = NEW.status OR NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Guests get email confirmation — only notify authenticated users
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_event_title FROM public.events WHERE id = NEW.event_id;

  INSERT INTO public.notifications (user_id, type, title, body, entity_id, metadata)
  VALUES (
    NEW.user_id,
    'ticket_confirmed',
    'Ticket Confirmed! 🎟️',
    'Your ' || NEW.quantity || ' ticket(s) for ' || COALESCE(v_event_title, 'the event') || ' are confirmed.',
    NEW.event_id,
    jsonb_build_object(
      'event_id', NEW.event_id::text,
      'purchase_intent_id', NEW.id::text,
      'quantity', NEW.quantity
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: pgmq_archive(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_archive(queue_name text, msg_id bigint) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.archive(queue_name, msg_id);
$$;


--
-- Name: pgmq_delete(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_delete(queue_name text, msg_id bigint) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.delete(queue_name, msg_id);
$$;


--
-- Name: pgmq_read(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_read(queue_name text, sleep_seconds integer, batch_size integer) RETURNS SETOF pgmq.message_record
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT * FROM pgmq.read(queue_name, sleep_seconds, batch_size);
$$;


--
-- Name: pgmq_send(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pgmq_send(queue_name text, message jsonb) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT pgmq.send(queue_name, message);
$$;


--
-- Name: populate_ticket_guest_info(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_ticket_guest_info() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: protect_partner_status_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_partner_status_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Only admins can change protected fields
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true) THEN
    NEW.status := OLD.status;
    NEW.verified := OLD.verified;
    NEW.approved_by := OLD.approved_by;
    NEW.approved_at := OLD.approved_at;
    NEW.kyc_status := OLD.kyc_status;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: recompute_host_trust_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_host_trust_score() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_experience_id UUID;
  v_host_id UUID;
  v_avg_rating NUMERIC;
BEGIN
  -- Determine which experience was affected
  IF TG_OP = 'DELETE' THEN
    v_experience_id := OLD.experience_id;
  ELSE
    v_experience_id := NEW.experience_id;
  END IF;

  -- Find the host of this experience
  SELECT host_id INTO v_host_id
  FROM public.tables
  WHERE id = v_experience_id;

  IF v_host_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Calculate average rating across ALL experiences by this host
  SELECT AVG(er.rating)::NUMERIC(3,2) INTO v_avg_rating
  FROM public.experience_reviews er
  JOIN public.tables t ON er.experience_id = t.id
  WHERE t.host_id = v_host_id;

  -- Update the host's trust_score
  UPDATE public.users
  SET trust_score = COALESCE(v_avg_rating, 0)
  WHERE id = v_host_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: refresh_analytics_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_analytics_views() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY partner_performance_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY event_sales_summary;
END;
$$;


--
-- Name: release_expired_reservations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_expired_reservations() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_released_count INTEGER;
BEGIN
  -- Release Tickets held by expired intents
  WITH expired_intents AS (
    SELECT id FROM purchase_intents
    WHERE status = 'pending' AND expires_at < NOW()
  ),
  released_tickets AS (
    UPDATE tickets
    SET status = 'available',
        purchase_intent_id = NULL,
        held_until = NULL,
        user_id = NULL
    WHERE purchase_intent_id IN (SELECT id FROM expired_intents)
    RETURNING id
  )
  -- Mark intents as expired
  UPDATE purchase_intents
  SET status = 'expired', updated_at = NOW()
  WHERE id IN (SELECT id FROM expired_intents);

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count;
END;
$$;


--
-- Name: FUNCTION release_expired_reservations(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.release_expired_reservations() IS 'Should run every minute to release expired ticket reservations';


--
-- Name: release_seats_for_intent(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_seats_for_intent(p_intent_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM seat_holds WHERE session_id = p_intent_id::text;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Unstamp seats from tickets that never became valid
  UPDATE tickets
  SET seat_id = NULL, seat_info = NULL
  WHERE purchase_intent_id = p_intent_id
    AND seat_id IS NOT NULL
    AND status != 'valid';

  RETURN v_count;
END;
$$;


--
-- Name: reserve_experience(uuid, uuid, uuid, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_experience(p_table_id uuid, p_schedule_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_intent_id UUID;
    v_current_guests INTEGER;
    v_max_guests INTEGER;
    v_price DECIMAL(10,2);
    v_table_price DECIMAL(10,2);
    v_schedule_price DECIMAL(10,2);
    
    -- Partner Fee Settings
    v_partner_id UUID;
    v_custom_percentage DECIMAL(5,2);
    v_pass_fees BOOLEAN;
    
    -- Calculation Variables
    v_applied_percentage DECIMAL(5,2);
    v_fee_amount DECIMAL(10,2);
    v_subtotal DECIMAL(10,2);
    v_platform_fee_charged DECIMAL(10,2); -- What the user pays in Xendit
    v_total_amount DECIMAL(10,2);
BEGIN
    -- 1. Check Capacity (Lock row)
    IF p_schedule_id IS NOT NULL THEN
        SELECT current_guests, max_guests, price_per_person
        INTO v_current_guests, v_max_guests, v_schedule_price
        FROM public.experience_schedules
        WHERE id = p_schedule_id
        FOR UPDATE;
        
        IF v_current_guests + p_quantity > v_max_guests THEN
            RAISE EXCEPTION 'Schedule is full';
        END IF;
    END IF;

    -- 2. Get Table Price and Partner ID
    SELECT price_per_person, partner_id 
    INTO v_table_price, v_partner_id
    FROM public.tables WHERE id = p_table_id;
    
    v_price := COALESCE(v_schedule_price, v_table_price, 0);

    -- 3. Get Partner Fee Logic
    SELECT 
        COALESCE(custom_percentage, 15.00), -- Default to 15% if null
        COALESCE(pass_fees_to_customer, TRUE) -- Default to True (Customer pays)
    INTO v_custom_percentage, v_pass_fees
    FROM public.partners
    WHERE id = v_partner_id;
    
    -- 4. Calculate Fees
    v_applied_percentage := COALESCE(v_custom_percentage, 15.00);
    v_subtotal := v_price * p_quantity;
    
    -- Calculate the fee value based on subtotal
    v_fee_amount := v_subtotal * (v_applied_percentage / 100.0);
    
    IF v_pass_fees THEN
        -- Case A: Customer Pays (Add-on)
        v_platform_fee_charged := v_fee_amount;
        v_total_amount := v_subtotal + v_fee_amount;
    ELSE
        -- Case B: Host Pays (Absorbed)
        v_platform_fee_charged := 0; -- User sees 0 fee
        v_total_amount := v_subtotal; -- User pays just the price
    END IF;

    -- 5. Create Intent
    INSERT INTO public.experience_purchase_intents (
        user_id,
        table_id,
        schedule_id,
        quantity,
        unit_price,
        subtotal,
        platform_fee,
        total_amount,
        status,
        expires_at,
        xendit_external_id,
        guest_email,
        guest_name,
        guest_phone,
        
        -- Persist logic
        fee_percentage,
        fees_passed_to_customer
    ) VALUES (
        p_user_id,
        p_table_id,
        p_schedule_id,
        p_quantity,
        v_price,
        v_subtotal,
        v_platform_fee_charged, -- This goes to Xendit invoice
        v_total_amount,
        'pending',
        NOW() + INTERVAL '15 minutes',
        'exp_' || gen_random_uuid()::text,
        p_guest_email,
        p_guest_name,
        p_guest_phone,
        
        v_applied_percentage,
        v_pass_fees
    ) RETURNING id INTO v_intent_id;

    -- 6. Reserve Spot
    IF p_schedule_id IS NOT NULL THEN
        UPDATE public.experience_schedules
        SET current_guests = current_guests + p_quantity
        WHERE id = p_schedule_id;
    END IF;

    RETURN v_intent_id;
END;
$$;


--
-- Name: reserve_tickets(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_intent_id UUID;
  v_current_sold INTEGER;
  v_capacity INTEGER;
  v_ticket_price DECIMAL(10,2);
BEGIN
  SELECT tickets_sold, capacity, ticket_price
  INTO v_current_sold, v_capacity, v_ticket_price
  FROM events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_current_sold + p_quantity > v_capacity THEN
    RAISE EXCEPTION 'Event sold out or insufficient capacity';
  END IF;

  INSERT INTO purchase_intents (
    user_id, event_id, quantity, unit_price, subtotal,
    platform_fee, total_amount, status, expires_at, xendit_external_id
  ) VALUES (
    p_user_id, p_event_id, p_quantity, v_ticket_price,
    v_ticket_price * p_quantity,
    (v_ticket_price * p_quantity) * 0.10,
    (v_ticket_price * p_quantity) * 1.10,
    'pending',
    NOW() + INTERVAL '10 minutes',
    'intent_' || gen_random_uuid()::text
  ) RETURNING id INTO v_intent_id;

  UPDATE events
  SET tickets_sold = tickets_sold + p_quantity,
      updated_at = NOW()
  WHERE id = p_event_id;

  RETURN v_intent_id;
END;
$$;


--
-- Name: reserve_tickets(uuid, uuid, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_intent_id UUID;
  v_ticket_price DECIMAL(10,2);
  v_reserved_ids UUID[];
BEGIN
  SELECT ticket_price INTO v_ticket_price FROM events WHERE id = p_event_id;

  INSERT INTO purchase_intents (
    user_id, event_id, quantity, unit_price, subtotal,
    platform_fee, total_amount, status, expires_at,
    xendit_external_id, guest_email, guest_name, guest_phone
  ) VALUES (
    p_user_id, p_event_id, p_quantity, v_ticket_price,
    v_ticket_price * p_quantity,
    (v_ticket_price * p_quantity) * 0.10,
    (v_ticket_price * p_quantity) * 1.10,
    'pending',
    NOW() + INTERVAL '10 minutes',
    'intent_' || gen_random_uuid()::text,
    p_guest_email, p_guest_name, p_guest_phone
  ) RETURNING id INTO v_intent_id;

  WITH locked_tickets AS (
    SELECT id
    FROM tickets
    WHERE event_id = p_event_id AND status = 'available'
    LIMIT p_quantity
    FOR UPDATE SKIP LOCKED
  ),
  updated_rows AS (
    UPDATE tickets
    SET
      status = 'reserved',
      purchase_intent_id = v_intent_id,
      held_until = NOW() + INTERVAL '10 minutes',
      updated_at = NOW()
    WHERE id IN (SELECT id FROM locked_tickets)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_reserved_ids FROM updated_rows;

  IF v_reserved_ids IS NULL OR array_length(v_reserved_ids, 1) < p_quantity THEN
    RAISE EXCEPTION 'Not enough tickets available (Requested %, Got %)', p_quantity, COALESCE(array_length(v_reserved_ids, 1), 0);
  END IF;

  RETURN v_intent_id;
END;
$$;


--
-- Name: scan_ticket(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.scan_ticket(p_code text, p_user_id uuid, p_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_ticket record;
  v_organizer_id uuid;
  v_is_authorized boolean;
BEGIN
  -- 1. Find Ticket with strict join on Event
  SELECT
    t.id, t.status, t.checked_in_at, t.guest_name, t.event_id, t.seat_info,
    e.organizer_id, e.title as event_title,
    tt.name as tier_name,
    u.display_name as user_name,
    pi.guest_name as pi_guest_name
  INTO v_ticket
  FROM tickets t
  JOIN events e ON t.event_id = e.id
  LEFT JOIN ticket_tiers tt ON t.tier_id = tt.id
  LEFT JOIN users u ON t.user_id = u.id
  LEFT JOIN purchase_intents pi ON t.purchase_intent_id = pi.id
  WHERE (
    t.id::text = p_code OR
    t.qr_code = p_code OR
    t.ticket_number = UPPER(p_code)
  )
  LIMIT 1;

  -- 2. Validation: Existence
  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ticket not found');
  END IF;

  -- 3. Validation: Event Match
  IF p_event_id IS NOT NULL AND v_ticket.event_id != p_event_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Wrong Event',
      'details', 'Ticket is for ' || v_ticket.event_title,
      'ticket', jsonb_build_object('event_title', v_ticket.event_title)
    );
  END IF;

  -- 4. Authorization: User must be Owner or Team Member
  v_organizer_id := v_ticket.organizer_id;

  SELECT EXISTS (
    SELECT 1 FROM partners p WHERE p.id = v_organizer_id AND p.user_id = p_user_id
    UNION ALL
    SELECT 1 FROM partner_team_members ptm
    WHERE ptm.partner_id = v_organizer_id
    AND ptm.user_id = p_user_id
    AND ptm.is_active = true
  ) INTO v_is_authorized;

  IF NOT v_is_authorized THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized', 'details', 'You do not have permission to scan for this event');
  END IF;

  -- 5. Status Check
  IF v_ticket.status::text = 'used' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'ALREADY SCANNED',
      'details', 'Checked in at ' || to_char(v_ticket.checked_in_at AT TIME ZONE 'UTC', 'HH12:MI AM'),
      'ticket', jsonb_build_object(
        'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
        'tier_name', v_ticket.tier_name,
        'seat', v_ticket.seat_info
      )
    );
  ELSIF v_ticket.status::text IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Ticket Void',
      'details', 'Status: ' || v_ticket.status,
      'ticket', jsonb_build_object(
        'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
        'seat', v_ticket.seat_info
      )
    );
  END IF;

  -- 6. Update Ticket (Check-in)
  UPDATE tickets
  SET status = 'used',
      checked_in_at = now(),
      checked_in_by = p_user_id
  WHERE id = v_ticket.id;

  -- 7. Return Success
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Valid Ticket',
    'ticket', jsonb_build_object(
      'id', v_ticket.id,
      'guestName', COALESCE(v_ticket.guest_name, v_ticket.pi_guest_name, v_ticket.user_name, 'Guest'),
      'tier_name', v_ticket.tier_name,
      'event_title', v_ticket.event_title,
      'seat', v_ticket.seat_info,
      'checked_in_at', now()
    )
  );
END;
$$;


--
-- Name: search_all(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_all(p_query text, p_user_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid, p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_tsquery tsquery;
  v_raw text;
  v_hangouts jsonb;
  v_events jsonb;
  v_people jsonb;
BEGIN
  v_raw := trim(p_query);
  IF v_raw = '' THEN
    RETURN jsonb_build_object('hangouts','[]'::jsonb,'events','[]'::jsonb,'people','[]'::jsonb);
  END IF;

  BEGIN
    v_tsquery := to_tsquery('english',
      array_to_string(array(
        SELECT w || ':*' FROM unnest(string_to_array(
          regexp_replace(public.immutable_unaccent(lower(v_raw)), '[^\w\s]', '', 'g'), ' '
        )) AS w WHERE w <> ''
      ), ' & '));
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('english', v_raw);
  END;

  -- Hangouts
  SELECT coalesce(jsonb_agg(to_jsonb(h) - 'rank' ORDER BY h.rank DESC), '[]'::jsonb)
  INTO v_hangouts
  FROM (
    SELECT t.id, t.title, t.description, t.location_name, t.city,
      t.datetime, t.status, t.current_capacity, t.max_guests,
      t.image_url, t.cuisine_type, t.marker_emoji,
      t.experience_type, t.is_experience, t.price_per_person, t.currency, t.images,
      (
        CASE WHEN t.search_vector @@ v_tsquery THEN ts_rank_cd(t.search_vector, v_tsquery, 32) ELSE 0 END
        + similarity(coalesce(t.title,''), v_raw) * 0.5
        + similarity(coalesce(t.description,''), v_raw) * 0.2
        + CASE WHEN t.datetime > now() THEN 0.3 WHEN t.datetime > now() - interval '7 days' THEN 0.1 ELSE 0 END
      ) AS rank
    FROM public.tables t
    WHERE t.status IN ('open','full')
      AND t.datetime > now() - interval '7 days'
      AND (t.search_vector @@ v_tsquery
        OR similarity(coalesce(t.title,''), v_raw) > 0.15
        OR similarity(coalesce(t.description,''), v_raw) > 0.15
        OR t.title ILIKE '%' || v_raw || '%'
        OR t.description ILIKE '%' || v_raw || '%'
        OR t.location_name ILIKE '%' || v_raw || '%')
    ORDER BY rank DESC LIMIT p_limit
  ) h;

  -- Events
  SELECT coalesce(jsonb_agg(to_jsonb(e) - 'rank' ORDER BY e.rank DESC), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT ev.id, ev.title, ev.venue_name, ev.start_datetime, ev.status,
      ev.cover_image_url, ev.event_type::text AS event_type, ev.ticket_price,
      ev.capacity, ev.tickets_sold, ev.description,
      (
        CASE WHEN ev.search_vector @@ v_tsquery THEN ts_rank_cd(ev.search_vector, v_tsquery, 32) ELSE 0 END
        + similarity(coalesce(ev.title,''), v_raw) * 0.5
        + similarity(coalesce(ev.description,''), v_raw) * 0.2
        + CASE WHEN ev.start_datetime > now() THEN 0.3 WHEN ev.start_datetime > now() - interval '7 days' THEN 0.1 ELSE 0 END
      ) AS rank
    FROM public.events ev
    WHERE ev.status IN ('active','sold_out')
      AND ev.start_datetime > now() - interval '7 days'
      AND (ev.search_vector @@ v_tsquery
        OR similarity(coalesce(ev.title,''), v_raw) > 0.15
        OR similarity(coalesce(ev.description,''), v_raw) > 0.15
        OR ev.title ILIKE '%' || v_raw || '%'
        OR ev.venue_name ILIKE '%' || v_raw || '%'
        OR ev.description ILIKE '%' || v_raw || '%')
    ORDER BY rank DESC LIMIT p_limit
  ) e;

  -- People (user_photos uses uploaded_at, not created_at)
  SELECT coalesce(jsonb_agg(to_jsonb(p) - 'rank' ORDER BY p.rank DESC), '[]'::jsonb)
  INTO v_people
  FROM (
    SELECT u.id, u.display_name, u.username, u.bio, u.is_verified, u.nationality,
      ph.photo_url AS avatar_url,
      (
        similarity(coalesce(u.display_name,''), v_raw) * 0.6
        + similarity(coalesce(u.username,''), v_raw) * 0.4
        + CASE WHEN u.display_name ILIKE v_raw||'%' THEN 0.3 WHEN u.display_name ILIKE '%'||v_raw||'%' THEN 0.15 ELSE 0 END
        + CASE WHEN u.username ILIKE v_raw||'%' THEN 0.3 WHEN u.username ILIKE '%'||v_raw||'%' THEN 0.15 ELSE 0 END
      ) AS rank
    FROM public.users u
    LEFT JOIN LATERAL (
      SELECT up.photo_url FROM public.user_photos up
      WHERE up.user_id = u.id
      ORDER BY up.is_primary DESC NULLS LAST, up.uploaded_at ASC LIMIT 1
    ) ph ON true
    WHERE u.id != p_user_id
      AND (u.display_name ILIKE '%'||v_raw||'%'
        OR u.username ILIKE '%'||v_raw||'%'
        OR similarity(coalesce(u.display_name,''), v_raw) > 0.2
        OR similarity(coalesce(u.username,''), v_raw) > 0.2)
    ORDER BY rank DESC LIMIT p_limit
  ) p;

  RETURN jsonb_build_object('hangouts', v_hangouts, 'events', v_events, 'people', v_people);
END;$$;


--
-- Name: search_events_fts(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_events_fts(p_query text, p_limit integer DEFAULT 15) RETURNS SETOF jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE v_tsquery tsquery; v_raw text;
BEGIN
  v_raw := trim(p_query); IF v_raw='' THEN RETURN; END IF;
  BEGIN v_tsquery := to_tsquery('english', array_to_string(array(
    SELECT w||':*' FROM unnest(string_to_array(regexp_replace(public.immutable_unaccent(lower(v_raw)),'[^\w\s]','','g'),' ')) AS w WHERE w<>''
  ),' & ')); EXCEPTION WHEN OTHERS THEN v_tsquery := plainto_tsquery('english',v_raw); END;
  RETURN QUERY SELECT to_jsonb(e)-'rank' FROM (
    SELECT ev.id,ev.title,ev.venue_name,ev.start_datetime,ev.status,
      ev.cover_image_url,ev.event_type::text AS event_type,ev.ticket_price,
      ev.capacity,ev.tickets_sold,ev.description,
      (CASE WHEN ev.search_vector@@v_tsquery THEN ts_rank_cd(ev.search_vector,v_tsquery,32) ELSE 0 END
       +similarity(coalesce(ev.title,''),v_raw)*0.5+similarity(coalesce(ev.description,''),v_raw)*0.2
       +CASE WHEN ev.start_datetime>now() THEN 0.3 WHEN ev.start_datetime>now()-interval '7 days' THEN 0.1 ELSE 0 END
      ) AS rank
    FROM public.events ev
    WHERE ev.status IN ('active','sold_out') AND ev.start_datetime>now()-interval '7 days'
      AND (ev.search_vector@@v_tsquery OR similarity(coalesce(ev.title,''),v_raw)>0.15
        OR similarity(coalesce(ev.description,''),v_raw)>0.15
        OR ev.title ILIKE '%'||v_raw||'%' OR ev.venue_name ILIKE '%'||v_raw||'%'
        OR ev.description ILIKE '%'||v_raw||'%')
    ORDER BY rank DESC LIMIT p_limit
  ) e;
END;$$;


--
-- Name: search_hangouts_fts(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_hangouts_fts(p_query text, p_limit integer DEFAULT 15) RETURNS SETOF jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE v_tsquery tsquery; v_raw text;
BEGIN
  v_raw := trim(p_query); IF v_raw='' THEN RETURN; END IF;
  BEGIN v_tsquery := to_tsquery('english', array_to_string(array(
    SELECT w||':*' FROM unnest(string_to_array(regexp_replace(public.immutable_unaccent(lower(v_raw)),'[^\w\s]','','g'),' ')) AS w WHERE w<>''
  ),' & ')); EXCEPTION WHEN OTHERS THEN v_tsquery := plainto_tsquery('english',v_raw); END;
  RETURN QUERY SELECT to_jsonb(h)-'rank' FROM (
    SELECT t.id,t.title,t.description,t.location_name,t.city,t.datetime,t.status,
      t.current_capacity,t.max_guests,t.image_url,t.cuisine_type,t.marker_emoji,
      t.experience_type,t.is_experience,t.price_per_person,t.currency,t.images,
      (CASE WHEN t.search_vector@@v_tsquery THEN ts_rank_cd(t.search_vector,v_tsquery,32) ELSE 0 END
       +similarity(coalesce(t.title,''),v_raw)*0.5+similarity(coalesce(t.description,''),v_raw)*0.2
       +CASE WHEN t.datetime>now() THEN 0.3 WHEN t.datetime>now()-interval '7 days' THEN 0.1 ELSE 0 END
      ) AS rank
    FROM public.tables t
    WHERE t.status IN ('open','full') AND t.datetime>now()-interval '7 days'
      AND (t.search_vector@@v_tsquery OR similarity(coalesce(t.title,''),v_raw)>0.15
        OR similarity(coalesce(t.description,''),v_raw)>0.15
        OR t.title ILIKE '%'||v_raw||'%' OR t.description ILIKE '%'||v_raw||'%'
        OR t.location_name ILIKE '%'||v_raw||'%')
    ORDER BY rank DESC LIMIT p_limit
  ) h;
END;$$;


--
-- Name: search_users(text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_users(p_query text, p_limit integer DEFAULT 20, p_exclude_user_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, display_name text, username text, avatar_url text, bio text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.display_name,
    u.username,
    COALESCE(
      (SELECT up.photo_url FROM public.user_photos up 
       WHERE up.user_id = u.id AND up.is_primary = true 
       LIMIT 1),
      (SELECT up.photo_url FROM public.user_photos up 
       WHERE up.user_id = u.id 
       ORDER BY up.id ASC 
       LIMIT 1)
    ) AS avatar_url,
    u.bio
  FROM public.users u
  WHERE 
    (p_exclude_user_id IS NULL OR u.id != p_exclude_user_id)
    AND (
      u.display_name ILIKE '%' || p_query || '%'
      OR u.username ILIKE '%' || p_query || '%'
    )
  ORDER BY 
    -- Exact username match first
    CASE WHEN LOWER(u.username) = LOWER(p_query) THEN 0 ELSE 1 END,
    -- Then prefix matches
    CASE WHEN u.username ILIKE p_query || '%' THEN 0 ELSE 1 END,
    CASE WHEN u.display_name ILIKE p_query || '%' THEN 0 ELSE 1 END,
    -- Then everything else by name
    u.display_name
  LIMIT p_limit;
END;
$$;


--
-- Name: send_event_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_event_reminders() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_event RECORD;
  v_ticket RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 24-hour reminder window
  FOR v_event IN
    SELECT id, title FROM public.events
    WHERE status = 'active'
    AND start_datetime BETWEEN (v_now + INTERVAL '23 hours 45 minutes')
                            AND (v_now + INTERVAL '24 hours 15 minutes')
  LOOP
    FOR v_ticket IN
      SELECT DISTINCT user_id FROM public.purchase_intents
      WHERE event_id = v_event.id AND status = 'completed' AND user_id IS NOT NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_ticket.user_id AND type = 'event_reminder_24h' AND entity_id = v_event.id
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, entity_id, metadata)
        VALUES (
          v_ticket.user_id,
          'event_reminder_24h',
          'Event Tomorrow!',
          COALESCE(v_event.title, 'Your event') || ' is tomorrow. Get ready!',
          v_event.id,
          jsonb_build_object('event_id', v_event.id::text, 'reminder_type', '24h')
        );
      END IF;
    END LOOP;
  END LOOP;

  -- 1-hour reminder window
  FOR v_event IN
    SELECT id, title FROM public.events
    WHERE status = 'active'
    AND start_datetime BETWEEN (v_now + INTERVAL '45 minutes')
                            AND (v_now + INTERVAL '1 hour 15 minutes')
  LOOP
    FOR v_ticket IN
      SELECT DISTINCT user_id FROM public.purchase_intents
      WHERE event_id = v_event.id AND status = 'completed' AND user_id IS NOT NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
        WHERE user_id = v_ticket.user_id AND type = 'event_reminder_1h' AND entity_id = v_event.id
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, entity_id, metadata)
        VALUES (
          v_ticket.user_id,
          'event_reminder_1h',
          'Starting Soon!',
          COALESCE(v_event.title, 'Your event') || ' starts in 1 hour!',
          v_event.id,
          jsonb_build_object('event_id', v_event.id::text, 'reminder_type', '1h')
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;


--
-- Name: send_event_reminders_24h(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_event_reminders_24h() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  r RECORD;
BEGIN
  -- Loop through users who have events starting in ~24 hours
  FOR r IN
    -- 1. Ticket Holders
    SELECT DISTINCT t.user_id, e.title, e.id as event_id
    FROM tickets t
    JOIN events e ON e.id = t.event_id
    WHERE e.start_datetime BETWEEN NOW() + INTERVAL '23 hours 30 minutes' 
                               AND NOW() + INTERVAL '24 hours 30 minutes'
      AND t.status = 'valid'
    
    UNION
    
    -- 2. Social Table Joiners
    SELECT DISTINCT p.user_id, t.title, t.id as event_id
    FROM table_participants p
    JOIN tables t ON t.id = p.table_id
    WHERE t.datetime BETWEEN NOW() + INTERVAL '23 hours 30 minutes' 
                         AND NOW() + INTERVAL '24 hours 30 minutes'
      AND p.status = 'approved'
  LOOP
    -- Send Push
    PERFORM net.http_post(
      url := 'https://rahhezqtkpvkialnduft.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM secrets.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
      ),
      body := jsonb_build_object(
        'user_id', r.user_id,
        'title', 'Event Tomorrow! ⏰',
        'body', 'Reminder: ' || r.title || ' is starting regularly in 24 hours.',
        'data', jsonb_build_object(
          'type', 'event_reminder',
          'event_id', r.event_id::TEXT
        )
      )
    );
  END LOOP;
END;
$$;


--
-- Name: set_event_registrations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_event_registrations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: submit_event_request(uuid, jsonb, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid DEFAULT NULL::uuid, p_guest_email text DEFAULT NULL::text, p_guest_name text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_user_id UUID;
    v_event RECORD;
    v_registration_id UUID;
    v_status TEXT;
    v_required_questions UUID[];
    v_answered_questions UUID[];
    v_missing UUID[];
    v_existing_id UUID;
    v_effective_email TEXT;
    v_invite_status TEXT;
BEGIN
    -- 1. Determine identity (auth.uid for logged-in, guest_email for guests)
    v_user_id := auth.uid();

    IF v_user_id IS NULL AND (p_guest_email IS NULL OR trim(p_guest_email) = '') THEN
        RAISE EXCEPTION 'Must provide guest_email if not authenticated'
            USING ERRCODE = 'P0001';
    END IF;

    -- 2. Load event + validate it's live
    SELECT id, require_approval, invite_only, status, organizer_id
    INTO v_event
    FROM events
    WHERE id = p_event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Event not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_event.status != 'active' THEN
        RAISE EXCEPTION 'Event is not accepting registrations (status: %)', v_event.status
            USING ERRCODE = 'P0003';
    END IF;

    -- 3. Check for existing non-cancelled registration
    IF v_user_id IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM event_registrations
        WHERE event_id = p_event_id
          AND user_id = v_user_id
          AND status != 'cancelled'
        LIMIT 1;
    ELSE
        SELECT id INTO v_existing_id
        FROM event_registrations
        WHERE event_id = p_event_id
          AND user_id IS NULL
          AND lower(guest_email) = lower(p_guest_email)
          AND status != 'cancelled'
        LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'You have already registered for this event'
            USING ERRCODE = 'P0004';
    END IF;

    -- 4. Validate all required questions are answered
    SELECT array_agg(id) INTO v_required_questions
    FROM registration_questions
    WHERE event_id = p_event_id AND is_required = true;

    IF v_required_questions IS NOT NULL AND array_length(v_required_questions, 1) > 0 THEN
        SELECT array_agg((value->>'question_id')::UUID) INTO v_answered_questions
        FROM jsonb_array_elements(p_answers)
        WHERE value->>'answer' IS NOT NULL
          AND trim(value->>'answer') != '';

        SELECT array_agg(q_id) INTO v_missing
        FROM unnest(v_required_questions) AS q_id
        WHERE q_id != ALL(COALESCE(v_answered_questions, ARRAY[]::UUID[]));

        IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
            RAISE EXCEPTION 'Required questions not answered: %', v_missing
                USING ERRCODE = 'P0005';
        END IF;
    END IF;

    -- 5. Determine status based on the event's access model.
    --    invite-only: invited emails are pre-cleared (approved); everyone else
    --    is a request-to-join (pending). Otherwise fall back to require_approval.
    IF v_event.invite_only THEN
        v_effective_email := COALESCE(
            (SELECT email FROM users WHERE id = v_user_id),
            p_guest_email
        );
        v_invite_status := is_email_invited(p_event_id, v_effective_email);
        IF v_invite_status IN ('invited', 'accepted') THEN
            v_status := 'approved';
        ELSE
            v_status := 'pending';
        END IF;
    ELSIF v_event.require_approval THEN
        v_status := 'pending';
    ELSE
        v_status := 'auto_approved';
    END IF;

    -- 6. Insert registration
    INSERT INTO event_registrations (
        event_id, user_id, guest_email, guest_name, tier_id, status
    )
    VALUES (
        p_event_id, v_user_id, p_guest_email, p_guest_name, p_tier_id, v_status
    )
    RETURNING id INTO v_registration_id;

    -- 7. Bulk insert answers
    IF p_answers IS NOT NULL AND jsonb_array_length(p_answers) > 0 THEN
        INSERT INTO registration_answers (registration_id, question_id, answer)
        SELECT
            v_registration_id,
            (a->>'question_id')::UUID,
            CASE
                WHEN jsonb_typeof(a->'answer') = 'string' THEN a->>'answer'
                ELSE (a->'answer')::TEXT
            END
        FROM jsonb_array_elements(p_answers) AS a
        WHERE a->>'question_id' IS NOT NULL;
    END IF;

    RETURN jsonb_build_object(
        'registration_id', v_registration_id,
        'status', v_status,
        'require_approval', (v_event.require_approval OR v_event.invite_only)
    );
END;
$$;


--
-- Name: FUNCTION submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid, p_guest_email text, p_guest_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid, p_guest_email text, p_guest_name text) IS 'Submits an event registration request. Inserts event_registrations + registration_answers in one transaction. Returns the new registration_id and status (pending if event.require_approval, auto_approved otherwise). Validates required questions are answered. Prevents duplicate registrations per (event, user) or (event, guest_email). Supports both logged-in users (auth.uid) and guests (p_guest_email).';


--
-- Name: suggest_users(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suggest_users(p_current_user_id uuid, p_limit integer DEFAULT 10) RETURNS TABLE(id uuid, display_name text, username text, avatar_url text, bio text, is_verified boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.username,
    COALESCE(
      (SELECT up.photo_url FROM public.user_photos up
       WHERE up.user_id = u.id AND up.is_primary = true
       LIMIT 1),
      (SELECT up.photo_url FROM public.user_photos up
       WHERE up.user_id = u.id
       ORDER BY up.id ASC
       LIMIT 1)
    ) AS avatar_url,
    u.bio,
    u.is_verified
  FROM public.users u
  WHERE
    u.id != p_current_user_id
    AND u.deleted_at IS NULL
    AND u.status = 'active'
    AND u.id NOT IN (
      SELECT f.following_id FROM public.follows f WHERE f.follower_id = p_current_user_id
    )
  ORDER BY u.last_active_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;


--
-- Name: sync_dm_participant_inbox(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_dm_participant_inbox() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_other_user RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM chat_inbox WHERE chat_id = OLD.chat_id AND user_id = OLD.user_id AND chat_type = 'dm';
    RETURN OLD;
  END IF;

  -- UPDATE: last_read_at changed → reset unread
  IF TG_OP = 'UPDATE' AND NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    UPDATE chat_inbox SET
      unread_count = 0,
      has_unread = FALSE,
      last_read_at = NEW.last_read_at,
      updated_at = NOW()
    WHERE chat_id = NEW.chat_id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- INSERT → create inbox row
  IF TG_OP = 'INSERT' THEN
    SELECT u.id, u.display_name,
      (SELECT up.photo_url FROM user_photos up WHERE up.user_id = u.id ORDER BY up.is_primary DESC NULLS LAST, up.display_order LIMIT 1) as photo_url
    INTO v_other_user
    FROM direct_chat_participants ocp
    JOIN users u ON ocp.user_id = u.id
    WHERE ocp.chat_id = NEW.chat_id AND ocp.user_id != NEW.user_id
    LIMIT 1;

    IF v_other_user IS NOT NULL THEN
      INSERT INTO chat_inbox (chat_id, user_id, chat_type, title, subtitle, image_url, icon_key, last_activity_at, metadata, last_read_at)
      VALUES (
        NEW.chat_id,
        NEW.user_id,
        'dm',
        v_other_user.display_name,
        'Direct Message',
        v_other_user.photo_url,
        'person',
        NOW(),
        jsonb_build_object('other_user_id', v_other_user.id, 'other_user_name', v_other_user.display_name),
        NEW.last_read_at
      )
      ON CONFLICT (chat_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_event_tickets_sold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_event_tickets_sold() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'available' THEN
      UPDATE events SET tickets_sold = tickets_sold + 1 WHERE id = NEW.event_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status != 'available' THEN
      UPDATE events SET tickets_sold = GREATEST(0, tickets_sold - 1) WHERE id = OLD.event_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'available' AND NEW.status != 'available' THEN
      UPDATE events SET tickets_sold = tickets_sold + 1 WHERE id = NEW.event_id;
    ELSIF OLD.status != 'available' AND NEW.status = 'available' THEN
      UPDATE events SET tickets_sold = GREATEST(0, tickets_sold - 1) WHERE id = OLD.event_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: sync_group_member_inbox(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_group_member_inbox() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_group RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM chat_inbox WHERE chat_id = OLD.group_id AND user_id = OLD.user_id AND chat_type = 'group';
    RETURN OLD;
  END IF;

  -- UPDATE: last_read_at changed → reset unread
  IF TG_OP = 'UPDATE' AND NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    UPDATE chat_inbox SET
      unread_count = 0,
      has_unread = FALSE,
      last_read_at = NEW.last_read_at,
      updated_at = NOW()
    WHERE chat_id = NEW.group_id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- UPDATE: status changed to non-approved → remove
  IF TG_OP = 'UPDATE' AND NEW.status != 'approved' THEN
    DELETE FROM chat_inbox WHERE chat_id = NEW.group_id AND user_id = NEW.user_id AND chat_type = 'group';
    RETURN NEW;
  END IF;

  -- INSERT or UPDATE to approved → upsert inbox row
  IF NEW.status = 'approved' THEN
    SELECT id, name, category, privacy, member_count, icon_emoji, cover_image_url, created_at
    INTO v_group FROM groups WHERE id = NEW.group_id;

    IF v_group IS NOT NULL THEN
      INSERT INTO chat_inbox (chat_id, user_id, chat_type, title, subtitle, image_url, icon_key, last_activity_at, metadata, last_read_at)
      VALUES (
        NEW.group_id,
        NEW.user_id,
        'group',
        v_group.name,
        v_group.category || ' group',
        v_group.cover_image_url,
        v_group.category,
        COALESCE(
          (SELECT MAX(m."timestamp") FROM messages m WHERE m.group_id = NEW.group_id),
          v_group.created_at
        ),
        jsonb_build_object('group_id', v_group.id, 'privacy', v_group.privacy, 'member_count', v_group.member_count, 'icon_emoji', v_group.icon_emoji),
        NEW.last_read_at
      )
      ON CONFLICT (chat_id, user_id) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_post_comment_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_post_comment_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: sync_post_like_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_post_like_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: sync_subscriber_group_membership(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_subscriber_group_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT id INTO v_group_id
  FROM groups
  WHERE subscription_tier_id = NEW.tier_id
    AND group_type = 'subscriber'
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('active', 'grace_period') THEN
    INSERT INTO group_members (group_id, user_id, role, status, joined_at)
    VALUES (v_group_id, NEW.fan_id, 'member', 'active', now())
    ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'active';

  ELSIF NEW.status IN ('cancelled', 'expired')
    AND NEW.current_period_end < now() THEN
    UPDATE group_members
    SET status = 'removed'
    WHERE group_id = v_group_id AND user_id = NEW.fan_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_table_member_inbox(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_table_member_inbox() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_table RECORD;
BEGIN
  -- DELETE or status changed to non-active → remove from inbox
  IF TG_OP = 'DELETE' THEN
    DELETE FROM chat_inbox WHERE chat_id = OLD.table_id AND user_id = OLD.user_id AND chat_type = 'table';
    RETURN OLD;
  END IF;

  -- UPDATE: last_read_at changed → reset unread
  IF TG_OP = 'UPDATE' AND NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    UPDATE chat_inbox SET
      unread_count = 0,
      has_unread = FALSE,
      last_read_at = NEW.last_read_at,
      updated_at = NOW()
    WHERE chat_id = NEW.table_id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- UPDATE: status changed to non-active → remove
  IF TG_OP = 'UPDATE' AND NEW.status NOT IN ('approved', 'joined', 'attended') THEN
    DELETE FROM chat_inbox WHERE chat_id = NEW.table_id AND user_id = NEW.user_id AND chat_type = 'table';
    RETURN NEW;
  END IF;

  -- INSERT or UPDATE to active status → upsert inbox row
  IF NEW.status IN ('approved', 'joined', 'attended') THEN
    SELECT id, title, location_name, cuisine_type, status, max_guests, created_at
    INTO v_table FROM tables WHERE id = NEW.table_id;

    IF v_table IS NOT NULL THEN
      INSERT INTO chat_inbox (chat_id, user_id, chat_type, title, subtitle, icon_key, last_activity_at, metadata, last_read_at)
      VALUES (
        NEW.table_id,
        NEW.user_id,
        'table',
        v_table.title,
        v_table.location_name,
        v_table.cuisine_type,
        COALESCE(
          (SELECT MAX(m."timestamp") FROM messages m WHERE m.table_id = NEW.table_id AND m.group_id IS NULL),
          GREATEST(NEW.joined_at, v_table.created_at)
        ),
        jsonb_build_object('table_id', v_table.id, 'status', v_table.status, 'max_guests', v_table.max_guests),
        NEW.last_read_at
      )
      ON CONFLICT (chat_id, user_id) DO UPDATE SET
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        updated_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_trip_participant_inbox(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_trip_participant_inbox() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_trip RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM chat_inbox WHERE chat_id = OLD.chat_id AND user_id = OLD.user_id AND chat_type = 'trip';
    RETURN OLD;
  END IF;

  -- UPDATE: last_read_at changed → reset unread
  IF TG_OP = 'UPDATE' AND NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    UPDATE chat_inbox SET
      unread_count = 0,
      has_unread = FALSE,
      last_read_at = NEW.last_read_at,
      updated_at = NOW()
    WHERE chat_id = NEW.chat_id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- INSERT → create inbox row
  IF TG_OP = 'INSERT' THEN
    SELECT id, destination_city, destination_country, ably_channel_id, start_date
    INTO v_trip FROM trip_group_chats WHERE id = NEW.chat_id;

    IF v_trip IS NOT NULL THEN
      INSERT INTO chat_inbox (chat_id, user_id, chat_type, title, subtitle, icon_key, last_activity_at, metadata, last_read_at)
      VALUES (
        NEW.chat_id,
        NEW.user_id,
        'trip',
        v_trip.destination_city || ' Group',
        v_trip.destination_country,
        'flight',
        COALESCE(v_trip.start_date::timestamptz, NOW()),
        jsonb_build_object('bucket_id', v_trip.ably_channel_id, 'start_date', v_trip.start_date),
        NEW.last_read_at
      )
      ON CONFLICT (chat_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: tables_search_vector_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tables_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.title), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.description), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.cuisine_type), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.experience_type), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.location_name), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(public.immutable_unaccent(NEW.city), '')), 'C');
  RETURN NEW;
END;
$$;


--
-- Name: toggle_partner_follow(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_partner_follow(p_partner_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
  v_email   text;
  v_name    text;
  v_exists  boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001';
  END IF;

  -- Validate partner exists
  IF NOT EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'Partner not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT email, display_name INTO v_email, v_name FROM users WHERE id = v_user_id;

  SELECT EXISTS (
    SELECT 1 FROM partner_followers
    WHERE user_id = v_user_id AND partner_id = p_partner_id
  ) INTO v_exists;

  IF v_exists THEN
    -- UNFOLLOW: remove follow + deactivate the email sub that came from following
    DELETE FROM partner_followers
      WHERE user_id = v_user_id AND partner_id = p_partner_id;

    IF v_email IS NOT NULL THEN
      UPDATE partner_subscribers
         SET is_active = false, unsubscribed_at = now()
       WHERE partner_id = p_partner_id
         AND lower(email) = lower(v_email)
         AND source = 'app_follow';
    END IF;

    RETURN jsonb_build_object('following', false);
  ELSE
    -- FOLLOW: add follow + (re)activate email subscription
    INSERT INTO partner_followers (user_id, partner_id)
      VALUES (v_user_id, p_partner_id)
      ON CONFLICT (user_id, partner_id) DO NOTHING;

    IF v_email IS NOT NULL THEN
      INSERT INTO partner_subscribers (partner_id, email, full_name, source, is_active)
        VALUES (p_partner_id, v_email, v_name, 'app_follow', true)
      ON CONFLICT (partner_id, email) DO UPDATE
        SET is_active       = true,
            unsubscribed_at = NULL,
            full_name       = COALESCE(partner_subscribers.full_name, EXCLUDED.full_name);
    END IF;

    RETURN jsonb_build_object('following', true);
  END IF;
END;
$$;


--
-- Name: trg_alert_kyc_submitted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_alert_kyc_submitted() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only fire when kyc_status transitions TO pending_review
  IF (OLD.kyc_status IS DISTINCT FROM NEW.kyc_status)
     AND NEW.kyc_status = 'pending_review' THEN

    PERFORM notify_internal_alert(
      'partner_signup',
      'KYC Documents Submitted — Review Required',
      format(
        '<p><strong>%s</strong> has submitted their KYC documents and is waiting for review.</p>' ||
        '<p>Review their documents in the <a href="https://hanghut.com/admin/partners">Admin Partners panel</a>.</p>',
        COALESCE(NEW.business_name, 'Unknown Partner')
      ),
      jsonb_build_object(
        'Business Name',    NEW.business_name,
        'Representative',   COALESCE(NEW.representative_name, '—'),
        'Contact Email',    COALESCE(NEW.work_email, '—'),
        'Contact Number',   COALESCE(NEW.contact_number, '—'),
        'Previous KYC',     COALESCE(OLD.kyc_status::text, 'not_started'),
        'Submitted At',     to_char(now() AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_alert_new_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_alert_new_report() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM notify_internal_alert(
    'report',
    'New User Report Submitted — Review Required',
    format(
      '<p>A user has submitted a report that requires review.</p>' ||
      '<p>Review it in the <a href="https://hanghut.com/admin/reports">Admin Reports panel</a>.</p>'
    ),
    jsonb_build_object(
      'Target',    COALESCE(NEW.metadata->>'target_name', NEW.target_id::text),
      'Type',      NEW.target_type,
      'Reason',    NEW.reason_category,
      'Details',   COALESCE(NEW.description, '—'),
      'Status',    NEW.status,
      'Reported At', to_char(NEW.created_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: trg_alert_partner_signup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_alert_partner_signup() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM notify_internal_alert(
    'partner_signup',
    'New Partner Sign-Up — Needs Verification',
    format(
      '<p>A new organizer has registered and is awaiting verification.</p>' ||
      '<p>Please review their application in the <a href="https://hanghut.com/admin/partners">Admin Partners panel</a>.</p>',
      NEW.business_name
    ),
    jsonb_build_object(
      'Business Name', NEW.business_name,
      'Representative', COALESCE(NEW.representative_name, '—'),
      'Contact Email',  COALESCE(NEW.work_email, '—'),
      'Contact Number', COALESCE(NEW.contact_number, '—'),
      'KYC Status',     COALESCE(NEW.kyc_status::text, 'not started'),
      'Signed Up At',   to_char(NEW.created_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: trg_alert_partner_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_alert_partner_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    PERFORM notify_internal_alert(
      'status_update',
      'Partner Account Approved',
      format(
        '<p><strong>%s</strong> has been approved as a verified partner on HangHut.</p>',
        COALESCE(NEW.business_name, 'Unknown Partner')
      ),
      jsonb_build_object(
        'Business Name',  NEW.business_name,
        'Approved By',    COALESCE(NEW.approved_by::text, 'system'),
        'Approved At',    to_char(COALESCE(NEW.approved_at, now()) AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
      )
    );

  ELSIF NEW.status = 'rejected' THEN
    PERFORM notify_internal_alert(
      'status_update',
      'Partner Application Rejected',
      format(
        '<p><strong>%s</strong>''s partner application has been rejected.</p>',
        COALESCE(NEW.business_name, 'Unknown Partner')
      ),
      jsonb_build_object(
        'Business Name',  NEW.business_name,
        'Contact Email',  COALESCE(NEW.work_email, '—'),
        'Admin Notes',    COALESCE(NEW.admin_notes, '—')
      )
    );

  ELSIF NEW.status = 'suspended' THEN
    PERFORM notify_internal_alert(
      'status_update',
      'Partner Account Suspended',
      format(
        '<p><strong>%s</strong>''s partner account has been suspended.</p>',
        COALESCE(NEW.business_name, 'Unknown Partner')
      ),
      jsonb_build_object(
        'Business Name',  NEW.business_name,
        'Contact Email',  COALESCE(NEW.work_email, '—'),
        'Admin Notes',    COALESCE(NEW.admin_notes, '—')
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_alert_payout_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_alert_payout_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_business_name text;
BEGIN
  -- Only fire on new pending_request payouts
  IF NEW.status <> 'pending_request' THEN
    RETURN NEW;
  END IF;

  SELECT business_name INTO v_business_name
  FROM partners WHERE id = NEW.partner_id;

  PERFORM notify_internal_alert(
    'payout_request',
    'New Payout Request — Action Required',
    format(
      '<p><strong>%s</strong> has submitted a payout request and is waiting for approval.</p>' ||
      '<p>Review and approve in the <a href="https://hanghut.com/admin/payouts">Admin Payouts panel</a>.</p>',
      COALESCE(v_business_name, 'Unknown Partner')
    ),
    jsonb_build_object(
      'Partner',        COALESCE(v_business_name, '—'),
      'Amount',         '₱' || to_char(NEW.amount, 'FM999,999,990.00'),
      'Bank',           COALESCE(NEW.bank_name, '—'),
      'Account Name',   COALESCE(NEW.bank_account_name, '—'),
      'Requested At',   to_char(NEW.requested_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
    )
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_chat_inbox_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_inbox_on_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_chat_id UUID;
  v_msg_text TEXT;
  v_msg_time TIMESTAMPTZ;
  v_sender_id UUID;
BEGIN
  v_sender_id := NEW.sender_id;

  IF TG_TABLE_NAME = 'direct_messages' THEN
    v_chat_id := NEW.chat_id;
    v_msg_time := NEW.created_at;
    v_msg_text := CASE
      WHEN NEW.message_type = 'gif' THEN 'GIF'
      WHEN NEW.message_type = 'image' THEN '📷 Photo'
      WHEN NEW.content ~~ '%/storage/v1/object/%' THEN '📷 Photo'
      ELSE SUBSTRING(NEW.content FROM 1 FOR 100)
    END;

  ELSIF TG_TABLE_NAME = 'trip_messages' THEN
    v_chat_id := NEW.chat_id;
    v_msg_time := NEW.sent_at;
    v_msg_text := CASE
      WHEN NEW.message_type = 'gif' THEN 'GIF'
      WHEN NEW.message_type = 'image' THEN '📷 Photo'
      WHEN NEW.content ~~ '%/storage/v1/object/%' THEN '📷 Photo'
      ELSE SUBSTRING(NEW.content FROM 1 FOR 100)
    END;

  ELSIF TG_TABLE_NAME = 'messages' THEN
    v_chat_id := COALESCE(NEW.group_id, NEW.table_id);
    v_msg_time := NEW."timestamp";
    v_msg_text := CASE
      WHEN NEW.content_type = 'gif' THEN 'GIF'
      WHEN NEW.content_type = 'image' THEN '📷 Photo'
      WHEN NEW.content ~~ '%/storage/v1/object/%' THEN '📷 Photo'
      ELSE SUBSTRING(NEW.content FROM 1 FOR 100)
    END;
  END IF;

  UPDATE chat_inbox
  SET 
    last_activity_at = v_msg_time,
    last_message_text = v_msg_text,
    last_message_sender_id = v_sender_id,
    subtitle = v_msg_text,
    updated_at = NOW(),
    unread_count = CASE 
      WHEN chat_inbox.user_id = v_sender_id THEN 0
      ELSE chat_inbox.unread_count + 1
    END,
    has_unread = CASE
      WHEN chat_inbox.user_id = v_sender_id THEN FALSE
      ELSE TRUE
    END
  WHERE chat_inbox.chat_id = v_chat_id;

  RETURN NEW;
END;
$$;


--
-- Name: update_event_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_event_location() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_group_member_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_group_member_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
    UPDATE groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
      UPDATE groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
    ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
      UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_post_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_post_location() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_promo_usage_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_promo_usage_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_promo_id UUID;
    v_usage_count INTEGER;
BEGIN
    -- Determine which promo to update
    IF TG_OP = 'DELETE' THEN
        v_promo_id := OLD.promo_code_id;
    ELSE
        v_promo_id := COALESCE(NEW.promo_code_id, OLD.promo_code_id);
    END IF;

    -- Skip if no promo_code_id
    IF v_promo_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Count actual uses of this promo code
    SELECT COUNT(*) INTO v_usage_count
    FROM purchase_intents
    WHERE promo_code_id = v_promo_id
      AND status IN ('completed', 'confirmed');

    -- Update the promo's usage_count
    UPDATE promo_codes
    SET usage_count = v_usage_count
    WHERE id = v_promo_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_support_ticket_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_support_ticket_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_table_capacity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_table_capacity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update current_capacity based on approved/joined members
    UPDATE public.tables
    SET current_capacity = (
        SELECT COUNT(*)
        FROM public.table_members
        WHERE table_id = COALESCE(NEW.table_id, OLD.table_id)
        AND status IN ('approved', 'joined', 'attended')
    )
    WHERE id = COALESCE(NEW.table_id, OLD.table_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_table_location(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_table_location() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_tier_quantity_sold(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tier_quantity_sold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_tier_id UUID;
    v_sold_count INTEGER;
BEGIN
    -- Determine which tier to update
    IF TG_OP = 'DELETE' THEN
        v_tier_id := OLD.tier_id;
    ELSE
        v_tier_id := COALESCE(NEW.tier_id, OLD.tier_id);
    END IF;

    -- Skip if no tier_id (e.g. general admission without tiers)
    IF v_tier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Count actual sold tickets for this tier
    -- "sold" = any status except 'available', 'cancelled', 'refunded'
    SELECT COUNT(*) INTO v_sold_count
    FROM tickets
    WHERE tier_id = v_tier_id
      AND status NOT IN ('available', 'cancelled', 'refunded');

    -- Update the tier's quantity_sold
    UPDATE ticket_tiers
    SET quantity_sold = v_sold_count
    WHERE id = v_tier_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_user_location(double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_location(lat double precision, lng double precision) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE users
  SET 
    current_lat = lat,
    current_lng = lng,
    location_updated_at = NOW()
  WHERE id = auth.uid();
END;
$$;


--
-- Name: update_user_trust_score(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_trust_score() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    avg_score NUMERIC;
    total_ratings INTEGER;
    no_show_count INTEGER;
BEGIN
    SELECT 
        AVG(overall_score),
        COUNT(*),
        SUM(CASE WHEN is_no_show THEN 1 ELSE 0 END)
    INTO avg_score, total_ratings, no_show_count
    FROM ratings
    WHERE rated_user_id = NEW.rated_user_id;
    
    UPDATE users
    SET 
        trust_score = GREATEST(0, LEAST(100, 
            (avg_score * 20) - (no_show_count * 5)
        )),
        total_no_shows = no_show_count
    WHERE id = NEW.rated_user_id;
    
    RETURN NEW;
END;
$$;


--
-- Name: validate_ticket(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_ticket(ticket_qr_code text, event_id_param uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  ticket_data RECORD;
BEGIN
  -- Find and lock ticket
  SELECT 
    t.id,
    t.ticket_number,
    t.status,
    t.checked_in_at,
    u.display_name,
    e.title AS event_title,
    e.start_datetime
  INTO ticket_data
  FROM tickets t
  JOIN users u ON t.user_id = u.id
  JOIN events e ON t.event_id = e.id
  WHERE t.qr_code = ticket_qr_code
    AND t.event_id = event_id_param
  FOR UPDATE;

  -- Ticket not found
  IF NOT FOUND THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Ticket not found or invalid event'
    )::json;
  END IF;

  -- Already used
  IF ticket_data.status = 'used' THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Ticket already checked in',
      'status', 'used',
      'checked_in_at', ticket_data.checked_in_at
    )::json;
  END IF;

  -- Cancelled or refunded
  IF ticket_data.status != 'valid' THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Ticket is ' || ticket_data.status,
      'status', ticket_data.status
    )::json;
  END IF;

  -- Mark as used
  UPDATE tickets
  SET 
    status = 'used',
    checked_in_at = NOW(),
    checked_in_by = auth.uid(),
    updated_at = NOW()
  WHERE id = ticket_data.id;

  -- Return success
  RETURN json_build_object(
    'valid', true,
    'ticket_number', ticket_data.ticket_number,
    'attendee_name', ticket_data.display_name,
    'event_title', ticket_data.event_title,
    'event_start', ticket_data.start_datetime
  )::json;
END;
$$;


--
-- Name: FUNCTION validate_ticket(ticket_qr_code text, event_id_param uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_ticket(ticket_qr_code text, event_id_param uuid) IS 'Validates and marks ticket as used during event check-in';


--
-- Name: verify_participant(uuid, uuid, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_participant(p_table_id uuid, p_target_user_id uuid, p_verifier_lat double precision, p_verifier_lng double precision) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_verifier_id UUID := auth.uid();
    v_verifier_status TEXT;
    v_is_host BOOLEAN;
    v_table_location GEOGRAPHY(POINT, 4326);
    v_distance_meters FLOAT;
    v_was_geo_checked BOOLEAN;
BEGIN
    -- 1. Check if Verifier is Authorized (Host or Verified/Checked-in)
    SELECT (host_id = v_verifier_id) INTO v_is_host
    FROM public.tables WHERE id = p_table_id;

    IF NOT v_is_host THEN
        SELECT arrival_status INTO v_verifier_status
        FROM public.table_members
        WHERE table_id = p_table_id AND user_id = v_verifier_id;
        
        IF v_verifier_status IS NULL OR v_verifier_status NOT IN ('verified', 'checked_in') THEN
            RETURN jsonb_build_object('success', false, 'error', 'Verifier must be verified first.');
        END IF;
    END IF;

    -- 2. Check that target user is actually a member
    IF NOT EXISTS (
      SELECT 1 FROM public.table_members
      WHERE table_id = p_table_id AND user_id = p_target_user_id
        AND status IN ('approved', 'joined', 'attended')
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this activity');
    END IF;

    -- 3. Check Distance (GPS Gating) — 500m threshold (GPS indoors can drift 50-300m)
    SELECT location INTO v_table_location
    FROM public.tables WHERE id = p_table_id;

    IF v_table_location IS NULL THEN
         RETURN jsonb_build_object('success', false, 'error', 'Venue location not found.');
    END IF;

    v_distance_meters := ST_Distance(
        v_table_location, 
        ST_SetSRID(ST_MakePoint(p_verifier_lng, p_verifier_lat), 4326)::geography
    );

    IF v_distance_meters > 500 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', format('Too far from venue (%s m away). Must be within 500m.', round(v_distance_meters::numeric, 0))
        );
    END IF;

    -- 4. Verify the Target User
    UPDATE public.table_members
    SET 
        arrival_status = 'verified',
        verified_at = NOW(),
        verified_by = v_verifier_id
    WHERE table_id = p_table_id AND user_id = p_target_user_id;

    -- 5. Check if already geo-checked (to avoid double-counting total_checkins)
    SELECT EXISTS(
      SELECT 1 FROM public.activity_checkins 
      WHERE table_id = p_table_id AND user_id = p_target_user_id
    ) INTO v_was_geo_checked;

    -- 6. Record in activity_checkins (upsert: geo → qr_verified upgrade)
    INSERT INTO public.activity_checkins (table_id, user_id, checkin_type, verified_by)
    VALUES (p_table_id, p_target_user_id, 'qr_verified', v_verifier_id)
    ON CONFLICT (table_id, user_id)
    DO UPDATE SET checkin_type = 'qr_verified', verified_by = v_verifier_id;

    -- 7. Increment QR verified count (and total_checkins if not already counted)
    INSERT INTO public.user_gamification_stats (user_id, total_qr_verified, total_checkins, updated_at)
    VALUES (p_target_user_id, 1, CASE WHEN v_was_geo_checked THEN 0 ELSE 1 END, now())
    ON CONFLICT (user_id) DO UPDATE
    SET total_qr_verified = user_gamification_stats.total_qr_verified + 1,
        total_checkins = CASE 
          WHEN v_was_geo_checked THEN user_gamification_stats.total_checkins
          ELSE user_gamification_stats.total_checkins + 1
        END,
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'message', 'User verified successfully');
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    user_id uuid NOT NULL,
    checkin_type text DEFAULT 'geo'::text NOT NULL,
    checked_in_at timestamp with time zone DEFAULT now() NOT NULL,
    latitude double precision,
    longitude double precision,
    verified_by uuid,
    CONSTRAINT activity_checkins_checkin_type_check CHECK ((checkin_type = ANY (ARRAY['geo'::text, 'qr_verified'::text])))
);


--
-- Name: ad_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_clicks (
    id bigint NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    clicked_at timestamp with time zone DEFAULT now() NOT NULL,
    amount_usd numeric(10,4) DEFAULT 0.10 NOT NULL,
    invoiced boolean DEFAULT false NOT NULL,
    invoice_month text,
    partner_id uuid
);


--
-- Name: ad_clicks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ad_clicks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ad_clicks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ad_clicks_id_seq OWNED BY public.ad_clicks.id;


--
-- Name: ad_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    invoice_month text NOT NULL,
    total_clicks integer DEFAULT 0 NOT NULL,
    total_usd numeric(10,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    paid_by text,
    CONSTRAINT ad_invoices_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'waived'::text, 'void'::text])))
);


--
-- Name: admin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_actions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    admin_id uuid NOT NULL,
    action_type text NOT NULL,
    target_user_id uuid NOT NULL,
    reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE admin_actions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_actions IS 'Audit log of all admin actions on user accounts';


--
-- Name: admin_email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    sender_name text DEFAULT 'HangHut'::text,
    recipient_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    status text DEFAULT 'draft'::text,
    sent_at timestamp with time zone,
    sent_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT admin_email_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'sent'::text, 'partial'::text, 'failed'::text])))
);


--
-- Name: TABLE admin_email_campaigns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_email_campaigns IS 'Tracks email campaigns sent by HangHut admins to the waitlist.';


--
-- Name: admin_otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_otp_codes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_popups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_popups (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    image_url text,
    action_url text,
    action_text text DEFAULT 'Learn More'::text,
    cooldown_days integer,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin_push_broadcasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_push_broadcasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    image_url text,
    data_payload jsonb DEFAULT '{}'::jsonb,
    target_segment text DEFAULT 'all'::text,
    status text DEFAULT 'pending'::text,
    total_recipients integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    error_message text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT admin_push_broadcasts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: ai_integration_references; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_integration_references (
    id integer NOT NULL,
    service_name text NOT NULL,
    documentation_markdown text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: ai_integration_references_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_integration_references_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_integration_references_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_integration_references_id_seq OWNED BY public.ai_integration_references.id;


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    key_prefix character varying(12) NOT NULL,
    key_hash text NOT NULL,
    name character varying(100) DEFAULT 'Default'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone
);


--
-- Name: api_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_rate_limits (
    key_prefix character varying(12) NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: apk_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.apk_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_name text NOT NULL,
    version_code integer NOT NULL,
    file_url text NOT NULL,
    file_size_bytes bigint NOT NULL,
    release_notes text,
    is_latest boolean DEFAULT false,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: app_team_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_team_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT app_team_memory_category_check CHECK ((category = ANY (ARRAY['session_handoff'::text, 'architecture'::text, 'decision'::text, 'bug'::text, 'pending'::text, 'context'::text])))
);


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    tier text NOT NULL,
    category text NOT NULL,
    icon_key text NOT NULL,
    requirements jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    xp_reward integer DEFAULT 0 NOT NULL,
    CONSTRAINT badges_category_check CHECK ((category = ANY (ARRAY['hosting'::text, 'social'::text, 'verified'::text, 'special'::text, 'meetup'::text]))),
    CONSTRAINT badges_tier_check CHECK ((tier = ANY (ARRAY['bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text, 'diamond'::text, 'special'::text])))
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    partner_id uuid NOT NULL,
    bank_code text NOT NULL,
    bank_name text NOT NULL,
    account_number text NOT NULL,
    account_holder_name text NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocks (
    blocker_user_id uuid NOT NULL,
    blocked_user_id uuid NOT NULL,
    blocked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blocks_check CHECK ((blocker_user_id <> blocked_user_id))
);


--
-- Name: chat_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    chat_type text NOT NULL,
    title text,
    subtitle text,
    image_url text,
    icon_key text,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    last_message_text text,
    last_message_sender_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    unread_count integer DEFAULT 0 NOT NULL,
    has_unread boolean DEFAULT false NOT NULL,
    last_read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_poll_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    poll_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option_id text NOT NULL,
    voted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_polls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_id text NOT NULL,
    chat_type text NOT NULL,
    creator_id uuid NOT NULL,
    question text NOT NULL,
    options jsonb NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    CONSTRAINT chat_polls_chat_type_check CHECK ((chat_type = ANY (ARRAY['table'::text, 'trip'::text])))
);


--
-- Name: comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_likes (
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: comment_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    city text,
    h3_cell text,
    latitude double precision,
    longitude double precision,
    image_url text,
    gif_url text,
    mentioned_user_ids uuid[] DEFAULT '{}'::uuid[]
);


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    location_name text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    city text,
    country text,
    datetime timestamp with time zone NOT NULL,
    max_guests integer DEFAULT 4 NOT NULL,
    cuisine_type text,
    price_per_person numeric(10,2),
    dietary_restrictions text[],
    marker_image_url text,
    marker_emoji text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    current_capacity integer DEFAULT 0 NOT NULL,
    image_url text,
    venue_address text,
    chat_storage_type text DEFAULT 'database'::text,
    marker_model text,
    location public.geography(Point,4326),
    experience_type text,
    images text[] DEFAULT '{}'::text[],
    video_url text,
    currency text DEFAULT 'PHP'::text,
    requirements text[] DEFAULT '{}'::text[],
    included_items text[] DEFAULT '{}'::text[],
    is_experience boolean DEFAULT false,
    verified_by_hanghut boolean DEFAULT false,
    host_bio text,
    host_avatar_url text,
    partner_id uuid,
    itinerary jsonb,
    requires_approval boolean DEFAULT false NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb,
    invited_user_ids uuid[] DEFAULT '{}'::uuid[],
    group_id uuid,
    search_vector tsvector,
    max_join_distance_km integer,
    CONSTRAINT tables_current_capacity_check CHECK ((current_capacity >= 0)),
    CONSTRAINT tables_experience_type_check CHECK ((experience_type = ANY (ARRAY['workshop'::text, 'adventure'::text, 'food_tour'::text, 'nightlife'::text, 'culture'::text, 'other'::text]))),
    CONSTRAINT tables_status_check CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'cancelled'::text, 'completed'::text]))),
    CONSTRAINT tables_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'followers_only'::text, 'mystery'::text, 'group_only'::text])))
);


--
-- Name: COLUMN tables.chat_storage_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tables.chat_storage_type IS 'Chat storage strategy: "database" for legacy Supabase-first, "telegram" for local SQLite-first';


--
-- Name: user_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_photos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    photo_url text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    is_face_verified boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: COLUMN user_photos.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_photos.sort_order IS 'Order of photos in the carousel';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    auth_provider public.auth_provider_type DEFAULT 'email'::public.auth_provider_type NOT NULL,
    display_name text NOT NULL,
    bio text,
    date_of_birth date,
    gender_identity text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone,
    home_location_lat double precision,
    home_location_lng double precision,
    is_verified_email boolean DEFAULT false NOT NULL,
    is_verified_phone boolean DEFAULT false NOT NULL,
    is_verified_photo boolean DEFAULT false NOT NULL,
    trust_score integer DEFAULT 50 NOT NULL,
    total_meetups_attended integer DEFAULT 0 NOT NULL,
    total_no_shows integer DEFAULT 0 NOT NULL,
    status public.user_status_type DEFAULT 'active'::public.user_status_type NOT NULL,
    occupation text,
    social_instagram text,
    tags text[] DEFAULT '{}'::text[],
    avatar_url text,
    is_admin boolean DEFAULT false NOT NULL,
    fcm_token text,
    notification_preferences jsonb DEFAULT jsonb_build_object('event_joins', true, 'chat_messages', true, 'post_likes', true, 'post_comments', true, 'event_updates', true),
    last_chat_notification_at jsonb DEFAULT '{}'::jsonb,
    role text DEFAULT 'user'::text,
    status_reason text,
    status_changed_at timestamp with time zone,
    status_changed_by uuid,
    deleted_at timestamp with time zone,
    current_lat double precision,
    current_lng double precision,
    location_updated_at timestamp with time zone,
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    verification_method text,
    custom_badge text,
    username text,
    hide_activity_from_friends boolean DEFAULT false,
    admin_role text,
    nationality text,
    hide_distance boolean DEFAULT false NOT NULL,
    current_location public.geography(Point,4326) GENERATED ALWAYS AS (
CASE
    WHEN ((current_lat IS NOT NULL) AND (current_lng IS NOT NULL)) THEN (public.st_setsrid(public.st_makepoint(current_lng, current_lat), 4326))::public.geography
    ELSE NULL::public.geography
END) STORED,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'moderator'::text]))),
    CONSTRAINT users_trust_score_check CHECK (((trust_score >= 0) AND (trust_score <= 100))),
    CONSTRAINT valid_admin_role CHECK (((admin_role IS NULL) OR (admin_role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'support'::text, 'finance_admin'::text]))))
);


--
-- Name: COLUMN users.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.status IS 'User account status: active, suspended, banned, or deleted';


--
-- Name: COLUMN users.occupation; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.occupation IS 'User job title or role';


--
-- Name: COLUMN users.social_instagram; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.social_instagram IS 'Instagram handle (without @)';


--
-- Name: COLUMN users.tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.tags IS 'Array of interest/vibe tags';


--
-- Name: COLUMN users.avatar_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.avatar_url IS 'URL to the user''s primary profile avatar';


--
-- Name: COLUMN users.is_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.is_admin IS 'Flag indicating if user has admin privileges for the web dashboard';


--
-- Name: COLUMN users.status_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.status_reason IS 'Reason for suspension/ban (visible to user)';


--
-- Name: COLUMN users.deleted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.deleted_at IS 'Soft delete timestamp for GDPR compliance';


--
-- Name: debug_map_tables; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.debug_map_tables AS
 SELECT t.id,
    t.title,
    t.host_id,
    t.status,
    t.datetime,
    (t.status = 'open'::text) AS is_open,
    (t.datetime > now()) AS is_future_date,
    (u.id IS NOT NULL) AS host_profile_exists,
    (EXISTS ( SELECT 1
           FROM public.user_photos up
          WHERE ((up.user_id = t.host_id) AND (up.is_primary = true)))) AS host_has_photo,
    u.display_name AS host_name
   FROM (public.tables t
     LEFT JOIN public.users u ON ((t.host_id = u.id)));


--
-- Name: direct_chat_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_chat_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone DEFAULT now()
);


--
-- Name: direct_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_chats (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    chat_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    created_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone,
    sequence_number bigint NOT NULL,
    reply_to_id uuid,
    gif_url text,
    deleted_at timestamp with time zone,
    deleted_for_everyone boolean DEFAULT false,
    sender_name text
);


--
-- Name: COLUMN direct_messages.sequence_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.direct_messages.sequence_number IS 'Server-assigned monotonically increasing sequence number for guaranteed message ordering. Auto-incremented per chat_id.';


--
-- Name: email_automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    automation_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    dedup_key text NOT NULL,
    campaign_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    trigger_type text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    subject text,
    html_content text,
    offset_minutes integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_automations_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['welcome'::text, 'post_event'::text, 'pre_event'::text, 'new_event'::text])))
);


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    subject text NOT NULL,
    html_content text NOT NULL,
    recipient_count integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    status text DEFAULT 'draft'::text,
    sent_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    segment text DEFAULT 'all_subscribers'::text,
    event_id uuid,
    automation_id uuid,
    trigger_type text,
    scheduled_for timestamp with time zone,
    scheduled_payload jsonb,
    CONSTRAINT email_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sending'::text, 'sent'::text, 'partial_failure'::text, 'failed'::text])))
);


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    resend_id text,
    campaign_id uuid,
    recipient text,
    type text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: email_campaign_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.email_campaign_stats AS
 SELECT c.id,
    c.partner_id,
    c.subject,
    c.html_content,
    c.recipient_count,
    c.sent_count,
    c.failed_count,
    c.status,
    c.sent_at,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.segment,
    c.event_id,
    COALESCE(d.delivered, (0)::bigint) AS delivered_count,
    COALESCE(o.opened, (0)::bigint) AS opened_count,
    COALESCE(k.clicked, (0)::bigint) AS clicked_count,
    COALESCE(b.bounced, (0)::bigint) AS bounced_count,
    COALESCE(p.complained, (0)::bigint) AS complained_count,
    c.trigger_type,
    c.automation_id
   FROM (((((public.email_campaigns c
     LEFT JOIN ( SELECT email_events.campaign_id,
            count(DISTINCT email_events.recipient) AS delivered
           FROM public.email_events
          WHERE (email_events.type = 'delivered'::text)
          GROUP BY email_events.campaign_id) d ON ((d.campaign_id = c.id)))
     LEFT JOIN ( SELECT email_events.campaign_id,
            count(DISTINCT email_events.recipient) AS opened
           FROM public.email_events
          WHERE (email_events.type = 'opened'::text)
          GROUP BY email_events.campaign_id) o ON ((o.campaign_id = c.id)))
     LEFT JOIN ( SELECT email_events.campaign_id,
            count(DISTINCT email_events.recipient) AS clicked
           FROM public.email_events
          WHERE (email_events.type = 'clicked'::text)
          GROUP BY email_events.campaign_id) k ON ((k.campaign_id = c.id)))
     LEFT JOIN ( SELECT email_events.campaign_id,
            count(DISTINCT email_events.recipient) AS bounced
           FROM public.email_events
          WHERE (email_events.type = 'bounced'::text)
          GROUP BY email_events.campaign_id) b ON ((b.campaign_id = c.id)))
     LEFT JOIN ( SELECT email_events.campaign_id,
            count(DISTINCT email_events.recipient) AS complained
           FROM public.email_events
          WHERE (email_events.type = 'complained'::text)
          GROUP BY email_events.campaign_id) p ON ((p.campaign_id = c.id)));


--
-- Name: email_sends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sends (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid,
    partner_id uuid,
    recipient text NOT NULL,
    resend_id text,
    status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_suppressions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppressions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid,
    email text NOT NULL,
    reason text DEFAULT 'unsubscribe'::text NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    email text NOT NULL,
    name text,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT event_invites_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'csv'::text, 'past_attendee'::text, 'subscriber'::text]))),
    CONSTRAINT event_invites_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text])))
);


--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid,
    guest_email text,
    guest_name text,
    tier_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_registrations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'auto_approved'::text, 'cancelled'::text]))),
    CONSTRAINT registration_has_identity CHECK (((user_id IS NOT NULL) OR (guest_email IS NOT NULL)))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organizer_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    event_type public.event_type DEFAULT 'other'::public.event_type,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    address text,
    venue_name text,
    start_datetime timestamp with time zone NOT NULL,
    end_datetime timestamp with time zone,
    capacity integer NOT NULL,
    tickets_sold integer DEFAULT 0,
    ticket_price numeric(10,2) NOT NULL,
    min_tickets_per_purchase integer DEFAULT 1,
    max_tickets_per_purchase integer DEFAULT 10,
    cover_image_url text,
    images jsonb,
    status public.event_status DEFAULT 'draft'::public.event_status,
    is_featured boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    city text,
    sales_end_datetime timestamp with time zone,
    video_url text,
    description_html text,
    theme_color text DEFAULT '#000000'::text,
    layout_config jsonb DEFAULT '{"order": ["hero", "title", "details", "about", "gallery", "organizer"], "hidden": []}'::jsonb,
    location public.geography(Point,4326),
    custom_tos text,
    seating_type text DEFAULT 'general_admission'::text NOT NULL,
    max_seats_per_order integer DEFAULT 10,
    search_vector tsvector,
    is_external boolean DEFAULT false NOT NULL,
    external_ticket_url text,
    external_provider_name text,
    require_approval boolean DEFAULT false NOT NULL,
    hide_venue_until_registered boolean DEFAULT false NOT NULL,
    approval_email_subject text,
    approval_email_body text,
    rejection_email_subject text,
    rejection_email_body text,
    subscriber_early_access_hours integer,
    required_tier_id uuid,
    is_subscriber_only boolean DEFAULT false NOT NULL,
    invite_only boolean DEFAULT false NOT NULL,
    CONSTRAINT events_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT events_seating_type_check CHECK ((seating_type = ANY (ARRAY['general_admission'::text, 'assigned_seating'::text]))),
    CONSTRAINT events_ticket_price_check CHECK ((ticket_price >= (0)::numeric)),
    CONSTRAINT events_tickets_sold_check CHECK ((tickets_sold >= 0)),
    CONSTRAINT images_max_count CHECK ((jsonb_array_length(images) <= 5)),
    CONSTRAINT max_tickets_reasonable CHECK ((max_tickets_per_purchase <= capacity)),
    CONSTRAINT max_tickets_valid CHECK ((max_tickets_per_purchase >= min_tickets_per_purchase)),
    CONSTRAINT min_tickets_positive CHECK ((min_tickets_per_purchase >= 1)),
    CONSTRAINT tickets_sold_within_capacity CHECK ((tickets_sold <= capacity)),
    CONSTRAINT valid_datetime_range CHECK (((end_datetime IS NULL) OR (end_datetime > start_datetime))),
    CONSTRAINT valid_ticket_purchase_limits CHECK ((max_tickets_per_purchase >= min_tickets_per_purchase))
);


--
-- Name: TABLE events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.events IS 'Ticketed events created by verified partners';


--
-- Name: COLUMN events.min_tickets_per_purchase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.min_tickets_per_purchase IS 'Minimum number of tickets a user must purchase in one order (default: 1)';


--
-- Name: COLUMN events.max_tickets_per_purchase; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.max_tickets_per_purchase IS 'Maximum number of tickets a user can purchase in one order (default: 10)';


--
-- Name: COLUMN events.images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.images IS 'Array of additional event image URLs (max 5)';


--
-- Name: COLUMN events.city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.city IS 'City extracted from Google Places address';


--
-- Name: COLUMN events.sales_end_datetime; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.sales_end_datetime IS 'When ticket sales automatically close';


--
-- Name: COLUMN events.custom_tos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.custom_tos IS 'Event-specific Terms of Service (overrides organizer default if set)';


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    purchase_intent_id uuid,
    event_id uuid NOT NULL,
    user_id uuid,
    ticket_number text NOT NULL,
    qr_code text,
    status public.ticket_status DEFAULT 'valid'::public.ticket_status,
    checked_in_at timestamp with time zone,
    checked_in_by uuid,
    tier text DEFAULT 'general_admission'::text,
    seat_info jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    guest_email text,
    guest_name text,
    tier_id uuid,
    held_until timestamp with time zone,
    seat_id uuid,
    registration_id uuid
);


--
-- Name: TABLE tickets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tickets IS 'Individual tickets issued after successful payment';


--
-- Name: COLUMN tickets.tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.tier IS 'Legacy tier identifier (deprecated, use tier_id)';


--
-- Name: COLUMN tickets.tier_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tickets.tier_id IS 'Reference to ticket tier (NULL for legacy tickets, use TEXT tier column)';


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    purchase_intent_id uuid NOT NULL,
    event_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    user_id uuid,
    gross_amount numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    payment_processing_fee numeric(10,2) NOT NULL,
    organizer_payout numeric(10,2) NOT NULL,
    fee_percentage numeric(5,2) NOT NULL,
    fee_basis text,
    xendit_transaction_id text,
    status public.transaction_status DEFAULT 'pending'::public.transaction_status,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fixed_fee numeric(10,2),
    payout_id uuid
);


--
-- Name: TABLE transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.transactions IS 'Financial records for accounting and reconciliation';


--
-- Name: COLUMN transactions.fixed_fee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.fixed_fee IS 'The fixed fee amount (customer paid fee) related to the transaction.';


--
-- Name: COLUMN transactions.payout_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.transactions.payout_id IS 'The payout request that includes this transaction.';


--
-- Name: event_sales_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.event_sales_summary AS
 SELECT e.id AS event_id,
    e.title,
    e.start_datetime,
    e.capacity,
    e.tickets_sold,
    count(DISTINCT ti.id) AS total_tickets_issued,
    count(DISTINCT ti.id) FILTER (WHERE (ti.status = 'used'::public.ticket_status)) AS tickets_used,
    COALESCE(sum(tr.gross_amount), (0)::numeric) AS total_revenue,
    COALESCE(sum(tr.platform_fee), (0)::numeric) AS platform_revenue,
    COALESCE(sum(tr.organizer_payout), (0)::numeric) AS organizer_revenue
   FROM ((public.events e
     LEFT JOIN public.tickets ti ON ((ti.event_id = e.id)))
     LEFT JOIN public.transactions tr ON (((tr.event_id = e.id) AND (tr.status = 'completed'::public.transaction_status))))
  GROUP BY e.id, e.title, e.start_datetime, e.capacity, e.tickets_sold
  WITH NO DATA;


--
-- Name: event_seat_maps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_seat_maps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    template_id uuid,
    canvas_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    canvas_width integer DEFAULT 1400 NOT NULL,
    canvas_height integer DEFAULT 900 NOT NULL,
    pricing_mode text DEFAULT 'per_section'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT event_seat_maps_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['per_section'::text, 'per_seat'::text])))
);


--
-- Name: event_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seat_map_id uuid NOT NULL,
    event_id uuid NOT NULL,
    template_section_id uuid,
    label text NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    polygon_points double precision[] NOT NULL,
    arc_config jsonb,
    tier_id uuid,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    row_tier_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    section_type text DEFAULT 'general'::text NOT NULL
);


--
-- Name: event_subscription_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_subscription_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    subscription_tier_id uuid NOT NULL,
    discount_type text NOT NULL,
    discount_value numeric NOT NULL,
    max_tickets integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_subscription_discounts_discount_type_check CHECK ((discount_type = ANY (ARRAY['fixed_price'::text, 'percentage'::text]))),
    CONSTRAINT event_subscription_discounts_discount_value_check CHECK ((discount_value > (0)::numeric))
);


--
-- Name: event_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_views (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    event_id uuid NOT NULL,
    user_id uuid,
    viewed_at timestamp with time zone DEFAULT now(),
    source text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE event_views; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.event_views IS 'Tracks event view analytics for conversion funnel';


--
-- Name: experience_purchase_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experience_purchase_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    table_id uuid NOT NULL,
    schedule_id uuid,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    xendit_invoice_id text,
    xendit_invoice_url text,
    xendit_external_id text,
    payment_method text,
    status text DEFAULT 'pending'::text,
    expires_at timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    guest_email text,
    guest_name text,
    guest_phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    fee_percentage numeric(5,2),
    fees_passed_to_customer boolean,
    check_in_status text DEFAULT 'pending'::text,
    checked_in_at timestamp with time zone,
    checked_in_by uuid,
    CONSTRAINT experience_purchase_intents_check_in_status_check CHECK ((check_in_status = ANY (ARRAY['pending'::text, 'checked_in'::text, 'no_show'::text]))),
    CONSTRAINT experience_purchase_intents_platform_fee_check CHECK ((platform_fee >= (0)::numeric)),
    CONSTRAINT experience_purchase_intents_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT experience_purchase_intents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'expired'::text, 'refunded'::text]))),
    CONSTRAINT experience_purchase_intents_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT experience_purchase_intents_total_amount_check CHECK ((total_amount >= (0)::numeric)),
    CONSTRAINT experience_purchase_intents_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: experience_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experience_reviews (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    experience_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rating integer NOT NULL,
    review_text text,
    communication_rating integer,
    value_rating integer,
    organization_rating integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT experience_reviews_communication_rating_check CHECK (((communication_rating >= 1) AND (communication_rating <= 5))),
    CONSTRAINT experience_reviews_organization_rating_check CHECK (((organization_rating >= 1) AND (organization_rating <= 5))),
    CONSTRAINT experience_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT experience_reviews_value_rating_check CHECK (((value_rating >= 1) AND (value_rating <= 5)))
);


--
-- Name: experience_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experience_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    max_guests integer NOT NULL,
    current_guests integer DEFAULT 0,
    price_per_person numeric(10,2),
    status text DEFAULT 'open'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT experience_schedules_status_check CHECK ((status = ANY (ARRAY['open'::text, 'full'::text, 'cancelled'::text, 'completed'::text])))
);


--
-- Name: experience_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.experience_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_intent_id uuid NOT NULL,
    table_id uuid NOT NULL,
    host_id uuid NOT NULL,
    user_id uuid NOT NULL,
    gross_amount numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    host_payout numeric(10,2) NOT NULL,
    xendit_transaction_id text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    partner_id uuid,
    payout_id uuid,
    CONSTRAINT experience_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: fan_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fan_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fan_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    status text NOT NULL,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancelled_at timestamp with time zone,
    payrex_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payrex_customer_id text,
    payrex_payment_method_id text,
    CONSTRAINT fan_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'grace_period'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    status text DEFAULT 'pending'::text,
    last_read_at timestamp with time zone,
    joined_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE group_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.group_members IS 'Membership roster for groups with role-based access';


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    rules text,
    cover_image_url text,
    icon_emoji text,
    category text DEFAULT 'other'::text,
    privacy text DEFAULT 'public'::text,
    location_city text,
    location_lat double precision,
    location_lng double precision,
    created_by uuid NOT NULL,
    member_count integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subscription_tier_id uuid,
    group_type text DEFAULT 'community'::text NOT NULL,
    broadcast_mode boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.groups IS 'Persistent community groups (Strava clubs / FB groups)';


--
-- Name: purchase_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_intents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    event_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    platform_fee numeric(10,2) NOT NULL,
    payment_processing_fee numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    fee_percentage numeric(5,2),
    pricing_note text,
    xendit_invoice_id text,
    xendit_invoice_url text,
    xendit_external_id text,
    payment_method text,
    status public.purchase_intent_status DEFAULT 'pending'::public.purchase_intent_status,
    expires_at timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    guest_email text,
    guest_name text,
    guest_phone text,
    tier_id uuid,
    promo_code_id uuid,
    discount_amount numeric(10,2) DEFAULT 0.00,
    subscribed_to_newsletter boolean DEFAULT false,
    refunded_amount numeric(10,2) DEFAULT 0.00,
    refunded_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    access_token uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT check_purchaser_identity CHECK (((user_id IS NOT NULL) OR ((guest_email IS NOT NULL) AND (guest_name IS NOT NULL)))),
    CONSTRAINT purchase_intents_payment_processing_fee_check CHECK ((payment_processing_fee >= (0)::numeric)),
    CONSTRAINT purchase_intents_platform_fee_check CHECK ((platform_fee >= (0)::numeric)),
    CONSTRAINT purchase_intents_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT purchase_intents_refunded_amount_check CHECK ((refunded_amount >= (0)::numeric)),
    CONSTRAINT purchase_intents_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT purchase_intents_total_amount_check CHECK ((total_amount >= (0)::numeric)),
    CONSTRAINT purchase_intents_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: TABLE purchase_intents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.purchase_intents IS 'Tracks the purchase flow from intent to payment completion';


--
-- Name: COLUMN purchase_intents.tier_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_intents.tier_id IS 'Reference to specific ticket tier purchased (NULL for legacy purchases)';


--
-- Name: COLUMN purchase_intents.promo_code_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_intents.promo_code_id IS 'The promo code applied to this purchase';


--
-- Name: COLUMN purchase_intents.discount_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_intents.discount_amount IS 'Total value stored in database currency (PHP) deducted from subtotal';


--
-- Name: high_traffic_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.high_traffic_events AS
 SELECT e.id,
    e.title,
    e.start_datetime,
    e.capacity,
    e.tickets_sold,
    count(DISTINCT pi.id) AS purchase_attempts,
    count(DISTINCT pi.id) FILTER (WHERE (pi.status = 'completed'::public.purchase_intent_status)) AS successful_purchases,
    count(DISTINCT pi.id) FILTER (WHERE (pi.status = 'failed'::public.purchase_intent_status)) AS failed_purchases,
    round((((count(DISTINCT pi.id) FILTER (WHERE (pi.status = 'completed'::public.purchase_intent_status)))::numeric / (NULLIF(count(DISTINCT pi.id), 0))::numeric) * (100)::numeric), 2) AS success_rate_pct
   FROM (public.events e
     LEFT JOIN public.purchase_intents pi ON ((pi.event_id = e.id)))
  WHERE (e.start_datetime > (now() - '30 days'::interval))
  GROUP BY e.id, e.title, e.start_datetime, e.capacity, e.tickets_sold
 HAVING (count(DISTINCT pi.id) > 50)
  ORDER BY (count(DISTINCT pi.id)) DESC;


--
-- Name: interest_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interest_tags (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    category public.interest_category_type DEFAULT 'other'::public.interest_category_type NOT NULL,
    icon text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content text,
    image_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    image_urls text[],
    city text,
    h3_cell text,
    latitude double precision,
    longitude double precision,
    post_type text DEFAULT 'text'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    visibility text DEFAULT 'public'::text,
    marker_asset text,
    gif_url text,
    event_id uuid,
    video_url text,
    table_id uuid,
    is_story boolean DEFAULT false,
    vibe_tag text,
    external_place_id text,
    external_place_name text,
    mentioned_user_ids uuid[] DEFAULT '{}'::uuid[],
    location public.geography(Point,4326),
    group_id uuid,
    thumbnail_url text,
    like_count integer DEFAULT 0 NOT NULL,
    comment_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT posts_post_type_check CHECK ((post_type = ANY (ARRAY['text'::text, 'image'::text, 'hangout'::text, 'video'::text]))),
    CONSTRAINT posts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'followers'::text, 'private'::text])))
);


--
-- Name: COLUMN posts.post_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.post_type IS 'Type of post: text, image, or hangout (auto-generated)';


--
-- Name: COLUMN posts.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.metadata IS 'JSON metadata for special post types (e.g., table headers)';


--
-- Name: COLUMN posts.visibility; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.visibility IS 'Visibility scope: public, followers, or private';


--
-- Name: COLUMN posts.marker_asset; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.marker_asset IS 'Path to the 3D GLB model asset for map markers (e.g. assets/models/pizza.glb)';


--
-- Name: COLUMN posts.gif_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.gif_url IS 'URL to Tenor GIF (mutually exclusive with image_urls)';


--
-- Name: COLUMN posts.event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.event_id IS 'Link to an event. If present, the post should render an event attachment card.';


--
-- Name: COLUMN posts.video_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.posts.video_url IS 'URL for video content in the post';


--
-- Name: map_live_stories_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.map_live_stories_view AS
 SELECT p.event_id,
    p.table_id,
    p.external_place_id,
    p.external_place_name,
    p.latitude,
    p.longitude,
    p.location,
    count(p.id) AS story_count,
    max(p.created_at) AS latest_story_time,
    (array_agg(p.id ORDER BY p.created_at DESC))[1] AS id,
    (array_agg(COALESCE(p.image_url, p.thumbnail_url) ORDER BY p.created_at DESC))[1] AS image_url,
    (array_agg(p.video_url ORDER BY p.created_at DESC))[1] AS video_url,
    (array_agg(p.user_id ORDER BY p.created_at DESC))[1] AS author_id,
    (array_agg(u.display_name ORDER BY p.created_at DESC))[1] AS author_name,
    (array_agg(COALESCE(u.avatar_url, up_photo.photo_url) ORDER BY p.created_at DESC))[1] AS author_avatar_url
   FROM ((public.posts p
     LEFT JOIN public.users u ON ((p.user_id = u.id)))
     LEFT JOIN public.user_photos up_photo ON (((u.id = up_photo.user_id) AND (up_photo.is_primary = true))))
  WHERE ((p.is_story = true) AND (p.created_at > (now() - '24:00:00'::interval)))
  GROUP BY p.event_id, p.table_id, p.external_place_id, p.external_place_name, p.latitude, p.longitude, p.location;


--
-- Name: map_ready_tables; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.map_ready_tables AS
 SELECT t.id,
    t.title,
    t.description,
    t.location_name AS venue_name,
    t.venue_address,
    t.latitude AS location_lat,
    t.longitude AS location_lng,
    t.location,
    t.datetime AS scheduled_time,
    t.max_guests AS max_capacity,
    t.status,
    t.current_capacity,
    t.marker_image_url,
    t.marker_emoji,
    t.image_url,
    t.images,
    t.cuisine_type AS activity_type,
    t.price_per_person,
    t.dietary_restrictions AS budget_range,
    t.visibility,
    t.experience_type,
    t.video_url,
    t.currency,
    t.is_experience,
    t.requirements,
    t.included_items,
    t.verified_by_hanghut,
    t.host_id,
    COALESCE(u.display_name, 'Unknown Host'::text) AS host_name,
    ( SELECT up.photo_url
           FROM public.user_photos up
          WHERE (up.user_id = t.host_id)
          ORDER BY up.is_primary DESC, up.sort_order
         LIMIT 1) AS host_photo_url,
    COALESCE(u.trust_score, 0) AS host_trust_score,
    t.current_capacity AS member_count,
    (t.max_guests - t.current_capacity) AS seats_left,
        CASE
            WHEN (t.current_capacity >= t.max_guests) THEN 'full'::text
            WHEN ((t.current_capacity)::numeric >= ((t.max_guests)::numeric * 0.8)) THEN 'filling_up'::text
            ELSE 'available'::text
        END AS availability_state
   FROM (public.tables t
     LEFT JOIN public.users u ON ((t.host_id = u.id)))
  WHERE ((t.status = 'open'::text) AND (t.datetime > now()) AND ((t.is_experience = false) OR (t.is_experience IS NULL) OR (t.verified_by_hanghut = true)));


--
-- Name: matching_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matching_queue (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    timeframe_preference public.timeframe_preference_type DEFAULT 'today'::public.timeframe_preference_type NOT NULL,
    custom_date timestamp with time zone,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.queue_status_type DEFAULT 'pending'::public.queue_status_type NOT NULL,
    matched_table_id uuid,
    matched_at timestamp with time zone
);


--
-- Name: message_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    content_type text DEFAULT 'text'::text,
    reply_to_id uuid,
    deleted_at timestamp with time zone,
    deleted_for_everyone boolean DEFAULT false,
    gif_url text,
    sender_name text,
    sequence_number bigint NOT NULL,
    group_id uuid,
    is_pinned boolean DEFAULT false NOT NULL,
    pinned_by uuid,
    pinned_at timestamp with time zone,
    CONSTRAINT messages_content_type_check CHECK ((content_type = ANY (ARRAY['text'::text, 'gif'::text, 'image'::text, 'poll'::text, 'system'::text])))
);


--
-- Name: COLUMN messages.sequence_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.sequence_number IS 'Server-assigned monotonically increasing sequence number for guaranteed message ordering. Never use client timestamps for ordering.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid NOT NULL,
    actor_id uuid,
    type text NOT NULL,
    entity_id uuid,
    title text NOT NULL,
    body text,
    is_read boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['like'::text, 'comment'::text, 'follow'::text, 'mention'::text, 'badge_earned'::text, 'trip_match'::text, 'hangout_invite'::text, 'follower_hangout'::text, 'group_join_request'::text, 'group_approved'::text, 'friend_joined'::text, 'chat'::text, 'join_request'::text, 'new_follower'::text, 'ticket_confirmed'::text, 'new_event'::text, 'event_reminder_24h'::text, 'event_reminder_1h'::text, 'member_joined'::text, 'subscription_confirmed'::text, 'subscription_expired'::text, 'kyc_verified'::text, 'kyc_rejected'::text])))
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'Stores user notifications for the Activity Feed';


--
-- Name: partner_followers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_followers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: partner_gateway_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_gateway_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    provider text NOT NULL,
    account_id text,
    account_holder_id text,
    verification_id text,
    kyc_status text,
    file_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_response jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partner_gateway_accounts_provider_check CHECK ((provider = ANY (ARRAY['xendit'::text, 'payrex'::text])))
);


--
-- Name: partner_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    email text NOT NULL,
    role text NOT NULL,
    token uuid DEFAULT gen_random_uuid(),
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invited_by uuid,
    CONSTRAINT partner_invites_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'viewer'::text, 'scanner'::text, 'finance'::text, 'marketing'::text]))),
    CONSTRAINT partner_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text])))
);


--
-- Name: partner_kyc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_kyc_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    owner_kind text DEFAULT 'business'::text NOT NULL,
    owner_id uuid,
    doc_type text NOT NULL,
    storage_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partner_kyc_documents_owner_kind_check CHECK ((owner_kind = ANY (ARRAY['business'::text, 'authorized_person'::text, 'stakeholder'::text])))
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    business_name text NOT NULL,
    business_type text,
    registration_number text,
    tax_id text,
    bank_name text,
    bank_account_number text,
    bank_account_name text,
    pricing_model public.partner_pricing_model DEFAULT 'standard'::public.partner_pricing_model,
    custom_percentage numeric(5,2),
    custom_per_ticket numeric(10,2),
    promotional_until timestamp with time zone,
    volume_tier_enabled boolean DEFAULT false,
    status public.partner_status DEFAULT 'pending'::public.partner_status,
    verified boolean DEFAULT false,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone,
    profile_photo_url text,
    description text,
    slug text,
    cover_image_url text,
    social_links jsonb DEFAULT '{}'::jsonb,
    branding jsonb DEFAULT '{}'::jsonb,
    payout_limit numeric DEFAULT 50000,
    auto_approve_enabled boolean DEFAULT false,
    representative_name text,
    contact_number text,
    work_email text,
    kyc_status public.kyc_status_type DEFAULT 'not_started'::public.kyc_status_type,
    kyc_rejection_reason text,
    id_document_url text,
    business_document_url text,
    terms_version text,
    terms_accepted_at timestamp with time zone,
    terms_accepted_ip inet,
    digital_signature_text text,
    pass_fees_to_customer boolean DEFAULT false,
    fixed_fee_per_ticket numeric(10,2) DEFAULT 15.00,
    auto_approve_payouts boolean DEFAULT false,
    xendit_account_id text,
    bir_2303_url text,
    xendit_account_holder_id text,
    split_rule_id text,
    platform_fee_receivable numeric DEFAULT 0,
    nationality text,
    place_of_birth text,
    street_line1 text,
    street_line2 text,
    city text,
    province_state text,
    postal_code text,
    articles_of_incorporation_url text,
    secretary_certificate_url text,
    latest_gis_url text,
    custom_tos text,
    custom_domain text,
    custom_domain_verified boolean DEFAULT false NOT NULL,
    custom_domain_added_at timestamp with time zone,
    use_main_wallet boolean DEFAULT false NOT NULL,
    show_membership_tab boolean DEFAULT false NOT NULL,
    capabilities text[] DEFAULT '{organizer}'::text[] NOT NULL,
    business_industry_subcategory text,
    business_establishment_date date,
    business_intents text[],
    business_source_of_funds text[],
    business_average_monthly_basket_size text,
    money_out_transaction_frequency text,
    business_phone_country_code text,
    business_phone_number text,
    legal_entity_address jsonb,
    authorized_person_first_name text,
    authorized_person_last_name text,
    authorized_person_gender text,
    authorized_person_date_of_birth date,
    authorized_person_role text,
    authorized_person_nationality text,
    authorized_person_email text,
    authorized_person_mobile_country_code text,
    authorized_person_mobile_number text,
    authorized_person_address jsonb,
    contact_person_first_name text,
    contact_person_last_name text,
    contact_person_email text,
    contact_person_mobile_country_code text,
    contact_person_mobile_number text,
    authorized_person_identification jsonb,
    xendit_cards_gcash_live boolean DEFAULT false NOT NULL,
    subscriptions_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT valid_custom_per_ticket CHECK (((custom_per_ticket IS NULL) OR (custom_per_ticket >= (0)::numeric))),
    CONSTRAINT valid_custom_percentage CHECK (((custom_percentage IS NULL) OR ((custom_percentage >= (0)::numeric) AND (custom_percentage <= (100)::numeric))))
);


--
-- Name: TABLE partners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.partners IS 'Event organizers who can create and manage ticketed events';


--
-- Name: COLUMN partners.profile_photo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.profile_photo_url IS 'Profile photo URL for organizer avatar in event cards';


--
-- Name: COLUMN partners.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.description IS 'About the organizer - shown in event details';


--
-- Name: COLUMN partners.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.slug IS 'Unique identifier for the partner storefront URL';


--
-- Name: COLUMN partners.social_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.social_links IS 'JSON object containing social media URLs (facebook, instagram, website, etc)';


--
-- Name: COLUMN partners.branding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.branding IS 'Partner storefront branding: colors, cover_image, favicon, bio, tagline, social_links';


--
-- Name: COLUMN partners.kyc_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.kyc_status IS 'Status of the Know Your Customer verification process';


--
-- Name: COLUMN partners.digital_signature_text; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.digital_signature_text IS 'The text input (full name) provided by user as signature';


--
-- Name: COLUMN partners.pass_fees_to_customer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.pass_fees_to_customer IS 'If true, fee is added on top (Customer pays). If false, fee is deducted from payout (Host pays).';


--
-- Name: COLUMN partners.fixed_fee_per_ticket; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.fixed_fee_per_ticket IS 'A fixed amount (in PHP) added to the ticket price, payable by customer, collected by platform.';


--
-- Name: COLUMN partners.auto_approve_payouts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.auto_approve_payouts IS 'If true, payout requests from this partner bypass manual admin review and are disbursed automatically via Xendit';


--
-- Name: COLUMN partners.custom_tos; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.custom_tos IS 'Organizer custom Terms of Service shown at checkout (default for all events)';


--
-- Name: COLUMN partners.custom_domain; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.custom_domain IS 'Custom domain for the partner storefront (e.g. tickets.theirdomain.com)';


--
-- Name: COLUMN partners.custom_domain_verified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.custom_domain_verified IS 'Whether Vercel has verified DNS for this custom domain';


--
-- Name: COLUMN partners.use_main_wallet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.partners.use_main_wallet IS 'When true, create-purchase-intent skips sub-account routing (for-user-id), split rule, and the PLATFORM fee override — payment settles directly to the main Xendit account. Used for first-party events.';


--
-- Name: partner_performance_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.partner_performance_summary AS
 SELECT p.id AS partner_id,
    p.business_name,
    count(DISTINCT e.id) AS total_events,
    COALESCE(sum(e.tickets_sold), (0)::bigint) AS total_tickets_sold,
    COALESCE(sum(t.organizer_payout), (0)::numeric) AS total_earnings,
    COALESCE(sum(t.platform_fee), (0)::numeric) AS total_platform_fees,
    max(e.start_datetime) AS last_event_date,
    count(DISTINCT e.id) FILTER (WHERE (e.status = 'active'::public.event_status)) AS active_events
   FROM ((public.partners p
     LEFT JOIN public.events e ON ((e.organizer_id = p.id)))
     LEFT JOIN public.transactions t ON (((t.partner_id = p.id) AND (t.status = 'completed'::public.transaction_status))))
  WHERE (p.status = 'approved'::public.partner_status)
  GROUP BY p.id, p.business_name
  WITH NO DATA;


--
-- Name: partner_stakeholders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_stakeholders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    nationality text,
    date_of_birth date,
    is_authorized_person boolean DEFAULT false NOT NULL,
    address jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    identification jsonb
);


--
-- Name: partner_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    source text DEFAULT 'checkout'::text,
    subscribed_at timestamp with time zone DEFAULT now(),
    unsubscribed_at timestamp with time zone,
    is_active boolean DEFAULT true,
    unsubscribe_token uuid DEFAULT gen_random_uuid(),
    created_at timestamp with time zone DEFAULT now(),
    event_id uuid
);


--
-- Name: partner_team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.partner_role DEFAULT 'scanner'::public.partner_role NOT NULL,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);


--
-- Name: TABLE partner_team_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.partner_team_members IS 'Team members with role-based access: owner, manager, scanner';


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    partner_id uuid NOT NULL,
    event_id uuid,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'PHP'::text,
    bank_name text NOT NULL,
    bank_account_number text NOT NULL,
    bank_account_name text NOT NULL,
    xendit_disbursement_id text,
    xendit_external_id text,
    status public.payout_status DEFAULT 'pending_request'::public.payout_status,
    requested_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    approved_by uuid,
    processed_at timestamp with time zone,
    completed_at timestamp with time zone,
    admin_notes text,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    table_id uuid,
    CONSTRAINT payouts_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: TABLE payouts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payouts IS 'Organizer payout requests and disbursement tracking';


--
-- Name: post_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_bookmarks (
    user_id uuid NOT NULL,
    post_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rules (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    partner_id uuid NOT NULL,
    rule_name text NOT NULL,
    rule_type text NOT NULL,
    conditions jsonb NOT NULL,
    fee_percentage numeric(5,2),
    per_ticket_fee numeric(10,2),
    active boolean DEFAULT true,
    starts_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE pricing_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_rules IS 'Custom pricing rules for specific partners (admin-configured)';


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid,
    code text NOT NULL,
    discount_type public.discount_type NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    usage_limit integer,
    usage_count integer DEFAULT 0,
    starts_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    app_only boolean DEFAULT false NOT NULL,
    CONSTRAINT valid_percentage CHECK ((((discount_type = 'percentage'::public.discount_type) AND (discount_amount <= (100)::numeric) AND (discount_amount > (0)::numeric)) OR ((discount_type = 'fixed_amount'::public.discount_type) AND (discount_amount > (0)::numeric))))
);


--
-- Name: ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    table_id uuid NOT NULL,
    rater_user_id uuid NOT NULL,
    rated_user_id uuid NOT NULL,
    overall_score integer NOT NULL,
    friendliness_score integer NOT NULL,
    punctuality_score integer NOT NULL,
    engagement_score integer NOT NULL,
    review_text text,
    is_no_show boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ratings_check CHECK ((rater_user_id <> rated_user_id)),
    CONSTRAINT ratings_engagement_score_check CHECK (((engagement_score >= 1) AND (engagement_score <= 5))),
    CONSTRAINT ratings_friendliness_score_check CHECK (((friendliness_score >= 1) AND (friendliness_score <= 5))),
    CONSTRAINT ratings_overall_score_check CHECK (((overall_score >= 1) AND (overall_score <= 5))),
    CONSTRAINT ratings_punctuality_score_check CHECK (((punctuality_score >= 1) AND (punctuality_score <= 5)))
);


--
-- Name: registration_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    answer text,
    created_at timestamp with time zone DEFAULT now(),
    registration_id uuid NOT NULL
);


--
-- Name: registration_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registration_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    label text NOT NULL,
    question_type text NOT NULL,
    options jsonb,
    is_required boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT registration_questions_question_type_check CHECK ((question_type = ANY (ARRAY['short_text'::text, 'long_text'::text, 'single_choice'::text, 'multi_choice'::text, 'checkbox'::text, 'social_profile'::text, 'url'::text, 'company'::text])))
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    reporter_id uuid,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reason_category text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text]))),
    CONSTRAINT reports_target_type_check CHECK ((target_type = ANY (ARRAY['user'::text, 'post'::text, 'table'::text, 'message'::text, 'app'::text, 'other'::text])))
);


--
-- Name: seat_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seat_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seat_id uuid NOT NULL,
    session_id text NOT NULL,
    user_id uuid,
    expires_at timestamp with time zone DEFAULT (now() + '00:12:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: seats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_id uuid NOT NULL,
    event_id uuid NOT NULL,
    row_label text NOT NULL,
    seat_number integer NOT NULL,
    label text NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    custom_price numeric(10,2),
    status text DEFAULT 'available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tier_id uuid,
    CONSTRAINT seats_status_check CHECK ((status = ANY (ARRAY['available'::text, 'booked'::text, 'disabled'::text])))
);


--
-- Name: story_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    viewer_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    fan_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    perk_type text NOT NULL,
    perk_label text NOT NULL,
    claim_period text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    organizer_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fulfilled_at timestamp with time zone,
    CONSTRAINT subscription_claims_perk_type_check CHECK ((perk_type = ANY (ARRAY['merch'::text, 'shoutout'::text]))),
    CONSTRAINT subscription_claims_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'rejected'::text])))
);


--
-- Name: subscription_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid NOT NULL,
    fan_id uuid NOT NULL,
    partner_id uuid NOT NULL,
    amount numeric NOT NULL,
    platform_fee numeric NOT NULL,
    payrex_ref text NOT NULL,
    status text NOT NULL,
    billing_period_start timestamp with time zone NOT NULL,
    billing_period_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_payments_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'failed'::text, 'pending'::text])))
);


--
-- Name: subscription_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    image_url text,
    gated_url text,
    gated_url_label text,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: subscription_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price_monthly numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    long_description text,
    perks jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT subscription_tiers_price_monthly_check CHECK ((price_monthly > (0)::numeric))
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    ticket_type text DEFAULT 'account_appeal'::text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text,
    user_email text,
    user_display_name text,
    account_status text,
    account_status_reason text,
    admin_response text,
    admin_id uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: TABLE support_tickets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.support_tickets IS 'Support tickets for user appeals, bug reports, and feature requests';


--
-- Name: COLUMN support_tickets.ticket_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_tickets.ticket_type IS 'Type of ticket: account_appeal, bug_report, feature_request, other';


--
-- Name: COLUMN support_tickets.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.support_tickets.status IS 'Ticket status: open, in_progress, resolved, closed';


--
-- Name: table_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    table_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.member_role_type DEFAULT 'member'::public.member_role_type NOT NULL,
    status public.member_status_type DEFAULT 'pending'::public.member_status_type NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    joined_at timestamp with time zone,
    left_at timestamp with time zone,
    arrival_status text DEFAULT 'joined'::text NOT NULL,
    verified_at timestamp with time zone,
    verified_by uuid,
    last_read_at timestamp with time zone,
    rsvp_status text DEFAULT 'none'::text,
    is_muted boolean DEFAULT false NOT NULL,
    CONSTRAINT table_members_arrival_status_check CHECK ((arrival_status = ANY (ARRAY['joined'::text, 'omw'::text, 'arrived'::text, 'verified'::text, 'checked_in'::text]))),
    CONSTRAINT table_members_rsvp_status_check CHECK ((rsvp_status = ANY (ARRAY['none'::text, 'going'::text, 'maybe'::text, 'not_going'::text])))
);


--
-- Name: COLUMN table_members.arrival_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.table_members.arrival_status IS 'Real-time status: joined, omw, arrived, verified';


--
-- Name: COLUMN table_members.verified_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.table_members.verified_by IS 'The user ID who performed the P2P verification';


--
-- Name: table_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.table_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT table_participants_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text])))
);


--
-- Name: team_comms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_comms (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    from_team text NOT NULL,
    to_team text NOT NULL,
    category text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text,
    metadata jsonb DEFAULT '{}'::jsonb,
    thread_id bigint,
    CONSTRAINT team_comms_category_check CHECK ((category = ANY (ARRAY['schema_change'::text, 'edge_function'::text, 'api_contract'::text, 'action_needed'::text, 'status_update'::text, 'bug_report'::text, 'question'::text, 'announcement'::text]))),
    CONSTRAINT team_comms_from_team_check CHECK ((from_team = ANY (ARRAY['app'::text, 'web'::text, 'system'::text]))),
    CONSTRAINT team_comms_to_team_check CHECK ((to_team = ANY (ARRAY['app'::text, 'web'::text, 'both'::text])))
);


--
-- Name: team_comms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.team_comms ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.team_comms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: template_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    label text NOT NULL,
    polygon_points double precision[] NOT NULL,
    arc_config jsonb,
    row_count integer DEFAULT 0 NOT NULL,
    seats_per_row integer DEFAULT 0 NOT NULL,
    seat_orientation text DEFAULT 'straight'::text,
    default_color text DEFAULT '#6366f1'::text,
    section_type text DEFAULT 'general'::text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT template_sections_seat_orientation_check CHECK ((seat_orientation = ANY (ARRAY['straight'::text, 'arc'::text]))),
    CONSTRAINT template_sections_section_type_check CHECK ((section_type = ANY (ARRAY['vip'::text, 'general'::text, 'floor'::text, 'box'::text, 'balcony'::text, 'standing'::text])))
);


--
-- Name: ticket_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    quantity_total integer NOT NULL,
    quantity_sold integer DEFAULT 0 NOT NULL,
    min_per_order integer DEFAULT 1,
    max_per_order integer DEFAULT 10,
    sales_start timestamp with time zone,
    sales_end timestamp with time zone,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    subscriber_price numeric,
    CONSTRAINT ticket_tiers_check CHECK ((max_per_order >= min_per_order)),
    CONSTRAINT ticket_tiers_check1 CHECK ((quantity_sold <= quantity_total)),
    CONSTRAINT ticket_tiers_check2 CHECK (((sales_end IS NULL) OR (sales_start IS NULL) OR (sales_end > sales_start))),
    CONSTRAINT ticket_tiers_min_per_order_check CHECK ((min_per_order >= 1)),
    CONSTRAINT ticket_tiers_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT ticket_tiers_quantity_sold_check CHECK ((quantity_sold >= 0)),
    CONSTRAINT ticket_tiers_quantity_total_check CHECK ((quantity_total > 0))
);


--
-- Name: TABLE ticket_tiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ticket_tiers IS 'Multiple ticket types/tiers per event (VIP, GA, Early Bird, etc.)';


--
-- Name: COLUMN ticket_tiers.quantity_sold; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ticket_tiers.quantity_sold IS 'Updated by trigger on ticket_purchases';


--
-- Name: travel_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_matches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    travel_plan_id_1 uuid NOT NULL,
    travel_plan_id_2 uuid NOT NULL,
    match_score integer NOT NULL,
    ably_channel_id text,
    matched_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.travel_match_status_type DEFAULT 'active'::public.travel_match_status_type NOT NULL,
    CONSTRAINT travel_matches_check CHECK ((travel_plan_id_1 < travel_plan_id_2)),
    CONSTRAINT travel_matches_match_score_check CHECK (((match_score >= 0) AND (match_score <= 100)))
);


--
-- Name: travel_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    destination_city text NOT NULL,
    destination_country text NOT NULL,
    destination_lat double precision NOT NULL,
    destination_lng double precision NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    trip_purpose public.trip_purpose_type DEFAULT 'vacation'::public.trip_purpose_type NOT NULL,
    status public.travel_status_type DEFAULT 'planning'::public.travel_status_type NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT travel_plans_check CHECK ((end_date >= start_date))
);


--
-- Name: trip_chat_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_chat_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    chat_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    last_read_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE trip_chat_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trip_chat_participants IS 'Participants in trip group chats';


--
-- Name: trip_group_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_group_chats (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    destination_city text NOT NULL,
    destination_country text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    ably_channel_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE trip_group_chats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trip_group_chats IS 'Group chats for travelers going to same destination';


--
-- Name: user_trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_trips (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    destination_city text NOT NULL,
    destination_country text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    travel_style text,
    interests text[],
    goals text[],
    description text,
    status text DEFAULT 'upcoming'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_dates CHECK ((end_date >= start_date)),
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['upcoming'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE user_trips; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_trips IS 'Stores user future trip plans for matching with other travelers';


--
-- Name: trip_matches; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.trip_matches AS
 SELECT DISTINCT t1.id AS trip_id,
    t1.user_id,
    t2.user_id AS matched_user_id,
    t2.id AS matched_trip_id,
    t1.destination_city,
    t1.destination_country,
    GREATEST(t1.start_date, t2.start_date) AS overlap_start,
    LEAST(t1.end_date, t2.end_date) AS overlap_end,
    ((LEAST(t1.end_date, t2.end_date) - GREATEST(t1.start_date, t2.start_date)) + 1) AS overlap_days
   FROM (public.user_trips t1
     JOIN public.user_trips t2 ON (((t1.destination_city = t2.destination_city) AND (t1.destination_country = t2.destination_country) AND (t1.id <> t2.id) AND (t1.user_id <> t2.user_id) AND (t1.status = 'upcoming'::text) AND (t2.status = 'upcoming'::text) AND (t1.start_date <= t2.end_date) AND (t1.end_date >= t2.start_date))));


--
-- Name: VIEW trip_matches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.trip_matches IS 'Returns users with overlapping trips to the same destination';


--
-- Name: trip_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    chat_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    sent_at timestamp with time zone DEFAULT now(),
    sequence_number bigint NOT NULL,
    reply_to_id uuid,
    gif_url text,
    deleted_at timestamp with time zone,
    deleted_for_everyone boolean DEFAULT false,
    sender_name text
);


--
-- Name: TABLE trip_messages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trip_messages IS 'Messages in trip group chats';


--
-- Name: COLUMN trip_messages.sequence_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trip_messages.sequence_number IS 'Server-assigned monotonically increasing sequence number for guaranteed message ordering. Auto-incremented per chat_id.';


--
-- Name: trip_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    trip_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'member'::text
);


--
-- Name: TABLE trip_participants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trip_participants IS 'Junction table for group trip participants';


--
-- Name: user_active_chats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_active_chats AS
 SELECT chat_id,
    user_id,
    chat_type,
    title,
    subtitle,
    image_url,
    icon_key,
    last_activity_at,
    metadata,
    (unread_count)::bigint AS unread_count,
    has_unread
   FROM public.chat_inbox;


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    badge_id uuid NOT NULL,
    earned_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_gamification_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_gamification_stats (
    user_id uuid NOT NULL,
    total_events_hosted integer DEFAULT 0,
    total_events_attended integer DEFAULT 0,
    total_connections_made integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    total_checkins integer DEFAULT 0,
    total_qr_verified integer DEFAULT 0,
    unique_people_met integer DEFAULT 0,
    unique_locations integer DEFAULT 0,
    total_xp integer DEFAULT 0 NOT NULL,
    level integer DEFAULT 1 NOT NULL
);


--
-- Name: user_interests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_interests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    interest_tag_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_personality; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_personality (
    user_id uuid NOT NULL,
    openness integer NOT NULL,
    conscientiousness integer NOT NULL,
    extraversion integer NOT NULL,
    agreeableness integer NOT NULL,
    neuroticism integer NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_personality_agreeableness_check CHECK (((agreeableness >= 1) AND (agreeableness <= 5))),
    CONSTRAINT user_personality_conscientiousness_check CHECK (((conscientiousness >= 1) AND (conscientiousness <= 5))),
    CONSTRAINT user_personality_extraversion_check CHECK (((extraversion >= 1) AND (extraversion <= 5))),
    CONSTRAINT user_personality_neuroticism_check CHECK (((neuroticism >= 1) AND (neuroticism <= 5))),
    CONSTRAINT user_personality_openness_check CHECK (((openness >= 1) AND (openness <= 5)))
);


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    budget_min integer DEFAULT 0 NOT NULL,
    budget_max integer DEFAULT 1000 NOT NULL,
    primary_goal public.goal_type DEFAULT 'friends'::public.goal_type NOT NULL,
    open_to_all_goals boolean DEFAULT false NOT NULL,
    preferred_meetup_mode public.meetup_mode_type DEFAULT 'both'::public.meetup_mode_type NOT NULL,
    gender_preference public.gender_preference_type DEFAULT 'no_preference'::public.gender_preference_type NOT NULL,
    preferred_group_size_min integer DEFAULT 3 NOT NULL,
    preferred_group_size_max integer DEFAULT 6 NOT NULL,
    CONSTRAINT user_preferences_budget_min_check CHECK ((budget_min >= 0)),
    CONSTRAINT user_preferences_check CHECK ((budget_max >= budget_min)),
    CONSTRAINT user_preferences_check1 CHECK ((preferred_group_size_max >= preferred_group_size_min)),
    CONSTRAINT user_preferences_preferred_group_size_min_check CHECK ((preferred_group_size_min >= 2))
);


--
-- Name: user_ratings_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.user_ratings_summary AS
 SELECT rated_user_id AS user_id,
    count(*) AS total_ratings,
    avg(overall_score) AS avg_overall_score,
    avg(friendliness_score) AS avg_friendliness,
    avg(punctuality_score) AS avg_punctuality,
    avg(engagement_score) AS avg_engagement,
    sum(
        CASE
            WHEN is_no_show THEN 1
            ELSE 0
        END) AS no_show_count
   FROM public.ratings
  GROUP BY rated_user_id;


--
-- Name: v_rpc_mark_exists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.v_rpc_mark_exists (
    "exists" boolean
);


--
-- Name: v_rpc_tray_exists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.v_rpc_tray_exists (
    "exists" boolean
);


--
-- Name: v_story_views_exists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.v_story_views_exists (
    "exists" boolean
);


--
-- Name: venue_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venue_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    venue_name text NOT NULL,
    venue_address text,
    thumbnail_url text,
    canvas_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    canvas_width integer DEFAULT 1400 NOT NULL,
    canvas_height integer DEFAULT 900 NOT NULL,
    total_capacity integer,
    tags text[] DEFAULT '{}'::text[],
    is_published boolean DEFAULT false,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    source text DEFAULT 'landing_page'::text,
    created_at timestamp with time zone DEFAULT now(),
    phone_type text,
    CONSTRAINT waitlist_phone_type_check CHECK (((phone_type IS NULL) OR (phone_type = ANY (ARRAY['android'::text, 'iphone'::text]))))
);


--
-- Name: TABLE waitlist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.waitlist IS 'Collects emails and names from the landing page waitlist modal.';


--
-- Name: wallet_topups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_topups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    user_id uuid,
    amount numeric NOT NULL,
    currency text DEFAULT 'PHP'::text,
    status text DEFAULT 'pending'::text,
    xendit_session_id text,
    reference_id text,
    payment_method text,
    platform_fee_settled numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT wallet_topups_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT wallet_topups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'expired'::text])))
);


--
-- Name: web_team_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.web_team_context (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_date date NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    commits text[],
    team_comms_ids integer[],
    status text DEFAULT 'complete'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: web_team_context_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.web_team_context ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.web_team_context_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_endpoint_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    response_status integer,
    response_body text,
    delivered_at timestamp with time zone DEFAULT now(),
    success boolean DEFAULT false
);


--
-- Name: webhook_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_endpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_id uuid NOT NULL,
    url text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    secret text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ad_clicks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_clicks ALTER COLUMN id SET DEFAULT nextval('public.ad_clicks_id_seq'::regclass);


--
-- Name: ai_integration_references id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_integration_references ALTER COLUMN id SET DEFAULT nextval('public.ai_integration_references_id_seq'::regclass);


--
-- Name: activity_checkins activity_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_checkins
    ADD CONSTRAINT activity_checkins_pkey PRIMARY KEY (id);


--
-- Name: activity_checkins activity_checkins_table_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_checkins
    ADD CONSTRAINT activity_checkins_table_id_user_id_key UNIQUE (table_id, user_id);


--
-- Name: ad_clicks ad_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_pkey PRIMARY KEY (id);


--
-- Name: ad_clicks ad_clicks_user_event_month_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_user_event_month_unique UNIQUE (user_id, event_id, invoice_month);


--
-- Name: ad_invoices ad_invoices_partner_id_invoice_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_invoices
    ADD CONSTRAINT ad_invoices_partner_id_invoice_month_key UNIQUE (partner_id, invoice_month);


--
-- Name: ad_invoices ad_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_invoices
    ADD CONSTRAINT ad_invoices_pkey PRIMARY KEY (id);


--
-- Name: admin_actions admin_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_pkey PRIMARY KEY (id);


--
-- Name: admin_email_campaigns admin_email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_email_campaigns
    ADD CONSTRAINT admin_email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: admin_otp_codes admin_otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_otp_codes
    ADD CONSTRAINT admin_otp_codes_pkey PRIMARY KEY (id);


--
-- Name: admin_popups admin_popups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_popups
    ADD CONSTRAINT admin_popups_pkey PRIMARY KEY (id);


--
-- Name: admin_push_broadcasts admin_push_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_push_broadcasts
    ADD CONSTRAINT admin_push_broadcasts_pkey PRIMARY KEY (id);


--
-- Name: ai_integration_references ai_integration_references_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_integration_references
    ADD CONSTRAINT ai_integration_references_pkey PRIMARY KEY (id);


--
-- Name: ai_integration_references ai_integration_references_service_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_integration_references
    ADD CONSTRAINT ai_integration_references_service_name_key UNIQUE (service_name);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_rate_limits api_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_rate_limits
    ADD CONSTRAINT api_rate_limits_pkey PRIMARY KEY (key_prefix);


--
-- Name: apk_releases apk_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apk_releases
    ADD CONSTRAINT apk_releases_pkey PRIMARY KEY (id);


--
-- Name: app_team_memory app_team_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_team_memory
    ADD CONSTRAINT app_team_memory_pkey PRIMARY KEY (id);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: badges badges_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_slug_key UNIQUE (slug);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (blocker_user_id, blocked_user_id);


--
-- Name: chat_inbox chat_inbox_chat_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_inbox
    ADD CONSTRAINT chat_inbox_chat_id_user_id_key UNIQUE (chat_id, user_id);


--
-- Name: chat_inbox chat_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_inbox
    ADD CONSTRAINT chat_inbox_pkey PRIMARY KEY (id);


--
-- Name: chat_poll_votes chat_poll_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_poll_votes
    ADD CONSTRAINT chat_poll_votes_pkey PRIMARY KEY (id);


--
-- Name: chat_poll_votes chat_poll_votes_poll_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_poll_votes
    ADD CONSTRAINT chat_poll_votes_poll_id_user_id_key UNIQUE (poll_id, user_id);


--
-- Name: chat_polls chat_polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_polls
    ADD CONSTRAINT chat_polls_pkey PRIMARY KEY (id);


--
-- Name: comment_likes comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id);


--
-- Name: comment_reactions comment_reactions_comment_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_id_user_id_emoji_key UNIQUE (comment_id, user_id, emoji);


--
-- Name: comment_reactions comment_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_pkey PRIMARY KEY (id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: direct_chat_participants direct_chat_participants_chat_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_chat_participants
    ADD CONSTRAINT direct_chat_participants_chat_id_user_id_key UNIQUE (chat_id, user_id);


--
-- Name: direct_chat_participants direct_chat_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_chat_participants
    ADD CONSTRAINT direct_chat_participants_pkey PRIMARY KEY (id);


--
-- Name: direct_chats direct_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_chats
    ADD CONSTRAINT direct_chats_pkey PRIMARY KEY (id);


--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);


--
-- Name: email_automation_runs email_automation_runs_automation_id_dedup_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_runs
    ADD CONSTRAINT email_automation_runs_automation_id_dedup_key_key UNIQUE (automation_id, dedup_key);


--
-- Name: email_automation_runs email_automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_runs
    ADD CONSTRAINT email_automation_runs_pkey PRIMARY KEY (id);


--
-- Name: email_automations email_automations_partner_id_trigger_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT email_automations_partner_id_trigger_type_key UNIQUE (partner_id, trigger_type);


--
-- Name: email_automations email_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT email_automations_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);


--
-- Name: email_sends email_sends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sends
    ADD CONSTRAINT email_sends_pkey PRIMARY KEY (id);


--
-- Name: email_suppressions email_suppressions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (id);


--
-- Name: event_invites event_invites_event_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_email_key UNIQUE (event_id, email);


--
-- Name: event_invites event_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_pkey PRIMARY KEY (id);


--
-- Name: event_registrations event_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_pkey PRIMARY KEY (id);


--
-- Name: event_seat_maps event_seat_maps_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seat_maps
    ADD CONSTRAINT event_seat_maps_event_id_key UNIQUE (event_id);


--
-- Name: event_seat_maps event_seat_maps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seat_maps
    ADD CONSTRAINT event_seat_maps_pkey PRIMARY KEY (id);


--
-- Name: event_sections event_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_sections
    ADD CONSTRAINT event_sections_pkey PRIMARY KEY (id);


--
-- Name: event_subscription_discounts event_subscription_discounts_event_id_subscription_tier_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_subscription_discounts
    ADD CONSTRAINT event_subscription_discounts_event_id_subscription_tier_id_key UNIQUE (event_id, subscription_tier_id);


--
-- Name: event_subscription_discounts event_subscription_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_subscription_discounts
    ADD CONSTRAINT event_subscription_discounts_pkey PRIMARY KEY (id);


--
-- Name: event_views event_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_views
    ADD CONSTRAINT event_views_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: experience_purchase_intents experience_purchase_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_pkey PRIMARY KEY (id);


--
-- Name: experience_purchase_intents experience_purchase_intents_xendit_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_xendit_external_id_key UNIQUE (xendit_external_id);


--
-- Name: experience_purchase_intents experience_purchase_intents_xendit_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_xendit_invoice_id_key UNIQUE (xendit_invoice_id);


--
-- Name: experience_reviews experience_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_reviews
    ADD CONSTRAINT experience_reviews_pkey PRIMARY KEY (id);


--
-- Name: experience_reviews experience_reviews_user_experience_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_reviews
    ADD CONSTRAINT experience_reviews_user_experience_unique UNIQUE (experience_id, user_id);


--
-- Name: experience_schedules experience_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_schedules
    ADD CONSTRAINT experience_schedules_pkey PRIMARY KEY (id);


--
-- Name: experience_transactions experience_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_pkey PRIMARY KEY (id);


--
-- Name: fan_subscriptions fan_subscriptions_fan_id_partner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_subscriptions
    ADD CONSTRAINT fan_subscriptions_fan_id_partner_id_key UNIQUE (fan_id, partner_id);


--
-- Name: fan_subscriptions fan_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_subscriptions
    ADD CONSTRAINT fan_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: interest_tags interest_tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_tags
    ADD CONSTRAINT interest_tags_name_key UNIQUE (name);


--
-- Name: interest_tags interest_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interest_tags
    ADD CONSTRAINT interest_tags_pkey PRIMARY KEY (id);


--
-- Name: matching_queue matching_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matching_queue
    ADD CONSTRAINT matching_queue_pkey PRIMARY KEY (id);


--
-- Name: message_reactions message_reactions_message_id_user_id_emoji_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_user_id_emoji_key UNIQUE (message_id, user_id, emoji);


--
-- Name: message_reactions message_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: partner_followers partner_followers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_followers
    ADD CONSTRAINT partner_followers_pkey PRIMARY KEY (id);


--
-- Name: partner_followers partner_followers_user_id_partner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_followers
    ADD CONSTRAINT partner_followers_user_id_partner_id_key UNIQUE (user_id, partner_id);


--
-- Name: partner_gateway_accounts partner_gateway_accounts_partner_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_gateway_accounts
    ADD CONSTRAINT partner_gateway_accounts_partner_id_provider_key UNIQUE (partner_id, provider);


--
-- Name: partner_gateway_accounts partner_gateway_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_gateway_accounts
    ADD CONSTRAINT partner_gateway_accounts_pkey PRIMARY KEY (id);


--
-- Name: partner_invites partner_invites_partner_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_partner_id_email_key UNIQUE (partner_id, email);


--
-- Name: partner_invites partner_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_pkey PRIMARY KEY (id);


--
-- Name: partner_kyc_documents partner_kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_kyc_documents
    ADD CONSTRAINT partner_kyc_documents_pkey PRIMARY KEY (id);


--
-- Name: partner_stakeholders partner_stakeholders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_stakeholders
    ADD CONSTRAINT partner_stakeholders_pkey PRIMARY KEY (id);


--
-- Name: partner_subscribers partner_subscribers_partner_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_subscribers
    ADD CONSTRAINT partner_subscribers_partner_id_email_key UNIQUE (partner_id, email);


--
-- Name: partner_subscribers partner_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_subscribers
    ADD CONSTRAINT partner_subscribers_pkey PRIMARY KEY (id);


--
-- Name: partner_team_members partner_team_members_partner_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_partner_id_user_id_key UNIQUE (partner_id, user_id);


--
-- Name: partner_team_members partner_team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_pkey PRIMARY KEY (id);


--
-- Name: partners partners_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_custom_domain_key UNIQUE (custom_domain);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: partners partners_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_slug_key UNIQUE (slug);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_xendit_disbursement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_xendit_disbursement_id_key UNIQUE (xendit_disbursement_id);


--
-- Name: payouts payouts_xendit_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_xendit_external_id_key UNIQUE (xendit_external_id);


--
-- Name: post_bookmarks post_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_bookmarks
    ADD CONSTRAINT post_bookmarks_pkey PRIMARY KEY (user_id, post_id);


--
-- Name: post_likes post_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: promo_codes promo_codes_event_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_event_id_code_key UNIQUE (event_id, code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: purchase_intents purchase_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_pkey PRIMARY KEY (id);


--
-- Name: purchase_intents purchase_intents_xendit_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_xendit_external_id_key UNIQUE (xendit_external_id);


--
-- Name: purchase_intents purchase_intents_xendit_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_xendit_invoice_id_key UNIQUE (xendit_invoice_id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_table_id_rater_user_id_rated_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_table_id_rater_user_id_rated_user_id_key UNIQUE (table_id, rater_user_id, rated_user_id);


--
-- Name: registration_answers registration_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_answers
    ADD CONSTRAINT registration_answers_pkey PRIMARY KEY (id);


--
-- Name: registration_questions registration_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_questions
    ADD CONSTRAINT registration_questions_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: seat_holds seat_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seat_holds
    ADD CONSTRAINT seat_holds_pkey PRIMARY KEY (id);


--
-- Name: seat_holds seat_holds_seat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seat_holds
    ADD CONSTRAINT seat_holds_seat_id_key UNIQUE (seat_id);


--
-- Name: seats seats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_pkey PRIMARY KEY (id);


--
-- Name: seats seats_section_id_row_label_seat_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_section_id_row_label_seat_number_key UNIQUE (section_id, row_label, seat_number);


--
-- Name: story_views story_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views
    ADD CONSTRAINT story_views_pkey PRIMARY KEY (id);


--
-- Name: story_views story_views_post_id_viewer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_views
    ADD CONSTRAINT story_views_post_id_viewer_id_key UNIQUE (post_id, viewer_id);


--
-- Name: subscription_claims subscription_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_claims
    ADD CONSTRAINT subscription_claims_pkey PRIMARY KEY (id);


--
-- Name: subscription_payments subscription_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_payments
    ADD CONSTRAINT subscription_payments_pkey PRIMARY KEY (id);


--
-- Name: subscription_posts subscription_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_posts
    ADD CONSTRAINT subscription_posts_pkey PRIMARY KEY (id);


--
-- Name: subscription_tiers subscription_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_tiers
    ADD CONSTRAINT subscription_tiers_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: table_members table_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_members
    ADD CONSTRAINT table_members_pkey PRIMARY KEY (id);


--
-- Name: table_members table_members_table_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_members
    ADD CONSTRAINT table_members_table_id_user_id_key UNIQUE (table_id, user_id);


--
-- Name: table_participants table_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_participants
    ADD CONSTRAINT table_participants_pkey PRIMARY KEY (id);


--
-- Name: table_participants table_participants_table_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_participants
    ADD CONSTRAINT table_participants_table_id_user_id_key UNIQUE (table_id, user_id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: team_comms team_comms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_comms
    ADD CONSTRAINT team_comms_pkey PRIMARY KEY (id);


--
-- Name: template_sections template_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_pkey PRIMARY KEY (id);


--
-- Name: ticket_tiers ticket_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_tiers
    ADD CONSTRAINT ticket_tiers_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_qr_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_qr_code_key UNIQUE (qr_code);


--
-- Name: tickets tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: travel_matches travel_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_matches
    ADD CONSTRAINT travel_matches_pkey PRIMARY KEY (id);


--
-- Name: travel_matches travel_matches_travel_plan_id_1_travel_plan_id_2_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_matches
    ADD CONSTRAINT travel_matches_travel_plan_id_1_travel_plan_id_2_key UNIQUE (travel_plan_id_1, travel_plan_id_2);


--
-- Name: travel_plans travel_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_plans
    ADD CONSTRAINT travel_plans_pkey PRIMARY KEY (id);


--
-- Name: trip_chat_participants trip_chat_participants_chat_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_chat_participants
    ADD CONSTRAINT trip_chat_participants_chat_id_user_id_key UNIQUE (chat_id, user_id);


--
-- Name: trip_chat_participants trip_chat_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_chat_participants
    ADD CONSTRAINT trip_chat_participants_pkey PRIMARY KEY (id);


--
-- Name: trip_group_chats trip_group_chats_ably_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_group_chats
    ADD CONSTRAINT trip_group_chats_ably_channel_id_key UNIQUE (ably_channel_id);


--
-- Name: trip_group_chats trip_group_chats_destination_city_destination_country_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_group_chats
    ADD CONSTRAINT trip_group_chats_destination_city_destination_country_start_key UNIQUE (destination_city, destination_country, start_date, end_date);


--
-- Name: trip_group_chats trip_group_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_group_chats
    ADD CONSTRAINT trip_group_chats_pkey PRIMARY KEY (id);


--
-- Name: trip_messages trip_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_messages
    ADD CONSTRAINT trip_messages_pkey PRIMARY KEY (id);


--
-- Name: trip_participants trip_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_pkey PRIMARY KEY (id);


--
-- Name: trip_participants trip_participants_trip_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_trip_id_user_id_key UNIQUE (trip_id, user_id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_user_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);


--
-- Name: user_gamification_stats user_gamification_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_gamification_stats
    ADD CONSTRAINT user_gamification_stats_pkey PRIMARY KEY (user_id);


--
-- Name: user_interests user_interests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_pkey PRIMARY KEY (id);


--
-- Name: user_interests user_interests_user_id_interest_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_interest_tag_id_key UNIQUE (user_id, interest_tag_id);


--
-- Name: user_personality user_personality_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personality
    ADD CONSTRAINT user_personality_pkey PRIMARY KEY (user_id);


--
-- Name: user_photos user_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_photos
    ADD CONSTRAINT user_photos_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_trips user_trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_trips
    ADD CONSTRAINT user_trips_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: venue_templates venue_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_templates
    ADD CONSTRAINT venue_templates_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_email_unique UNIQUE (email);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: wallet_topups wallet_topups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_topups
    ADD CONSTRAINT wallet_topups_pkey PRIMARY KEY (id);


--
-- Name: wallet_topups wallet_topups_reference_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_topups
    ADD CONSTRAINT wallet_topups_reference_id_key UNIQUE (reference_id);


--
-- Name: web_team_context web_team_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.web_team_context
    ADD CONSTRAINT web_team_context_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhook_endpoints webhook_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_pkey PRIMARY KEY (id);


--
-- Name: ad_clicks_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_clicks_event_idx ON public.ad_clicks USING btree (event_id, clicked_at);


--
-- Name: ad_clicks_invoiced_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_clicks_invoiced_month_idx ON public.ad_clicks USING btree (invoiced, invoice_month);


--
-- Name: ad_clicks_partner_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_clicks_partner_month_idx ON public.ad_clicks USING btree (partner_id, invoice_month, invoiced);


--
-- Name: ad_invoices_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_invoices_month_idx ON public.ad_invoices USING btree (invoice_month, status);


--
-- Name: ad_invoices_partner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_invoices_partner_idx ON public.ad_invoices USING btree (partner_id, status);


--
-- Name: email_events_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_campaign_idx ON public.email_events USING btree (campaign_id);


--
-- Name: email_events_dedupe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_events_dedupe_idx ON public.email_events USING btree (resend_id, type, recipient);


--
-- Name: email_events_resend_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_events_resend_idx ON public.email_events USING btree (resend_id);


--
-- Name: email_sends_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_sends_campaign_idx ON public.email_sends USING btree (campaign_id);


--
-- Name: email_sends_campaign_recipient_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_sends_campaign_recipient_uniq ON public.email_sends USING btree (campaign_id, recipient);


--
-- Name: email_sends_resend_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_sends_resend_id_idx ON public.email_sends USING btree (resend_id);


--
-- Name: email_suppressions_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_suppressions_email_idx ON public.email_suppressions USING btree (lower(email));


--
-- Name: email_suppressions_partner_email_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_suppressions_partner_email_uniq ON public.email_suppressions USING btree (partner_id, email) NULLS NOT DISTINCT;


--
-- Name: event_invites_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_invites_email_idx ON public.event_invites USING btree (lower(email));


--
-- Name: event_invites_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_invites_event_id_idx ON public.event_invites USING btree (event_id);


--
-- Name: event_invites_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_invites_token_idx ON public.event_invites USING btree (token);


--
-- Name: event_registrations_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_event_status_idx ON public.event_registrations USING btree (event_id, status, created_at DESC);


--
-- Name: event_registrations_unique_guest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_registrations_unique_guest ON public.event_registrations USING btree (event_id, lower(guest_email)) WHERE ((user_id IS NULL) AND (guest_email IS NOT NULL) AND (status <> 'cancelled'::text));


--
-- Name: event_registrations_unique_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX event_registrations_unique_user ON public.event_registrations USING btree (event_id, user_id) WHERE ((user_id IS NOT NULL) AND (status <> 'cancelled'::text));


--
-- Name: event_registrations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_registrations_user_idx ON public.event_registrations USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_activity_checkins_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_checkins_table_id ON public.activity_checkins USING btree (table_id);


--
-- Name: idx_activity_checkins_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_checkins_user_id ON public.activity_checkins USING btree (user_id);


--
-- Name: idx_admin_actions_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_actions_admin ON public.admin_actions USING btree (admin_id);


--
-- Name: idx_admin_actions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_actions_created ON public.admin_actions USING btree (created_at DESC);


--
-- Name: idx_admin_actions_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_actions_target ON public.admin_actions USING btree (target_user_id);


--
-- Name: idx_api_keys_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_partner ON public.api_keys USING btree (partner_id);


--
-- Name: idx_api_keys_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix);


--
-- Name: idx_apk_releases_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_apk_releases_latest ON public.apk_releases USING btree (is_latest) WHERE (is_latest = true);


--
-- Name: idx_app_team_memory_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_team_memory_category ON public.app_team_memory USING btree (category);


--
-- Name: idx_app_team_memory_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_team_memory_created_at ON public.app_team_memory USING btree (created_at DESC);


--
-- Name: idx_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_blocked ON public.blocks USING btree (blocked_user_id);


--
-- Name: idx_blocks_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_blocker ON public.blocks USING btree (blocker_user_id);


--
-- Name: idx_broadcasts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_broadcasts_created_at ON public.admin_push_broadcasts USING btree (created_at DESC);


--
-- Name: idx_chat_inbox_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_inbox_chat_id ON public.chat_inbox USING btree (chat_id);


--
-- Name: idx_chat_inbox_user_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_inbox_user_activity ON public.chat_inbox USING btree (user_id, has_unread DESC, last_activity_at DESC);


--
-- Name: idx_chat_poll_votes_poll_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_poll_votes_poll_id ON public.chat_poll_votes USING btree (poll_id);


--
-- Name: idx_chat_poll_votes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_poll_votes_user_id ON public.chat_poll_votes USING btree (user_id);


--
-- Name: idx_chat_polls_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_polls_chat_id ON public.chat_polls USING btree (chat_id);


--
-- Name: idx_comment_likes_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_likes_comment_id ON public.comment_likes USING btree (comment_id);


--
-- Name: idx_comment_likes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_likes_user_id ON public.comment_likes USING btree (user_id);


--
-- Name: idx_comment_reactions_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_reactions_comment_id ON public.comment_reactions USING btree (comment_id);


--
-- Name: idx_comment_reactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_reactions_user_id ON public.comment_reactions USING btree (user_id);


--
-- Name: idx_comments_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_city ON public.comments USING btree (city);


--
-- Name: idx_comments_h3_cell; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_h3_cell ON public.comments USING btree (h3_cell);


--
-- Name: idx_comments_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_post_id ON public.comments USING btree (post_id);


--
-- Name: INDEX idx_comments_post_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_comments_post_id IS 'Optimizes comment count aggregation';


--
-- Name: idx_comments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_user_id ON public.comments USING btree (user_id);


--
-- Name: idx_direct_chat_participants_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_chat_participants_chat_id ON public.direct_chat_participants USING btree (chat_id);


--
-- Name: idx_direct_chat_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_chat_participants_user_id ON public.direct_chat_participants USING btree (user_id);


--
-- Name: idx_direct_messages_chat_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_chat_created_at ON public.direct_messages USING btree (chat_id, created_at DESC);


--
-- Name: idx_direct_messages_chat_seq_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_chat_seq_id ON public.direct_messages USING btree (chat_id, sequence_number DESC, id);


--
-- Name: idx_direct_messages_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_deleted ON public.direct_messages USING btree (chat_id, deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_direct_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_direct_messages_sender_id ON public.direct_messages USING btree (sender_id);


--
-- Name: idx_email_automation_runs_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automation_runs_partner ON public.email_automation_runs USING btree (partner_id);


--
-- Name: idx_email_automations_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_enabled ON public.email_automations USING btree (trigger_type) WHERE (enabled = true);


--
-- Name: idx_email_automations_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_partner ON public.email_automations USING btree (partner_id);


--
-- Name: idx_email_campaigns_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_partner ON public.email_campaigns USING btree (partner_id);


--
-- Name: idx_email_campaigns_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_scheduled ON public.email_campaigns USING btree (scheduled_for) WHERE (status = 'scheduled'::text);


--
-- Name: idx_event_sales_datetime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_sales_datetime ON public.event_sales_summary USING btree (start_datetime DESC);


--
-- Name: idx_event_sales_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_sales_event_id ON public.event_sales_summary USING btree (event_id);


--
-- Name: idx_event_sub_discounts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_sub_discounts_event ON public.event_subscription_discounts USING btree (event_id);


--
-- Name: idx_event_views_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_views_event_date ON public.event_views USING btree (event_id, viewed_at DESC);


--
-- Name: idx_event_views_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_views_user ON public.event_views USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_events_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_city ON public.events USING btree (city);


--
-- Name: idx_events_images; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_images ON public.events USING gin (images);


--
-- Name: idx_events_location_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_location_gist ON public.events USING gist (location);


--
-- Name: idx_events_organizer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_organizer_id ON public.events USING btree (organizer_id);


--
-- Name: idx_events_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_search_vector ON public.events USING gin (search_vector);


--
-- Name: idx_events_sold_out; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_sold_out ON public.events USING btree (id) WHERE (status = 'sold_out'::public.event_status);


--
-- Name: idx_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status ON public.events USING btree (status);


--
-- Name: idx_events_status_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_status_start ON public.events USING btree (status, start_datetime);


--
-- Name: idx_events_ticket_limits; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_ticket_limits ON public.events USING btree (min_tickets_per_purchase, max_tickets_per_purchase);


--
-- Name: idx_events_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_title_trgm ON public.events USING gin (title public.gin_trgm_ops);


--
-- Name: idx_events_type_datetime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_type_datetime ON public.events USING btree (event_type, start_datetime) WHERE (status = 'active'::public.event_status);


--
-- Name: idx_events_venue_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_venue_trgm ON public.events USING gin (venue_name public.gin_trgm_ops);


--
-- Name: idx_exp_intents_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_exp_intents_external_id ON public.experience_purchase_intents USING btree (xendit_external_id);


--
-- Name: idx_exp_intents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exp_intents_status ON public.experience_purchase_intents USING btree (status);


--
-- Name: idx_exp_intents_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exp_intents_user ON public.experience_purchase_intents USING btree (user_id);


--
-- Name: idx_experience_purchase_intents_checkin_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_purchase_intents_checkin_status ON public.experience_purchase_intents USING btree (check_in_status);


--
-- Name: idx_experience_reviews_experience_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_reviews_experience_id ON public.experience_reviews USING btree (experience_id);


--
-- Name: idx_experience_reviews_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_reviews_user_id ON public.experience_reviews USING btree (user_id);


--
-- Name: idx_experience_schedules_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_schedules_start_time ON public.experience_schedules USING btree (start_time);


--
-- Name: idx_experience_schedules_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_schedules_table_id ON public.experience_schedules USING btree (table_id);


--
-- Name: idx_experience_transactions_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_experience_transactions_partner_id ON public.experience_transactions USING btree (partner_id);


--
-- Name: idx_fan_subscriptions_fan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fan_subscriptions_fan_id ON public.fan_subscriptions USING btree (fan_id);


--
-- Name: idx_fan_subscriptions_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fan_subscriptions_partner_id ON public.fan_subscriptions USING btree (partner_id);


--
-- Name: idx_fan_subscriptions_status_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fan_subscriptions_status_period ON public.fan_subscriptions USING btree (status, current_period_end);


--
-- Name: idx_follows_following_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follows_following_id ON public.follows USING btree (following_id);


--
-- Name: idx_group_members_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id);


--
-- Name: idx_group_members_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_status ON public.group_members USING btree (status);


--
-- Name: idx_group_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);


--
-- Name: idx_groups_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_category ON public.groups USING btree (category);


--
-- Name: idx_groups_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_created_by ON public.groups USING btree (created_by);


--
-- Name: idx_groups_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_location ON public.groups USING btree (location_city) WHERE (location_city IS NOT NULL);


--
-- Name: idx_groups_privacy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_privacy ON public.groups USING btree (privacy);


--
-- Name: idx_groups_subscription_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_subscription_tier ON public.groups USING btree (subscription_tier_id) WHERE (subscription_tier_id IS NOT NULL);


--
-- Name: idx_groups_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_groups_type ON public.groups USING btree (group_type) WHERE (group_type <> 'community'::text);


--
-- Name: idx_interest_tags_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interest_tags_category ON public.interest_tags USING btree (category);


--
-- Name: idx_interest_tags_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interest_tags_name ON public.interest_tags USING btree (name);


--
-- Name: idx_line_active_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_active_at ON public.users USING btree (last_active_at);


--
-- Name: idx_matching_queue_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matching_queue_requested_at ON public.matching_queue USING btree (requested_at);


--
-- Name: idx_matching_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matching_queue_status ON public.matching_queue USING btree (status);


--
-- Name: idx_matching_queue_timeframe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matching_queue_timeframe ON public.matching_queue USING btree (timeframe_preference);


--
-- Name: idx_matching_queue_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matching_queue_user_id ON public.matching_queue USING btree (user_id);


--
-- Name: idx_message_reactions_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_message_id ON public.message_reactions USING btree (message_id);


--
-- Name: idx_message_reactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_reactions_user_id ON public.message_reactions USING btree (user_id);


--
-- Name: idx_messages_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_group ON public.messages USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_messages_pinned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_pinned ON public.messages USING btree (table_id, is_pinned) WHERE (is_pinned = true);


--
-- Name: idx_messages_pinned_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_pinned_group ON public.messages USING btree (group_id, is_pinned) WHERE (is_pinned = true);


--
-- Name: idx_messages_reply_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_reply_to ON public.messages USING btree (reply_to_id);


--
-- Name: idx_messages_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sequence ON public.messages USING btree (table_id, sequence_number DESC);


--
-- Name: idx_messages_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_timestamp ON public.messages USING btree ("timestamp");


--
-- Name: idx_notifications_cooldown; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_cooldown ON public.notifications USING btree (user_id, entity_id, type, created_at DESC);


--
-- Name: idx_notifications_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_created ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id) WHERE (is_read = false);


--
-- Name: idx_otp_user_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_user_expires ON public.admin_otp_codes USING btree (user_id, expires_at);


--
-- Name: idx_partner_followers_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_followers_partner ON public.partner_followers USING btree (partner_id);


--
-- Name: idx_partner_followers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_followers_user ON public.partner_followers USING btree (user_id);


--
-- Name: idx_partner_gateway_accounts_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_gateway_accounts_partner ON public.partner_gateway_accounts USING btree (partner_id);


--
-- Name: idx_partner_kyc_documents_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_kyc_documents_owner ON public.partner_kyc_documents USING btree (owner_id);


--
-- Name: idx_partner_kyc_documents_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_kyc_documents_partner ON public.partner_kyc_documents USING btree (partner_id);


--
-- Name: idx_partner_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_members_user ON public.partner_team_members USING btree (user_id);


--
-- Name: idx_partner_performance_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_performance_partner_id ON public.partner_performance_summary USING btree (partner_id);


--
-- Name: idx_partner_stakeholders_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_stakeholders_partner ON public.partner_stakeholders USING btree (partner_id);


--
-- Name: idx_partner_subscribers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_subscribers_active ON public.partner_subscribers USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_partner_subscribers_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_subscribers_event_id ON public.partner_subscribers USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_partner_subscribers_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_subscribers_partner ON public.partner_subscribers USING btree (partner_id);


--
-- Name: idx_partner_subscribers_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partner_subscribers_token ON public.partner_subscribers USING btree (unsubscribe_token);


--
-- Name: idx_partners_capabilities; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_capabilities ON public.partners USING gin (capabilities);


--
-- Name: idx_partners_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_slug ON public.partners USING btree (slug);


--
-- Name: idx_partners_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_status ON public.partners USING btree (status) WHERE (status <> 'rejected'::public.partner_status);


--
-- Name: idx_partners_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_user_id ON public.partners USING btree (user_id);


--
-- Name: idx_partners_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_partners_verified ON public.partners USING btree (verified) WHERE (verified = true);


--
-- Name: idx_payouts_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_event ON public.payouts USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_payouts_partner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_partner_status ON public.payouts USING btree (partner_id, status);


--
-- Name: idx_payouts_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_pending ON public.payouts USING btree (requested_at DESC) WHERE (status = ANY (ARRAY['pending_request'::public.payout_status, 'approved'::public.payout_status]));


--
-- Name: idx_post_likes_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_likes_post_id ON public.post_likes USING btree (post_id);


--
-- Name: INDEX idx_post_likes_post_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_post_likes_post_id IS 'Optimizes like count aggregation';


--
-- Name: idx_post_likes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_likes_user_id ON public.post_likes USING btree (user_id);


--
-- Name: idx_post_likes_user_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_likes_user_post ON public.post_likes USING btree (user_id, post_id);


--
-- Name: idx_posts_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_city ON public.posts USING btree (city);


--
-- Name: idx_posts_city_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_city_created_at ON public.posts USING btree (city, created_at DESC);


--
-- Name: idx_posts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created_at ON public.posts USING btree (created_at);


--
-- Name: idx_posts_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_event_id ON public.posts USING btree (event_id);


--
-- Name: idx_posts_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_events_created_at ON public.posts USING btree (created_at DESC) WHERE (event_id IS NOT NULL);


--
-- Name: idx_posts_external_place_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_external_place_id ON public.posts USING btree (external_place_id);


--
-- Name: idx_posts_feed_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_feed_created_at ON public.posts USING btree (created_at DESC, id DESC) WHERE (visibility = 'public'::text);


--
-- Name: INDEX idx_posts_feed_created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_posts_feed_created_at IS 'Optimizes main feed query ordering';


--
-- Name: idx_posts_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_group ON public.posts USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_posts_h3_cell; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_h3_cell ON public.posts USING btree (h3_cell);


--
-- Name: INDEX idx_posts_h3_cell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_posts_h3_cell IS 'Speeds up location-based filtering';


--
-- Name: idx_posts_location_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_location_gist ON public.posts USING gist (location);


--
-- Name: idx_posts_mentioned_user_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_mentioned_user_ids ON public.posts USING gin (mentioned_user_ids);


--
-- Name: idx_posts_story_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_story_recent ON public.posts USING btree (created_at DESC) WHERE ((is_story = true) AND (latitude IS NOT NULL));


--
-- Name: idx_posts_story_viewport; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_story_viewport ON public.posts USING btree (latitude, longitude) WHERE (is_story = true);


--
-- Name: idx_posts_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_table_id ON public.posts USING btree (table_id);


--
-- Name: idx_posts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_type ON public.posts USING btree (post_type);


--
-- Name: idx_posts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_user_id ON public.posts USING btree (user_id);


--
-- Name: idx_posts_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_visibility ON public.posts USING btree (visibility);


--
-- Name: idx_posts_with_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_with_events ON public.posts USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: idx_pricing_rules_partner_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_partner_active ON public.pricing_rules USING btree (partner_id, active) WHERE (active = true);


--
-- Name: idx_purchase_intents_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_intents_event_status ON public.purchase_intents USING btree (event_id, status);


--
-- Name: idx_purchase_intents_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_intents_expiry ON public.purchase_intents USING btree (expires_at, status) WHERE (status = 'pending'::public.purchase_intent_status);


--
-- Name: idx_purchase_intents_tier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_intents_tier_id ON public.purchase_intents USING btree (tier_id);


--
-- Name: idx_purchase_intents_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_intents_user_event ON public.purchase_intents USING btree (user_id, event_id);


--
-- Name: idx_ratings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_created_at ON public.ratings USING btree (created_at);


--
-- Name: idx_ratings_is_no_show; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_is_no_show ON public.ratings USING btree (is_no_show);


--
-- Name: idx_ratings_rated_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_rated_user_id ON public.ratings USING btree (rated_user_id);


--
-- Name: idx_ratings_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ratings_table_id ON public.ratings USING btree (table_id);


--
-- Name: idx_registration_answers_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_answers_question_id ON public.registration_answers USING btree (question_id);


--
-- Name: idx_registration_questions_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registration_questions_event_id ON public.registration_questions USING btree (event_id);


--
-- Name: idx_reports_reporter_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reporter_created ON public.reports USING btree (reporter_id, created_at DESC);


--
-- Name: idx_reports_reporter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_reporter_id ON public.reports USING btree (reporter_id);


--
-- Name: idx_reports_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reports_target ON public.reports USING btree (target_type, target_id);


--
-- Name: idx_seat_holds_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seat_holds_expires ON public.seat_holds USING btree (expires_at);


--
-- Name: idx_seat_holds_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seat_holds_session ON public.seat_holds USING btree (session_id);


--
-- Name: idx_seats_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_event ON public.seats USING btree (event_id);


--
-- Name: idx_seats_section; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_section ON public.seats USING btree (section_id);


--
-- Name: idx_seats_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_status ON public.seats USING btree (event_id, status);


--
-- Name: idx_seats_tier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seats_tier_id ON public.seats USING btree (tier_id) WHERE (tier_id IS NOT NULL);


--
-- Name: idx_story_views_post_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_views_post_id ON public.story_views USING btree (post_id);


--
-- Name: idx_story_views_viewer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_story_views_viewer_id ON public.story_views USING btree (viewer_id);


--
-- Name: idx_subscription_claims_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_subscription_claims_dedup ON public.subscription_claims USING btree (subscription_id, perk_label, claim_period) WHERE (claim_period IS NOT NULL);


--
-- Name: idx_subscription_claims_fan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_claims_fan ON public.subscription_claims USING btree (fan_id);


--
-- Name: idx_subscription_claims_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_claims_partner ON public.subscription_claims USING btree (partner_id, status);


--
-- Name: idx_subscription_posts_partner_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_posts_partner_published ON public.subscription_posts USING btree (partner_id, published_at);


--
-- Name: idx_subscription_tiers_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_tiers_partner ON public.subscription_tiers USING btree (partner_id);


--
-- Name: idx_support_tickets_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_created ON public.support_tickets USING btree (created_at DESC);


--
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- Name: idx_support_tickets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_type ON public.support_tickets USING btree (ticket_type);


--
-- Name: idx_support_tickets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_user ON public.support_tickets USING btree (user_id);


--
-- Name: idx_table_members_arrival_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_members_arrival_status ON public.table_members USING btree (arrival_status);


--
-- Name: idx_table_members_muted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_members_muted ON public.table_members USING btree (table_id, user_id, is_muted);


--
-- Name: idx_table_members_rsvp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_members_rsvp_status ON public.table_members USING btree (table_id, rsvp_status);


--
-- Name: idx_table_members_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_members_status ON public.table_members USING btree (status);


--
-- Name: idx_table_members_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_members_table_id ON public.table_members USING btree (table_id);


--
-- Name: idx_table_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_members_user_id ON public.table_members USING btree (user_id);


--
-- Name: idx_table_participants_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_participants_lookup ON public.table_participants USING btree (table_id, user_id, status);


--
-- Name: idx_table_participants_table_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_participants_table_id ON public.table_participants USING btree (table_id);


--
-- Name: idx_table_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_table_participants_user_id ON public.table_participants USING btree (user_id);


--
-- Name: idx_tables_chat_storage_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_chat_storage_type ON public.tables USING btree (chat_storage_type);


--
-- Name: idx_tables_cuisine_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_cuisine_trgm ON public.tables USING gin (cuisine_type public.gin_trgm_ops);


--
-- Name: idx_tables_datetime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_datetime ON public.tables USING btree (datetime);


--
-- Name: idx_tables_description_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_description_trgm ON public.tables USING gin (description public.gin_trgm_ops);


--
-- Name: idx_tables_experience_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_experience_type ON public.tables USING btree (experience_type);


--
-- Name: idx_tables_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_group_id ON public.tables USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_tables_host_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_host_id ON public.tables USING btree (host_id);


--
-- Name: idx_tables_is_experience; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_is_experience ON public.tables USING btree (is_experience);


--
-- Name: idx_tables_lat_lng; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_lat_lng ON public.tables USING btree (latitude, longitude);


--
-- Name: idx_tables_location_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_location_gist ON public.tables USING gist (location);


--
-- Name: idx_tables_location_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_location_trgm ON public.tables USING gin (location_name public.gin_trgm_ops);


--
-- Name: idx_tables_marker_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_marker_model ON public.tables USING btree (marker_model);


--
-- Name: idx_tables_partner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_partner_id ON public.tables USING btree (partner_id);


--
-- Name: idx_tables_search_vector; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_search_vector ON public.tables USING gin (search_vector);


--
-- Name: idx_tables_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_status ON public.tables USING btree (status);


--
-- Name: idx_tables_status_datetime; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_status_datetime ON public.tables USING btree (status, datetime);


--
-- Name: idx_tables_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_title_trgm ON public.tables USING gin (title public.gin_trgm_ops);


--
-- Name: idx_team_comms_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_comms_category ON public.team_comms USING btree (category, created_at DESC);


--
-- Name: idx_team_comms_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_comms_thread ON public.team_comms USING btree (thread_id) WHERE (thread_id IS NOT NULL);


--
-- Name: idx_team_comms_to_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_comms_to_team ON public.team_comms USING btree (to_team, resolved, created_at DESC);


--
-- Name: idx_team_members_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_partner ON public.partner_team_members USING btree (partner_id);


--
-- Name: idx_team_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_user ON public.partner_team_members USING btree (user_id);


--
-- Name: idx_ticket_tiers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_tiers_active ON public.ticket_tiers USING btree (event_id, is_active);


--
-- Name: idx_ticket_tiers_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_tiers_event_id ON public.ticket_tiers USING btree (event_id);


--
-- Name: idx_tickets_event_guest_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_event_guest_search ON public.tickets USING btree (event_id, guest_name) WHERE (event_id IS NOT NULL);


--
-- Name: idx_tickets_event_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_event_status ON public.tickets USING btree (event_id, status);


--
-- Name: idx_tickets_tier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_tier_id ON public.tickets USING btree (tier_id);


--
-- Name: idx_tickets_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_user_event ON public.tickets USING btree (user_id, event_id);


--
-- Name: idx_transactions_created_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_created_status ON public.transactions USING btree (created_at DESC, status);


--
-- Name: idx_transactions_partner_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_partner_event ON public.transactions USING btree (partner_id, event_id);


--
-- Name: idx_transactions_partner_status_amount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_partner_status_amount ON public.transactions USING btree (partner_id, status, organizer_payout) WHERE (status = 'completed'::public.transaction_status);


--
-- Name: idx_transactions_payout_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_payout_id ON public.transactions USING btree (payout_id);


--
-- Name: idx_travel_matches_plan_1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_matches_plan_1 ON public.travel_matches USING btree (travel_plan_id_1);


--
-- Name: idx_travel_matches_plan_2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_matches_plan_2 ON public.travel_matches USING btree (travel_plan_id_2);


--
-- Name: idx_travel_matches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_matches_status ON public.travel_matches USING btree (status);


--
-- Name: idx_travel_plans_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_plans_end_date ON public.travel_plans USING btree (end_date);


--
-- Name: idx_travel_plans_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_plans_location ON public.travel_plans USING btree (destination_lat, destination_lng);


--
-- Name: idx_travel_plans_start_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_plans_start_date ON public.travel_plans USING btree (start_date);


--
-- Name: idx_travel_plans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_plans_status ON public.travel_plans USING btree (status);


--
-- Name: idx_travel_plans_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_travel_plans_user_id ON public.travel_plans USING btree (user_id);


--
-- Name: idx_trip_chat_participants_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_chat_participants_chat_id ON public.trip_chat_participants USING btree (chat_id);


--
-- Name: idx_trip_chat_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_chat_participants_user_id ON public.trip_chat_participants USING btree (user_id);


--
-- Name: idx_trip_messages_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_messages_chat_id ON public.trip_messages USING btree (chat_id);


--
-- Name: idx_trip_messages_chat_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_messages_chat_sent_at ON public.trip_messages USING btree (chat_id, sent_at DESC);


--
-- Name: idx_trip_messages_chat_seq_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_messages_chat_seq_id ON public.trip_messages USING btree (chat_id, sequence_number DESC, id);


--
-- Name: idx_trip_messages_chat_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_messages_chat_sequence ON public.trip_messages USING btree (chat_id, sequence_number DESC);


--
-- Name: idx_trip_messages_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_messages_deleted ON public.trip_messages USING btree (chat_id, deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_trip_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_messages_sent_at ON public.trip_messages USING btree (sent_at);


--
-- Name: idx_trip_participants_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_participants_trip_id ON public.trip_participants USING btree (trip_id);


--
-- Name: idx_trip_participants_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_participants_user_id ON public.trip_participants USING btree (user_id);


--
-- Name: idx_user_interests_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_interests_tag_id ON public.user_interests USING btree (interest_tag_id);


--
-- Name: idx_user_interests_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_interests_user_id ON public.user_interests USING btree (user_id);


--
-- Name: idx_user_photos_is_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_photos_is_primary ON public.user_photos USING btree (is_primary);


--
-- Name: idx_user_photos_one_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_photos_one_primary ON public.user_photos USING btree (user_id) WHERE (is_primary = true);


--
-- Name: idx_user_photos_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_photos_user_id ON public.user_photos USING btree (user_id);


--
-- Name: idx_user_trips_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_trips_dates ON public.user_trips USING btree (start_date, end_date);


--
-- Name: idx_user_trips_destination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_trips_destination ON public.user_trips USING btree (destination_city, destination_country);


--
-- Name: idx_user_trips_matching; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_trips_matching ON public.user_trips USING btree (destination_city, destination_country, start_date, end_date);


--
-- Name: idx_user_trips_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_trips_status ON public.user_trips USING btree (status);


--
-- Name: idx_user_trips_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_trips_user_id ON public.user_trips USING btree (user_id);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_current_location_gist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_current_location_gist ON public.users USING gist (current_location);


--
-- Name: idx_users_deleted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_deleted_at ON public.users USING btree (deleted_at);


--
-- Name: idx_users_display_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_display_name_trgm ON public.users USING gin (display_name public.gin_trgm_ops);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_fcm_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_fcm_token ON public.users USING btree (id) WHERE (fcm_token IS NOT NULL);


--
-- Name: idx_users_is_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_admin ON public.users USING btree (is_admin) WHERE (is_admin = true);


--
-- Name: idx_users_is_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_verified ON public.users USING btree (is_verified);


--
-- Name: idx_users_last_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_active ON public.users USING btree (last_active_at DESC NULLS LAST);


--
-- Name: idx_users_last_notification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_notification ON public.users USING gin (last_chat_notification_at);


--
-- Name: idx_users_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_location ON public.users USING btree (home_location_lat, home_location_lng);


--
-- Name: idx_users_location_bbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_location_bbox ON public.users USING btree (current_lat, current_lng) WHERE ((current_lat IS NOT NULL) AND (current_lng IS NOT NULL));


--
-- Name: idx_users_notification_prefs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_notification_prefs ON public.users USING gin (notification_preferences);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: idx_users_username_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_username_lower ON public.users USING btree (lower(username));


--
-- Name: idx_users_username_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username_trgm ON public.users USING gin (username public.gin_trgm_ops);


--
-- Name: idx_web_team_context_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_team_context_category ON public.web_team_context USING btree (category);


--
-- Name: idx_web_team_context_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_team_context_date ON public.web_team_context USING btree (session_date DESC);


--
-- Name: idx_web_team_context_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_web_team_context_status ON public.web_team_context USING btree (status);


--
-- Name: idx_webhook_deliveries_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_created ON public.webhook_deliveries USING btree (delivered_at);


--
-- Name: idx_webhook_deliveries_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_endpoint ON public.webhook_deliveries USING btree (webhook_endpoint_id);


--
-- Name: idx_webhook_endpoints_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_endpoints_partner ON public.webhook_endpoints USING btree (partner_id);


--
-- Name: purchase_intents_access_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_intents_access_token_key ON public.purchase_intents USING btree (access_token);


--
-- Name: registration_answers_registration_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX registration_answers_registration_id_idx ON public.registration_answers USING btree (registration_id);


--
-- Name: tickets_registration_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_registration_id_idx ON public.tickets USING btree (registration_id) WHERE (registration_id IS NOT NULL);


--
-- Name: uniq_sale_txn_per_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_sale_txn_per_intent ON public.transactions USING btree (purchase_intent_id) WHERE (fee_basis IS DISTINCT FROM 'refund'::text);


--
-- Name: reports check_report_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER check_report_rate_limit BEFORE INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.enforce_report_rate_limit();


--
-- Name: direct_messages direct_messages_sequence_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER direct_messages_sequence_trigger BEFORE INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.assign_direct_message_sequence();


--
-- Name: direct_chat_participants inbox_sync_dm_participant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_sync_dm_participant AFTER INSERT OR DELETE OR UPDATE ON public.direct_chat_participants FOR EACH ROW EXECUTE FUNCTION public.sync_dm_participant_inbox();


--
-- Name: group_members inbox_sync_group_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_sync_group_member AFTER INSERT OR DELETE OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.sync_group_member_inbox();


--
-- Name: table_members inbox_sync_table_member; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_sync_table_member AFTER INSERT OR DELETE OR UPDATE ON public.table_members FOR EACH ROW EXECUTE FUNCTION public.sync_table_member_inbox();


--
-- Name: trip_chat_participants inbox_sync_trip_participant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_sync_trip_participant AFTER INSERT OR DELETE OR UPDATE ON public.trip_chat_participants FOR EACH ROW EXECUTE FUNCTION public.sync_trip_participant_inbox();


--
-- Name: direct_messages inbox_update_on_direct_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_update_on_direct_message AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_inbox_on_message();


--
-- Name: messages inbox_update_on_table_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_update_on_table_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_inbox_on_message();


--
-- Name: trip_messages inbox_update_on_trip_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inbox_update_on_trip_message AFTER INSERT ON public.trip_messages FOR EACH ROW EXECUTE FUNCTION public.update_chat_inbox_on_message();


--
-- Name: messages messages_sequence_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER messages_sequence_trigger BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.assign_message_sequence();


--
-- Name: events on_event_created_active; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_event_created_active AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.auto_post_event_to_feed();


--
-- Name: events on_event_published; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_event_published AFTER UPDATE OF status ON public.events FOR EACH ROW EXECUTE FUNCTION public.auto_post_event_to_feed();


--
-- Name: comments on_new_comment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_comment AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION public.handle_new_comment();


--
-- Name: direct_messages on_new_direct_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_direct_message AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();


--
-- Name: follows on_new_follower; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_follower AFTER INSERT ON public.follows FOR EACH ROW EXECUTE FUNCTION public.notify_new_follower();


--
-- Name: post_likes on_new_like; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_like AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.handle_new_like();


--
-- Name: messages on_new_table_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_table_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();


--
-- Name: trip_messages on_new_trip_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_new_trip_message AFTER INSERT ON public.trip_messages FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();


--
-- Name: partners on_partner_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_partner_status_change AFTER UPDATE OF status ON public.partners FOR EACH ROW EXECUTE FUNCTION public.notify_host_status_change();


--
-- Name: payouts on_payout_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_payout_created AFTER INSERT ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.handle_new_payout();


--
-- Name: posts on_post_mention; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_post_mention AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION public.handle_post_mentions();


--
-- Name: purchase_intents on_purchase_subscribe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_purchase_subscribe AFTER UPDATE ON public.purchase_intents FOR EACH ROW EXECUTE FUNCTION public.handle_checkout_subscription();


--
-- Name: table_participants on_table_participant_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_table_participant_approved AFTER UPDATE OF status ON public.table_participants FOR EACH ROW WHEN (((old.status = 'pending'::text) AND (new.status = 'approved'::text))) EXECUTE FUNCTION public.notify_table_join_simple();


--
-- Name: table_participants on_table_participant_join; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_table_participant_join AFTER INSERT ON public.table_participants FOR EACH ROW EXECUTE FUNCTION public.notify_table_join_simple();


--
-- Name: purchase_intents on_ticket_confirmed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_ticket_confirmed AFTER UPDATE ON public.purchase_intents FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_confirmed();


--
-- Name: user_trips on_trip_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_trip_created AFTER INSERT ON public.user_trips FOR EACH ROW EXECUTE FUNCTION public.create_trip_creator_participant();


--
-- Name: partners protect_partner_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_partner_status BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.protect_partner_status_fields();


--
-- Name: experience_reviews recompute_host_trust_score_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recompute_host_trust_score_trigger AFTER INSERT OR DELETE OR UPDATE ON public.experience_reviews FOR EACH ROW EXECUTE FUNCTION public.recompute_host_trust_score();


--
-- Name: support_tickets support_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_support_ticket_timestamp();


--
-- Name: partners trg_alert_kyc_submitted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_alert_kyc_submitted AFTER UPDATE OF kyc_status ON public.partners FOR EACH ROW EXECUTE FUNCTION public.trg_alert_kyc_submitted();


--
-- Name: reports trg_alert_new_report; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_alert_new_report AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.trg_alert_new_report();


--
-- Name: partners trg_alert_partner_signup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_alert_partner_signup AFTER INSERT ON public.partners FOR EACH ROW EXECUTE FUNCTION public.trg_alert_partner_signup();


--
-- Name: partners trg_alert_partner_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_alert_partner_status_change AFTER UPDATE OF status ON public.partners FOR EACH ROW EXECUTE FUNCTION public.trg_alert_partner_status_change();


--
-- Name: payouts trg_alert_payout_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_alert_payout_request AFTER INSERT ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.trg_alert_payout_request();


--
-- Name: tickets trg_auto_follow_organizer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_follow_organizer AFTER INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.auto_follow_organizer_on_ticket();


--
-- Name: event_registrations trg_event_registrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_registrations_updated_at BEFORE UPDATE ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION public.set_event_registrations_updated_at();


--
-- Name: events trg_events_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_events_search_vector BEFORE INSERT OR UPDATE OF title, description, event_type, venue_name ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_search_vector_update();


--
-- Name: group_members trg_group_member_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_group_member_count AFTER INSERT OR DELETE OR UPDATE ON public.group_members FOR EACH ROW EXECUTE FUNCTION public.update_group_member_count();


--
-- Name: events trg_new_event_automation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_new_event_automation AFTER INSERT OR UPDATE OF status ON public.events FOR EACH ROW EXECUTE FUNCTION public.enqueue_new_event_automation();


--
-- Name: events trg_notify_followers_new_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_followers_new_event AFTER INSERT OR UPDATE OF status ON public.events FOR EACH ROW EXECUTE FUNCTION public.notify_followers_new_event();


--
-- Name: tables trg_notify_followers_new_hangout; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_followers_new_hangout AFTER INSERT ON public.tables FOR EACH ROW EXECUTE FUNCTION public.notify_followers_new_hangout();


--
-- Name: table_members trg_notify_host_member_joined; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_host_member_joined AFTER INSERT ON public.table_members FOR EACH ROW EXECUTE FUNCTION public.notify_host_member_joined();


--
-- Name: event_registrations trg_notify_organizer_on_registration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_organizer_on_registration AFTER INSERT ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_on_registration();


--
-- Name: events trg_notify_past_buyers_new_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_past_buyers_new_event AFTER INSERT OR UPDATE OF status ON public.events FOR EACH ROW EXECUTE FUNCTION public.notify_past_buyers_new_event();


--
-- Name: subscription_posts trg_notify_subscriber_post; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_subscriber_post AFTER INSERT OR UPDATE ON public.subscription_posts FOR EACH ROW EXECUTE FUNCTION public.notify_new_subscriber_post();


--
-- Name: fan_subscriptions trg_notify_subscription; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_subscription AFTER INSERT OR UPDATE ON public.fan_subscriptions FOR EACH ROW EXECUTE FUNCTION public.notify_subscription_event();


--
-- Name: subscription_claims trg_notify_subscription_claim; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_subscription_claim AFTER INSERT OR UPDATE ON public.subscription_claims FOR EACH ROW EXECUTE FUNCTION public.notify_subscription_claim();


--
-- Name: tickets trg_sync_event_tickets_sold; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_event_tickets_sold AFTER INSERT OR DELETE OR UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.sync_event_tickets_sold();


--
-- Name: comments trg_sync_post_comment_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_post_comment_count AFTER INSERT OR DELETE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.sync_post_comment_count();


--
-- Name: post_likes trg_sync_post_like_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_post_like_count AFTER INSERT OR DELETE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.sync_post_like_count();


--
-- Name: fan_subscriptions trg_sync_subscriber_group_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_subscriber_group_membership AFTER INSERT OR UPDATE ON public.fan_subscriptions FOR EACH ROW EXECUTE FUNCTION public.sync_subscriber_group_membership();


--
-- Name: tables trg_tables_search_vector; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tables_search_vector BEFORE INSERT OR UPDATE OF title, description, cuisine_type, experience_type, location_name, city ON public.tables FOR EACH ROW EXECUTE FUNCTION public.tables_search_vector_update();


--
-- Name: partner_subscribers trg_welcome_automation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_welcome_automation AFTER INSERT ON public.partner_subscribers FOR EACH ROW EXECUTE FUNCTION public.enqueue_welcome_automation();


--
-- Name: reports trigger_auto_suspend_on_reports; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_suspend_on_reports AFTER INSERT ON public.reports FOR EACH ROW EXECUTE FUNCTION public.auto_suspend_on_report_threshold();


--
-- Name: travel_matches trigger_generate_travel_channel; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_travel_channel BEFORE INSERT ON public.travel_matches FOR EACH ROW EXECUTE FUNCTION public.generate_travel_match_channel();


--
-- Name: events trigger_mint_tickets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_mint_tickets AFTER INSERT OR UPDATE OF capacity ON public.events FOR EACH ROW EXECUTE FUNCTION public.mint_event_tickets();


--
-- Name: notifications trigger_notifications_webhook; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notifications_webhook AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.handle_notifications_webhook();


--
-- Name: tickets trigger_populate_ticket_guest_info; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_populate_ticket_guest_info BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.populate_ticket_guest_info();


--
-- Name: purchase_intents trigger_update_promo_usage_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_promo_usage_count AFTER INSERT OR DELETE OR UPDATE OF promo_code_id, status ON public.purchase_intents FOR EACH ROW EXECUTE FUNCTION public.update_promo_usage_count();


--
-- Name: table_members trigger_update_table_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_table_capacity AFTER INSERT OR DELETE OR UPDATE ON public.table_members FOR EACH ROW EXECUTE FUNCTION public.update_table_capacity();


--
-- Name: tickets trigger_update_tier_quantity_sold; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_tier_quantity_sold AFTER INSERT OR DELETE OR UPDATE OF status, tier_id ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_tier_quantity_sold();


--
-- Name: ratings trigger_update_trust_score; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_trust_score AFTER INSERT OR UPDATE ON public.ratings FOR EACH ROW EXECUTE FUNCTION public.update_user_trust_score();


--
-- Name: users trigger_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: trip_messages trip_messages_sequence_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trip_messages_sequence_trigger BEFORE INSERT ON public.trip_messages FOR EACH ROW EXECUTE FUNCTION public.assign_trip_message_sequence();


--
-- Name: events update_event_location_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_event_location_trigger BEFORE INSERT OR UPDATE OF latitude, longitude ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_event_location();


--
-- Name: events update_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: partners update_partners_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payouts update_payouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: posts update_post_location_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_post_location_trigger BEFORE INSERT OR UPDATE OF latitude, longitude ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_post_location();


--
-- Name: purchase_intents update_purchase_intents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_purchase_intents_updated_at BEFORE UPDATE ON public.purchase_intents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tables update_table_location_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_table_location_trigger BEFORE INSERT OR UPDATE OF latitude, longitude ON public.tables FOR EACH ROW EXECUTE FUNCTION public.update_table_location();


--
-- Name: tables update_tables_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON public.tables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tickets update_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transactions update_transactions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_trips update_user_trips_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_trips_updated_at BEFORE UPDATE ON public.user_trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: activity_checkins activity_checkins_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_checkins
    ADD CONSTRAINT activity_checkins_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: activity_checkins activity_checkins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_checkins
    ADD CONSTRAINT activity_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: activity_checkins activity_checkins_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_checkins
    ADD CONSTRAINT activity_checkins_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: ad_clicks ad_clicks_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: ad_clicks ad_clicks_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;


--
-- Name: ad_clicks ad_clicks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_clicks
    ADD CONSTRAINT ad_clicks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ad_invoices ad_invoices_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_invoices
    ADD CONSTRAINT ad_invoices_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: admin_actions admin_actions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: admin_actions admin_actions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id);


--
-- Name: admin_email_campaigns admin_email_campaigns_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_email_campaigns
    ADD CONSTRAINT admin_email_campaigns_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id);


--
-- Name: admin_otp_codes admin_otp_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_otp_codes
    ADD CONSTRAINT admin_otp_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_push_broadcasts admin_push_broadcasts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_push_broadcasts
    ADD CONSTRAINT admin_push_broadcasts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: api_keys api_keys_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: apk_releases apk_releases_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.apk_releases
    ADD CONSTRAINT apk_releases_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: bank_accounts bank_accounts_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: blocks blocks_blocker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_poll_votes chat_poll_votes_poll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_poll_votes
    ADD CONSTRAINT chat_poll_votes_poll_id_fkey FOREIGN KEY (poll_id) REFERENCES public.chat_polls(id) ON DELETE CASCADE;


--
-- Name: chat_poll_votes chat_poll_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_poll_votes
    ADD CONSTRAINT chat_poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_polls chat_polls_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_polls
    ADD CONSTRAINT chat_polls_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_likes comment_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_likes
    ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: comment_reactions comment_reactions_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comment_reactions comment_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_reactions
    ADD CONSTRAINT comment_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: comments comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;


--
-- Name: comments comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: comments comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: direct_chat_participants direct_chat_participants_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_chat_participants
    ADD CONSTRAINT direct_chat_participants_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.direct_chats(id) ON DELETE CASCADE;


--
-- Name: direct_chat_participants direct_chat_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_chat_participants
    ADD CONSTRAINT direct_chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.direct_chats(id) ON DELETE CASCADE;


--
-- Name: direct_messages direct_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.direct_messages(id) ON DELETE SET NULL;


--
-- Name: direct_messages direct_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_automation_runs email_automation_runs_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_runs
    ADD CONSTRAINT email_automation_runs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.email_automations(id) ON DELETE CASCADE;


--
-- Name: email_automation_runs email_automation_runs_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automation_runs
    ADD CONSTRAINT email_automation_runs_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: email_automations email_automations_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT email_automations_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: email_campaigns email_campaigns_automation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.email_automations(id) ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: email_campaigns email_campaigns_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id);


--
-- Name: email_campaigns email_campaigns_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: email_events email_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_sends email_sends_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sends
    ADD CONSTRAINT email_sends_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_sends email_sends_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sends
    ADD CONSTRAINT email_sends_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: email_suppressions email_suppressions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: event_invites event_invites_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_invites
    ADD CONSTRAINT event_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_registrations event_registrations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: event_registrations event_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_registrations
    ADD CONSTRAINT event_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: event_seat_maps event_seat_maps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seat_maps
    ADD CONSTRAINT event_seat_maps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_seat_maps event_seat_maps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_seat_maps
    ADD CONSTRAINT event_seat_maps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.venue_templates(id);


--
-- Name: event_sections event_sections_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_sections
    ADD CONSTRAINT event_sections_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_sections event_sections_seat_map_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_sections
    ADD CONSTRAINT event_sections_seat_map_id_fkey FOREIGN KEY (seat_map_id) REFERENCES public.event_seat_maps(id) ON DELETE CASCADE;


--
-- Name: event_sections event_sections_template_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_sections
    ADD CONSTRAINT event_sections_template_section_id_fkey FOREIGN KEY (template_section_id) REFERENCES public.template_sections(id);


--
-- Name: event_sections event_sections_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_sections
    ADD CONSTRAINT event_sections_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ticket_tiers(id);


--
-- Name: event_subscription_discounts event_subscription_discounts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_subscription_discounts
    ADD CONSTRAINT event_subscription_discounts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_subscription_discounts event_subscription_discounts_subscription_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_subscription_discounts
    ADD CONSTRAINT event_subscription_discounts_subscription_tier_id_fkey FOREIGN KEY (subscription_tier_id) REFERENCES public.subscription_tiers(id) ON DELETE CASCADE;


--
-- Name: event_views event_views_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_views
    ADD CONSTRAINT event_views_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_views event_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_views
    ADD CONSTRAINT event_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: events events_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: events events_required_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_required_tier_id_fkey FOREIGN KEY (required_tier_id) REFERENCES public.subscription_tiers(id);


--
-- Name: experience_purchase_intents experience_purchase_intents_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES auth.users(id);


--
-- Name: experience_purchase_intents experience_purchase_intents_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.experience_schedules(id) ON DELETE SET NULL;


--
-- Name: experience_purchase_intents experience_purchase_intents_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: experience_purchase_intents experience_purchase_intents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_purchase_intents
    ADD CONSTRAINT experience_purchase_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: experience_reviews experience_reviews_experience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_reviews
    ADD CONSTRAINT experience_reviews_experience_id_fkey FOREIGN KEY (experience_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: experience_reviews experience_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_reviews
    ADD CONSTRAINT experience_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: experience_schedules experience_schedules_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_schedules
    ADD CONSTRAINT experience_schedules_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: experience_transactions experience_transactions_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: experience_transactions experience_transactions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: experience_transactions experience_transactions_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.payouts(id);


--
-- Name: experience_transactions experience_transactions_purchase_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_purchase_intent_id_fkey FOREIGN KEY (purchase_intent_id) REFERENCES public.experience_purchase_intents(id) ON DELETE CASCADE;


--
-- Name: experience_transactions experience_transactions_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: experience_transactions experience_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.experience_transactions
    ADD CONSTRAINT experience_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: fan_subscriptions fan_subscriptions_fan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_subscriptions
    ADD CONSTRAINT fan_subscriptions_fan_id_fkey FOREIGN KEY (fan_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: fan_subscriptions fan_subscriptions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_subscriptions
    ADD CONSTRAINT fan_subscriptions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: fan_subscriptions fan_subscriptions_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fan_subscriptions
    ADD CONSTRAINT fan_subscriptions_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.subscription_tiers(id);


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: follows follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_members
    ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: groups groups_subscription_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_subscription_tier_id_fkey FOREIGN KEY (subscription_tier_id) REFERENCES public.subscription_tiers(id) ON DELETE SET NULL;


--
-- Name: matching_queue matching_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matching_queue
    ADD CONSTRAINT matching_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: message_reactions message_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: messages messages_pinned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES auth.users(id);


--
-- Name: messages messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: partner_followers partner_followers_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_followers
    ADD CONSTRAINT partner_followers_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_followers partner_followers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_followers
    ADD CONSTRAINT partner_followers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: partner_gateway_accounts partner_gateway_accounts_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_gateway_accounts
    ADD CONSTRAINT partner_gateway_accounts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_invites partner_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: partner_invites partner_invites_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_invites
    ADD CONSTRAINT partner_invites_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_kyc_documents partner_kyc_documents_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_kyc_documents
    ADD CONSTRAINT partner_kyc_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.partner_stakeholders(id) ON DELETE CASCADE;


--
-- Name: partner_kyc_documents partner_kyc_documents_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_kyc_documents
    ADD CONSTRAINT partner_kyc_documents_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_stakeholders partner_stakeholders_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_stakeholders
    ADD CONSTRAINT partner_stakeholders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_subscribers partner_subscribers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_subscribers
    ADD CONSTRAINT partner_subscribers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: partner_subscribers partner_subscribers_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_subscribers
    ADD CONSTRAINT partner_subscribers_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_team_members partner_team_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: partner_team_members partner_team_members_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: partner_team_members partner_team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_team_members
    ADD CONSTRAINT partner_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: partners partners_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: partners partners_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payouts payouts_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: payouts payouts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: payouts payouts_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: payouts payouts_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id);


--
-- Name: post_bookmarks post_bookmarks_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_bookmarks
    ADD CONSTRAINT post_bookmarks_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_bookmarks post_bookmarks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_bookmarks
    ADD CONSTRAINT post_bookmarks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: post_likes post_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_likes post_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: posts posts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: posts posts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: posts posts_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id);


--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: pricing_rules pricing_rules_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: promo_codes promo_codes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: purchase_intents purchase_intents_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: purchase_intents purchase_intents_promo_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_promo_code_id_fkey FOREIGN KEY (promo_code_id) REFERENCES public.promo_codes(id);


--
-- Name: purchase_intents purchase_intents_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ticket_tiers(id) ON DELETE SET NULL;


--
-- Name: purchase_intents purchase_intents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_intents
    ADD CONSTRAINT purchase_intents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_rated_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_rated_user_id_fkey FOREIGN KEY (rated_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_rater_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_rater_user_id_fkey FOREIGN KEY (rater_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: registration_answers registration_answers_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_answers
    ADD CONSTRAINT registration_answers_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.registration_questions(id) ON DELETE CASCADE;


--
-- Name: registration_answers registration_answers_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_answers
    ADD CONSTRAINT registration_answers_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON DELETE CASCADE;


--
-- Name: registration_questions registration_questions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registration_questions
    ADD CONSTRAINT registration_questions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: reports reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: seat_holds seat_holds_seat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seat_holds
    ADD CONSTRAINT seat_holds_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.seats(id) ON DELETE CASCADE;


--
-- Name: seat_holds seat_holds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seat_holds
    ADD CONSTRAINT seat_holds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: seats seats_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: seats seats_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.event_sections(id) ON DELETE CASCADE;


--
-- Name: seats seats_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seats
    ADD CONSTRAINT seats_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ticket_tiers(id) ON DELETE SET NULL;


--
-- Name: subscription_claims subscription_claims_fan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_claims
    ADD CONSTRAINT subscription_claims_fan_id_fkey FOREIGN KEY (fan_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscription_claims subscription_claims_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_claims
    ADD CONSTRAINT subscription_claims_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: subscription_claims subscription_claims_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_claims
    ADD CONSTRAINT subscription_claims_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.fan_subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscription_payments subscription_payments_fan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_payments
    ADD CONSTRAINT subscription_payments_fan_id_fkey FOREIGN KEY (fan_id) REFERENCES public.users(id);


--
-- Name: subscription_payments subscription_payments_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_payments
    ADD CONSTRAINT subscription_payments_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: subscription_payments subscription_payments_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_payments
    ADD CONSTRAINT subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.fan_subscriptions(id);


--
-- Name: subscription_posts subscription_posts_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_posts
    ADD CONSTRAINT subscription_posts_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: subscription_posts subscription_posts_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_posts
    ADD CONSTRAINT subscription_posts_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.subscription_tiers(id);


--
-- Name: subscription_tiers subscription_tiers_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_tiers
    ADD CONSTRAINT subscription_tiers_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id);


--
-- Name: support_tickets support_tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: table_members table_members_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_members
    ADD CONSTRAINT table_members_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: table_members table_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_members
    ADD CONSTRAINT table_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: table_members table_members_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_members
    ADD CONSTRAINT table_members_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id);


--
-- Name: table_participants table_participants_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_participants
    ADD CONSTRAINT table_participants_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: table_participants table_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.table_participants
    ADD CONSTRAINT table_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tables tables_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE SET NULL;


--
-- Name: tables tables_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tables tables_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: team_comms team_comms_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_comms
    ADD CONSTRAINT team_comms_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.team_comms(id);


--
-- Name: template_sections template_sections_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_sections
    ADD CONSTRAINT template_sections_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.venue_templates(id) ON DELETE CASCADE;


--
-- Name: ticket_tiers ticket_tiers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_tiers
    ADD CONSTRAINT ticket_tiers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.users(id);


--
-- Name: tickets tickets_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_purchase_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_purchase_intent_id_fkey FOREIGN KEY (purchase_intent_id) REFERENCES public.purchase_intents(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_registration_id_fkey FOREIGN KEY (registration_id) REFERENCES public.event_registrations(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_seat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES public.seats(id);


--
-- Name: tickets tickets_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES public.ticket_tiers(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_payout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_payout_id_fkey FOREIGN KEY (payout_id) REFERENCES public.payouts(id);


--
-- Name: transactions transactions_purchase_intent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_purchase_intent_id_fkey FOREIGN KEY (purchase_intent_id) REFERENCES public.purchase_intents(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: travel_matches travel_matches_travel_plan_id_1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_matches
    ADD CONSTRAINT travel_matches_travel_plan_id_1_fkey FOREIGN KEY (travel_plan_id_1) REFERENCES public.travel_plans(id) ON DELETE CASCADE;


--
-- Name: travel_matches travel_matches_travel_plan_id_2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_matches
    ADD CONSTRAINT travel_matches_travel_plan_id_2_fkey FOREIGN KEY (travel_plan_id_2) REFERENCES public.travel_plans(id) ON DELETE CASCADE;


--
-- Name: travel_plans travel_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_plans
    ADD CONSTRAINT travel_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trip_chat_participants trip_chat_participants_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_chat_participants
    ADD CONSTRAINT trip_chat_participants_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.trip_group_chats(id) ON DELETE CASCADE;


--
-- Name: trip_chat_participants trip_chat_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_chat_participants
    ADD CONSTRAINT trip_chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trip_messages trip_messages_chat_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_messages
    ADD CONSTRAINT trip_messages_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES public.trip_group_chats(id) ON DELETE CASCADE;


--
-- Name: trip_messages trip_messages_reply_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_messages
    ADD CONSTRAINT trip_messages_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.trip_messages(id) ON DELETE SET NULL;


--
-- Name: trip_messages trip_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_messages
    ADD CONSTRAINT trip_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: trip_participants trip_participants_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.user_trips(id) ON DELETE CASCADE;


--
-- Name: trip_participants trip_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_participants
    ADD CONSTRAINT trip_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_badge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_gamification_stats user_gamification_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_gamification_stats
    ADD CONSTRAINT user_gamification_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_interests user_interests_interest_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_interest_tag_id_fkey FOREIGN KEY (interest_tag_id) REFERENCES public.interest_tags(id) ON DELETE CASCADE;


--
-- Name: user_interests user_interests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_interests
    ADD CONSTRAINT user_interests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_personality user_personality_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personality
    ADD CONSTRAINT user_personality_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_photos user_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_photos
    ADD CONSTRAINT user_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_trips user_trips_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_trips
    ADD CONSTRAINT user_trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_status_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_status_changed_by_fkey FOREIGN KEY (status_changed_by) REFERENCES public.users(id);


--
-- Name: venue_templates venue_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venue_templates
    ADD CONSTRAINT venue_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: wallet_topups wallet_topups_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_topups
    ADD CONSTRAINT wallet_topups_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id);


--
-- Name: wallet_topups wallet_topups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_topups
    ADD CONSTRAINT wallet_topups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: webhook_deliveries webhook_deliveries_webhook_endpoint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_endpoint_id_fkey FOREIGN KEY (webhook_endpoint_id) REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE;


--
-- Name: webhook_endpoints webhook_endpoints_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE;


--
-- Name: admin_email_campaigns Admin full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin full access" ON public.admin_email_campaigns USING (true) WITH CHECK (true);


--
-- Name: admin_popups Admin full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin full access" ON public.admin_popups USING (true) WITH CHECK (true);


--
-- Name: POLICY "Admin full access" ON admin_popups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Admin full access" ON public.admin_popups IS 'Allows full CRUD access for web admins managing popups.';


--
-- Name: ad_invoices Admin full access to ad_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin full access to ad_invoices" ON public.ad_invoices USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true)))));


--
-- Name: partners Admins can delete partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete partners" ON public.partners FOR DELETE USING ((public.is_user_admin() IS NOT NULL));


--
-- Name: group_members Admins can invite members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can invite members" ON public.group_members FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = group_members.group_id) AND (gm.user_id = auth.uid()) AND (gm.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (gm.status = 'approved'::text))))));


--
-- Name: registration_answers Admins can read all registration answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all registration answers" ON public.registration_answers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: registration_questions Admins can read all registration questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all registration questions" ON public.registration_questions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: group_members Admins can remove members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can remove members" ON public.group_members FOR DELETE USING (public.is_group_admin(group_id, auth.uid()));


--
-- Name: events Admins can update all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all events" ON public.events FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: partners Admins can update all partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all partners" ON public.partners FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: tables Admins can update all tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update all tables" ON public.tables FOR UPDATE USING ((public.is_user_admin() IS NOT NULL)) WITH CHECK ((public.is_user_admin() IS NOT NULL));


--
-- Name: group_members Admins can update members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update members" ON public.group_members FOR UPDATE USING (public.is_group_moderator(group_id, auth.uid()));


--
-- Name: partners Admins can update partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update partners" ON public.partners FOR UPDATE USING ((public.is_user_admin() IS NOT NULL));


--
-- Name: payouts Admins can update payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update payouts" ON public.payouts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: reports Admins can update reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING ((public.is_user_admin() IS NOT NULL));


--
-- Name: support_tickets Admins can update tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update tickets" ON public.support_tickets FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: bank_accounts Admins can view all bank accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all bank accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (public.check_is_admin());


--
-- Name: events Admins can view all events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all events" ON public.events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: partners Admins can view all partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all partners" ON public.partners FOR SELECT USING ((public.is_user_admin() IS NOT NULL));


--
-- Name: payouts Admins can view all payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payouts" ON public.payouts FOR SELECT TO authenticated USING (public.check_is_admin());


--
-- Name: reports Admins can view all reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING ((public.is_user_admin() IS NOT NULL));


--
-- Name: tables Admins can view all tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tables" ON public.tables FOR SELECT USING ((public.is_user_admin() IS NOT NULL));


--
-- Name: support_tickets Admins can view all tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tickets" ON public.support_tickets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: users Admins can view all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all users" ON public.users FOR SELECT TO authenticated USING (public.check_is_admin());


--
-- Name: waitlist Allow admin reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin reads" ON public.waitlist FOR SELECT USING (true);


--
-- Name: waitlist Allow anonymous inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous inserts" ON public.waitlist FOR INSERT WITH CHECK (true);


--
-- Name: admin_popups Allow anonymous reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous reads" ON public.admin_popups FOR SELECT USING ((is_active = true));


--
-- Name: POLICY "Allow anonymous reads" ON admin_popups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Allow anonymous reads" ON public.admin_popups IS 'Required for the mobile app to fetch active popups on startup.';


--
-- Name: admin_popups Allow public read access to active popups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to active popups" ON public.admin_popups FOR SELECT USING ((is_active = true));


--
-- Name: purchase_intents Allow purchase intent creation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow purchase intent creation" ON public.purchase_intents FOR INSERT WITH CHECK (((auth.uid() = user_id) OR ((user_id IS NULL) AND (guest_email IS NOT NULL)) OR (auth.role() = 'service_role'::text)));


--
-- Name: purchase_intents Allow purchase intent select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow purchase intent select" ON public.purchase_intents FOR SELECT USING (((auth.uid() = user_id) OR (auth.role() = 'service_role'::text)));


--
-- Name: event_views Anyone can track event views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can track event views" ON public.event_views FOR INSERT WITH CHECK (true);


--
-- Name: trip_chat_participants Anyone can view chat participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view chat participants" ON public.trip_chat_participants FOR SELECT USING (true);


--
-- Name: comments Anyone can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view comments" ON public.comments FOR SELECT USING (true);


--
-- Name: experience_reviews Anyone can view experience reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view experience reviews" ON public.experience_reviews FOR SELECT USING (true);


--
-- Name: post_likes Anyone can view likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view likes" ON public.post_likes FOR SELECT USING (true);


--
-- Name: tables Anyone can view non-group-only tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view non-group-only tables" ON public.tables FOR SELECT USING ((visibility IS DISTINCT FROM 'group_only'::text));


--
-- Name: groups Anyone can view public and private groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view public and private groups" ON public.groups FOR SELECT USING ((privacy = ANY (ARRAY['public'::text, 'private'::text])));


--
-- Name: experience_schedules Anyone can view schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view schedules" ON public.experience_schedules FOR SELECT USING (true);


--
-- Name: trip_group_chats Anyone can view trip chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view trip chats" ON public.trip_group_chats FOR SELECT USING (true);


--
-- Name: trip_participants Anyone can view trip participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view trip participants" ON public.trip_participants FOR SELECT USING (true);


--
-- Name: user_photos Anyone can view user photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view user photos" ON public.user_photos FOR SELECT USING (true);


--
-- Name: tables Approved partners can create experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved partners can create experiences" ON public.tables FOR INSERT TO authenticated WITH CHECK (((auth.uid() = host_id) AND (is_experience = true) AND (partner_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.partners
  WHERE ((partners.id = tables.partner_id) AND (partners.user_id = auth.uid()) AND (partners.status = 'approved'::public.partner_status))))));


--
-- Name: team_comms Authenticated can read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read" ON public.team_comms FOR SELECT TO authenticated USING (true);


--
-- Name: apk_releases Authenticated delete for apk_releases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated delete for apk_releases" ON public.apk_releases FOR DELETE TO authenticated USING (true);


--
-- Name: apk_releases Authenticated insert for apk_releases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated insert for apk_releases" ON public.apk_releases FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: apk_releases Authenticated update for apk_releases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated update for apk_releases" ON public.apk_releases FOR UPDATE TO authenticated USING (true);


--
-- Name: groups Authenticated users can create groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT WITH CHECK ((auth.uid() = created_by));


--
-- Name: experience_reviews Authenticated users can create reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create reviews" ON public.experience_reviews FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: trip_group_chats Authenticated users can create trip chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create trip chats" ON public.trip_group_chats FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: chat_polls Authenticated users can read polls; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read polls" ON public.chat_polls FOR SELECT TO authenticated USING (true);


--
-- Name: chat_poll_votes Authenticated users can read votes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read votes" ON public.chat_poll_votes FOR SELECT TO authenticated USING (true);


--
-- Name: trip_chat_participants Authenticated users can view trip chat participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view trip chat participants" ON public.trip_chat_participants FOR SELECT TO authenticated USING (true);


--
-- Name: story_views Authors and viewers can read views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authors and viewers can read views" ON public.story_views FOR SELECT USING (((auth.uid() = viewer_id) OR (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = story_views.post_id) AND (p.user_id = auth.uid()))))));


--
-- Name: badges Badges are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Badges are viewable by everyone" ON public.badges FOR SELECT USING (true);


--
-- Name: trip_messages Chat participants can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chat participants can send messages" ON public.trip_messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM public.trip_chat_participants
  WHERE ((trip_chat_participants.chat_id = trip_messages.chat_id) AND (trip_chat_participants.user_id = auth.uid()))))));


--
-- Name: trip_messages Chat participants can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Chat participants can view messages" ON public.trip_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.trip_chat_participants
  WHERE ((trip_chat_participants.chat_id = trip_messages.chat_id) AND (trip_chat_participants.user_id = auth.uid())))));


--
-- Name: comment_likes Comment likes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comment likes are viewable by everyone" ON public.comment_likes FOR SELECT USING (true);


--
-- Name: comments Comments are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);


--
-- Name: chat_polls Creator can insert poll; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creator can insert poll" ON public.chat_polls FOR INSERT TO authenticated WITH CHECK ((creator_id = auth.uid()));


--
-- Name: chat_polls Creator can update poll; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creator can update poll" ON public.chat_polls FOR UPDATE TO authenticated USING ((creator_id = auth.uid()));


--
-- Name: groups Creator can view own group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Creator can view own group" ON public.groups FOR SELECT TO authenticated USING ((created_by = auth.uid()));


--
-- Name: reports Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users" ON public.reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: table_members Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.table_members FOR SELECT USING (true);


--
-- Name: table_participants Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.table_participants FOR SELECT USING (true);


--
-- Name: user_photos Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.user_photos FOR SELECT USING (true);


--
-- Name: users Enable read access for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all users" ON public.users FOR SELECT USING (true);


--
-- Name: reports Enable read for reporters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read for reporters" ON public.reports FOR SELECT TO authenticated USING ((auth.uid() = reporter_id));


--
-- Name: follows Follows are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Follows are viewable by everyone" ON public.follows FOR SELECT USING (true);


--
-- Name: messages Group members can pin messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can pin messages" ON public.messages FOR UPDATE TO authenticated USING (((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()))) WITH CHECK (((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid())));


--
-- Name: tables Group members can view group_only tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group members can view group_only tables" ON public.tables FOR SELECT TO authenticated USING (((visibility = 'group_only'::text) AND (group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid())));


--
-- Name: groups Group owner can delete group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group owner can delete group" ON public.groups FOR DELETE USING ((created_by = auth.uid()));


--
-- Name: groups Group owner or admin can update group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Group owner or admin can update group" ON public.groups FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = groups.id) AND (group_members.user_id = auth.uid()) AND (group_members.role = ANY (ARRAY['owner'::text, 'admin'::text])) AND (group_members.status = 'approved'::text)))));


--
-- Name: tables Hosts can delete their own tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can delete their own tables" ON public.tables FOR DELETE USING ((auth.uid() = host_id));


--
-- Name: table_members Hosts can manage members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can manage members" ON public.table_members FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.tables
  WHERE ((tables.id = table_members.table_id) AND (tables.host_id = auth.uid())))));


--
-- Name: experience_schedules Hosts can manage their schedules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can manage their schedules" ON public.experience_schedules USING ((auth.uid() IN ( SELECT tables.host_id
   FROM public.tables
  WHERE (tables.id = experience_schedules.table_id))));


--
-- Name: table_members Hosts can mute members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can mute members" ON public.table_members FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.tables
  WHERE ((tables.id = table_members.table_id) AND (tables.host_id = auth.uid())))));


--
-- Name: experience_purchase_intents Hosts can update experience purchase intents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can update experience purchase intents" ON public.experience_purchase_intents FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = experience_purchase_intents.table_id) AND (t.host_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = experience_purchase_intents.table_id) AND (t.host_id = auth.uid())))));


--
-- Name: tables Hosts can update their own tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can update their own tables" ON public.tables FOR UPDATE USING ((auth.uid() = host_id));


--
-- Name: experience_purchase_intents Hosts can view bookings for their experiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can view bookings for their experiences" ON public.experience_purchase_intents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = experience_purchase_intents.table_id) AND (t.host_id = auth.uid())))));


--
-- Name: experience_transactions Hosts can view own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Hosts can view own transactions" ON public.experience_transactions FOR SELECT USING ((auth.uid() = host_id));


--
-- Name: interest_tags Interest tags are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Interest tags are viewable by everyone" ON public.interest_tags FOR SELECT USING (true);


--
-- Name: activity_checkins Members can view activity checkins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view activity checkins" ON public.activity_checkins FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.table_members tm
  WHERE ((tm.table_id = activity_checkins.table_id) AND (tm.user_id = auth.uid()) AND (tm.status = ANY (ARRAY['approved'::public.member_status_type, 'joined'::public.member_status_type, 'attended'::public.member_status_type])))))));


--
-- Name: group_members Members can view group roster; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view group roster" ON public.group_members FOR SELECT USING ((public.is_group_member(group_id, auth.uid()) OR (user_id = auth.uid())));


--
-- Name: groups Members can view hidden groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view hidden groups" ON public.groups FOR SELECT TO authenticated USING (((privacy = 'hidden'::text) AND (EXISTS ( SELECT 1
   FROM public.group_members
  WHERE ((group_members.group_id = groups.id) AND (group_members.user_id = auth.uid()) AND (group_members.status = 'approved'::text))))));


--
-- Name: admin_actions Only admins can insert admin actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can insert admin actions" ON public.admin_actions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: admin_actions Only admins can view admin actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can view admin actions" ON public.admin_actions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::text)))));


--
-- Name: events Organizers can create own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can create own events" ON public.events FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners
  WHERE ((partners.id = events.organizer_id) AND (partners.user_id = auth.uid()) AND (partners.status = 'approved'::public.partner_status)))));


--
-- Name: bank_accounts Organizers can manage own bank accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can manage own bank accounts" ON public.bank_accounts USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())
UNION
 SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE ((partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role]))))));


--
-- Name: registration_questions Organizers can manage own registration questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can manage own registration questions" ON public.registration_questions USING ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.organizer_id IN ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid()))))));


--
-- Name: promo_codes Organizers can manage promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can manage promo codes" ON public.promo_codes TO authenticated USING ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.organizer_id IN ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
        UNION
         SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE (partner_team_members.user_id = auth.uid())))))) WITH CHECK ((event_id IN ( SELECT events.id
   FROM public.events
  WHERE (events.organizer_id IN ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
        UNION
         SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE (partner_team_members.user_id = auth.uid()))))));


--
-- Name: partner_subscribers Organizers can manage subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can manage subscribers" ON public.partner_subscribers TO authenticated USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())
UNION
 SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid())))) WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())
UNION
 SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))));


--
-- Name: promo_codes Organizers can manage their event promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can manage their event promo codes" ON public.promo_codes USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = promo_codes.event_id) AND (events.organizer_id IN ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())))))));


--
-- Name: registration_answers Organizers can read answers for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can read answers for their events" ON public.registration_answers FOR SELECT USING ((question_id IN ( SELECT rq.id
   FROM ((public.registration_questions rq
     JOIN public.events e ON ((rq.event_id = e.id)))
     JOIN public.partners p ON ((e.organizer_id = p.id)))
  WHERE (p.user_id = auth.uid()))));


--
-- Name: payouts Organizers can request payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can request payouts" ON public.payouts FOR INSERT TO authenticated WITH CHECK (((partner_id IN ( SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))) OR (partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())))));


--
-- Name: events Organizers can update own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can update own events" ON public.events FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.partners
  WHERE ((partners.id = events.organizer_id) AND (partners.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners
  WHERE ((partners.id = events.organizer_id) AND (partners.user_id = auth.uid())))));


--
-- Name: tickets Organizers can update tickets for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can update tickets for their events" ON public.tickets FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND ((events.organizer_id = ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
         LIMIT 1)) OR (events.organizer_id IN ( SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE ((partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role, 'scanner'::public.partner_role])))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND ((events.organizer_id = ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
         LIMIT 1)) OR (events.organizer_id IN ( SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE ((partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role, 'scanner'::public.partner_role]))))))))));


--
-- Name: bank_accounts Organizers can view bank accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view bank accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (((partner_id IN ( SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))) OR (partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())))));


--
-- Name: bank_accounts Organizers can view own bank accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view own bank accounts" ON public.bank_accounts FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())
UNION
 SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))));


--
-- Name: events Organizers can view own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view own events" ON public.events FOR SELECT TO authenticated USING (((organizer_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))) OR (organizer_id IN ( SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid())))));


--
-- Name: payouts Organizers can view payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view payouts" ON public.payouts FOR SELECT TO authenticated USING (((partner_id IN ( SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))) OR (partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())))));


--
-- Name: purchase_intents Organizers can view purchase intents for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view purchase intents for their events" ON public.purchase_intents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = purchase_intents.event_id) AND ((events.organizer_id = ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
         LIMIT 1)) OR (events.organizer_id IN ( SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE (partner_team_members.user_id = auth.uid()))))))));


--
-- Name: tickets Organizers can view tickets for their events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view tickets for their events" ON public.tickets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = tickets.event_id) AND ((events.organizer_id = ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
         LIMIT 1)) OR (events.organizer_id IN ( SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE (partner_team_members.user_id = auth.uid()))))))));


--
-- Name: transactions Organizers can view transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Organizers can view transactions" ON public.transactions FOR SELECT TO authenticated USING (((partner_id IN ( SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))) OR (partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())))));


--
-- Name: partner_team_members Owners can manage team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage team members" ON public.partner_team_members TO authenticated USING (public.is_partner_owner(partner_id)) WITH CHECK (public.is_partner_owner(partner_id));


--
-- Name: direct_chats Participants can update chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can update chats" ON public.direct_chats FOR UPDATE USING (public.is_direct_chat_member(id));


--
-- Name: direct_chats Participants can view chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants can view chats" ON public.direct_chats FOR SELECT USING (public.is_direct_chat_member(id));


--
-- Name: partners Partners can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can insert own profile" ON public.partners FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (status = 'pending'::public.partner_status)));


--
-- Name: partner_subscribers Partners can insert their own subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can insert their own subscribers" ON public.partner_subscribers FOR INSERT WITH CHECK ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: events Partners can manage own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can manage own events" ON public.events USING ((organizer_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: email_campaigns Partners can manage their own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can manage their own campaigns" ON public.email_campaigns USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: ad_clicks Partners can read own ad_clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can read own ad_clicks" ON public.ad_clicks FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: ad_invoices Partners can read own ad_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can read own ad_invoices" ON public.ad_invoices FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: partners Partners can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can update own profile" ON public.partners FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: partner_subscribers Partners can update their own subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can update their own subscribers" ON public.partner_subscribers FOR UPDATE USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: partners Partners can view own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view own data" ON public.partners FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: experience_transactions Partners can view own experience transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view own experience transactions" ON public.experience_transactions FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: payouts Partners can view own payouts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view own payouts" ON public.payouts FOR SELECT USING ((auth.uid() IN ( SELECT partners.user_id
   FROM public.partners
  WHERE (partners.id = payouts.partner_id))));


--
-- Name: partners Partners can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view own profile" ON public.partners FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: wallet_topups Partners can view own topups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view own topups" ON public.wallet_topups FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: transactions Partners can view own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view own transactions" ON public.transactions FOR SELECT USING ((auth.uid() IN ( SELECT partners.user_id
   FROM public.partners
  WHERE (partners.id = transactions.partner_id))));


--
-- Name: email_campaigns Partners can view their own campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view their own campaigns" ON public.email_campaigns FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: partner_subscribers Partners can view their own subscribers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view their own subscribers" ON public.partner_subscribers FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid()))));


--
-- Name: email_suppressions Partners can view their own suppressions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners can view their own suppressions" ON public.email_suppressions FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())
UNION
 SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))));


--
-- Name: ticket_tiers Partners manage their ticket tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners manage their ticket tiers" ON public.ticket_tiers TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = ticket_tiers.event_id) AND ((events.organizer_id = ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
         LIMIT 1)) OR (events.organizer_id IN ( SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE ((partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role])))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = ticket_tiers.event_id) AND ((events.organizer_id = ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
         LIMIT 1)) OR (events.organizer_id IN ( SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE ((partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role]))))))))));


--
-- Name: email_events Partners read own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners read own events" ON public.email_events FOR SELECT USING ((campaign_id IN ( SELECT c.id
   FROM public.email_campaigns c
  WHERE (c.partner_id IN ( SELECT partners.id
           FROM public.partners
          WHERE (partners.user_id = auth.uid())
        UNION
         SELECT partner_team_members.partner_id
           FROM public.partner_team_members
          WHERE (partner_team_members.user_id = auth.uid()))))));


--
-- Name: email_sends Partners read own sends; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Partners read own sends" ON public.email_sends FOR SELECT USING ((partner_id IN ( SELECT partners.id
   FROM public.partners
  WHERE (partners.user_id = auth.uid())
UNION
 SELECT partner_team_members.partner_id
   FROM public.partner_team_members
  WHERE (partner_team_members.user_id = auth.uid()))));


--
-- Name: comments Post author can delete any comment on their post; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post author can delete any comment on their post" ON public.comments FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.posts
  WHERE ((posts.id = comments.post_id) AND (posts.user_id = auth.uid())))));


--
-- Name: post_likes Post likes are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Post likes are viewable by everyone" ON public.post_likes FOR SELECT USING (true);


--
-- Name: posts Posts are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (((visibility = 'public'::text) OR (user_id = auth.uid()) OR ((visibility = 'followers'::text) AND (EXISTS ( SELECT 1
   FROM public.follows
  WHERE ((follows.follower_id = auth.uid()) AND (follows.following_id = posts.user_id)))))));


--
-- Name: pricing_rules Pricing rules are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pricing rules are viewable by everyone" ON public.pricing_rules FOR SELECT USING (true);


--
-- Name: comment_reactions Public can read comment reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read comment reactions" ON public.comment_reactions FOR SELECT USING (true);


--
-- Name: message_reactions Public can read message reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read message reactions" ON public.message_reactions FOR SELECT USING (true);


--
-- Name: registration_questions Public can read registration questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read registration questions" ON public.registration_questions FOR SELECT USING (true);


--
-- Name: partner_subscribers Public can unsubscribe via token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can unsubscribe via token" ON public.partner_subscribers FOR UPDATE USING ((unsubscribe_token = (((current_setting('request.headers'::text))::json ->> 'x-unsubscribe-token'::text))::uuid)) WITH CHECK ((unsubscribe_token = (((current_setting('request.headers'::text))::json ->> 'x-unsubscribe-token'::text))::uuid));


--
-- Name: events Public can view active events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active events" ON public.events FOR SELECT TO authenticated, anon USING ((status = 'active'::public.event_status));


--
-- Name: promo_codes Public can view active promo codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active promo codes" ON public.promo_codes FOR SELECT USING ((is_active = true));


--
-- Name: ticket_tiers Public can view active ticket tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view active ticket tiers" ON public.ticket_tiers FOR SELECT USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.events
  WHERE ((events.id = ticket_tiers.event_id) AND (events.status = 'active'::public.event_status))))));


--
-- Name: partners Public can view partners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view partners" ON public.partners FOR SELECT USING (true);


--
-- Name: events Public can view published events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view published events" ON public.events FOR SELECT USING (((status)::text <> 'draft'::text));


--
-- Name: users Public profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable by everyone" ON public.users FOR SELECT USING (true);


--
-- Name: apk_releases Public read access for apk_releases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read access for apk_releases" ON public.apk_releases FOR SELECT USING (true);


--
-- Name: tickets Scanners can view org event tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Scanners can view org event tickets" ON public.tickets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partner_team_members ptm ON ((e.organizer_id = ptm.partner_id)))
  WHERE ((e.id = tickets.event_id) AND (ptm.user_id = auth.uid()) AND (ptm.is_active = true)))));


--
-- Name: direct_messages Send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Send messages" ON public.direct_messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND public.is_direct_chat_member(chat_id)));


--
-- Name: chat_inbox Service can manage all inbox rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service can manage all inbox rows" ON public.chat_inbox TO service_role USING (true) WITH CHECK (true);


--
-- Name: ad_clicks Service role can insert ad clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert ad clicks" ON public.ad_clicks FOR INSERT WITH CHECK (true);


--
-- Name: ad_clicks Service role can read ad clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can read ad clicks" ON public.ad_clicks FOR SELECT USING (true);


--
-- Name: partner_team_members Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.partner_team_members TO service_role USING (true) WITH CHECK (true);


--
-- Name: team_comms Service role full access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access" ON public.team_comms TO service_role USING (true) WITH CHECK (true);


--
-- Name: experience_transactions Service role full access on experience transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on experience transactions" ON public.experience_transactions USING ((auth.role() = 'service_role'::text));


--
-- Name: transactions Service role full access on transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on transactions" ON public.transactions USING ((auth.role() = 'service_role'::text));


--
-- Name: wallet_topups Service role full access on wallet_topups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on wallet_topups" ON public.wallet_topups USING ((auth.role() = 'service_role'::text));


--
-- Name: app_team_memory Service role only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role only" ON public.app_team_memory USING (false) WITH CHECK (false);


--
-- Name: user_gamification_stats Stats are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Stats are viewable by everyone" ON public.user_gamification_stats FOR SELECT USING (true);


--
-- Name: messages Table members can pin messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Table members can pin messages" ON public.messages FOR UPDATE TO authenticated USING (((table_id IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.table_members tm
  WHERE ((tm.table_id = messages.table_id) AND (tm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = messages.table_id) AND (t.host_id = auth.uid()))))))) WITH CHECK (((table_id IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM public.table_members tm
  WHERE ((tm.table_id = messages.table_id) AND (tm.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = messages.table_id) AND (t.host_id = auth.uid())))))));


--
-- Name: partner_invites Team leads can manage invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team leads can manage invites" ON public.partner_invites USING (((EXISTS ( SELECT 1
   FROM public.partner_team_members
  WHERE ((partner_team_members.partner_id = partner_invites.partner_id) AND (partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role]))))) OR (EXISTS ( SELECT 1
   FROM public.partners
  WHERE ((partners.id = partner_invites.partner_id) AND (partners.user_id = auth.uid()))))));


--
-- Name: partner_invites Team leads can view invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team leads can view invites" ON public.partner_invites FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.partner_team_members
  WHERE ((partner_team_members.partner_id = partner_invites.partner_id) AND (partner_team_members.user_id = auth.uid()) AND (partner_team_members.role = ANY (ARRAY['owner'::public.partner_role, 'manager'::public.partner_role]))))) OR (EXISTS ( SELECT 1
   FROM public.partners
  WHERE ((partners.id = partner_invites.partner_id) AND (partners.user_id = auth.uid()))))));


--
-- Name: partners Team members can view their partner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team members can view their partner" ON public.partners FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_team_member_of_partner(id)));


--
-- Name: ticket_tiers Ticket tiers are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ticket tiers are viewable by everyone" ON public.ticket_tiers FOR SELECT USING (true);


--
-- Name: trip_participants Trip creators can add participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trip creators can add participants" ON public.trip_participants FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_trips
  WHERE ((user_trips.id = trip_participants.trip_id) AND (user_trips.user_id = auth.uid())))));


--
-- Name: user_badges User badges are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "User badges are viewable by everyone" ON public.user_badges FOR SELECT USING (true);


--
-- Name: post_bookmarks Users can add bookmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add bookmarks" ON public.post_bookmarks FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: message_reactions Users can add reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: message_reactions Users can add reactions to their table messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add reactions to their table messages" ON public.message_reactions FOR INSERT WITH CHECK ((((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.table_members tm ON ((tm.table_id = m.table_id)))
  WHERE ((m.id = message_reactions.message_id) AND (tm.user_id = auth.uid()) AND (tm.status = ANY (ARRAY['approved'::public.member_status_type, 'joined'::public.member_status_type, 'attended'::public.member_status_type])))))) OR (EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.tables t ON ((t.id = m.table_id)))
  WHERE ((m.id = message_reactions.message_id) AND (t.host_id = auth.uid()))))));


--
-- Name: tables Users can create hangout tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create hangout tables" ON public.tables FOR INSERT WITH CHECK (((auth.uid() = host_id) AND (is_experience IS NOT TRUE)));


--
-- Name: comments Users can create their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own comments" ON public.comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: posts Users can create their own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own posts" ON public.posts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_trips Users can create their own trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own trips" ON public.user_trips FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: support_tickets Users can create tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create tickets" ON public.support_tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: comment_reactions Users can delete their own comment reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comment reactions" ON public.comment_reactions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: direct_messages Users can delete their own direct messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own direct messages" ON public.direct_messages FOR DELETE USING ((sender_id = auth.uid()));


--
-- Name: partner_followers Users can delete their own follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own follows" ON public.partner_followers FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: post_likes Users can delete their own likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own likes" ON public.post_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: table_members Users can delete their own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own membership" ON public.table_members FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: message_reactions Users can delete their own message reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own message reactions" ON public.message_reactions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: messages Users can delete their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING ((auth.uid() = sender_id));


--
-- Name: user_photos Users can delete their own photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own photos" ON public.user_photos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: posts Users can delete their own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own posts" ON public.posts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: experience_reviews Users can delete their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own reviews" ON public.experience_reviews FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: trip_messages Users can delete their own trip messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own trip messages" ON public.trip_messages FOR DELETE USING ((sender_id = auth.uid()));


--
-- Name: user_trips Users can delete their own trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own trips" ON public.user_trips FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: chat_poll_votes Users can delete their vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their vote" ON public.chat_poll_votes FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: follows Users can follow others; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can follow others" ON public.follows FOR INSERT WITH CHECK ((auth.uid() = follower_id));


--
-- Name: notifications Users can insert notifications for others (e.g. Invites); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert notifications for others (e.g. Invites)" ON public.notifications FOR INSERT WITH CHECK ((auth.uid() = actor_id));


--
-- Name: story_views Users can insert own views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own views" ON public.story_views FOR INSERT WITH CHECK ((auth.uid() = viewer_id));


--
-- Name: ratings Users can insert ratings they gave; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert ratings they gave" ON public.ratings FOR INSERT TO authenticated WITH CHECK ((rater_user_id = auth.uid()));


--
-- Name: comment_reactions Users can insert their own comment reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own comment reactions" ON public.comment_reactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: comments Users can insert their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own comments" ON public.comments FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: partner_followers Users can insert their own follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own follows" ON public.partner_followers FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: post_likes Users can insert their own likes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own likes" ON public.post_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: message_reactions Users can insert their own message reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own message reactions" ON public.message_reactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_photos Users can insert their own photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own photos" ON public.user_photos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: users Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.users FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: table_members Users can join tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can join tables" ON public.table_members FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: table_participants Users can join tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can join tables" ON public.table_participants FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: trip_chat_participants Users can join trip chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can join trip chats" ON public.trip_chat_participants FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: table_participants Users can leave tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can leave tables" ON public.table_participants FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: trip_chat_participants Users can leave trip chats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can leave trip chats" ON public.trip_chat_participants FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: trip_participants Users can leave trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can leave trips" ON public.trip_participants FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: comment_likes Users can like comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can like comments" ON public.comment_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: post_likes Users can like posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can like posts" ON public.post_likes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: registration_answers Users can manage own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own answers" ON public.registration_answers USING ((registration_id IN ( SELECT event_registrations.id
   FROM public.event_registrations
  WHERE (event_registrations.user_id = auth.uid()))));


--
-- Name: blocks Users can manage own blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own blocks" ON public.blocks TO authenticated USING ((blocker_user_id = auth.uid()));


--
-- Name: user_interests Users can manage own interests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own interests" ON public.user_interests TO authenticated USING ((user_id = auth.uid()));


--
-- Name: travel_plans Users can manage own travel plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own travel plans" ON public.travel_plans TO authenticated USING ((user_id = auth.uid()));


--
-- Name: ratings Users can read ratings they gave or received; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read ratings they gave or received" ON public.ratings FOR SELECT TO authenticated USING (((rater_user_id = auth.uid()) OR (rated_user_id = auth.uid())));


--
-- Name: message_reactions Users can read reactions from their tables; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read reactions from their tables" ON public.message_reactions FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.table_members tm ON ((tm.table_id = m.table_id)))
  WHERE ((m.id = message_reactions.message_id) AND (tm.user_id = auth.uid()) AND (tm.status = ANY (ARRAY['approved'::public.member_status_type, 'joined'::public.member_status_type, 'attended'::public.member_status_type]))))) OR (EXISTS ( SELECT 1
   FROM (public.messages m
     JOIN public.tables t ON ((t.id = m.table_id)))
  WHERE ((m.id = message_reactions.message_id) AND (t.host_id = auth.uid()))))));


--
-- Name: post_bookmarks Users can remove bookmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove bookmarks" ON public.post_bookmarks FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: group_members Users can remove own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove own membership" ON public.group_members FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: messages Users can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send messages" ON public.messages FOR INSERT WITH CHECK (((auth.uid() = sender_id) AND (((table_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.table_members tm
  WHERE ((tm.table_id = messages.table_id) AND (tm.user_id = auth.uid()))))) OR ((table_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = messages.table_id) AND (t.host_id = auth.uid()))))) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()) AND ((NOT (EXISTS ( SELECT 1
   FROM public.groups g
  WHERE ((g.id = messages.group_id) AND (g.broadcast_mode = true))))) OR (EXISTS ( SELECT 1
   FROM public.group_members gm
  WHERE ((gm.group_id = gm.group_id) AND (gm.user_id = auth.uid()) AND (gm.role = 'admin'::text)))))))));


--
-- Name: messages Users can soft-delete their own messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can soft-delete their own messages" ON public.messages FOR UPDATE TO authenticated USING ((sender_id = auth.uid()));


--
-- Name: follows Users can unfollow others; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unfollow others" ON public.follows FOR DELETE USING ((auth.uid() = follower_id));


--
-- Name: comment_likes Users can unlike comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unlike comments" ON public.comment_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: post_likes Users can unlike posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unlike posts" ON public.post_likes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: chat_inbox Users can update own inbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own inbox" ON public.chat_inbox FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: group_members Users can update own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own membership" ON public.group_members FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: direct_chat_participants Users can update own participant record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own participant record" ON public.direct_chat_participants FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_personality Users can update own personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own personality" ON public.user_personality FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_preferences Users can update own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: users Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING ((auth.uid() = id));


--
-- Name: story_views Users can update own views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own views" ON public.story_views FOR UPDATE USING ((auth.uid() = viewer_id)) WITH CHECK ((auth.uid() = viewer_id));


--
-- Name: comments Users can update their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own comments" ON public.comments FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: direct_messages Users can update their own direct messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own direct messages" ON public.direct_messages FOR UPDATE USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));


--
-- Name: users Users can update their own fcm_token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own fcm_token" ON public.users FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: table_members Users can update their own membership; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own membership" ON public.table_members FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: users Users can update their own notification_preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notification_preferences" ON public.users FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: table_participants Users can update their own participation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own participation" ON public.table_participants FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: user_photos Users can update their own photos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own photos" ON public.user_photos FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: posts Users can update their own posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own posts" ON public.posts FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: experience_reviews Users can update their own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own reviews" ON public.experience_reviews FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: trip_chat_participants Users can update their own trip chat participation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own trip chat participation" ON public.trip_chat_participants FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: trip_messages Users can update their own trip messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own trip messages" ON public.trip_messages FOR UPDATE USING ((sender_id = auth.uid())) WITH CHECK ((sender_id = auth.uid()));


--
-- Name: user_trips Users can update their own trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own trips" ON public.user_trips FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: chat_poll_votes Users can update their vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their vote" ON public.chat_poll_votes FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_personality Users can upsert own personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can upsert own personality" ON public.user_personality FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_preferences Users can upsert own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can upsert own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_trips Users can view all trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all trips" ON public.user_trips FOR SELECT USING (true);


--
-- Name: messages Users can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages" ON public.messages FOR SELECT USING (((public.is_user_admin() IS NOT NULL) OR ((table_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.table_members tm
  WHERE ((tm.table_id = messages.table_id) AND (tm.user_id = auth.uid()))))) OR ((table_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.tables t
  WHERE ((t.id = messages.table_id) AND (t.host_id = auth.uid()))))) OR ((group_id IS NOT NULL) AND public.is_group_member(group_id, auth.uid()))));


--
-- Name: experience_purchase_intents Users can view own experience intents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own experience intents" ON public.experience_purchase_intents FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_inbox Users can view own inbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own inbox" ON public.chat_inbox FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: partners Users can view own partner profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own partner profile" ON public.partners FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_personality Users can view own personality; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own personality" ON public.user_personality FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: user_preferences Users can view own preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: users Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- Name: purchase_intents Users can view own purchase intents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own purchase intents" ON public.purchase_intents FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: partner_team_members Users can view own team memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own team memberships" ON public.partner_team_members FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: support_tickets Users can view own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tickets" ON public.support_tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tickets Users can view own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tickets" ON public.tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: travel_matches Users can view own travel matches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own travel matches" ON public.travel_matches FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.travel_plans tp
  WHERE (((tp.id = travel_matches.travel_plan_id_1) OR (tp.id = travel_matches.travel_plan_id_2)) AND (tp.user_id = auth.uid())))));


--
-- Name: message_reactions Users can view reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view reactions" ON public.message_reactions FOR SELECT USING (true);


--
-- Name: post_bookmarks Users can view their own bookmarks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own bookmarks" ON public.post_bookmarks FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: partner_followers Users can view their own follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own follows" ON public.partner_followers FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: partner_invites Users can view their own invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own invites" ON public.partner_invites FOR SELECT USING ((email = auth.email()));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: chat_poll_votes Users can vote; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can vote" ON public.chat_poll_votes FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: direct_chat_participants View chat participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View chat participants" ON public.direct_chat_participants FOR SELECT USING (((user_id = auth.uid()) OR public.is_direct_chat_member(chat_id)));


--
-- Name: direct_messages View messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "View messages" ON public.direct_messages FOR SELECT USING (public.is_direct_chat_member(chat_id));


--
-- Name: activity_checkins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_checkins ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_otp_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_otp_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_popups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_popups ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_push_broadcasts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_push_broadcasts ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: api_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: apk_releases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.apk_releases ENABLE ROW LEVEL SECURITY;

--
-- Name: app_team_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_team_memory ENABLE ROW LEVEL SECURITY;

--
-- Name: badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_poll_votes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_poll_votes ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_polls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_polls ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: comment_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: direct_chat_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direct_chat_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: direct_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: direct_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automation_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automation_runs email_automation_runs_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_automation_runs_owner_select ON public.email_automation_runs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = email_automation_runs.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: email_automations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_automations ENABLE ROW LEVEL SECURITY;

--
-- Name: email_automations email_automations_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_automations_owner ON public.email_automations USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = email_automations.partner_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = email_automations.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sends; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

--
-- Name: email_suppressions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: event_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: event_seat_maps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_seat_maps ENABLE ROW LEVEL SECURITY;

--
-- Name: event_seat_maps event_seat_maps_organizer_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_seat_maps_organizer_all ON public.event_seat_maps USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((e.organizer_id = p.id)))
  WHERE ((e.id = event_seat_maps.event_id) AND (p.user_id = auth.uid())))));


--
-- Name: event_seat_maps event_seat_maps_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_seat_maps_public_read ON public.event_seat_maps FOR SELECT USING (true);


--
-- Name: event_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: event_sections event_sections_organizer_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_sections_organizer_all ON public.event_sections USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((e.organizer_id = p.id)))
  WHERE ((e.id = event_sections.event_id) AND (p.user_id = auth.uid())))));


--
-- Name: event_sections event_sections_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_sections_public_read ON public.event_sections FOR SELECT USING (true);


--
-- Name: event_subscription_discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_subscription_discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: event_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_views ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: experience_purchase_intents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.experience_purchase_intents ENABLE ROW LEVEL SECURITY;

--
-- Name: experience_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.experience_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: experience_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.experience_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: experience_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.experience_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_claims fan_manage_own_claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fan_manage_own_claims ON public.subscription_claims USING ((fan_id = auth.uid())) WITH CHECK ((fan_id = auth.uid()));


--
-- Name: subscription_payments fan_read_own_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fan_read_own_payments ON public.subscription_payments FOR SELECT USING ((fan_id = auth.uid()));


--
-- Name: fan_subscriptions fan_read_own_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fan_read_own_subscriptions ON public.fan_subscriptions FOR SELECT USING ((fan_id = auth.uid()));


--
-- Name: fan_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fan_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

--
-- Name: posts geotagged_stories_view_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY geotagged_stories_view_policy ON public.posts FOR SELECT USING (((visibility = 'public'::text) OR (user_id = auth.uid()) OR ((visibility = 'followers'::text) AND (EXISTS ( SELECT 1
   FROM public.follows
  WHERE ((follows.follower_id = auth.uid()) AND (follows.following_id = posts.user_id)))))));


--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: interest_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interest_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: matching_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matching_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: message_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: event_invites organizers_manage_event_invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizers_manage_event_invites ON public.event_invites USING ((event_id IN ( SELECT e.id
   FROM public.events e
  WHERE (e.organizer_id IN ( SELECT p.id
           FROM public.partners p
          WHERE (p.user_id = auth.uid())))))) WITH CHECK ((event_id IN ( SELECT e.id
   FROM public.events e
  WHERE (e.organizer_id IN ( SELECT p.id
           FROM public.partners p
          WHERE (p.user_id = auth.uid()))))));


--
-- Name: event_registrations organizers_read_event_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizers_read_event_registrations ON public.event_registrations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((p.id = e.organizer_id)))
  WHERE ((e.id = event_registrations.event_id) AND (p.user_id = auth.uid())))));


--
-- Name: event_registrations organizers_update_event_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizers_update_event_registrations ON public.event_registrations FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((p.id = e.organizer_id)))
  WHERE ((e.id = event_registrations.event_id) AND (p.user_id = auth.uid())))));


--
-- Name: partner_followers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_followers ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_gateway_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_gateway_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_gateway_accounts partner_gateway_accounts_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_gateway_accounts_owner_select ON public.partner_gateway_accounts FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_gateway_accounts.partner_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true))))));


--
-- Name: partner_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_kyc_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_kyc_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_kyc_documents partner_kyc_documents_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_kyc_documents_owner_select ON public.partner_kyc_documents FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_kyc_documents.partner_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true))))));


--
-- Name: partner_kyc_documents partner_kyc_documents_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_kyc_documents_owner_write ON public.partner_kyc_documents USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_kyc_documents.partner_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_kyc_documents.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: subscription_claims partner_manage_claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_manage_claims ON public.subscription_claims USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_claims.partner_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_claims.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: event_subscription_discounts partner_manage_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_manage_discounts ON public.event_subscription_discounts USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((p.id = e.organizer_id)))
  WHERE ((e.id = event_subscription_discounts.event_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((p.id = e.organizer_id)))
  WHERE ((e.id = event_subscription_discounts.event_id) AND (p.user_id = auth.uid())))));


--
-- Name: subscription_posts partner_manage_own_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_manage_own_posts ON public.subscription_posts USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_posts.partner_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_posts.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: subscription_tiers partner_manage_own_tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_manage_own_tiers ON public.subscription_tiers USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_tiers.partner_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_tiers.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: subscription_payments partner_read_own_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_read_own_payments ON public.subscription_payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = subscription_payments.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: fan_subscriptions partner_read_own_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_read_own_subscriptions ON public.fan_subscriptions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = fan_subscriptions.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: partner_stakeholders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_stakeholders ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_stakeholders partner_stakeholders_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_stakeholders_owner_select ON public.partner_stakeholders FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_stakeholders.partner_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.is_admin = true))))));


--
-- Name: partner_stakeholders partner_stakeholders_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_stakeholders_owner_write ON public.partner_stakeholders USING ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_stakeholders.partner_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.partners p
  WHERE ((p.id = partner_stakeholders.partner_id) AND (p.user_id = auth.uid())))));


--
-- Name: partner_subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: partners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: post_bookmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: post_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_tiers public_read_active_tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_active_tiers ON public.subscription_tiers FOR SELECT USING ((is_active = true));


--
-- Name: event_subscription_discounts public_read_discounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_discounts ON public.event_subscription_discounts FOR SELECT USING (true);


--
-- Name: subscription_posts public_read_published_posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_published_posts ON public.subscription_posts FOR SELECT USING (((published_at IS NOT NULL) AND (published_at <= now())));


--
-- Name: purchase_intents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_intents ENABLE ROW LEVEL SECURITY;

--
-- Name: ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: registration_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.registration_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: seat_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: seat_holds seat_holds_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seat_holds_delete ON public.seat_holds FOR DELETE USING (true);


--
-- Name: seat_holds seat_holds_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seat_holds_insert ON public.seat_holds FOR INSERT WITH CHECK (true);


--
-- Name: seat_holds seat_holds_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seat_holds_read ON public.seat_holds FOR SELECT USING (true);


--
-- Name: seats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;

--
-- Name: seats seats_organizer_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seats_organizer_all ON public.seats USING ((EXISTS ( SELECT 1
   FROM (public.events e
     JOIN public.partners p ON ((e.organizer_id = p.id)))
  WHERE ((e.id = seats.event_id) AND (p.user_id = auth.uid())))));


--
-- Name: seats seats_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY seats_public_read ON public.seats FOR SELECT USING (true);


--
-- Name: story_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: table_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.table_members ENABLE ROW LEVEL SECURITY;

--
-- Name: table_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.table_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

--
-- Name: team_comms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_comms ENABLE ROW LEVEL SECURITY;

--
-- Name: template_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.template_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: template_sections template_sections_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY template_sections_admin_all ON public.template_sections USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: template_sections template_sections_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY template_sections_public_read ON public.template_sections FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.venue_templates
  WHERE ((venue_templates.id = template_sections.template_id) AND (venue_templates.is_published = true)))));


--
-- Name: ticket_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: travel_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.travel_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: travel_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.travel_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_chat_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_chat_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_group_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_group_chats ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: trip_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: user_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: user_gamification_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_gamification_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: user_interests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

--
-- Name: user_personality; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_personality ENABLE ROW LEVEL SECURITY;

--
-- Name: user_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_trips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_trips ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: event_registrations users_read_own_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_registrations ON public.event_registrations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: venue_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.venue_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_templates venue_templates_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_templates_admin_all ON public.venue_templates USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.is_admin = true)))));


--
-- Name: venue_templates venue_templates_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY venue_templates_public_read ON public.venue_templates FOR SELECT USING ((is_published = true));


--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: wallet_topups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_endpoints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _cluster_grid_size(zoom integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public._cluster_grid_size(zoom integer) TO anon;
GRANT ALL ON FUNCTION public._cluster_grid_size(zoom integer) TO authenticated;
GRANT ALL ON FUNCTION public._cluster_grid_size(zoom integer) TO service_role;


--
-- Name: FUNCTION assign_direct_message_sequence(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_direct_message_sequence() TO anon;
GRANT ALL ON FUNCTION public.assign_direct_message_sequence() TO authenticated;
GRANT ALL ON FUNCTION public.assign_direct_message_sequence() TO service_role;


--
-- Name: FUNCTION assign_message_sequence(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_message_sequence() TO anon;
GRANT ALL ON FUNCTION public.assign_message_sequence() TO authenticated;
GRANT ALL ON FUNCTION public.assign_message_sequence() TO service_role;


--
-- Name: FUNCTION assign_seats_to_intent(p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_seats_to_intent(p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.assign_seats_to_intent(p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.assign_seats_to_intent(p_intent_id uuid, p_tier_id uuid, p_quantity integer, p_seat_ids uuid[]) TO service_role;


--
-- Name: FUNCTION assign_trip_message_sequence(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_trip_message_sequence() TO anon;
GRANT ALL ON FUNCTION public.assign_trip_message_sequence() TO authenticated;
GRANT ALL ON FUNCTION public.assign_trip_message_sequence() TO service_role;


--
-- Name: FUNCTION atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer) TO anon;
GRANT ALL ON FUNCTION public.atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer) TO authenticated;
GRANT ALL ON FUNCTION public.atomic_decrement_tickets_sold(p_event_id uuid, p_quantity integer) TO service_role;


--
-- Name: FUNCTION auto_activate_current_trips(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_activate_current_trips() TO anon;
GRANT ALL ON FUNCTION public.auto_activate_current_trips() TO authenticated;
GRANT ALL ON FUNCTION public.auto_activate_current_trips() TO service_role;


--
-- Name: FUNCTION auto_complete_past_trips(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_complete_past_trips() TO anon;
GRANT ALL ON FUNCTION public.auto_complete_past_trips() TO authenticated;
GRANT ALL ON FUNCTION public.auto_complete_past_trips() TO service_role;


--
-- Name: FUNCTION auto_follow_organizer_on_ticket(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_follow_organizer_on_ticket() TO anon;
GRANT ALL ON FUNCTION public.auto_follow_organizer_on_ticket() TO authenticated;
GRANT ALL ON FUNCTION public.auto_follow_organizer_on_ticket() TO service_role;


--
-- Name: FUNCTION auto_match_trip(p_trip_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_match_trip(p_trip_id uuid) TO anon;
GRANT ALL ON FUNCTION public.auto_match_trip(p_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.auto_match_trip(p_trip_id uuid) TO service_role;


--
-- Name: FUNCTION auto_post_event_to_feed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_post_event_to_feed() TO anon;
GRANT ALL ON FUNCTION public.auto_post_event_to_feed() TO authenticated;
GRANT ALL ON FUNCTION public.auto_post_event_to_feed() TO service_role;


--
-- Name: FUNCTION auto_suspend_on_report_threshold(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auto_suspend_on_report_threshold() TO anon;
GRANT ALL ON FUNCTION public.auto_suspend_on_report_threshold() TO authenticated;
GRANT ALL ON FUNCTION public.auto_suspend_on_report_threshold() TO service_role;


--
-- Name: FUNCTION award_xp(p_user_id uuid, p_xp integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.award_xp(p_user_id uuid, p_xp integer) TO anon;
GRANT ALL ON FUNCTION public.award_xp(p_user_id uuid, p_xp integer) TO authenticated;
GRANT ALL ON FUNCTION public.award_xp(p_user_id uuid, p_xp integer) TO service_role;


--
-- Name: FUNCTION book_seats_for_intent(p_intent_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.book_seats_for_intent(p_intent_id uuid) TO anon;
GRANT ALL ON FUNCTION public.book_seats_for_intent(p_intent_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_seats_for_intent(p_intent_id uuid) TO service_role;


--
-- Name: FUNCTION calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) TO anon;
GRANT ALL ON FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_distance(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision) TO service_role;


--
-- Name: FUNCTION check_in_ticket(p_ticket_id uuid, p_event_id uuid, p_scanner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_in_ticket(p_ticket_id uuid, p_event_id uuid, p_scanner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_in_ticket(p_ticket_id uuid, p_event_id uuid, p_scanner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_in_ticket(p_ticket_id uuid, p_event_id uuid, p_scanner_id uuid) TO service_role;


--
-- Name: FUNCTION check_is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_is_admin() TO anon;
GRANT ALL ON FUNCTION public.check_is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.check_is_admin() TO service_role;


--
-- Name: FUNCTION check_user_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_user_status() TO anon;
GRANT ALL ON FUNCTION public.check_user_status() TO authenticated;
GRANT ALL ON FUNCTION public.check_user_status() TO service_role;


--
-- Name: FUNCTION check_username_available(p_username text, p_exclude_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_username_available(p_username text, p_exclude_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.check_username_available(p_username text, p_exclude_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.check_username_available(p_username text, p_exclude_user_id uuid) TO service_role;


--
-- Name: FUNCTION cleanup_expired_seat_holds(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_seat_holds() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_seat_holds() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_seat_holds() TO service_role;


--
-- Name: FUNCTION cleanup_expired_story_views(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cleanup_expired_story_views() TO anon;
GRANT ALL ON FUNCTION public.cleanup_expired_story_views() TO authenticated;
GRANT ALL ON FUNCTION public.cleanup_expired_story_views() TO service_role;


--
-- Name: FUNCTION compute_level(p_xp integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.compute_level(p_xp integer) TO anon;
GRANT ALL ON FUNCTION public.compute_level(p_xp integer) TO authenticated;
GRANT ALL ON FUNCTION public.compute_level(p_xp integer) TO service_role;


--
-- Name: FUNCTION confirm_experience_booking(p_intent_id uuid, p_payment_method text, p_xendit_id text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.confirm_experience_booking(p_intent_id uuid, p_payment_method text, p_xendit_id text) TO anon;
GRANT ALL ON FUNCTION public.confirm_experience_booking(p_intent_id uuid, p_payment_method text, p_xendit_id text) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_experience_booking(p_intent_id uuid, p_payment_method text, p_xendit_id text) TO service_role;


--
-- Name: FUNCTION create_trip_creator_participant(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_trip_creator_participant() TO anon;
GRANT ALL ON FUNCTION public.create_trip_creator_participant() TO authenticated;
GRANT ALL ON FUNCTION public.create_trip_creator_participant() TO service_role;


--
-- Name: FUNCTION decrement_experience_guests(p_schedule_id uuid, p_quantity integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.decrement_experience_guests(p_schedule_id uuid, p_quantity integer) TO anon;
GRANT ALL ON FUNCTION public.decrement_experience_guests(p_schedule_id uuid, p_quantity integer) TO authenticated;
GRANT ALL ON FUNCTION public.decrement_experience_guests(p_schedule_id uuid, p_quantity integer) TO service_role;


--
-- Name: FUNCTION delete_dm_chat(p_chat_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_dm_chat(p_chat_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_dm_chat(p_chat_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_dm_chat(p_chat_id uuid) TO service_role;


--
-- Name: FUNCTION delete_table_marker_image(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.delete_table_marker_image() TO anon;
GRANT ALL ON FUNCTION public.delete_table_marker_image() TO authenticated;
GRANT ALL ON FUNCTION public.delete_table_marker_image() TO service_role;


--
-- Name: FUNCTION detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint) TO anon;
GRANT ALL ON FUNCTION public.detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint) TO authenticated;
GRANT ALL ON FUNCTION public.detect_message_gaps(p_table_id uuid, p_start_seq bigint, p_end_seq bigint) TO service_role;


--
-- Name: FUNCTION enforce_report_rate_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_report_rate_limit() TO anon;
GRANT ALL ON FUNCTION public.enforce_report_rate_limit() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_report_rate_limit() TO service_role;


--
-- Name: FUNCTION enqueue_new_event_automation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enqueue_new_event_automation() TO anon;
GRANT ALL ON FUNCTION public.enqueue_new_event_automation() TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_new_event_automation() TO service_role;


--
-- Name: FUNCTION enqueue_welcome_automation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enqueue_welcome_automation() TO anon;
GRANT ALL ON FUNCTION public.enqueue_welcome_automation() TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_welcome_automation() TO service_role;


--
-- Name: FUNCTION events_search_vector_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.events_search_vector_update() TO anon;
GRANT ALL ON FUNCTION public.events_search_vector_update() TO authenticated;
GRANT ALL ON FUNCTION public.events_search_vector_update() TO service_role;


--
-- Name: FUNCTION expire_stale_experience_intents(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expire_stale_experience_intents() TO anon;
GRANT ALL ON FUNCTION public.expire_stale_experience_intents() TO authenticated;
GRANT ALL ON FUNCTION public.expire_stale_experience_intents() TO service_role;


--
-- Name: FUNCTION expire_stale_purchase_intents(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.expire_stale_purchase_intents() TO anon;
GRANT ALL ON FUNCTION public.expire_stale_purchase_intents() TO authenticated;
GRANT ALL ON FUNCTION public.expire_stale_purchase_intents() TO service_role;


--
-- Name: FUNCTION finalize_email_batch(p_campaign_id uuid, p_sent integer, p_failed integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.finalize_email_batch(p_campaign_id uuid, p_sent integer, p_failed integer) TO anon;
GRANT ALL ON FUNCTION public.finalize_email_batch(p_campaign_id uuid, p_sent integer, p_failed integer) TO authenticated;
GRANT ALL ON FUNCTION public.finalize_email_batch(p_campaign_id uuid, p_sent integer, p_failed integer) TO service_role;


--
-- Name: FUNCTION find_direct_chat(user_id_1 uuid, user_id_2 uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_direct_chat(user_id_1 uuid, user_id_2 uuid) TO anon;
GRANT ALL ON FUNCTION public.find_direct_chat(user_id_1 uuid, user_id_2 uuid) TO authenticated;
GRANT ALL ON FUNCTION public.find_direct_chat(user_id_1 uuid, user_id_2 uuid) TO service_role;


--
-- Name: FUNCTION generate_qr_code(ticket_id uuid, event_id uuid, user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_qr_code(ticket_id uuid, event_id uuid, user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.generate_qr_code(ticket_id uuid, event_id uuid, user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.generate_qr_code(ticket_id uuid, event_id uuid, user_id uuid) TO service_role;


--
-- Name: FUNCTION generate_table_channel_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_table_channel_id() TO anon;
GRANT ALL ON FUNCTION public.generate_table_channel_id() TO authenticated;
GRANT ALL ON FUNCTION public.generate_table_channel_id() TO service_role;


--
-- Name: FUNCTION generate_ticket_number(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_ticket_number() TO anon;
GRANT ALL ON FUNCTION public.generate_ticket_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_ticket_number() TO service_role;


--
-- Name: FUNCTION generate_travel_match_channel(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_travel_match_channel() TO anon;
GRANT ALL ON FUNCTION public.generate_travel_match_channel() TO authenticated;
GRANT ALL ON FUNCTION public.generate_travel_match_channel() TO service_role;


--
-- Name: FUNCTION generate_unique_username(base_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_unique_username(base_name text) TO anon;
GRANT ALL ON FUNCTION public.generate_unique_username(base_name text) TO authenticated;
GRANT ALL ON FUNCTION public.generate_unique_username(base_name text) TO service_role;


--
-- Name: FUNCTION geo_checkin(p_table_id uuid, p_user_lat double precision, p_user_lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.geo_checkin(p_table_id uuid, p_user_lat double precision, p_user_lng double precision) TO anon;
GRANT ALL ON FUNCTION public.geo_checkin(p_table_id uuid, p_user_lat double precision, p_user_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.geo_checkin(p_table_id uuid, p_user_lat double precision, p_user_lng double precision) TO service_role;


--
-- Name: FUNCTION get_active_user_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_user_count() TO anon;
GRANT ALL ON FUNCTION public.get_active_user_count() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_user_count() TO service_role;


--
-- Name: FUNCTION get_active_users(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_users() TO anon;
GRANT ALL ON FUNCTION public.get_active_users() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_users() TO service_role;


--
-- Name: FUNCTION get_active_users(page_size integer, page_number integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_users(page_size integer, page_number integer) TO anon;
GRANT ALL ON FUNCTION public.get_active_users(page_size integer, page_number integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_active_users(page_size integer, page_number integer) TO service_role;


--
-- Name: FUNCTION get_active_users(page_size integer, page_number integer, user_lat double precision, user_lng double precision, radius_km double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_users(page_size integer, page_number integer, user_lat double precision, user_lng double precision, radius_km double precision) TO anon;
GRANT ALL ON FUNCTION public.get_active_users(page_size integer, page_number integer, user_lat double precision, user_lng double precision, radius_km double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_active_users(page_size integer, page_number integer, user_lat double precision, user_lng double precision, radius_km double precision) TO service_role;


--
-- Name: FUNCTION get_active_users_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, page_size integer, page_number integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_users_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, page_size integer, page_number integer) TO anon;
GRANT ALL ON FUNCTION public.get_active_users_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, page_size integer, page_number integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_active_users_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, page_size integer, page_number integer) TO service_role;


--
-- Name: FUNCTION get_active_users_philippines(page_size integer, page_number integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_users_philippines(page_size integer, page_number integer) TO anon;
GRANT ALL ON FUNCTION public.get_active_users_philippines(page_size integer, page_number integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_active_users_philippines(page_size integer, page_number integer) TO service_role;


--
-- Name: FUNCTION get_active_users_philippines_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_active_users_philippines_count() TO anon;
GRANT ALL ON FUNCTION public.get_active_users_philippines_count() TO authenticated;
GRANT ALL ON FUNCTION public.get_active_users_philippines_count() TO service_role;


--
-- Name: FUNCTION get_admin_accounting_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_accounting_stats() TO anon;
GRANT ALL ON FUNCTION public.get_admin_accounting_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_accounting_stats() TO service_role;


--
-- Name: FUNCTION get_admin_partner_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_admin_partner_stats() TO anon;
GRANT ALL ON FUNCTION public.get_admin_partner_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_admin_partner_stats() TO service_role;


--
-- Name: FUNCTION get_blocked_user_ids(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_blocked_user_ids() TO anon;
GRANT ALL ON FUNCTION public.get_blocked_user_ids() TO authenticated;
GRANT ALL ON FUNCTION public.get_blocked_user_ids() TO service_role;


--
-- Name: FUNCTION get_daily_sales_stats(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_daily_sales_stats() TO anon;
GRANT ALL ON FUNCTION public.get_daily_sales_stats() TO authenticated;
GRANT ALL ON FUNCTION public.get_daily_sales_stats() TO service_role;


--
-- Name: FUNCTION get_due_event_automations(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_due_event_automations() TO anon;
GRANT ALL ON FUNCTION public.get_due_event_automations() TO authenticated;
GRANT ALL ON FUNCTION public.get_due_event_automations() TO service_role;


--
-- Name: FUNCTION get_event_seat_map(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_event_seat_map(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_event_seat_map(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_event_seat_map(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION get_event_sold_count(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_event_sold_count(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_event_sold_count(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_event_sold_count(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION get_events_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_events_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer) TO anon;
GRANT ALL ON FUNCTION public.get_events_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_events_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer) TO service_role;


--
-- Name: FUNCTION get_events_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_events_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) TO anon;
GRANT ALL ON FUNCTION public.get_events_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_events_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) TO service_role;


--
-- Name: FUNCTION get_following_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_following_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision) TO anon;
GRANT ALL ON FUNCTION public.get_following_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision) TO service_role;


--
-- Name: FUNCTION get_following_ids(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_following_ids(user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_following_ids(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_following_ids(user_id uuid) TO service_role;


--
-- Name: FUNCTION get_friends_at_table(p_table_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_friends_at_table(p_table_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_friends_at_table(p_table_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_friends_at_table(p_table_id uuid) TO service_role;


--
-- Name: FUNCTION get_friends_going_to_event(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_friends_going_to_event(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_friends_going_to_event(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_friends_going_to_event(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION get_friends_in_experience(p_table_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_friends_in_experience(p_table_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_friends_in_experience(p_table_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_friends_in_experience(p_table_id uuid) TO service_role;


--
-- Name: FUNCTION get_main_feed(p_limit integer, p_offset integer, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_main_feed(p_limit integer, p_offset integer, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) TO anon;
GRANT ALL ON FUNCTION public.get_main_feed(p_limit integer, p_offset integer, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_main_feed(p_limit integer, p_offset integer, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) TO service_role;


--
-- Name: FUNCTION get_main_feed_cursor(p_limit integer, p_cursor timestamp without time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_main_feed_cursor(p_limit integer, p_cursor timestamp without time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) TO anon;
GRANT ALL ON FUNCTION public.get_main_feed_cursor(p_limit integer, p_cursor timestamp without time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_main_feed_cursor(p_limit integer, p_cursor timestamp without time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision, p_h3_cells text[]) TO service_role;


--
-- Name: FUNCTION get_nearby_tables(lat double precision, lng double precision, radius_meters double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_nearby_tables(lat double precision, lng double precision, radius_meters double precision) TO anon;
GRANT ALL ON FUNCTION public.get_nearby_tables(lat double precision, lng double precision, radius_meters double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_nearby_tables(lat double precision, lng double precision, radius_meters double precision) TO service_role;


--
-- Name: FUNCTION get_or_create_dm_chat(target_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_or_create_dm_chat(target_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_or_create_dm_chat(target_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_dm_chat(target_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_organizer_public_profile(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_organizer_public_profile(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_organizer_public_profile(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_organizer_public_profile(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_partner_role(p_partner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_partner_role(p_partner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_partner_role(p_partner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_partner_role(p_partner_id uuid) TO service_role;


--
-- Name: FUNCTION get_philippines_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_philippines_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision) TO anon;
GRANT ALL ON FUNCTION public.get_philippines_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_philippines_feed(p_limit integer, p_cursor timestamp with time zone, p_cursor_id uuid, p_user_lat double precision, p_user_lng double precision) TO service_role;


--
-- Name: FUNCTION get_secret(secret_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_secret(secret_name text) TO anon;
GRANT ALL ON FUNCTION public.get_secret(secret_name text) TO authenticated;
GRANT ALL ON FUNCTION public.get_secret(secret_name text) TO service_role;


--
-- Name: FUNCTION get_stories_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_stories_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer) TO anon;
GRANT ALL ON FUNCTION public.get_stories_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_stories_clusters_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer) TO service_role;


--
-- Name: FUNCTION get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) TO anon;
GRANT ALL ON FUNCTION public.get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.get_stories_in_viewport(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision) TO service_role;


--
-- Name: FUNCTION get_story_tray(p_following_only boolean, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_story_tray(p_following_only boolean, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_story_tray(p_following_only boolean, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_story_tray(p_following_only boolean, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION get_subscriber_event_discount(p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_subscriber_event_discount(p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_subscriber_event_discount(p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_subscriber_event_discount(p_event_id uuid) TO service_role;


--
-- Name: FUNCTION get_ticket_counts_by_events(p_event_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_ticket_counts_by_events(p_event_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_ticket_counts_by_events(p_event_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_ticket_counts_by_events(p_event_ids uuid[]) TO service_role;


--
-- Name: FUNCTION get_ticket_order(p_token uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_ticket_order(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.get_ticket_order(p_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_ticket_order(p_token uuid) TO service_role;


--
-- Name: FUNCTION get_trip_matches(target_trip_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_trip_matches(target_trip_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_trip_matches(target_trip_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_trip_matches(target_trip_id uuid) TO service_role;


--
-- Name: FUNCTION get_unique_checkin_locations(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_unique_checkin_locations(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_unique_checkin_locations(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_unique_checkin_locations(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_unique_people_met(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_unique_people_met(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_unique_people_met(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_unique_people_met(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_user_tickets(user_id_param uuid, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_tickets(user_id_param uuid, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_user_tickets(user_id_param uuid, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_user_tickets(user_id_param uuid, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION handle_checkout_subscription(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_checkout_subscription() TO anon;
GRANT ALL ON FUNCTION public.handle_checkout_subscription() TO authenticated;
GRANT ALL ON FUNCTION public.handle_checkout_subscription() TO service_role;


--
-- Name: FUNCTION handle_join_approval(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_join_approval() TO anon;
GRANT ALL ON FUNCTION public.handle_join_approval() TO authenticated;
GRANT ALL ON FUNCTION public.handle_join_approval() TO service_role;


--
-- Name: FUNCTION handle_join_decline(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_join_decline() TO anon;
GRANT ALL ON FUNCTION public.handle_join_decline() TO authenticated;
GRANT ALL ON FUNCTION public.handle_join_decline() TO service_role;


--
-- Name: FUNCTION handle_new_comment(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_comment() TO anon;
GRANT ALL ON FUNCTION public.handle_new_comment() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_comment() TO service_role;


--
-- Name: FUNCTION handle_new_like(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_like() TO anon;
GRANT ALL ON FUNCTION public.handle_new_like() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_like() TO service_role;


--
-- Name: FUNCTION handle_new_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_message() TO anon;
GRANT ALL ON FUNCTION public.handle_new_message() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_message() TO service_role;


--
-- Name: FUNCTION handle_new_payout(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_payout() TO anon;
GRANT ALL ON FUNCTION public.handle_new_payout() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_payout() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION handle_notifications_webhook(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_notifications_webhook() TO anon;
GRANT ALL ON FUNCTION public.handle_notifications_webhook() TO authenticated;
GRANT ALL ON FUNCTION public.handle_notifications_webhook() TO service_role;


--
-- Name: FUNCTION handle_post_mentions(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_post_mentions() TO anon;
GRANT ALL ON FUNCTION public.handle_post_mentions() TO authenticated;
GRANT ALL ON FUNCTION public.handle_post_mentions() TO service_role;


--
-- Name: FUNCTION handle_table_join(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_table_join() TO anon;
GRANT ALL ON FUNCTION public.handle_table_join() TO authenticated;
GRANT ALL ON FUNCTION public.handle_table_join() TO service_role;


--
-- Name: FUNCTION has_partner_role(p_partner_id uuid, p_role public.partner_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_partner_role(p_partner_id uuid, p_role public.partner_role) TO anon;
GRANT ALL ON FUNCTION public.has_partner_role(p_partner_id uuid, p_role public.partner_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_partner_role(p_partner_id uuid, p_role public.partner_role) TO service_role;


--
-- Name: FUNCTION hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.hold_seat(p_seat_id uuid, p_session_id text, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION immutable_unaccent(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.immutable_unaccent(input text) TO anon;
GRANT ALL ON FUNCTION public.immutable_unaccent(input text) TO authenticated;
GRANT ALL ON FUNCTION public.immutable_unaccent(input text) TO service_role;


--
-- Name: FUNCTION is_active_subscriber(p_partner_id uuid, p_min_tier_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_active_subscriber(p_partner_id uuid, p_min_tier_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_active_subscriber(p_partner_id uuid, p_min_tier_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_active_subscriber(p_partner_id uuid, p_min_tier_id uuid) TO service_role;


--
-- Name: FUNCTION is_direct_chat_member(target_chat_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_direct_chat_member(target_chat_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_direct_chat_member(target_chat_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_direct_chat_member(target_chat_id uuid) TO service_role;


--
-- Name: FUNCTION is_email_invited(p_event_id uuid, p_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_email_invited(p_event_id uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.is_email_invited(p_event_id uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.is_email_invited(p_event_id uuid, p_email text) TO service_role;


--
-- Name: FUNCTION is_group_admin(p_group_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_admin(p_group_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_member(p_group_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_group_moderator(p_group_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_group_moderator(p_group_id uuid, p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_group_moderator(p_group_id uuid, p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_group_moderator(p_group_id uuid, p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_partner_member(p_partner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_partner_member(p_partner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_partner_member(p_partner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_partner_member(p_partner_id uuid) TO service_role;


--
-- Name: FUNCTION is_partner_owner(p_partner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_partner_owner(p_partner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_partner_owner(p_partner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_partner_owner(p_partner_id uuid) TO service_role;


--
-- Name: FUNCTION is_team_member_of_partner(p_partner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_team_member_of_partner(p_partner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_team_member_of_partner(p_partner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_team_member_of_partner(p_partner_id uuid) TO service_role;


--
-- Name: FUNCTION is_user_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_user_admin() TO anon;
GRANT ALL ON FUNCTION public.is_user_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_user_admin() TO service_role;


--
-- Name: FUNCTION issue_tickets(p_intent_id uuid, p_registration_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.issue_tickets(p_intent_id uuid, p_registration_id uuid) TO anon;
GRANT ALL ON FUNCTION public.issue_tickets(p_intent_id uuid, p_registration_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.issue_tickets(p_intent_id uuid, p_registration_id uuid) TO service_role;


--
-- Name: FUNCTION mark_chat_read(p_chat_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_chat_read(p_chat_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_chat_read(p_chat_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_chat_read(p_chat_id uuid) TO service_role;


--
-- Name: FUNCTION mark_stories_viewed(p_author_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mark_stories_viewed(p_author_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mark_stories_viewed(p_author_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_stories_viewed(p_author_id uuid) TO service_role;


--
-- Name: FUNCTION mint_event_tickets(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.mint_event_tickets() TO anon;
GRANT ALL ON FUNCTION public.mint_event_tickets() TO authenticated;
GRANT ALL ON FUNCTION public.mint_event_tickets() TO service_role;


--
-- Name: FUNCTION notify_followers_new_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_followers_new_event() TO anon;
GRANT ALL ON FUNCTION public.notify_followers_new_event() TO authenticated;
GRANT ALL ON FUNCTION public.notify_followers_new_event() TO service_role;


--
-- Name: FUNCTION notify_followers_new_hangout(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_followers_new_hangout() TO anon;
GRANT ALL ON FUNCTION public.notify_followers_new_hangout() TO authenticated;
GRANT ALL ON FUNCTION public.notify_followers_new_hangout() TO service_role;


--
-- Name: FUNCTION notify_host_member_joined(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_host_member_joined() TO anon;
GRANT ALL ON FUNCTION public.notify_host_member_joined() TO authenticated;
GRANT ALL ON FUNCTION public.notify_host_member_joined() TO service_role;


--
-- Name: FUNCTION notify_host_status_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_host_status_change() TO anon;
GRANT ALL ON FUNCTION public.notify_host_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.notify_host_status_change() TO service_role;


--
-- Name: FUNCTION notify_internal_alert(p_type text, p_subject text, p_body_html text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_internal_alert(p_type text, p_subject text, p_body_html text, p_metadata jsonb) TO anon;
GRANT ALL ON FUNCTION public.notify_internal_alert(p_type text, p_subject text, p_body_html text, p_metadata jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.notify_internal_alert(p_type text, p_subject text, p_body_html text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION notify_new_follower(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_follower() TO anon;
GRANT ALL ON FUNCTION public.notify_new_follower() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_follower() TO service_role;


--
-- Name: FUNCTION notify_new_subscriber_post(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_new_subscriber_post() TO anon;
GRANT ALL ON FUNCTION public.notify_new_subscriber_post() TO authenticated;
GRANT ALL ON FUNCTION public.notify_new_subscriber_post() TO service_role;


--
-- Name: FUNCTION notify_organizer_on_registration(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_organizer_on_registration() TO anon;
GRANT ALL ON FUNCTION public.notify_organizer_on_registration() TO authenticated;
GRANT ALL ON FUNCTION public.notify_organizer_on_registration() TO service_role;


--
-- Name: FUNCTION notify_past_buyers_new_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_past_buyers_new_event() TO anon;
GRANT ALL ON FUNCTION public.notify_past_buyers_new_event() TO authenticated;
GRANT ALL ON FUNCTION public.notify_past_buyers_new_event() TO service_role;


--
-- Name: FUNCTION notify_purchase_confirmation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_purchase_confirmation() TO anon;
GRANT ALL ON FUNCTION public.notify_purchase_confirmation() TO authenticated;
GRANT ALL ON FUNCTION public.notify_purchase_confirmation() TO service_role;


--
-- Name: FUNCTION notify_subscription_claim(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_subscription_claim() TO anon;
GRANT ALL ON FUNCTION public.notify_subscription_claim() TO authenticated;
GRANT ALL ON FUNCTION public.notify_subscription_claim() TO service_role;


--
-- Name: FUNCTION notify_subscription_event(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_subscription_event() TO anon;
GRANT ALL ON FUNCTION public.notify_subscription_event() TO authenticated;
GRANT ALL ON FUNCTION public.notify_subscription_event() TO service_role;


--
-- Name: FUNCTION notify_table_join_simple(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_table_join_simple() TO anon;
GRANT ALL ON FUNCTION public.notify_table_join_simple() TO authenticated;
GRANT ALL ON FUNCTION public.notify_table_join_simple() TO service_role;


--
-- Name: FUNCTION notify_ticket_confirmed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_ticket_confirmed() TO anon;
GRANT ALL ON FUNCTION public.notify_ticket_confirmed() TO authenticated;
GRANT ALL ON FUNCTION public.notify_ticket_confirmed() TO service_role;


--
-- Name: FUNCTION pgmq_archive(queue_name text, msg_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgmq_archive(queue_name text, msg_id bigint) TO anon;
GRANT ALL ON FUNCTION public.pgmq_archive(queue_name text, msg_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.pgmq_archive(queue_name text, msg_id bigint) TO service_role;


--
-- Name: FUNCTION pgmq_delete(queue_name text, msg_id bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgmq_delete(queue_name text, msg_id bigint) TO anon;
GRANT ALL ON FUNCTION public.pgmq_delete(queue_name text, msg_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.pgmq_delete(queue_name text, msg_id bigint) TO service_role;


--
-- Name: FUNCTION pgmq_read(queue_name text, sleep_seconds integer, batch_size integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgmq_read(queue_name text, sleep_seconds integer, batch_size integer) TO anon;
GRANT ALL ON FUNCTION public.pgmq_read(queue_name text, sleep_seconds integer, batch_size integer) TO authenticated;
GRANT ALL ON FUNCTION public.pgmq_read(queue_name text, sleep_seconds integer, batch_size integer) TO service_role;


--
-- Name: FUNCTION pgmq_send(queue_name text, message jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pgmq_send(queue_name text, message jsonb) TO anon;
GRANT ALL ON FUNCTION public.pgmq_send(queue_name text, message jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.pgmq_send(queue_name text, message jsonb) TO service_role;


--
-- Name: FUNCTION populate_ticket_guest_info(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.populate_ticket_guest_info() TO anon;
GRANT ALL ON FUNCTION public.populate_ticket_guest_info() TO authenticated;
GRANT ALL ON FUNCTION public.populate_ticket_guest_info() TO service_role;


--
-- Name: FUNCTION protect_partner_status_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_partner_status_fields() TO anon;
GRANT ALL ON FUNCTION public.protect_partner_status_fields() TO authenticated;
GRANT ALL ON FUNCTION public.protect_partner_status_fields() TO service_role;


--
-- Name: FUNCTION recompute_host_trust_score(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recompute_host_trust_score() TO anon;
GRANT ALL ON FUNCTION public.recompute_host_trust_score() TO authenticated;
GRANT ALL ON FUNCTION public.recompute_host_trust_score() TO service_role;


--
-- Name: FUNCTION refresh_analytics_views(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.refresh_analytics_views() TO anon;
GRANT ALL ON FUNCTION public.refresh_analytics_views() TO authenticated;
GRANT ALL ON FUNCTION public.refresh_analytics_views() TO service_role;


--
-- Name: FUNCTION release_expired_reservations(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.release_expired_reservations() TO anon;
GRANT ALL ON FUNCTION public.release_expired_reservations() TO authenticated;
GRANT ALL ON FUNCTION public.release_expired_reservations() TO service_role;


--
-- Name: FUNCTION release_seats_for_intent(p_intent_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.release_seats_for_intent(p_intent_id uuid) TO anon;
GRANT ALL ON FUNCTION public.release_seats_for_intent(p_intent_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.release_seats_for_intent(p_intent_id uuid) TO service_role;


--
-- Name: FUNCTION reserve_experience(p_table_id uuid, p_schedule_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reserve_experience(p_table_id uuid, p_schedule_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text) TO anon;
GRANT ALL ON FUNCTION public.reserve_experience(p_table_id uuid, p_schedule_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.reserve_experience(p_table_id uuid, p_schedule_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text) TO service_role;


--
-- Name: FUNCTION reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer) TO anon;
GRANT ALL ON FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer) TO authenticated;
GRANT ALL ON FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer) TO service_role;


--
-- Name: FUNCTION reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text) TO anon;
GRANT ALL ON FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text) TO authenticated;
GRANT ALL ON FUNCTION public.reserve_tickets(p_event_id uuid, p_user_id uuid, p_quantity integer, p_guest_email text, p_guest_name text, p_guest_phone text) TO service_role;


--
-- Name: FUNCTION scan_ticket(p_code text, p_user_id uuid, p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.scan_ticket(p_code text, p_user_id uuid, p_event_id uuid) TO anon;
GRANT ALL ON FUNCTION public.scan_ticket(p_code text, p_user_id uuid, p_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.scan_ticket(p_code text, p_user_id uuid, p_event_id uuid) TO service_role;


--
-- Name: FUNCTION search_all(p_query text, p_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_all(p_query text, p_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_all(p_query text, p_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_all(p_query text, p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION search_events_fts(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_events_fts(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_events_fts(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_events_fts(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION search_hangouts_fts(p_query text, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_hangouts_fts(p_query text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.search_hangouts_fts(p_query text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_hangouts_fts(p_query text, p_limit integer) TO service_role;


--
-- Name: FUNCTION search_users(p_query text, p_limit integer, p_exclude_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.search_users(p_query text, p_limit integer, p_exclude_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.search_users(p_query text, p_limit integer, p_exclude_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.search_users(p_query text, p_limit integer, p_exclude_user_id uuid) TO service_role;


--
-- Name: FUNCTION send_event_reminders(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.send_event_reminders() TO anon;
GRANT ALL ON FUNCTION public.send_event_reminders() TO authenticated;
GRANT ALL ON FUNCTION public.send_event_reminders() TO service_role;


--
-- Name: FUNCTION send_event_reminders_24h(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.send_event_reminders_24h() TO anon;
GRANT ALL ON FUNCTION public.send_event_reminders_24h() TO authenticated;
GRANT ALL ON FUNCTION public.send_event_reminders_24h() TO service_role;


--
-- Name: FUNCTION set_event_registrations_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_event_registrations_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_event_registrations_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_event_registrations_updated_at() TO service_role;


--
-- Name: FUNCTION submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid, p_guest_email text, p_guest_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid, p_guest_email text, p_guest_name text) TO anon;
GRANT ALL ON FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid, p_guest_email text, p_guest_name text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_event_request(p_event_id uuid, p_answers jsonb, p_tier_id uuid, p_guest_email text, p_guest_name text) TO service_role;


--
-- Name: FUNCTION suggest_users(p_current_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.suggest_users(p_current_user_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.suggest_users(p_current_user_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.suggest_users(p_current_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION sync_dm_participant_inbox(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_dm_participant_inbox() TO anon;
GRANT ALL ON FUNCTION public.sync_dm_participant_inbox() TO authenticated;
GRANT ALL ON FUNCTION public.sync_dm_participant_inbox() TO service_role;


--
-- Name: FUNCTION sync_event_tickets_sold(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_event_tickets_sold() TO anon;
GRANT ALL ON FUNCTION public.sync_event_tickets_sold() TO authenticated;
GRANT ALL ON FUNCTION public.sync_event_tickets_sold() TO service_role;


--
-- Name: FUNCTION sync_group_member_inbox(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_group_member_inbox() TO anon;
GRANT ALL ON FUNCTION public.sync_group_member_inbox() TO authenticated;
GRANT ALL ON FUNCTION public.sync_group_member_inbox() TO service_role;


--
-- Name: FUNCTION sync_post_comment_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_post_comment_count() TO anon;
GRANT ALL ON FUNCTION public.sync_post_comment_count() TO authenticated;
GRANT ALL ON FUNCTION public.sync_post_comment_count() TO service_role;


--
-- Name: FUNCTION sync_post_like_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_post_like_count() TO anon;
GRANT ALL ON FUNCTION public.sync_post_like_count() TO authenticated;
GRANT ALL ON FUNCTION public.sync_post_like_count() TO service_role;


--
-- Name: FUNCTION sync_subscriber_group_membership(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_subscriber_group_membership() TO anon;
GRANT ALL ON FUNCTION public.sync_subscriber_group_membership() TO authenticated;
GRANT ALL ON FUNCTION public.sync_subscriber_group_membership() TO service_role;


--
-- Name: FUNCTION sync_table_member_inbox(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_table_member_inbox() TO anon;
GRANT ALL ON FUNCTION public.sync_table_member_inbox() TO authenticated;
GRANT ALL ON FUNCTION public.sync_table_member_inbox() TO service_role;


--
-- Name: FUNCTION sync_trip_participant_inbox(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_trip_participant_inbox() TO anon;
GRANT ALL ON FUNCTION public.sync_trip_participant_inbox() TO authenticated;
GRANT ALL ON FUNCTION public.sync_trip_participant_inbox() TO service_role;


--
-- Name: FUNCTION tables_search_vector_update(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tables_search_vector_update() TO anon;
GRANT ALL ON FUNCTION public.tables_search_vector_update() TO authenticated;
GRANT ALL ON FUNCTION public.tables_search_vector_update() TO service_role;


--
-- Name: FUNCTION toggle_partner_follow(p_partner_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.toggle_partner_follow(p_partner_id uuid) TO anon;
GRANT ALL ON FUNCTION public.toggle_partner_follow(p_partner_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.toggle_partner_follow(p_partner_id uuid) TO service_role;


--
-- Name: FUNCTION trg_alert_kyc_submitted(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_alert_kyc_submitted() TO anon;
GRANT ALL ON FUNCTION public.trg_alert_kyc_submitted() TO authenticated;
GRANT ALL ON FUNCTION public.trg_alert_kyc_submitted() TO service_role;


--
-- Name: FUNCTION trg_alert_new_report(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_alert_new_report() TO anon;
GRANT ALL ON FUNCTION public.trg_alert_new_report() TO authenticated;
GRANT ALL ON FUNCTION public.trg_alert_new_report() TO service_role;


--
-- Name: FUNCTION trg_alert_partner_signup(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_alert_partner_signup() TO anon;
GRANT ALL ON FUNCTION public.trg_alert_partner_signup() TO authenticated;
GRANT ALL ON FUNCTION public.trg_alert_partner_signup() TO service_role;


--
-- Name: FUNCTION trg_alert_partner_status_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_alert_partner_status_change() TO anon;
GRANT ALL ON FUNCTION public.trg_alert_partner_status_change() TO authenticated;
GRANT ALL ON FUNCTION public.trg_alert_partner_status_change() TO service_role;


--
-- Name: FUNCTION trg_alert_payout_request(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trg_alert_payout_request() TO anon;
GRANT ALL ON FUNCTION public.trg_alert_payout_request() TO authenticated;
GRANT ALL ON FUNCTION public.trg_alert_payout_request() TO service_role;


--
-- Name: FUNCTION update_chat_inbox_on_message(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_chat_inbox_on_message() TO anon;
GRANT ALL ON FUNCTION public.update_chat_inbox_on_message() TO authenticated;
GRANT ALL ON FUNCTION public.update_chat_inbox_on_message() TO service_role;


--
-- Name: FUNCTION update_event_location(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_event_location() TO anon;
GRANT ALL ON FUNCTION public.update_event_location() TO authenticated;
GRANT ALL ON FUNCTION public.update_event_location() TO service_role;


--
-- Name: FUNCTION update_group_member_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_group_member_count() TO anon;
GRANT ALL ON FUNCTION public.update_group_member_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_group_member_count() TO service_role;


--
-- Name: FUNCTION update_post_location(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_post_location() TO anon;
GRANT ALL ON FUNCTION public.update_post_location() TO authenticated;
GRANT ALL ON FUNCTION public.update_post_location() TO service_role;


--
-- Name: FUNCTION update_promo_usage_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_promo_usage_count() TO anon;
GRANT ALL ON FUNCTION public.update_promo_usage_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_promo_usage_count() TO service_role;


--
-- Name: FUNCTION update_support_ticket_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_support_ticket_timestamp() TO anon;
GRANT ALL ON FUNCTION public.update_support_ticket_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.update_support_ticket_timestamp() TO service_role;


--
-- Name: FUNCTION update_table_capacity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_table_capacity() TO anon;
GRANT ALL ON FUNCTION public.update_table_capacity() TO authenticated;
GRANT ALL ON FUNCTION public.update_table_capacity() TO service_role;


--
-- Name: FUNCTION update_table_location(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_table_location() TO anon;
GRANT ALL ON FUNCTION public.update_table_location() TO authenticated;
GRANT ALL ON FUNCTION public.update_table_location() TO service_role;


--
-- Name: FUNCTION update_tier_quantity_sold(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_tier_quantity_sold() TO anon;
GRANT ALL ON FUNCTION public.update_tier_quantity_sold() TO authenticated;
GRANT ALL ON FUNCTION public.update_tier_quantity_sold() TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: FUNCTION update_user_location(lat double precision, lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_user_location(lat double precision, lng double precision) TO anon;
GRANT ALL ON FUNCTION public.update_user_location(lat double precision, lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.update_user_location(lat double precision, lng double precision) TO service_role;


--
-- Name: FUNCTION update_user_trust_score(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_user_trust_score() TO anon;
GRANT ALL ON FUNCTION public.update_user_trust_score() TO authenticated;
GRANT ALL ON FUNCTION public.update_user_trust_score() TO service_role;


--
-- Name: FUNCTION validate_ticket(ticket_qr_code text, event_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_ticket(ticket_qr_code text, event_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.validate_ticket(ticket_qr_code text, event_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.validate_ticket(ticket_qr_code text, event_id_param uuid) TO service_role;


--
-- Name: FUNCTION verify_participant(p_table_id uuid, p_target_user_id uuid, p_verifier_lat double precision, p_verifier_lng double precision); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.verify_participant(p_table_id uuid, p_target_user_id uuid, p_verifier_lat double precision, p_verifier_lng double precision) TO anon;
GRANT ALL ON FUNCTION public.verify_participant(p_table_id uuid, p_target_user_id uuid, p_verifier_lat double precision, p_verifier_lng double precision) TO authenticated;
GRANT ALL ON FUNCTION public.verify_participant(p_table_id uuid, p_target_user_id uuid, p_verifier_lat double precision, p_verifier_lng double precision) TO service_role;


--
-- Name: TABLE activity_checkins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_checkins TO anon;
GRANT ALL ON TABLE public.activity_checkins TO authenticated;
GRANT ALL ON TABLE public.activity_checkins TO service_role;


--
-- Name: TABLE ad_clicks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ad_clicks TO anon;
GRANT ALL ON TABLE public.ad_clicks TO authenticated;
GRANT ALL ON TABLE public.ad_clicks TO service_role;


--
-- Name: SEQUENCE ad_clicks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.ad_clicks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ad_clicks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ad_clicks_id_seq TO service_role;


--
-- Name: TABLE ad_invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ad_invoices TO anon;
GRANT ALL ON TABLE public.ad_invoices TO authenticated;
GRANT ALL ON TABLE public.ad_invoices TO service_role;


--
-- Name: TABLE admin_actions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_actions TO anon;
GRANT ALL ON TABLE public.admin_actions TO authenticated;
GRANT ALL ON TABLE public.admin_actions TO service_role;


--
-- Name: TABLE admin_email_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_email_campaigns TO anon;
GRANT ALL ON TABLE public.admin_email_campaigns TO authenticated;
GRANT ALL ON TABLE public.admin_email_campaigns TO service_role;


--
-- Name: TABLE admin_otp_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_otp_codes TO anon;
GRANT ALL ON TABLE public.admin_otp_codes TO authenticated;
GRANT ALL ON TABLE public.admin_otp_codes TO service_role;


--
-- Name: TABLE admin_popups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_popups TO anon;
GRANT ALL ON TABLE public.admin_popups TO authenticated;
GRANT ALL ON TABLE public.admin_popups TO service_role;


--
-- Name: TABLE admin_push_broadcasts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_push_broadcasts TO anon;
GRANT ALL ON TABLE public.admin_push_broadcasts TO authenticated;
GRANT ALL ON TABLE public.admin_push_broadcasts TO service_role;


--
-- Name: TABLE ai_integration_references; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_integration_references TO anon;
GRANT ALL ON TABLE public.ai_integration_references TO authenticated;
GRANT ALL ON TABLE public.ai_integration_references TO service_role;


--
-- Name: SEQUENCE ai_integration_references_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.ai_integration_references_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ai_integration_references_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ai_integration_references_id_seq TO service_role;


--
-- Name: TABLE api_keys; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;


--
-- Name: TABLE api_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.api_rate_limits TO anon;
GRANT ALL ON TABLE public.api_rate_limits TO authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;


--
-- Name: TABLE apk_releases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.apk_releases TO anon;
GRANT ALL ON TABLE public.apk_releases TO authenticated;
GRANT ALL ON TABLE public.apk_releases TO service_role;


--
-- Name: TABLE app_team_memory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_team_memory TO anon;
GRANT ALL ON TABLE public.app_team_memory TO authenticated;
GRANT ALL ON TABLE public.app_team_memory TO service_role;


--
-- Name: TABLE badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.badges TO anon;
GRANT ALL ON TABLE public.badges TO authenticated;
GRANT ALL ON TABLE public.badges TO service_role;


--
-- Name: TABLE bank_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_accounts TO anon;
GRANT ALL ON TABLE public.bank_accounts TO authenticated;
GRANT ALL ON TABLE public.bank_accounts TO service_role;


--
-- Name: TABLE blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.blocks TO anon;
GRANT ALL ON TABLE public.blocks TO authenticated;
GRANT ALL ON TABLE public.blocks TO service_role;


--
-- Name: TABLE chat_inbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_inbox TO anon;
GRANT ALL ON TABLE public.chat_inbox TO authenticated;
GRANT ALL ON TABLE public.chat_inbox TO service_role;


--
-- Name: TABLE chat_poll_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_poll_votes TO anon;
GRANT ALL ON TABLE public.chat_poll_votes TO authenticated;
GRANT ALL ON TABLE public.chat_poll_votes TO service_role;


--
-- Name: TABLE chat_polls; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_polls TO anon;
GRANT ALL ON TABLE public.chat_polls TO authenticated;
GRANT ALL ON TABLE public.chat_polls TO service_role;


--
-- Name: TABLE comment_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comment_likes TO anon;
GRANT ALL ON TABLE public.comment_likes TO authenticated;
GRANT ALL ON TABLE public.comment_likes TO service_role;


--
-- Name: TABLE comment_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comment_reactions TO anon;
GRANT ALL ON TABLE public.comment_reactions TO authenticated;
GRANT ALL ON TABLE public.comment_reactions TO service_role;


--
-- Name: TABLE comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comments TO anon;
GRANT ALL ON TABLE public.comments TO authenticated;
GRANT ALL ON TABLE public.comments TO service_role;


--
-- Name: TABLE tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tables TO anon;
GRANT ALL ON TABLE public.tables TO authenticated;
GRANT ALL ON TABLE public.tables TO service_role;


--
-- Name: TABLE user_photos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_photos TO anon;
GRANT ALL ON TABLE public.user_photos TO authenticated;
GRANT ALL ON TABLE public.user_photos TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE debug_map_tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.debug_map_tables TO anon;
GRANT ALL ON TABLE public.debug_map_tables TO authenticated;
GRANT ALL ON TABLE public.debug_map_tables TO service_role;


--
-- Name: TABLE direct_chat_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.direct_chat_participants TO anon;
GRANT ALL ON TABLE public.direct_chat_participants TO authenticated;
GRANT ALL ON TABLE public.direct_chat_participants TO service_role;


--
-- Name: TABLE direct_chats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.direct_chats TO anon;
GRANT ALL ON TABLE public.direct_chats TO authenticated;
GRANT ALL ON TABLE public.direct_chats TO service_role;


--
-- Name: TABLE direct_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.direct_messages TO anon;
GRANT ALL ON TABLE public.direct_messages TO authenticated;
GRANT ALL ON TABLE public.direct_messages TO service_role;


--
-- Name: TABLE email_automation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_automation_runs TO anon;
GRANT ALL ON TABLE public.email_automation_runs TO authenticated;
GRANT ALL ON TABLE public.email_automation_runs TO service_role;


--
-- Name: TABLE email_automations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_automations TO anon;
GRANT ALL ON TABLE public.email_automations TO authenticated;
GRANT ALL ON TABLE public.email_automations TO service_role;


--
-- Name: TABLE email_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaigns TO anon;
GRANT ALL ON TABLE public.email_campaigns TO authenticated;
GRANT ALL ON TABLE public.email_campaigns TO service_role;


--
-- Name: TABLE email_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_events TO anon;
GRANT ALL ON TABLE public.email_events TO authenticated;
GRANT ALL ON TABLE public.email_events TO service_role;


--
-- Name: TABLE email_campaign_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_campaign_stats TO anon;
GRANT ALL ON TABLE public.email_campaign_stats TO authenticated;
GRANT ALL ON TABLE public.email_campaign_stats TO service_role;


--
-- Name: TABLE email_sends; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_sends TO anon;
GRANT ALL ON TABLE public.email_sends TO authenticated;
GRANT ALL ON TABLE public.email_sends TO service_role;


--
-- Name: TABLE email_suppressions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.email_suppressions TO anon;
GRANT ALL ON TABLE public.email_suppressions TO authenticated;
GRANT ALL ON TABLE public.email_suppressions TO service_role;


--
-- Name: TABLE event_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_invites TO anon;
GRANT ALL ON TABLE public.event_invites TO authenticated;
GRANT ALL ON TABLE public.event_invites TO service_role;


--
-- Name: TABLE event_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_registrations TO anon;
GRANT ALL ON TABLE public.event_registrations TO authenticated;
GRANT ALL ON TABLE public.event_registrations TO service_role;


--
-- Name: TABLE events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;


--
-- Name: TABLE tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tickets TO anon;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;


--
-- Name: TABLE transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transactions TO anon;
GRANT ALL ON TABLE public.transactions TO authenticated;
GRANT ALL ON TABLE public.transactions TO service_role;


--
-- Name: TABLE event_sales_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_sales_summary TO anon;
GRANT ALL ON TABLE public.event_sales_summary TO authenticated;
GRANT ALL ON TABLE public.event_sales_summary TO service_role;


--
-- Name: TABLE event_seat_maps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_seat_maps TO anon;
GRANT ALL ON TABLE public.event_seat_maps TO authenticated;
GRANT ALL ON TABLE public.event_seat_maps TO service_role;


--
-- Name: TABLE event_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_sections TO anon;
GRANT ALL ON TABLE public.event_sections TO authenticated;
GRANT ALL ON TABLE public.event_sections TO service_role;


--
-- Name: TABLE event_subscription_discounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_subscription_discounts TO anon;
GRANT ALL ON TABLE public.event_subscription_discounts TO authenticated;
GRANT ALL ON TABLE public.event_subscription_discounts TO service_role;


--
-- Name: TABLE event_views; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.event_views TO anon;
GRANT ALL ON TABLE public.event_views TO authenticated;
GRANT ALL ON TABLE public.event_views TO service_role;


--
-- Name: TABLE experience_purchase_intents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.experience_purchase_intents TO anon;
GRANT ALL ON TABLE public.experience_purchase_intents TO authenticated;
GRANT ALL ON TABLE public.experience_purchase_intents TO service_role;


--
-- Name: TABLE experience_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.experience_reviews TO anon;
GRANT ALL ON TABLE public.experience_reviews TO authenticated;
GRANT ALL ON TABLE public.experience_reviews TO service_role;


--
-- Name: TABLE experience_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.experience_schedules TO anon;
GRANT ALL ON TABLE public.experience_schedules TO authenticated;
GRANT ALL ON TABLE public.experience_schedules TO service_role;


--
-- Name: TABLE experience_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.experience_transactions TO anon;
GRANT ALL ON TABLE public.experience_transactions TO authenticated;
GRANT ALL ON TABLE public.experience_transactions TO service_role;


--
-- Name: TABLE fan_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fan_subscriptions TO anon;
GRANT ALL ON TABLE public.fan_subscriptions TO authenticated;
GRANT ALL ON TABLE public.fan_subscriptions TO service_role;


--
-- Name: TABLE follows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.follows TO anon;
GRANT ALL ON TABLE public.follows TO authenticated;
GRANT ALL ON TABLE public.follows TO service_role;


--
-- Name: TABLE group_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.group_members TO anon;
GRANT ALL ON TABLE public.group_members TO authenticated;
GRANT ALL ON TABLE public.group_members TO service_role;


--
-- Name: TABLE groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.groups TO anon;
GRANT ALL ON TABLE public.groups TO authenticated;
GRANT ALL ON TABLE public.groups TO service_role;


--
-- Name: TABLE purchase_intents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_intents TO anon;
GRANT ALL ON TABLE public.purchase_intents TO authenticated;
GRANT ALL ON TABLE public.purchase_intents TO service_role;


--
-- Name: TABLE high_traffic_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.high_traffic_events TO anon;
GRANT ALL ON TABLE public.high_traffic_events TO authenticated;
GRANT ALL ON TABLE public.high_traffic_events TO service_role;


--
-- Name: TABLE interest_tags; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.interest_tags TO anon;
GRANT ALL ON TABLE public.interest_tags TO authenticated;
GRANT ALL ON TABLE public.interest_tags TO service_role;


--
-- Name: TABLE posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts TO anon;
GRANT ALL ON TABLE public.posts TO authenticated;
GRANT ALL ON TABLE public.posts TO service_role;


--
-- Name: TABLE map_live_stories_view; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.map_live_stories_view TO anon;
GRANT ALL ON TABLE public.map_live_stories_view TO authenticated;
GRANT ALL ON TABLE public.map_live_stories_view TO service_role;


--
-- Name: TABLE map_ready_tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.map_ready_tables TO anon;
GRANT ALL ON TABLE public.map_ready_tables TO authenticated;
GRANT ALL ON TABLE public.map_ready_tables TO service_role;


--
-- Name: TABLE matching_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.matching_queue TO anon;
GRANT ALL ON TABLE public.matching_queue TO authenticated;
GRANT ALL ON TABLE public.matching_queue TO service_role;


--
-- Name: TABLE message_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.message_reactions TO anon;
GRANT ALL ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE partner_followers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_followers TO anon;
GRANT ALL ON TABLE public.partner_followers TO authenticated;
GRANT ALL ON TABLE public.partner_followers TO service_role;


--
-- Name: TABLE partner_gateway_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_gateway_accounts TO anon;
GRANT ALL ON TABLE public.partner_gateway_accounts TO authenticated;
GRANT ALL ON TABLE public.partner_gateway_accounts TO service_role;


--
-- Name: TABLE partner_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_invites TO anon;
GRANT ALL ON TABLE public.partner_invites TO authenticated;
GRANT ALL ON TABLE public.partner_invites TO service_role;


--
-- Name: TABLE partner_kyc_documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_kyc_documents TO anon;
GRANT ALL ON TABLE public.partner_kyc_documents TO authenticated;
GRANT ALL ON TABLE public.partner_kyc_documents TO service_role;


--
-- Name: TABLE partners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partners TO anon;
GRANT ALL ON TABLE public.partners TO authenticated;
GRANT ALL ON TABLE public.partners TO service_role;


--
-- Name: TABLE partner_performance_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_performance_summary TO anon;
GRANT ALL ON TABLE public.partner_performance_summary TO authenticated;
GRANT ALL ON TABLE public.partner_performance_summary TO service_role;


--
-- Name: TABLE partner_stakeholders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_stakeholders TO anon;
GRANT ALL ON TABLE public.partner_stakeholders TO authenticated;
GRANT ALL ON TABLE public.partner_stakeholders TO service_role;


--
-- Name: TABLE partner_subscribers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_subscribers TO anon;
GRANT ALL ON TABLE public.partner_subscribers TO authenticated;
GRANT ALL ON TABLE public.partner_subscribers TO service_role;


--
-- Name: TABLE partner_team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partner_team_members TO anon;
GRANT ALL ON TABLE public.partner_team_members TO authenticated;
GRANT ALL ON TABLE public.partner_team_members TO service_role;


--
-- Name: TABLE payouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payouts TO anon;
GRANT ALL ON TABLE public.payouts TO authenticated;
GRANT ALL ON TABLE public.payouts TO service_role;


--
-- Name: TABLE post_bookmarks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.post_bookmarks TO anon;
GRANT ALL ON TABLE public.post_bookmarks TO authenticated;
GRANT ALL ON TABLE public.post_bookmarks TO service_role;


--
-- Name: TABLE post_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.post_likes TO anon;
GRANT ALL ON TABLE public.post_likes TO authenticated;
GRANT ALL ON TABLE public.post_likes TO service_role;


--
-- Name: TABLE pricing_rules; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pricing_rules TO anon;
GRANT ALL ON TABLE public.pricing_rules TO authenticated;
GRANT ALL ON TABLE public.pricing_rules TO service_role;


--
-- Name: TABLE promo_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.promo_codes TO anon;
GRANT ALL ON TABLE public.promo_codes TO authenticated;
GRANT ALL ON TABLE public.promo_codes TO service_role;


--
-- Name: TABLE ratings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ratings TO anon;
GRANT ALL ON TABLE public.ratings TO authenticated;
GRANT ALL ON TABLE public.ratings TO service_role;


--
-- Name: TABLE registration_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_answers TO anon;
GRANT ALL ON TABLE public.registration_answers TO authenticated;
GRANT ALL ON TABLE public.registration_answers TO service_role;


--
-- Name: TABLE registration_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.registration_questions TO anon;
GRANT ALL ON TABLE public.registration_questions TO authenticated;
GRANT ALL ON TABLE public.registration_questions TO service_role;


--
-- Name: TABLE reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reports TO anon;
GRANT ALL ON TABLE public.reports TO authenticated;
GRANT ALL ON TABLE public.reports TO service_role;


--
-- Name: TABLE seat_holds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seat_holds TO anon;
GRANT ALL ON TABLE public.seat_holds TO authenticated;
GRANT ALL ON TABLE public.seat_holds TO service_role;


--
-- Name: TABLE seats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.seats TO anon;
GRANT ALL ON TABLE public.seats TO authenticated;
GRANT ALL ON TABLE public.seats TO service_role;


--
-- Name: TABLE story_views; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.story_views TO anon;
GRANT ALL ON TABLE public.story_views TO authenticated;
GRANT ALL ON TABLE public.story_views TO service_role;


--
-- Name: TABLE subscription_claims; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_claims TO anon;
GRANT ALL ON TABLE public.subscription_claims TO authenticated;
GRANT ALL ON TABLE public.subscription_claims TO service_role;


--
-- Name: TABLE subscription_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_payments TO anon;
GRANT ALL ON TABLE public.subscription_payments TO authenticated;
GRANT ALL ON TABLE public.subscription_payments TO service_role;


--
-- Name: TABLE subscription_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_posts TO anon;
GRANT ALL ON TABLE public.subscription_posts TO authenticated;
GRANT ALL ON TABLE public.subscription_posts TO service_role;


--
-- Name: TABLE subscription_tiers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscription_tiers TO anon;
GRANT ALL ON TABLE public.subscription_tiers TO authenticated;
GRANT ALL ON TABLE public.subscription_tiers TO service_role;


--
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.support_tickets TO anon;
GRANT ALL ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- Name: TABLE table_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.table_members TO anon;
GRANT ALL ON TABLE public.table_members TO authenticated;
GRANT ALL ON TABLE public.table_members TO service_role;


--
-- Name: TABLE table_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.table_participants TO anon;
GRANT ALL ON TABLE public.table_participants TO authenticated;
GRANT ALL ON TABLE public.table_participants TO service_role;


--
-- Name: TABLE team_comms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_comms TO anon;
GRANT ALL ON TABLE public.team_comms TO authenticated;
GRANT ALL ON TABLE public.team_comms TO service_role;


--
-- Name: SEQUENCE team_comms_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.team_comms_id_seq TO anon;
GRANT ALL ON SEQUENCE public.team_comms_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.team_comms_id_seq TO service_role;


--
-- Name: TABLE template_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.template_sections TO anon;
GRANT ALL ON TABLE public.template_sections TO authenticated;
GRANT ALL ON TABLE public.template_sections TO service_role;


--
-- Name: TABLE ticket_tiers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_tiers TO anon;
GRANT ALL ON TABLE public.ticket_tiers TO authenticated;
GRANT ALL ON TABLE public.ticket_tiers TO service_role;


--
-- Name: TABLE travel_matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.travel_matches TO anon;
GRANT ALL ON TABLE public.travel_matches TO authenticated;
GRANT ALL ON TABLE public.travel_matches TO service_role;


--
-- Name: TABLE travel_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.travel_plans TO anon;
GRANT ALL ON TABLE public.travel_plans TO authenticated;
GRANT ALL ON TABLE public.travel_plans TO service_role;


--
-- Name: TABLE trip_chat_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trip_chat_participants TO anon;
GRANT ALL ON TABLE public.trip_chat_participants TO authenticated;
GRANT ALL ON TABLE public.trip_chat_participants TO service_role;


--
-- Name: TABLE trip_group_chats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trip_group_chats TO anon;
GRANT ALL ON TABLE public.trip_group_chats TO authenticated;
GRANT ALL ON TABLE public.trip_group_chats TO service_role;


--
-- Name: TABLE user_trips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_trips TO anon;
GRANT ALL ON TABLE public.user_trips TO authenticated;
GRANT ALL ON TABLE public.user_trips TO service_role;


--
-- Name: TABLE trip_matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trip_matches TO anon;
GRANT ALL ON TABLE public.trip_matches TO authenticated;
GRANT ALL ON TABLE public.trip_matches TO service_role;


--
-- Name: TABLE trip_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trip_messages TO anon;
GRANT ALL ON TABLE public.trip_messages TO authenticated;
GRANT ALL ON TABLE public.trip_messages TO service_role;


--
-- Name: TABLE trip_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trip_participants TO anon;
GRANT ALL ON TABLE public.trip_participants TO authenticated;
GRANT ALL ON TABLE public.trip_participants TO service_role;


--
-- Name: TABLE user_active_chats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_active_chats TO anon;
GRANT ALL ON TABLE public.user_active_chats TO authenticated;
GRANT ALL ON TABLE public.user_active_chats TO service_role;


--
-- Name: TABLE user_badges; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_badges TO anon;
GRANT ALL ON TABLE public.user_badges TO authenticated;
GRANT ALL ON TABLE public.user_badges TO service_role;


--
-- Name: TABLE user_gamification_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_gamification_stats TO anon;
GRANT ALL ON TABLE public.user_gamification_stats TO authenticated;
GRANT ALL ON TABLE public.user_gamification_stats TO service_role;


--
-- Name: TABLE user_interests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_interests TO anon;
GRANT ALL ON TABLE public.user_interests TO authenticated;
GRANT ALL ON TABLE public.user_interests TO service_role;


--
-- Name: TABLE user_personality; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_personality TO anon;
GRANT ALL ON TABLE public.user_personality TO authenticated;
GRANT ALL ON TABLE public.user_personality TO service_role;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_preferences TO anon;
GRANT ALL ON TABLE public.user_preferences TO authenticated;
GRANT ALL ON TABLE public.user_preferences TO service_role;


--
-- Name: TABLE user_ratings_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_ratings_summary TO anon;
GRANT ALL ON TABLE public.user_ratings_summary TO authenticated;
GRANT ALL ON TABLE public.user_ratings_summary TO service_role;


--
-- Name: TABLE v_rpc_mark_exists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_rpc_mark_exists TO anon;
GRANT ALL ON TABLE public.v_rpc_mark_exists TO authenticated;
GRANT ALL ON TABLE public.v_rpc_mark_exists TO service_role;


--
-- Name: TABLE v_rpc_tray_exists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_rpc_tray_exists TO anon;
GRANT ALL ON TABLE public.v_rpc_tray_exists TO authenticated;
GRANT ALL ON TABLE public.v_rpc_tray_exists TO service_role;


--
-- Name: TABLE v_story_views_exists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.v_story_views_exists TO anon;
GRANT ALL ON TABLE public.v_story_views_exists TO authenticated;
GRANT ALL ON TABLE public.v_story_views_exists TO service_role;


--
-- Name: TABLE venue_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.venue_templates TO anon;
GRANT ALL ON TABLE public.venue_templates TO authenticated;
GRANT ALL ON TABLE public.venue_templates TO service_role;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;
GRANT ALL ON TABLE public.waitlist TO service_role;


--
-- Name: TABLE wallet_topups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wallet_topups TO anon;
GRANT ALL ON TABLE public.wallet_topups TO authenticated;
GRANT ALL ON TABLE public.wallet_topups TO service_role;


--
-- Name: TABLE web_team_context; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.web_team_context TO anon;
GRANT ALL ON TABLE public.web_team_context TO authenticated;
GRANT ALL ON TABLE public.web_team_context TO service_role;


--
-- Name: SEQUENCE web_team_context_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.web_team_context_id_seq TO anon;
GRANT ALL ON SEQUENCE public.web_team_context_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.web_team_context_id_seq TO service_role;


--
-- Name: TABLE webhook_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_deliveries TO anon;
GRANT ALL ON TABLE public.webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;


--
-- Name: TABLE webhook_endpoints; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_endpoints TO anon;
GRANT ALL ON TABLE public.webhook_endpoints TO authenticated;
GRANT ALL ON TABLE public.webhook_endpoints TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


