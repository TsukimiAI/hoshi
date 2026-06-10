CREATE TABLE IF NOT EXISTS hoshi_email_code (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    email       VARCHAR(128) NOT NULL,
    code_hash   VARCHAR(64)  NOT NULL,
    purpose     VARCHAR(32)  NOT NULL,
    expires_at  DATETIME     NOT NULL,
    used_at     DATETIME     NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_hoshi_email_code_email_purpose (email, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
