/**
 * 浏览器主题辅助（依赖 window.matchMedia，仅 client 端使用；通过 @aipanel/core/client 导出）
 */
import type { AIPanelWidgetTheme } from "../common/types";

/**
 * 当前系统主题（仅浏览器有效；SSR/无 window 环境返回 light）
 */
export function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * 挂件主题偏好解析：auto 按系统主题折算为 light/dark
 * @param theme - 挂件主题偏好（AIPanelWidgetTheme）
 * @param system - 系统主题（默认当前系统）
 * @returns 实际应用主题
 */
export function resolveWidgetTheme(
  theme: AIPanelWidgetTheme,
  system: "light" | "dark" = getSystemTheme(),
): "light" | "dark" {
  return theme === "auto" ? system : theme;
}
