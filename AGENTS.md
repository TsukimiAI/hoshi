# Hoshi 仓库约定

给改本仓库的 Agent。先读本文件，再动代码。用户可见文案与回复用简体中文。

## 是什么

pnpm monorepo：Electron 桌宠 + 工作台，本机 `@hoshi/agent` HTTP，状态在 `userData/hoshi.db`（`node:sqlite` + sqlite-vec）。

| 路径 | 职责 |
| --- | --- |
| `apps/desktop` | 主进程、预加载、桌宠 / 设置 / 工作台渲染 |
| `packages/agent` | 对话、记忆、知识库、画布、语音、插件、HTTP |
| `packages/shared` | 跨包类型与默认设置；协议从这里改 |
| `personas/default` | 星奈人设与立绘；勿编造人设 |

桌宠会话 `kind: "chat"`，工作台 `kind: "desk"` 且 `workspace: "desk"`。记忆全局。两边会话不互链、不抄近况。不要做「同一 sessionId」或窗口手递。

## 改哪里

- 协议 / 设置字段：`packages/shared`，并改 `resolveHoshiSettings` 兼容旧配置。
- 一轮对话：`chatTurn.ts`（落库、记忆抽取）→ `runtime.ts`（检索、工具、流式句）。
- 记忆：`packages/agent/src/memory/*` + `storage/memoryRepo.ts`。抽取在回复前；跳过门在 extract。
- 知识库：`packages/agent/src/knowledge/*`。切分一段一块（空行），`CHUNK_MAX_CHARS = 720`，代码/表原子块可超上限。`search()` rerank 后 `isKnowledgeHitOnTopic`，全丢留 1 条。总结模式不滤。`expandHitContext` 与 RAGAS 基线（`eval/baseline.json` 的 context relevancy）未经要求不要改。有 `source_text` 的重建才重切；不要在启动时全库重切。
- HTTP：只在 `packages/agent/src/server.ts` 加已有风格的路由，预加载同步暴露。禁止发明桌面没用到的 API。
- 库表：`storage/db.ts` 与 `storage/migrations/`。升 `DB_SCHEMA_VERSION`。
- 工作台 UI 在 `workbench.html` 与 `src/renderer/workbench/`（ESM，import 带 `.js`）。能抽纯函数就抽，避免再摊开无关逻辑。
- 工作台沙箱插件：遵守 `apps/desktop/resources/workbench/AGENTS.md`。禁止改拾星仓库本身来「实现」插件；用户说上线只提示点工作台「上线」。

## 编码

- TypeScript、显式类型。测试与实现同目录 `*.test.ts`。
- 注释只写非显然意图（中文可以）。不要空的 try/catch，不要大段注释掉的代码。
- 只改任务需要的文件。不要顺手重构、不要改计划文件、不要提交 `.env`。
- 渲染层：桌宠 / 设置 / 工作台是 vanilla DOM，不是 React。不要新起前端框架。
- 密钥只走设置或环境变量（`HOSHI_*`）。日志不要打印 key。

## 验证

- 默认：`pnpm test`，再跑被改包的 `typecheck`。
- 知识库离线：`pnpm eval:kb`。live：`eval:live` / `eval:memory` / `eval:kb-ragas`（耗额度，不默认跑）。
- 改了窗口、样式、路由或客户端状态：用浏览器或 Electron 走一遍相关路径，空态和错误态也看。桌宠与工作台若共享状态，两边都确认。
- 改切分后说明：旧文档需用户点「重建索引」。

## 不要做

- 不要为 CTF / 未授权访问写利用或 PoC。
- 不要把桌宠和工作台合成一个会话，除非用户明确要求并改协议。
- 不要改 RAGAS 题面或偷偷抬 `baseline.json`。
- 不要在文档或回复里编造「能看屏幕 / 能操作系统」。
