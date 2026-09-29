import type { CitationItem } from "@hoshi/shared";
import type { PluginHost } from "../runtime";
import type { LlmTool } from "../plugins/types";
import { knowledgeRoute } from "../retrieval/plan";
import type { KnowledgeSearchMode, KnowledgeService } from "./service";
import { isKnowledgeHitOnTopic } from "./relevance";

const LIST_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "list_knowledge",
    description:
      "列出知识库里老师已上传且可用的笔记/讲义文件名、所在库和来源文件。老师问知识库有什么、有哪些笔记、叫什么名字、上传过哪些文件时必须先调用。不要编造未列出的文件。",
    parameters: {
      type: "object",
      properties: {}
    }
  }
};

const SEARCH_TOOL: LlmTool = {
  type: "function",
  function: {
    name: "search_knowledge",
    description:
      "只检索老师上传到知识库的文档/讲义/笔记。天气、气温、股价、新闻、实时或当月情况等时事不要调用，那些用 web_search。知识库没有相关段落就当作没查到，禁止把无关文档当成答案。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索关键词或问题" },
        topK: { type: "integer", description: "返回条数，默认 5" },
        mode: { type: "string", description: "summarize 按序读全文；lookup 在文档内检索" }
      },
      required: ["query"]
    }
  }
};

function parseMode(value: unknown, query: string): KnowledgeSearchMode {
  if (value === "summarize" || value === "lookup") {
    return value;
  }
  return knowledgeRoute(query).kind === "summarize" ? "summarize" : "lookup";
}

export class KnowledgeToolHost implements PluginHost {
  private lastCitations: CitationItem[] = [];

  constructor(private readonly service: KnowledgeService) {}

  tools(): LlmTool[] {
    return this.service.isEnabled() ? [LIST_TOOL, SEARCH_TOOL] : [];
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    if (name === "list_knowledge") {
      return this.executeList();
    }
    if (name !== "search_knowledge") {
      return `工具不可用：${name}`;
    }
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      this.lastCitations = [];
      return "检索失败：缺少 query";
    }
    const topK = typeof args.topK === "number" ? Math.floor(args.topK) : undefined;
    const mode = parseMode(args.mode, query);
    try {
      const rawHits = await this.service.search(query, { topK, mode });
      const hits =
        mode === "summarize"
          ? rawHits
          : rawHits.filter((hit) => isKnowledgeHitOnTopic(query, `${hit.documentTitle}\n${hit.text}`));
      if (hits.length === 0) {
        this.lastCitations = [];
        return "知识库没有与该问题相关的文档。不要引用无关讲义。天气、新闻、股价等时事请用 web_search，不要再调用 search_knowledge。";
      }
      this.lastCitations = hits.map((hit) => ({
        chunkId: hit.chunkId,
        docId: hit.docId,
        documentTitle: hit.documentTitle,
        collectionId: hit.collectionId,
        collectionName: hit.collectionName,
        snippet: hit.text.replace(/\s+/g, " ").slice(0, 100),
        score: hit.score
      }));
      const budget =
        mode === "summarize" ? Math.max(this.service.contextBudgetChars(), 10000) : this.service.contextBudgetChars();
      const chunkChars = mode === "summarize" ? 1800 : 900;
      const lines: string[] = [];
      let used = 0;
      for (let i = 0; i < hits.length; i += 1) {
        const hit = hits[i];
        const header = `[${i + 1}] 《${hit.documentTitle}》`;
        let body = hit.text;
        try {
          body = await this.service.expandHitContext(hit, mode === "summarize" ? 0 : 1);
        } catch {
          /* 回填失败用命中块原文 */
        }
        const trimmed = body.replace(/\s+/g, " ").trim().slice(0, chunkChars);
        const block = `${header}\n${trimmed}`;
        if (used + block.length > budget && lines.length > 0) {
          break;
        }
        lines.push(block);
        used += block.length;
      }
      return lines.join("\n\n");
    } catch (error) {
      this.lastCitations = [];
      return `检索失败：${error instanceof Error ? error.message : "未知错误"}`;
    }
  }

  private async executeList(): Promise<string> {
    try {
      const items = await this.service.listCatalog();
      if (items.length === 0) {
        return "知识库里还没有可用的笔记或讲义。";
      }
      const lines = items.slice(0, 80).map((item, index) => {
        const source = item.sourceName ? `｜来源 ${item.sourceName}` : "";
        const collection = item.collectionName ? `｜${item.collectionName}` : "";
        return `${index + 1}. 《${item.title}》${collection}${source}`;
      });
      return `知识库可用文档（${items.length}）：\n${lines.join("\n")}`;
    } catch (error) {
      return `列出知识库失败：${error instanceof Error ? error.message : "未知错误"}`;
    }
  }

  takeCitations(): CitationItem[] {
    const out = this.lastCitations;
    this.lastCitations = [];
    return out;
  }
}
