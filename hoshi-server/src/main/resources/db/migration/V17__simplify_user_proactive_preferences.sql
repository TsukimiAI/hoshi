ALTER TABLE user_proactive_preferences
    ADD COLUMN follow_up_enabled TINYINT(1) NOT NULL DEFAULT 1;

ALTER TABLE user_proactive_preferences
    DROP COLUMN interval_minutes;

ALTER TABLE user_proactive_preferences
    DROP COLUMN daily_limit;
