ALTER TABLE user_memory ADD COLUMN supersedes_memory_id BIGINT NULL;

CREATE INDEX idx_user_memory_supersedes ON user_memory (supersedes_memory_id);

ALTER TABLE user_memory
    ADD CONSTRAINT fk_user_memory_supersedes
        FOREIGN KEY (supersedes_memory_id) REFERENCES user_memory(id) ON DELETE SET NULL;
