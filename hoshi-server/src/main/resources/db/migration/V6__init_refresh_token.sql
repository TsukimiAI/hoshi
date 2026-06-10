CREATE TABLE IF NOT EXISTS hoshi_refresh_token (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    token_hash  VARCHAR(64)  NOT NULL,
    expires_at  DATETIME     NOT NULL,
    revoked_at  DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_hoshi_refresh_token_hash (token_hash),
    KEY idx_hoshi_refresh_token_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
