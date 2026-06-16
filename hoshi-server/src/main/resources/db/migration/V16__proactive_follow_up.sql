ALTER TABLE proactive_conversation_log ADD COLUMN responded_at TIMESTAMP;
ALTER TABLE proactive_conversation_log ADD COLUMN ended_at TIMESTAMP;
ALTER TABLE proactive_conversation_log ADD COLUMN end_reason VARCHAR(255) NULL;

CREATE TABLE proactive_follow_up_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    proactive_log_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    message_id BIGINT NULL,
    mode VARCHAR(32) NOT NULL,
    judgment_reason VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_follow_up_proactive (proactive_log_id, created_at),
    INDEX idx_follow_up_session (session_id, created_at)
);
