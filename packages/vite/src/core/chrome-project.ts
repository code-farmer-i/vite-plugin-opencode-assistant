/**
 * 项目边界策略解析：在请求时把 chromeMcp.project 与 vite 自动 origins 合并为一份体。
 * 所有边界判定（页面归属 / 导航目标 / 扩展页）均只读此解析结果，单一来源。
 */
import type { ViteDevServer } from "vite";
import type { ChromeProjectOptions } from "@aipanel/core";
import { getProjectOrigins } from "./mcp-chrome";

export interface ProjectScope {
  /** 项目页 origins（自动，“项目页全局一个”分类 + vue-devtools 桥可用范围） */
  origins: string[];
  /** 可操作范围 = 项目页 ∪ allowOrigins：chrome 页面级 list/current/pageId 校验、navigate/new 目标用 */
  operationsOrigins: string[];
  /** 是否允许 chrome-extension:// 页面纳入可操作范围 */
  includeExtensions: boolean;
}

export function resolveProjectScope(
  server: ViteDevServer,
  project?: ChromeProjectOptions,
): ProjectScope {
  const auto = getProjectOrigins(server);
  const operationsOrigins = [...new Set([...auto, ...(project?.allowOrigins ?? [])])];
  return {
    origins: auto,
    operationsOrigins,
    includeExtensions: project?.includeExtensionPages === true,
  };
}
