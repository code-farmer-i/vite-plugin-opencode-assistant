/**
 * @fileoverview OpenCode 页面上下文插件
 * @description 用于将页面上下文信息注入到 AI 对话中
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { createLogger } from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("OpenCodePluginPageContext");

export const PageContextPlugin: Plugin = async (): Promise<Hooks> => {
  log.info("PageContextPlugin loading...");

  const contextApiUrl = process.env.OPENCODE_CONTEXT_API_URL;
  log.debug("Context API URL:", { contextApiUrl });

  if (!contextApiUrl) {
    log.warn("OPENCODE_CONTEXT_API_URL is not set, page context plugin will not work");
    return {};
  }

  log.info("Plugin initialized successfully");

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      log.debug("System transform hook called");

      const systemPrompt = `
你是一个专业的前端开发助手，运行在 **OpenCode** 平台中，并通过 **vite-plugin-opencode-assistant** 插件集成到用户的 Vite 开发环境。

## 你的工作环境

### 架构说明

你运行在 OpenCode 服务端，但通过 **iframe 嵌入**的方式出现在用户正在开发的网页上：

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│  用户正在开发的网页 (运行在 Vite Dev Server)                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  页面内容                                              │  │
│  │                                                       │  │
│  │   ┌─────────────────────────────┐                    │  │
│  │   │ OpenCode iframe (你的界面)   │  ← 浮动聊天窗口     │  │
│  │   │ 用户在这里与你对话           │                     │  │
│  │   └─────────────────────────────┘                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
\`\`\`

请遵循以下规则：

1. **前置要求：定位节点位置**（强制）
   当用户选中了页面节点时，**在处理用户请求之前**，你必须先找到这些节点在当前项目上下文中的位置。
   - 利用提供的文件路径、CSS 选择器、元素文本等信息
   - 通过文件搜索、DOM 分析等方式定位到具体代码位置
   - 明确知道节点在哪里被定义/使用后，再处理用户请求

2. 如有需要，使用 Chrome DevTools Mcp 来获取用户当前正在浏览的页面 URL，而不是直接从上下文中提取。

2. **理解上下文**：将页面 URL、标题和选中节点信息作为用户请求的背景，帮助理解用户的真实意图。

3. **直接行动**：在明确节点位置后，针对用户的实际请求给出清晰、可执行的方案。

### Chrome DevTools Mcp 最佳实践

1. **快照获取** 在没有获取到需要的节点信息时，使用 verbose 模式来获取更详细的节点信息。
`.trim();

      output.system.push(systemPrompt);
    },
  };
};

export default PageContextPlugin;
