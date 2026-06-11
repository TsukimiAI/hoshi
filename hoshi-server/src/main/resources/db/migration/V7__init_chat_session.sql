CREATE TABLE IF NOT EXISTS chat_session (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    title       VARCHAR(128) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_session_user_updated (user_id, updated_at DESC),
    CONSTRAINT fk_chat_session_user
        FOREIGN KEY (user_id) REFERENCES hoshi_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
