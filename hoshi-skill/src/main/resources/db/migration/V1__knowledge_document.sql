CREATE TABLE IF NOT EXISTS knowledge_document (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    user_id       BIGINT       NOT NULL,
    filename      VARCHAR(255) NOT NULL,
    content_type  VARCHAR(128) NOT NULL,
    storage_key   VARCHAR(512) NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'UPLOADED',
    chunk_count   INT          NOT NULL DEFAULT 0,
    error_message VARCHAR(1024) NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_knowledge_document_user_status (user_id, status),
    KEY idx_knowledge_document_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

