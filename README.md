# Hoshi（拾星）

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向 ToC 的个人 AI 桌面陪伴：**流式对话 + 用户记忆 + 个人知识库 RAG + 桌宠情绪联动**。

由 [TsukimiAI](https://github.com/TsukimiAI) 维护。

## 能力概览

| 能力 | 说明 |
|------|------|
| 对话 | SSE 句级流式、情绪标签、会话压缩与摘要 |
| 记忆 | 短期/长期抽取、冲突整合（supersede/archive）、半衰期与晋升 |
| 知识库 RAG | Markdown 结构化分块、文档摘要索引、意图分流、向量+词法混合检索 |
| 桌宠 | WebSocket 情绪同步、主动开口 |

## 架构

```
┌─────────────┐     REST / SSE / WS      ┌──────────────────┐
│  hoshi-app  │ ───────────────────────► │   hoshi-server   │
│  Electron   │                          │   :8080          │
└─────────────┘                          └────────┬─────────┘
                                                  │ HTTP
                                                  ▼
                                         ┌──────────────────┐
                                         │   hoshi-skill    │
                                         │   :8090 知识库   │
                                         └────────┬─────────┘
                                                  │
         ┌──────────┬──────────┬──────────┬───────┴────────┐
         ▼          ▼          ▼          ▼                ▼
      MySQL      Redis      MinIO      Qdrant          DashScope
                                      knowledge /        LLM +
                                      memory             Embedding
```

- **hoshi-server**：账号、会话、记忆、对话编排、桌宠；记忆向量写入 `hoshi_memory`
- **hoshi-skill**：文档上传/索引/检索；知识向量写入 `hoshi_knowledge`
- **hoshi-app**：Electron 主客户端

更细的模块约定见 [docs/backend-architecture.md](docs/backend-architecture.md)。

## 仓库结构

```
hoshi/
├── hoshi-common           # 异常、API 响应、情绪事件
├── hoshi-infrastructure   # MyBatis、MySQL、Redis、MinIO
├── hoshi-security         # JWT / Spring Security
├── hoshi-user             # 注册登录、资料
├── hoshi-ai               # LLM、Prompt、RAG 配置
├── hoshi-conversation     # 会话、记忆、SSE、知识代理
├── hoshi-companion        # 桌宠 WebSocket
├── hoshi-metrics          # Micrometer / Prometheus
├── hoshi-skill-api        # Skill HTTP 契约（知识检索 DTO）
├── hoshi-skill            # 知识库索引与检索服务
├── hoshi-server           # Spring Boot 启动入口
├── hoshi-app              # Electron 桌面客户端
└── hoshi-web              # 宣传页
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Java 17, Spring Boot 4, Spring Security, MyBatis-Plus, Flyway, Spring AI |
| 数据 | MySQL 8, Redis, MinIO, Qdrant |
| AI | 通义千问（Chat / Embedding）, 自研记忆与 RAG 流水线 |
| 桌面端 | Electron, React, TypeScript, electron-vite |

## 10 分钟本地跑通

### 1. 环境

- JDK 17+
- Maven 3.9+（或 `./mvnw`）
- Node.js 18+
- Docker（拉依赖）
- 阿里云 DashScope API Key（对话 + Embedding）

### 2. 依赖一键启动

```bash
docker compose up -d
```

拉起：**MySQL**（3306）、**Redis**（6379）、**MinIO**（9000/9001）、**Qdrant**（6333/6334）。

### 3. 本地配置（密钥）

```bash
export DASHSCOPE_API_KEY=sk-xxx

cp hoshi-server/src/main/resources/application-local.yml.example \
   hoshi-server/src/main/resources/application-local.yml
cp hoshi-skill/src/main/resources/application-local.yml.example \
   hoshi-skill/src/main/resources/application-local.yml
# 编辑两处 api-key，或依赖上面的环境变量
```

`application-local.yml` 已 gitignore，不要提交密钥。

### 4. RAG 开关（演示必开）

在 `hoshi-server` 的 `application-local.yml` 中：

```yaml
hoshi:
  ai:
    rag:
      knowledge-enabled: true   # 对话检索知识库 + 启用 skill HTTP 客户端
      memory-enabled: true      # 长期记忆向量（同时加载 server 侧 Qdrant）
      knowledge-budget-tokens: 800
  skill:
    knowledge:
      enabled: true             # 可选兼容项；只开 knowledge-enabled 也可
      base-url: http://localhost:8090
```

规则（避免「上传了但聊不到」）：

| 开关 | 作用 |
|------|------|
| `hoshi.ai.rag.knowledge-enabled=true` | **推荐唯一开关**：开启知识检索，并注册到 hoshi-skill 的 HTTP 客户端 |
| `hoshi.skill.knowledge.enabled=true` | 兼容旧配置；单独打开也会开启检索 |
| `hoshi.ai.rag.memory-enabled=true` | 长期记忆走 Qdrant 混合检索 |
| `hoshi.ai.rag.enabled` | 遗留总开关；仅作 server Qdrant 的额外覆盖，知识库不再依赖它 |

知识向量在 **hoshi-skill** 的 collection `hoshi_knowledge`；记忆向量在 **hoshi-server** 的 `hoshi_memory`。

### 5. 启动后端（两个进程）

```bash
# 终端 A：对话 / 记忆 / 代理
./mvnw -pl hoshi-server -am spring-boot:run

# 终端 B：知识库索引与检索
./mvnw -pl hoshi-skill -am spring-boot:run
```

- server：http://localhost:8080  
- skill：http://localhost:8090  
- Flyway 在 server 启动时自动迁移（含 `knowledge_document`）

### 6. 启动桌面端

```bash
cd hoshi-app
npm install
npm run dev
```

### 7. 冒烟检查

1. 注册 / 登录  
2. 设置 → 知识库 → 上传一份 `.md`  
3. 等到状态变为「可检索」  
4. 聊天：「总结我刚上传的文档」→ 再追问文档中的细节  

若上传失败，确认 **hoshi-skill :8090** 已启动、Qdrant / MinIO 健康。

## SMTP（可选）

注册验证 / 忘记密码需要邮箱：

```bash
export SMTP_HOST=smtp.qq.com
export SMTP_PORT=587
export SMTP_USERNAME=your@qq.com
export SMTP_PASSWORD=your-smtp-auth-code
export HOSHI_MAIL_FROM=your@qq.com
export HOSHI_PUBLIC_URL=http://localhost:5173
```

## 开发命令

```bash
# 测试
./mvnw -pl hoshi-server -am test
./mvnw -pl hoshi-skill -am test

# 打包
./mvnw -pl hoshi-server -am package
./mvnw -pl hoshi-skill -am package
```

## License

[MIT](LICENSE) © 2026 TsukimiAI
