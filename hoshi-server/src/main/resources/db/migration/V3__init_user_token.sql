CREATE TABLE IF NOT EXISTS hoshi_user_token (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    user_id      BIGINT       NOT NULL,
    token_type   VARCHAR(32)  NOT NULL COMMENT 'EMAIL_VERIFY, PASSWORD_RESET',
    token_hash   VARCHAR(128) NOT NULL,
    expires_at   DATETIME     NOT NULL,
    used_at      DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_hoshi_user_token_hash (token_hash),
    KEY idx_hoshi_user_token_user_type (user_id, token_type),
    CONSTRAINT fk_hoshi_user_token_user
        FOREIGN KEY (user_id) REFERENCES hoshi_user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
