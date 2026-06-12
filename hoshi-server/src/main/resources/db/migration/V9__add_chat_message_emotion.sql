ALTER TABLE chat_message
    ADD COLUMN emotion VARCHAR(32) NULL COMMENT 'assistant emotion tag' AFTER content;
