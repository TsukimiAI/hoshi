CREATE TABLE IF NOT EXISTS hoshi_user (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    username        VARCHAR(32)  NOT NULL,
    email           VARCHAR(128) NOT NULL,
    password_hash   VARCHAR(100) NOT NULL,
    nickname        VARCHAR(32)  NOT NULL,
    status          TINYINT      NOT NULL DEFAULT 1 COMMENT '1=active,0=disabled',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_hoshi_user_username (username),
    UNIQUE KEY uk_hoshi_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
