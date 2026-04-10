export type {
  OpenCodeWidgetPosition,
  OpenCodeWidgetTheme,
  OpenCodeWidgetSession,
  OpenCodeSelectedElement,
  OpenCodeRemoveSelectedPayload,
  OpenCodeWidgetSessionItem,
  OpenCodeSelectedElementItem,
  OpenCodeWidgetProps,
  OpenCodeWidgetEmits,
} from "@vite-plugin-opencode-assistant/shared";

// 为了向后兼容，保留原有导出
export type OpenCodeWidgetPositionLocal = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type OpenCodeWidgetThemeLocal = "light" | "dark" | "auto";
