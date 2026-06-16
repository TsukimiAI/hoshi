CREATE TABLE user_proactive_preferences (
    user_id BIGINT NOT NULL PRIMARY KEY,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    interval_minutes INT NOT NULL DEFAULT 180,
    daily_limit INT NOT NULL DEFAULT 3,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_proactive_updated (updated_at)
);
