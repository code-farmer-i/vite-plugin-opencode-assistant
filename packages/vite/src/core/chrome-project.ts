/**
 * 项目边界策略解析：在请求时把 chromeMcp.project 与 vite 自动 origins 合并为一份体。
 * 所有边界判定（页面归属 / 导航目标 / 扩展页）均只读此解析结果，单一来源。
 */
import type { ViteDevServer } from "vite";
import type { ChromeProjectOptions } from "@aipanel/core";
import { getProjectOrigins } from "./mcp-chrome";

export interface ProjectScope {
  /** 页面归属 origins：list/current/pageId 校验用 */
  origins: string[];
  /** navigate/new_page 目标 origins */
  navigationOrigins: string[];
  /** 是否允许 chrome-extension:// 页面纳入可操作范围 */
  includeExtensions: boolean;
}

export function resolveProjectScope(
  server: ViteDevServer,
  project?: ChromeProjectOptions,
): ProjectScope {
  const auto = getProjectOrigins(server);
  const extra = project?.projectOrigins ?? [];
  const origins =
    project?.projectOriginsMode === "explicit"
      ? [...new Set(extra)]
      : [...new Set([...auto, ...extra])];
  const nav = project?.navigationOrigins ?? [];
  const navigationOrigins =
    nav.length > 0 ? [...new Set(nav)] : origins;
  return {
    origins,
    navigationOrigins,
    includeExtensions: project?.includeExtensionPages === true,
  };
}
