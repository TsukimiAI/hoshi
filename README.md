# Hoshi（拾星）

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向 ToC 的个人 AI 工作站：桌宠情绪陪伴 + 可插拔 Skill + 结构化 Canvas 输出。

由 [TsukimiAI](https://github.com/TsukimiAI) 维护。

## 仓库结构

```
hoshi/
├── hoshi-common          # 通用类型、异常、响应封装
├── hoshi-infrastructure  # MyBatis-Plus、MySQL、Redis
├── hoshi-security        # Spring Security + JWT
├── hoshi-user            # 注册 / 登录
├── hoshi-companion       # 桌宠状态与 WebSocket
├── hoshi-server          # Spring Boot 启动入口
├── hoshi-app             # Electron 桌面客户端（主产品）
└── hoshi-web             # 宣传页 / 展示站点
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Java 17, Spring Boot 4, Spring Security, MyBatis-Plus, Flyway |
| 数据 | MySQL, Redis |
| 桌面端 | Electron, React, TypeScript, electron-vite |
| 官网 | React, TypeScript, Vite |
| AI（规划中） | Spring AI |

## 快速开始

### 环境要求

- JDK 17+
- Maven 3.9+（或使用项目自带 `./mvnw`）
- MySQL 8.0
- Redis（可选，部分功能后续使用）
- Node.js 18+（前端）

### 数据库

```sql
CREATE DATABASE hoshi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hoshi'@'localhost' IDENTIFIED BY 'hoshi';
GRANT ALL PRIVILEGES ON hoshi.* TO 'hoshi'@'localhost';
```

### 启动后端

```bash
./mvnw -pl hoshi-server -am spring-boot:run
```

默认端口：`8080`。Flyway 会自动执行数据库迁移。

### 启动桌面客户端

```bash
cd hoshi-app
npm install
npm run dev
```

### 启动宣传页（可选）

```bash
cd hoshi-web
npm install
npm run dev
```

### SMTP 配置（注册验证 / 忘记密码）

```bash
export SMTP_HOST=smtp.qq.com
export SMTP_PORT=587
export SMTP_USERNAME=your@qq.com
export SMTP_PASSWORD=your-smtp-auth-code
export HOSHI_MAIL_FROM=your@qq.com
export HOSHI_PUBLIC_URL=http://localhost:5173
```

邮件链接格式：`{HOSHI_PUBLIC_URL}/verify-email?token=...` 与 `/reset-password?token=...`

### API 示例

```bash
# 注册（发送验证邮件，未验证前不可登录）
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","email":"demo@example.com","password":"password123"}'

# 验证邮箱
curl -X POST http://localhost:8080/api/v1/auth/verify-email \
  -H 'Content-Type: application/json' \
  -d '{"token":"邮件中的token"}'

# 登录
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usernameOrEmail":"demo","password":"password123"}'

# 忘记密码
curl -X POST http://localhost:8080/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com"}'

# 重置密码
curl -X POST http://localhost:8080/api/v1/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"token":"邮件中的token","newPassword":"newpassword123"}'
```

## 开发

```bash
# 编译与测试
./mvnw -pl hoshi-server -am clean test

# 打包
./mvnw -pl hoshi-server -am package
```

## License

[MIT](LICENSE) © 2026 TsukimiAI
