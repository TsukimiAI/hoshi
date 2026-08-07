# Hoshi 后端架构约定

本文档描述 Hoshi 后端模块边界、依赖方向与核心编排分层，作为后续重构与 Code Review 的基准。

## 模块职责

| 模块 | 职责 |
|------|------|
| `hoshi-common` | 跨模块契约：异常、API 响应、桌宠情绪枚举与事件 |
| `hoshi-infrastructure` | 持久化、对象存储、MyBatis 配置 |
| `hoshi-security` | JWT、Spring Security 过滤器 |
| `hoshi-user` | 注册登录、资料、头像；对外暴露 `CurrentUserService` |
| `hoshi-ai` | LLM 调用与认知任务（情绪、记忆抽取、会话压缩） |
| `hoshi-companion` | 桌宠 WebSocket 广播；订阅 `CompanionEmotionPublishedEvent` |
| `hoshi-conversation` | 会话、消息、记忆、SSE 流式编排 |
| `hoshi-server` | Spring Boot 装配、Flyway、集成测试 |

## 依赖方向（允许）

```
common
  ↑
infrastructure, security, ai
  ↑
user, companion
  ↑
conversation
  ↑
server（显式装配 companion）
```

### 禁止

- `conversation` **不得**依赖 `companion`（通过 `hoshi-common` 事件解耦）
- `ai` / `companion` **不得**依赖 `conversation`
- 业务模块 **不得**直接依赖其他模块的 `mapper` / `entity`（应走 Service 或 common 契约）

## Conversation 内部分层

```
web/          Controller、CurrentUserResolver
service/      领域服务接口与薄门面（ChatMessageServiceImpl）
application/  编排与工作流
support/      纯工具、record、领域辅助类型
stream/       SSE Sink 抽象
entity/       持久化实体（后续可迁至 infrastructure）
```

### application 包

| 类 | 职责 |
|----|------|
| `ChatStreamOrchestrator` | AI 流式回复、SSE 分段、done 生命周期 |
| `ChatContextAssembler` | Prompt 上下文与记忆检索 |
| `MemoryExtractionWorkflow` | 回复后记忆抽取与持久化 |
| `SessionTitleWorkflow` | 新会话自动标题 |
| `SessionCompactionWorkflow` | 异步会话压缩 |
| `ChatMessagePersistenceService` | 消息/会话持久化 |
| `CompanionEmotionPublisher` | 发布桌宠情绪事件 |
| `ChatStreamErrorHandler` | 流式错误友好化 |

## 后台认知任务

聊天回复后的记忆抽取、会话压缩等异步任务统一经 `CognitionBackgroundTaskExecutor` 提交，线程池见 `CognitionBackgroundTaskConfiguration`。避免在各 Workflow 中直接使用裸 `CompletableFuture.runAsync`。

## 记忆检索

`MemoryRetriever` 接口（默认 `LexicalMemoryRetriever`）负责 short/long 记忆检索打分；开启 `hoshi.ai.rag.memory-enabled` 后使用 `HybridMemoryRetriever`（词法 + Qdrant）。

## 知识库 RAG

- 开关：`hoshi.ai.rag.knowledge-enabled=true`（推荐）；兼容 `hoshi.skill.knowledge.enabled`
- 编排：`RetrievalOrchestrator` → `HttpKnowledgeRetriever` → `hoshi-skill` `/v1/skills/knowledge/retrieve`
- 索引与混合排序在 `hoshi-skill`（`KnowledgeQueryPlanner` + `HybridKnowledgeRanker`）

## 流式生命周期

1. 持久化用户消息 → `event:user`
2. AI 流式生成 → `segment_*` 事件
3. 持久化助手消息
4. 可选自动标题 → `event:session`
5. **`event:done`**（客户端可恢复输入）
6. 异步记忆提取 → `event:memory`（若连接仍打开）
7. 异步会话压缩（无 SSE）

## 架构护栏

`hoshi-server` 中的 `ModuleArchitectureTest`（ArchUnit）强制执行模块依赖规则。新增模块或依赖前请先跑：

```bash
./mvnw -pl hoshi-server -am test
```
