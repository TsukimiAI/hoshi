ALTER TABLE chat_session ADD COLUMN summary TEXT NULL;
ALTER TABLE chat_session ADD COLUMN summary_facts TEXT NULL;
ALTER TABLE chat_session ADD COLUMN summary_decisions TEXT NULL;
ALTER TABLE chat_session ADD COLUMN summary_open_loops TEXT NULL;
ALTER TABLE chat_session ADD COLUMN summary_version INT NULL;
ALTER TABLE chat_session ADD COLUMN compressed_until_message_id BIGINT NULL;
ALTER TABLE chat_session ADD COLUMN summary_updated_at DATETIME NULL;
