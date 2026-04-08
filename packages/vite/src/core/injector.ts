import type { WidgetOptions } from "@vite-plugin-opencode-assistant/shared";
import { CONFIG_DATA_ATTR, WIDGET_SCRIPT_PATH } from "@vite-plugin-opencode-assistant/shared";

export function injectWidget(options: WidgetOptions): string {
  const configBase64 = Buffer.from(JSON.stringify(options)).toString("base64");
  const scriptTag = `<script type="module" src="${WIDGET_SCRIPT_PATH}" ${CONFIG_DATA_ATTR}="${configBase64}"></script>`;
  const styleTag = `<link rel="stylesheet" href="/__opencode_widget__.css" />`;
  return `${styleTag}\n${scriptTag}`;
}
