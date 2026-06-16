ALTER TABLE chat_message
    ADD COLUMN web_search_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'user message sent with web search' AFTER emotion;
