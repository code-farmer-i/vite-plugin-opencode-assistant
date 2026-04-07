/**
 * @fileoverview OpenCode 页面上下文插件
 * @description 用于将页面上下文信息注入到 AI 对话中
 */

import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { createLogger } from "../../logger.js";

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
    log.warn(
      "OPENCODE_CONTEXT_API_URL is not set, page context plugin will not work",
    );
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : "UnknownError";
      log.error("Failed to clear selected elements", {
        error: errorMessage,
        errorType: errorName,
        apiUrl,
      });
    }
  }

  function formatSelectedElement(
    element: SelectedElement,
    index: number,
  ): string {
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
      const suffix =
        element.innerText.length > MAX_TEXT_LENGTH
          ? "\n... (已省略部分内容)"
          : "";
      parts.push(`- **节点文本**:\n\`\`\`text\n${text}${suffix}\n\`\`\``);
    }

    return parts.join("\n") + "\n";
  }

  function buildContextPrefix(context: PageContextData): string {
    const pageLink = context.title
      ? `[${context.title}](${context.url})`
      : context.url;
    let prefix = `我现在正在浏览项目中的这个页面：${pageLink}\n\n`;

    if (context.selectedElements?.length) {
      prefix += `我选中了以下节点：\n\n`;
      context.selectedElements.forEach((element, index) => {
        prefix += formatSelectedElement(element, index) + "\n";
      });
    }

    prefix += `---\n**我的请求**：\n\n`;
    return prefix;
  }

  return {
    "experimental.chat.system.transform": async (_input, output) => {
      log.debug("System transform hook called");

      const systemPrompt = `
你是一个专业的前端开发助手，当前正集成在用户的 Vite 项目中（通过 vite-plugin-opencode-assistant）。
在对话中，用户可能会自动附加他们当前正在浏览的页面上下文（包括页面 URL、标题以及在页面上选中的 DOM 节点信息）。

处理这些上下文时，请遵循以下规则：
1. **理解上下文**：当看到“我现在正在浏览项目中的这个页面”或“选中节点”等信息时，请将其作为用户请求的背景。
2. **利用文件路径**：如果提供的节点信息中包含 \`文件位置\`，这通常对应于项目中的源代码文件。你可以直接分析或建议修改这些文件。
3. **精准定位**：结合节点的 \`节点文本\` 和 \`文件位置\`，帮助用户快速定位问题或实现功能。
4. **直接给出方案**：针对用户的实际请求，直接给出清晰、可执行的代码修改建议或解释，避免不必要的废话。
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

      const lastUserMsg = [...output.messages]
        .reverse()
        .find((m) => m.info.role === "user");
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
