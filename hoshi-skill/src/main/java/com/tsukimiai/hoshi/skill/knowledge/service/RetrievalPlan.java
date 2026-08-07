package com.tsukimiai.hoshi.skill.knowledge.service;

import java.util.List;

public record RetrievalPlan(String intent, Long lockedDocumentId, List<String> queries) {
}
