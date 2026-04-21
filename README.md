# vite-plugin-opencode-assistant

在 Vite 开发环境中嵌入 OpenCode AI 助手，实现边聊天边改代码、即时预览的开发体验。

## 包结构

这是一个 monorepo 项目，包含以下包：

| 包名 | 说明 |
| --- | --- |
| [vite-plugin-opencode-assistant](packages/vite/) | Vite 插件主包，用于在开发服务器中注入 AI 助手挂件 |
| [@vite-plugin-opencode-assistant/components](packages/components/src/open-code-widget/) | Vue 组件包，包含 OpenCode 挂件的所有 UI 组件 |
| @vite-plugin-opencode-assistant/shared | 共享代码，包含类型定义、工具函数、日志处理等 |
| @vite-plugin-opencode-assistant/opencode | OpenCode CLI 集成，包含进程管理、Web 服务启动等 |

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
pnpm build
```

### 开发

```bash
# 启动组件开发站点
pnpm dev:components

# 启动 playground 文档站点
pnpm dev:playground
```

## License

MIT