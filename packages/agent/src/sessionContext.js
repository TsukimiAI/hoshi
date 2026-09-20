"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sliceCompactSummary = sliceCompactSummary;
exports.llmCompactSummary = llmCompactSummary;
exports.buildSessionContext = buildSessionContext;
const sessionRepo_1 = require("./storage/sessionRepo");
const RECENT_RATIO = 0.7;
const SUMMARY_RATIO = 0.3;
const MAX_SUMMARY_CHARS = 3200;
function sliceCompactSummary(prev, lines) {
    const merged = [prev.trim(), lines.join("\n").trim()].filter(Boolean).join("\n");
    if (merged.length <= MAX_SUMMARY_CHARS) {
        return merged;
    }
    return merged.slice(merged.length - MAX_SUMMARY_CHARS);
}
async function llmCompactSummary(llm, prev, lines, sessionId) {
    const fallback = sliceCompactSummary(prev, lines);
    try {
        const result = await llm.completeChat([
            {
                role: "system",
                content: "把对话压成第三人称要点摘要，保留约定、称呼、老师偏好与未完成事项。不要发挥、不要对话体。不超过800字。"
            },
            {
                role: "user",
                content: `旧摘要：\n${prev.trim() || "（无）"}\n\n新对话：\n${lines.join("\n")}`
            }
        ], [], { enableSearch: false, timeoutMs: 20000, purpose: "compact", sessionId });
        const text = result.content.replace(/\s+/g, " ").trim();
        if (!text) {
            return { text: fallback };
        }
        return {
            text: text.length > MAX_SUMMARY_CHARS ? text.slice(0, MAX_SUMMARY_CHARS) : text,
            usage: result.usage
        };
    }
    catch {
        return { text: fallback };
    }
}
async function buildSessionContext(repo, sessionId, chat, llm) {
    const session = await repo.getSession(sessionId);
    if (!session) {
        throw new Error("session not found");
    }
    const stats = await repo.getSessionStats(sessionId);
    const allMessages = await repo.listMessages(sessionId, 400);
    const summaryTokenBudget = Math.floor(chat.contextBudget * SUMMARY_RATIO);
    const recentTokenBudget = Math.floor(chat.contextBudget * RECENT_RATIO);
    const summaryTokens = (0, sessionRepo_1.estimateTokenCount)(session.summaryText);
    const shouldCompact = stats.messageCount > chat.compactTriggerMsgCount ||
        stats.tokenEstimateSum > chat.compactTriggerToken ||
        summaryTokens + allMessages.reduce((sum, msg) => sum + msg.tokenEstimate, 0) > chat.contextBudget;
    let compactUsage;
    let triedCompact = false;
    if (shouldCompact && allMessages.length > chat.compactKeepRecent) {
        triedCompact = true;
        const compactable = allMessages.slice(0, allMessages.length - chat.compactKeepRecent);
        const keep = allMessages.slice(allMessages.length - chat.compactKeepRecent);
        const compactLines = compactable.map((message) => {
            const text = message.content.replace(/\s+/g, " ").trim().slice(0, 140);
            return `${message.role}: ${text}`;
        });
        const compactResult = await llmCompactSummary(llm, session.summaryText, compactLines, sessionId);
        const nextSummary = compactResult.text;
        compactUsage = compactResult.usage;
        const nextVersion = session.summaryVersion + 1;
        const compacted = await repo.compactSession({
            sessionId,
            summaryText: nextSummary,
            summaryVersion: nextVersion,
            expectedVersion: session.summaryVersion,
            deleteMessageIds: compactable.map((item) => item.id),
            beforeMessageCount: allMessages.length,
            afterMessageCount: keep.length,
            compressedTokenEstimate: compactable.reduce((sum, msg) => sum + msg.tokenEstimate, 0),
            firstCompactedMessageId: compactable[0]?.id ?? null,
            lastCompactedMessageId: compactable[compactable.length - 1]?.id ?? null
        });
        if (!compacted) {
            compactUsage = undefined;
        }
    }
    const freshSession = triedCompact ? await repo.getSession(sessionId) : session;
    const summaryText = freshSession?.summaryText ?? session.summaryText;
    const summaryMessage = summaryText && (0, sessionRepo_1.estimateTokenCount)(summaryText) <= summaryTokenBudget
        ? [{ role: "system", content: `会话摘要：\n${summaryText}` }]
        : [];
    const recentMessages = await repo.listMessages(sessionId, 240);
    const chosen = [];
    let used = 0;
    for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
        const item = recentMessages[i];
        if (used + item.tokenEstimate > recentTokenBudget) {
            break;
        }
        used += item.tokenEstimate;
        chosen.push(item);
    }
    chosen.reverse();
    return {
        history: [...summaryMessage, ...sessionRepo_1.SessionRepo.toPromptHistory(chosen)],
        compactUsage
    };
}
