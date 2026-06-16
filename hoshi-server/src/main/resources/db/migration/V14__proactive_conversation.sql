CREATE TABLE proactive_conversation_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_key VARCHAR(255) NOT NULL,
    message_id BIGINT NULL,
    content TEXT NULL,
    responded TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_proactive_user_created (user_id, created_at),
    INDEX idx_proactive_source (user_id, source_type, source_key, created_at)
);

ALTER TABLE chat_message
    ADD COLUMN message_source VARCHAR(32) NOT NULL DEFAULT 'chat' AFTER web_search_enabled;
