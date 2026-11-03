# Hoshi / 拾星

桌面陪伴应用：桌宠「星奈」聊天，工作台管知识库、画布和插件。Electron 本地跑，对话与记忆落在本机 SQLite。

## 仓库结构

```
apps/desktop          Electron 壳：桌宠、设置、工作台
packages/agent        对话运行时、记忆、知识库、HTTP
packages/shared       会话 / 设置 / SSE / 画布等共享类型
personas/default      人设、系统提示、表情立绘
```

## 怎么讲

两套会话，一份记忆，数据不出本机。

- **会话**：桌宠 `kind: "chat"`，工作台 `kind: "desk"`（请求带 `workspace: "desk"`）。`POST /v1/chat` 以 session.kind 开画布；chat 会话配 desk workspace 会拒。两边会话不互链、不抄近况。记忆全局，检索与写入不按窗口切开。
- **记忆**：回复前抽取；寒暄 / 天气 / 代码题等走 skip 门，不写库。离线单测在 `pnpm test`；记忆 live 是 `pnpm eval:memory`（耗额度，勿默认跑）。
- **知识库**：按空行一段一块（`CHUNK_MAX_CHARS = 720`），rerank 后主题过滤。离线 hit@k / MRR：`pnpm eval:kb`（假嵌入，不耗额度）。RAGAS 与对话路由基线在 `packages/agent/src/eval/baseline.json`，活测是 `pnpm eval:kb-ragas` / `pnpm eval:live`（耗额度，勿默认跑）。
- **存储**：Electron `userData/hoshi.db`（`node:sqlite` + sqlite-vec），不必另起数据库。

日常验证：`pnpm test`，再按需 `pnpm typecheck`。不要把 live 评测写进默认流程。

## 环境

- Node.js 22+（用到 `node:sqlite`）
- pnpm `9.12.3`（见根 `packageManager`）
- 可对话的 OpenAI 兼容接口（默认读 `.env`）

```bash
pnpm install
cp .env.example .env   # 填 HOSHI_API_KEY / HOSHI_BASE_URL / HOSHI_MODEL
pnpm dev               # 构建并启动 Electron
```

数据目录：Electron `userData`，库文件 `hoshi.db`。不必起独立数据库进程。

首次语音会拉 Whisper 资源（`apps/desktop` 的 `fetch-whisper`）。知识库嵌入 / rerank / 画布检索等在设置里配，也可写 `HOSHI_DEEPSEEK_API_KEY`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动桌面端 |
| `pnpm build` | 递归构建 workspace |
| `pnpm typecheck` | 各包 `tsc` |
| `pnpm test` | 单测（vitest，不含 live） |
| `pnpm eval:kb` | 知识库 hit@k / MRR（假嵌入，不耗额度） |
| `pnpm eval:live` | 对话 live 评测（耗额度，勿默认） |
| `pnpm eval:memory` | 记忆 live（耗额度，勿默认） |
| `pnpm eval:kb-ragas` | 知识库 RAGAS live（耗额度，勿默认） |
| `pnpm --filter @hoshi/desktop pack` | macOS 打包 |

改完切分规则后，已有文档要在工作台点「重建索引」才会按新规则重切。

## 桌面端窗口

| 窗口 | 代码入口 |
| --- | --- |
| 桌宠 | `apps/desktop/src/renderer/index.ts` |
| 设置 | `apps/desktop/src/renderer/settings.ts` |
| 工作台 | `apps/desktop/src/renderer/workbench/` |

主进程在 `apps/desktop/src/main/index.ts` 拉起 `@hoshi/agent` 的本地 HTTP，预加载经 `apps/desktop/src/preload/index.ts` 调 `/v1/*`。

工作台插件模板与协议在 `apps/desktop/resources/workbench/`。沙箱产物上线后进 `userData/plugins`。

## Agent HTTP（本机）

实现：`packages/agent/src/server.ts`。常见路径：

- `POST /v1/chat` SSE
- `/v1/sessions`、`/v1/memories`、`/v1/usage`
- `/v1/canvas` 及 restore / reorder
- `/v1/kb/*` 文集、文档、检索、重建
- `POST /v1/transcribe`、`GET /v1/plugins`、`GET /healthz`

类型与默认设置在 `@hoshi/shared`。改协议先改 shared，再改 agent 与桌面。

## 给 Agent 的说明

仓库根目录 [AGENTS.md](./AGENTS.md)。工作台沙箱另有 `apps/desktop/resources/workbench/AGENTS.md`。
