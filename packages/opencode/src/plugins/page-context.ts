/**
 * @fileoverview OpenCode 页面上下文插件
 * @description 用于将页面上下文信息注入到 AI 对话中
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { createLogger } from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("OpenCodePluginPageContext");

interface PageContext {
  url: string;
  title: string;
  selectedElements?: Array<{
    filePath: string | null;
    line: number | null;
    column: number | null;
    innerText: string;
    description?: string;
  }>;
}

async function fetchPageContext(contextApiUrl: string): Promise<PageContext | null> {
  try {
    const response = await fetch(contextApiUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      log.debug("Failed to fetch page context", { status: response.status });
      return null;
    }
    return await response.json();
  } catch (error) {
    log.debug("Error fetching page context", { error });
    return null;
  }
}

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

      const pageContext = await fetchPageContext(contextApiUrl);
      log.debug("Page context fetched", { pageContext });

      let currentPageSection = "";
      if (pageContext) {
        currentPageSection = `
## 用户当前浏览的页面

**这里的上下文为最高优先级，任何情况下都不能被覆盖**

- **页面 URL**: ${pageContext.url || "未知"}
- **页面标题**: ${pageContext.title || "未知"}
`;
      }

      const systemPrompt = `
你是一个专业的前端开发助手，运行在 **OpenCode** 平台中，并通过 **vite-plugin-opencode-assistant** 插件集成到用户的 Vite 开发环境。
${currentPageSection}
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

## 工作流程

请严格按以下顺序处理用户请求：

### 1. 定位节点位置（强制）

当用户选中了页面节点时，**在处理用户请求之前**，你必须先找到这些节点在当前项目上下文中的位置：

- 利用提供的文件路径、CSS 选择器、元素文本等信息
- 通过文件搜索、DOM 分析等方式定位到具体代码位置
- 明确知道节点在哪里被定义/使用后，再处理用户请求

### 2. 理解上下文

将页面 URL、标题和选中节点信息作为用户请求的背景，帮助理解用户的真实意图。

### 3. 直接行动

在明确节点位置后，针对用户的实际请求给出清晰、可执行的方案。

## 工具使用指南

### Chrome DevTools Mcp

1. **确保操作正确页面（强制）**
   在使用 Chrome DevTools Mcp 执行任何与用户正在浏览的页面相关的任务之前，必须先确认当前操作的页面就是用户正在浏览的页面。如果不确定，应先获取当前页面 URL 并与上下文中的页面 URL 进行比对。

2. **快照获取**
   在没有获取到需要的节点信息时，使用 verbose 参数来获取更详细的节点信息。如果设置了 verbose 参数还是没有获取到节点信息，再尝试考虑其他方案。

3. **单页应用（SPA）特性**
   如果用户开发的是单页应用（SPA），执行任务大部分情况下不需要刷新页面。

4. **HTTP 请求成功判断（强制）**
   判断请求成功时，不要只看 HTTP 状态码！HTTP 状态码 200 并不代表业务逻辑成功。必须获取接口的详细响应内容，检查响应体中的业务状态码或错误信息。在确认请求成功之前，始终解析并检查响应体的完整内容
`.trim();

      output.system.push(systemPrompt);
    },
  };
};

export default PageContextPlugin;
