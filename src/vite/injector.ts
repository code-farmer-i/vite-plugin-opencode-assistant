import { WidgetOptions } from '../types.js'
import { WIDGET_SCRIPT_PATH, CONFIG_DATA_ATTR } from '../constants.js'

export function injectWidget(options: WidgetOptions): string {
  const configBase64 = Buffer.from(JSON.stringify(options)).toString('base64')
  return `<script src="${WIDGET_SCRIPT_PATH}" ${CONFIG_DATA_ATTR}="${configBase64}"></script>`
}
