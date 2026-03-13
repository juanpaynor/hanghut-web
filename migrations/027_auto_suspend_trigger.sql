-- Migration: Auto-suspend users with 3+ pending reports
-- Phase 1 automated moderation — no AI needed, just a threshold trigger.
--
-- When a new report is inserted:
--   1. Count pending reports against the same target user
--   2. If 3 or more → auto-suspend the user
--   3. Mark all their pending reports as 'reviewed'
--   4. Log the action in admin_actions

CREATE OR REPLACE FUNCTION auto_suspend_on_report_threshold()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on reports table
DROP TRIGGER IF EXISTS trigger_auto_suspend_on_reports ON reports;

CREATE TRIGGER trigger_auto_suspend_on_reports
    AFTER INSERT ON reports
    FOR EACH ROW
    EXECUTE FUNCTION auto_suspend_on_report_threshold();
