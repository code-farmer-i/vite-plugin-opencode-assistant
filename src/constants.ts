/**
 * @fileoverview OpenCode 插件常量定义
 */

/** ==================== 网络相关 ==================== */

/** 默认主机名 */
export const DEFAULT_HOSTNAME = '127.0.0.1'

/** 默认 Web 服务端口 */
export const DEFAULT_WEB_PORT = 4097

/** 服务器启动超时时间（毫秒） */
export const SERVER_START_TIMEOUT = 15000

/** 服务器检查间隔（毫秒） */
export const SERVER_CHECK_INTERVAL = 100

/** 健康检查超时时间（毫秒） */
export const HEALTH_CHECK_TIMEOUT = 1000

/** ==================== 重试相关 ==================== */

/** 默认重试次数 */
export const DEFAULT_RETRIES = 5

/** 重试延迟（毫秒） */
export const RETRY_DELAY = 500

/** 进程终止等待时间（毫秒） */
export const PROCESS_KILL_DELAY = 500

/** ==================== 端口查找 ==================== */

/** 最大端口尝试次数 */
export const MAX_PORT_TRIES = 10

/** ==================== 日志相关 ==================== */

/** 插件日志前缀 */
export const LOG_PREFIX = '[vite-plugin-opencode]'

/** OpenCode Web 日志前缀 */
export const WEB_LOG_PREFIX = '[OpenCode Web]'

/** OpenCode Web 错误日志前缀 */
export const WEB_ERROR_PREFIX = '[OpenCode Web Error]'

/** ==================== 挂件相关 ==================== */

/** 挂件脚本路径 */
export const WIDGET_SCRIPT_PATH = '/__opencode_widget__.js'

/** 配置数据属性名 */
export const CONFIG_DATA_ATTR = 'data-opencode-config'

/** 上下文 API 路径 */
export const CONTEXT_API_PATH = '/__opencode_context__'

/** 启动 API 路径 */
export const START_API_PATH = '/__opencode_start__'

/** 会话列表 API 路径 */
export const SESSIONS_API_PATH = '/__opencode_sessions__'

/** SSE 事件流路径 */
export const SSE_EVENTS_PATH = '/__opencode_events__'

/** 上下文更新间隔（毫秒） */
export const CONTEXT_UPDATE_INTERVAL = 500

/** 服务器同步间隔（毫秒） */
export const SERVER_SYNC_INTERVAL = 2000

/** Vue Inspector 检查间隔（毫秒） */
export const INSPECTOR_CHECK_INTERVAL = 500

/** 自动打开延迟（毫秒） */
export const AUTO_OPEN_DELAY = 1000

/** 通知显示时间（毫秒） */
export const NOTIFICATION_DURATION = 3000

/** ==================== 存储相关 ==================== */

/** 初始化标记 */
export const INIT_MARKER = '__OPENCODE_INITIALIZED__'

/** 选中元素存储键 */
export const SELECTED_ELEMENTS_KEY = '__opencode_selected_elements__'

/** ==================== 文本处理 ==================== */

/** 元素文本最大显示长度 */
export const MAX_TEXT_LENGTH = 100

/** 元素上下文标记 */
export const CONTEXT_MARKER = '[元素上下文]'

/** ==================== 默认配置 ==================== */

/** 默认插件配置 */
export const DEFAULT_CONFIG = {
  enabled: true,
  webPort: DEFAULT_WEB_PORT,
  hostname: DEFAULT_HOSTNAME,
  position: 'bottom-right' as const,
  theme: 'auto' as const,
  open: false,
  autoReload: true,
  verbose: false,
  hotkey: 'ctrl+k',
}
