/**
 * @fileoverview OpenCode 页面上下文插件
 * @description 用于将页面上下文信息注入到 AI 对话中
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { createLogger } from "@vite-plugin-opencode-assistant/shared";

const MAX_TEXT_LENGTH = 10000;

const CONTEXT_MARKER = "__OPENCODE_CONTEXT__";

const log = createLogger("OpenCodePluginPageContext");

interface SelectedElement {
  filePath: string | null;
  line: number | null;
  column: number | null;
  innerText: string;
  description?: string;
}

interface PageContextData {
  url: string;
  title: string;
  selectedElements?: SelectedElement[];
}

export const PageContextPlugin: Plugin = async (): Promise<Hooks> => {
  log.info("PageContextPlugin loading...");

  const contextApiUrl = process.env.OPENCODE_CONTEXT_API_URL;
  log.debug("Context API URL:", { contextApiUrl });

  if (!contextApiUrl) {
    log.warn("OPENCODE_CONTEXT_API_URL is not set, page context plugin will not work");
    return {};
  }

  const apiUrl = contextApiUrl as string;
  log.info("Plugin initialized successfully");

  async function getPageContext(): Promise<PageContextData | null> {
    try {
      log.debug("Fetching context...", { apiUrl });
      const response = await fetch(apiUrl);

      if (!response.ok) {
        log.error("Context API returned error status", {
          status: response.status,
          statusText: response.statusText,
          apiUrl,
        });
        return null;
      }

      const data = (await response.json()) as PageContextData;
      log.debug("Context received", { url: data.url, title: data.title });
      return {
        url: data.url || "",
        title: data.title || "",
        selectedElements: data.selectedElements,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      log.error("Failed to get context", {
        error: errorMessage,
        errorType: errorName,
        apiUrl,
      });
      return null;
    }
  }

  async function clearSelectedElements(): Promise<void> {
    try {
      log.debug("Clearing selected elements", { apiUrl });
      const response = await fetch(apiUrl, { method: "DELETE" });
      log.debug("Clear response", { status: response.status });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      log.error("Failed to clear selected elements", {
        error: errorMessage,
        errorType: errorName,
        apiUrl,
      });
    }
  }

  function formatSelectedElement(element: SelectedElement, index: number): string {
    const parts: string[] = [];

    parts.push(`### 选中节点 ${index + 1}`);

    if (element.filePath) {
      const isNodeModule = element.filePath.includes("node_modules");

      if (isNodeModule) {
        // node_modules 中的元素：提供选择器信息，引导使用 Chrome MCP
        parts.push(`- **元素描述**: \`${element.description}\``);
        if (element.innerText?.trim()) {
          const text = element.innerText.trim().substring(0, 100);
          parts.push(`- **节点文本**: \`${text}${element.innerText.length > 100 ? "..." : ""}\``);
        }
        parts.push(
          `- **分析建议**: 请使用 Chrome DevTools MCP 获取当前页面快照，结合 CSS 选择器 \`${element.description}\` 来获取更多的页面上下文`,
        );
      } else {
        // 项目内元素：显示源码位置
        let location = element.filePath;
        if (element.line) {
          location += `:${element.line}`;
          if (element.column) {
            location += `:${element.column}`;
          }
        }
        parts.push(`- **文件位置**: \`${location}\``);
        if (element.innerText?.trim()) {
          const text = element.innerText.trim().substring(0, MAX_TEXT_LENGTH);
          const suffix = element.innerText.length > MAX_TEXT_LENGTH ? "\n... (已省略部分内容)" : "";
          parts.push(`- **节点文本**:\n\`\`\`text\n${text}${suffix}\n\`\`\``);
        }
      }
    }

    return parts.join("\n") + "\n";
  }

  function buildContextPrefix(context: PageContextData): string {
    const pageLink = context.title ? `[${context.title}](${context.url})` : context.url;
    let prefix = `【系统提示：以下是用户当前正在浏览的页面上下文，请将其作为最高优先级的背景信息来理解和响应用户的请求。】\n\n`;
    prefix += `用户现在正在浏览项目中的这个页面：${pageLink}\n\n`;

    if (context.selectedElements?.length) {
      prefix += `用户选中了以下节点：\n\n`;
      context.selectedElements.forEach((element, index) => {
        prefix += formatSelectedElement(element, index) + "\n";
      });
    }

    prefix += `---\n**用户的请求**：\n\n`;
    return prefix;
  }

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

### 上下文感知机制

当用户与你对话时，系统会自动收集并注入以下页面上下文信息：

1. **页面信息**：用户当前浏览的页面 URL 和标题
2. **选中元素**：用户在页面上选中的 DOM 元素信息，包括：
   - 源码文件路径（如 \`src/components/Button.tsx\`）
   - 行号和列号（精确定位到代码位置）
   - 元素的文本内容

这些信息由 Vite 插件通过内部 API 收集，并在用户发送消息时自动附加到消息前缀中。

## 上下文处理规则

当你在对话中看到类似以下格式的上下文信息时：

\`\`\`
【系统提示：以下是用户当前正在浏览的页面上下文...】
用户现在正在浏览项目中的这个页面：[页面标题](URL)
用户选中了以下节点：
### 选中节点 1
- **文件位置**: \`src/components/Button.tsx:42:10\`
- **节点文本**: ...
\`\`\`

请遵循以下规则：

1. **前置要求：定位节点位置**（强制）
   当用户选中了页面节点时，**在处理用户请求之前**，你必须先找到这些节点在当前项目上下文中的位置。
   - 利用提供的文件路径、CSS 选择器、元素文本等信息
   - 通过文件搜索、DOM 分析等方式定位到具体代码位置
   - 明确知道节点在哪里被定义/使用后，再处理用户请求

2. **理解上下文**：将页面 URL、标题和选中节点信息作为用户请求的背景，帮助理解用户的真实意图。

3. **直接行动**：在明确节点位置后，针对用户的实际请求给出清晰、可执行的方案。
`.trim();

      output.system.push(systemPrompt);
    },
    "experimental.chat.messages.transform": async (_input, output) => {
      log.debug("Message transform hook called");
      const context = await getPageContext();
      log.debug("Context data", {
        hasUrl: !!context?.url,
        hasElements: !!context?.selectedElements?.length,
      });

      if (!context?.url) return;

      const lastUserMsg = [...output.messages].reverse().find((m) => m.info.role === "user");
      if (!lastUserMsg) return;

      const textPart = lastUserMsg.parts.find((p) => p.type === "text");
      if (!textPart || !("text" in textPart)) return;

      if (textPart.text.includes(CONTEXT_MARKER)) return;

      const prefix = buildContextPrefix(context);
      textPart.text = prefix + textPart.text;

      if (context.selectedElements?.length) {
        log.debug("Selected elements found, clearing...");
        await clearSelectedElements();
      }
    },
  };
};

export default PageContextPlugin;
