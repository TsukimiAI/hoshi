package com.tsukimiai.hoshi.skill.knowledge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.skill.knowledge")
public class KnowledgeChunkProperties {

    private Chunk chunk = new Chunk();
    private Summary summary = new Summary();
    private Retrieve retrieve = new Retrieve();

    public Chunk getChunk() {
        return chunk;
    }

    public void setChunk(Chunk chunk) {
        this.chunk = chunk;
    }

    public Summary getSummary() {
        return summary;
    }

    public void setSummary(Summary summary) {
        this.summary = summary;
    }

    public Retrieve getRetrieve() {
        return retrieve;
    }

    public void setRetrieve(Retrieve retrieve) {
        this.retrieve = retrieve;
    }

    public static class Chunk {
        private int maxChars = 1200;
        private int overlapChars = 200;

        public int getMaxChars() {
            return maxChars;
        }

        public void setMaxChars(int maxChars) {
            this.maxChars = maxChars;
        }

        public int getOverlapChars() {
            return overlapChars;
        }

        public void setOverlapChars(int overlapChars) {
            this.overlapChars = overlapChars;
        }
    }

    public static class Summary {
        private boolean enabled = true;
        private String model = "qwen-turbo";
        private int maxInputChars = 12000;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public int getMaxInputChars() {
            return maxInputChars;
        }

        public void setMaxInputChars(int maxInputChars) {
            this.maxInputChars = maxInputChars;
        }
    }

    public static class Retrieve {
        private int candidateMultiplier = 2;
        private int maxQueries = 3;
        private int maxChunksPerSection = 2;

        public int getCandidateMultiplier() {
            return candidateMultiplier;
        }

        public void setCandidateMultiplier(int candidateMultiplier) {
            this.candidateMultiplier = candidateMultiplier;
        }

        public int getMaxQueries() {
            return maxQueries;
        }

        public void setMaxQueries(int maxQueries) {
            this.maxQueries = maxQueries;
        }

        public int getMaxChunksPerSection() {
            return maxChunksPerSection;
        }

        public void setMaxChunksPerSection(int maxChunksPerSection) {
            this.maxChunksPerSection = maxChunksPerSection;
        }
    }
}
