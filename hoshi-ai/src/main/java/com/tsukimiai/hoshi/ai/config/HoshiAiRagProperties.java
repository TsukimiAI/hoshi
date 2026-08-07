package com.tsukimiai.hoshi.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hoshi.ai.rag")
public class HoshiAiRagProperties {

    private boolean enabled = false;

    private boolean knowledgeEnabled = false;

    private boolean memoryEnabled = false;

    private int knowledgeTopK = 8;

    private double knowledgeMinScore = 0.60;

  /**
   * Token budget for knowledge chunks. When zero, {@link com.tsukimiai.hoshi.ai.model.AiPromptBudget#flexTokens()} is used.
   */
    private int knowledgeBudgetTokens = 0;

    /**
     * Token budget for summary-like knowledge queries. When zero, {@link #knowledgeBudgetTokens} is used.
     */
    private int knowledgeSummaryBudgetTokens = 2400;

    private String qdrantCollection = "hoshi_knowledge";

    private int memoryTopK = 6;

    private double memoryMinScore = 0.55;

    /**
     * Token budget for memory chunks. When zero, {@link com.tsukimiai.hoshi.ai.model.AiPromptBudget#flexTokens()} is used.
     */
    private int memoryBudgetTokens = 0;

    private String memoryQdrantCollection = "hoshi_memory";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isKnowledgeEnabled() {
        return knowledgeEnabled;
    }

    public void setKnowledgeEnabled(boolean knowledgeEnabled) {
        this.knowledgeEnabled = knowledgeEnabled;
    }

    public boolean isMemoryEnabled() {
        return memoryEnabled;
    }

    public void setMemoryEnabled(boolean memoryEnabled) {
        this.memoryEnabled = memoryEnabled;
    }

    public int getKnowledgeTopK() {
        return knowledgeTopK;
    }

    public void setKnowledgeTopK(int knowledgeTopK) {
        this.knowledgeTopK = knowledgeTopK;
    }

    public double getKnowledgeMinScore() {
        return knowledgeMinScore;
    }

    public void setKnowledgeMinScore(double knowledgeMinScore) {
        this.knowledgeMinScore = knowledgeMinScore;
    }

    public int getKnowledgeBudgetTokens() {
        return knowledgeBudgetTokens;
    }

    public void setKnowledgeBudgetTokens(int knowledgeBudgetTokens) {
        this.knowledgeBudgetTokens = knowledgeBudgetTokens;
    }

    public int getKnowledgeSummaryBudgetTokens() {
        return knowledgeSummaryBudgetTokens;
    }

    public void setKnowledgeSummaryBudgetTokens(int knowledgeSummaryBudgetTokens) {
        this.knowledgeSummaryBudgetTokens = knowledgeSummaryBudgetTokens;
    }

    public String getQdrantCollection() {
        return qdrantCollection;
    }

    public void setQdrantCollection(String qdrantCollection) {
        this.qdrantCollection = qdrantCollection;
    }

    public int getMemoryTopK() {
        return memoryTopK;
    }

    public void setMemoryTopK(int memoryTopK) {
        this.memoryTopK = memoryTopK;
    }

    public double getMemoryMinScore() {
        return memoryMinScore;
    }

    public void setMemoryMinScore(double memoryMinScore) {
        this.memoryMinScore = memoryMinScore;
    }

    public int getMemoryBudgetTokens() {
        return memoryBudgetTokens;
    }

    public void setMemoryBudgetTokens(int memoryBudgetTokens) {
        this.memoryBudgetTokens = memoryBudgetTokens;
    }

    public String getMemoryQdrantCollection() {
        return memoryQdrantCollection;
    }

    public void setMemoryQdrantCollection(String memoryQdrantCollection) {
        this.memoryQdrantCollection = memoryQdrantCollection;
    }

    /**
     * Knowledge chat retrieval is controlled by {@code knowledge-enabled} alone.
     * Server HTTP client to hoshi-skill follows the same flag.
     */
    public boolean isKnowledgeRetrievalActive() {
        return knowledgeEnabled;
    }

    /**
     * Long-memory vector retrieval is controlled by {@code memory-enabled} alone.
     * Enabling it also pulls in server-side Qdrant via {@link #isServerVectorStoreEnabled()}.
     */
    public boolean isMemoryRetrievalActive() {
        return memoryEnabled;
    }

    /**
     * Server-side Qdrant auto-config. Prefer {@code memory-enabled}; {@code enabled} remains as an explicit override.
     */
    public boolean isServerVectorStoreEnabled() {
        return memoryEnabled || enabled;
    }
}
