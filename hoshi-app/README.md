# Hoshi App

Hoshi 桌面客户端（Electron + React + TypeScript）。

## 开发

先启动后端：

```bash
cd ..
./mvnw -pl hoshi-server -am spring-boot:run
```

再启动桌面端：

```bash
npm install
npm run dev
```

开发模式下 `/api` 与 `/ws` 会代理到 `http://localhost:8080`。

## 常用命令

```bash
npm run dev        # 开发
npm run build      # 构建
npm run start      # 预览构建结果
npm run typecheck  # 类型检查
```

## 目录

```
src/
├── main/       # Electron 主进程
├── preload/    # 预加载脚本（window.hoshi API）
└── renderer/   # React UI
    └── src/lib/http.ts  # 后端 API 请求封装
```

## 打包

```bash
npm run build:mac
npm run build:win
npm run build:linux
```
