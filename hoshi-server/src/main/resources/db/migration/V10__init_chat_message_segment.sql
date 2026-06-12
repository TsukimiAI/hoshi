CREATE TABLE IF NOT EXISTS chat_message_segment (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    message_id  BIGINT       NOT NULL,
    seq         INT          NOT NULL,
    content     TEXT         NOT NULL,
    emotion     VARCHAR(32)  NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_chat_message_segment_message_seq (message_id, seq),
    KEY idx_chat_message_segment_message_id (message_id),
    CONSTRAINT fk_chat_message_segment_message
        FOREIGN KEY (message_id) REFERENCES chat_message(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
