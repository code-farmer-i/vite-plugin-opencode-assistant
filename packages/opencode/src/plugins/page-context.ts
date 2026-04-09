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
      let location = element.filePath;
      if (element.line) {
        location += `:${element.line}`;
        if (element.column) {
          location += `:${element.column}`;
        }
      }
      parts.push(`- **文件位置**: \`${location}\``);
    }

    if (element.innerText?.trim()) {
      const text = element.innerText.trim().substring(0, MAX_TEXT_LENGTH);
      const suffix = element.innerText.length > MAX_TEXT_LENGTH ? "\n... (已省略部分内容)" : "";
      parts.push(`- **节点文本**:\n\`\`\`text\n${text}${suffix}\n\`\`\``);
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
│  │   │ 用户在这里与你对话           │    (Ctrl+K 打开)   │  │
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

1. **理解上下文**：将页面 URL、标题和选中节点信息作为用户请求的背景，帮助理解用户的真实意图。
2. **利用文件路径**：\`文件位置\` 中的路径对应项目源码文件，格式为 \`文件路径:行号:列号\`。你可以直接读取、分析或修改这些文件。
3. **精准定位**：结合 \`节点文本\` 和 \`文件位置\`，快速定位用户关注的具体代码位置，提供针对性的建议。
4. **直接行动**：针对用户的实际请求，直接给出清晰、可执行的方案。如果需要修改代码，主动提出修改方案并询问是否需要你直接修改。
5. **善用工具**：充分利用你的能力（读取文件、修改代码、运行命令、浏览器调试）来帮助用户解决问题。
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
