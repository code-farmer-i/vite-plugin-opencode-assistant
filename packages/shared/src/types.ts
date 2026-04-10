/**
 * OpenCode 界面语言选项
 */
export type OpenCodeLanguage =
  | "en"
  | "zh"
  | "zht"
  | "ko"
  | "ja"
  | "de"
  | "es"
  | "fr"
  | "da"
  | "pl"
  | "ru"
  | "bs"
  | "ar"
  | "no"
  | "br"
  | "th"
  | "tr";

/**
 * OpenCode 内部设置（与 localStorage settings.v3 对应）
 * 用于配置 OpenCode Web 内部行为
 */
export interface OpenCodeSettings {
  /** 通用设置 */
  general?: {
    /** 自动保存 */
    autoSave?: boolean;
    /** 显示更新说明 */
    releaseNotes?: boolean;
    /** 后续动作模式 */
    followup?: "steer" | "suggest" | "none";
    /** 显示推理摘要 */
    showReasoningSummaries?: boolean;
    /** 默认展开 shell 工具部分 */
    shellToolPartsExpanded?: boolean;
    /** 默认展开编辑工具部分 */
    editToolPartsExpanded?: boolean;
  };

  /** 外观设置 */
  appearance?: {
    /** 界面字体大小 */
    fontSize?: number;
    /** 代码字体 */
    mono?: string;
    /** 界面字体 */
    sans?: string;
  };

  /** 权限设置 */
  permissions?: {
    /** 自动批准权限请求 */
    autoApprove?: boolean;
  };

  /** 通知设置 */
  notifications?: {
    /** 智能体完成时通知 */
    agent?: boolean;
    /** 权限请求时通知 */
    permissions?: boolean;
    /** 错误时通知 */
    errors?: boolean;
  };

  /** 音效设置 */
  sounds?: {
    /** 启用智能体音效 */
    agentEnabled?: boolean;
    /** 智能体音效 */
    agent?: string;
    /** 启用权限音效 */
    permissionsEnabled?: boolean;
    /** 权限音效 */
    permissions?: string;
    /** 启用错误音效 */
    errorsEnabled?: boolean;
    /** 错误音效 */
    errors?: string;
  };
}

/**
 * OpenCode Vite 插件配置选项
 */
export interface OpenCodeOptions {
  /** 是否启用插件，默认 true */
  enabled?: boolean;
  /** Web 服务端口，默认 4097 */
  webPort?: number;
  /** 代理服务端口，默认 4098 */
  proxyPort?: number;
  /** 服务主机名，默认 '127.0.0.1' */
  hostname?: string;
  /** 挂件位置，默认 'bottom-right' */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /** 主题模式，默认 'auto' */
  theme?: "light" | "dark" | "auto";
  /** 是否自动打开面板，默认 false */
  open?: boolean;
  /** 是否自动重载，默认 true */
  autoReload?: boolean;
  /** 是否输出详细日志，默认 false */
  verbose?: boolean;
  /** 快捷键配置，默认 'ctrl+k' */
  hotkey?: string;
  /** 服务启动后是否立即预热 Chrome MCP，默认 true */
  warmupChromeMcp?: boolean;

  // === OpenCode 内部配置 ===
  /** OpenCode 界面语言，默认跟随浏览器语言 */
  language?: OpenCodeLanguage;
  /** OpenCode 内部设置，直接映射到 localStorage settings.v3 */
  settings?: OpenCodeSettings;
}

/**
 * OpenCode Web 服务启动选项
 */
export interface WebOptions {
  /** 服务端口 */
  port: number;
  /** 服务主机名 */
  hostname: string;
  /** 服务器 URL */
  serverUrl: string;
  /** 工作目录 */
  cwd: string;
  /** 配置目录路径 */
  configDir?: string;
  /** CORS 允许的源 */
  corsOrigins?: string[];
  /** 上下文 API URL */
  contextApiUrl?: string;
}

/**
 * 挂件注入配置选项
 */
export interface WidgetOptions {
  /** Web 服务 URL */
  webUrl: string;
  /** 代理服务 URL */
  proxyUrl: string;
  /** 服务器 URL */
  serverUrl: string;
  /** 挂件位置 */
  position: string;
  /** 主题模式 */
  theme: string;
  /** 是否自动打开 */
  open: boolean;
  /** 是否自动重载 */
  autoReload: boolean;
  /** 工作目录 */
  cwd: string;
  /** 会话 URL */
  sessionUrl?: string;
  /** 快捷键配置 */
  hotkey?: string;
}

/**
 * OpenCode 会话信息
 */
export interface SessionInfo {
  /** 会话 ID */
  id: string;
  /** 会话标识符 */
  slug: string;
  /** 项目 ID */
  projectID: string;
  /** 项目目录 */
  directory: string;
  /** 会话标题 */
  title: string;
  /** 版本号 */
  version: string;
  /** 代码变更统计 */
  summary: {
    /** 新增行数 */
    additions: number;
    /** 删除行数 */
    deletions: number;
    /** 修改文件数 */
    files: number;
  };
  /** 时间信息 */
  time: {
    /** 创建时间戳 */
    created: number;
    /** 更新时间戳 */
    updated: number;
  };
}

/**
 * 选中的元素信息
 */
export interface SelectedElement {
  /** 文件路径 */
  filePath: string | null;
  /** 行号 */
  line: number | null;
  /** 列号 */
  column: number | null;
  /** 元素内部文本 */
  innerText: string;
  /** 元素描述（标签名+选择器） */
  description?: string;
}

/**
 * 页面上下文数据
 */
export interface PageContext {
  /** 当前页面 URL */
  url: string;
  /** 当前页面标题 */
  title: string;
  /** 选中的元素列表 */
  selectedElements?: SelectedElement[];
}

/**
 * 服务启动任务状态
 */
export type ServiceStartupTask =
  | "checking_opencode"
  | "allocating_port"
  | "preparing_runtime"
  | "starting_web"
  | "waiting_web_ready"
  | "starting_proxy"
  | "warming_up_chrome"
  | "creating_session"
  | "opencode_not_installed"
  | "web_start_timeout"
  | "session_creation_failed"
  | "chrome_mcp_failed"
  | "ready";

/**
 * 服务启动任务状态映射
 */
export const SERVICE_STARTUP_TASKS: Record<ServiceStartupTask, string> = {
  checking_opencode: "检查 OpenCode 安装",
  allocating_port: "分配服务端口",
  preparing_runtime: "准备运行环境",
  starting_web: "启动 OpenCode Web",
  waiting_web_ready: "等待服务就绪",
  starting_proxy: "启动代理服务",
  warming_up_chrome: "预热 Chrome DevTools",
  creating_session: "创建会话",
  opencode_not_installed: "OpenCode 未安装",
  web_start_timeout: "服务启动超时",
  session_creation_failed: "会话创建失败",
  chrome_mcp_failed: "Chrome DevTools 连接失败",
  ready: "准备完成",
};

// ==================== Widget 组件类型 ====================

/**
 * 挂件位置选项
 */
export type OpenCodeWidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

/**
 * 挂件主题选项
 */
export type OpenCodeWidgetTheme = "light" | "dark" | "auto";

/**
 * 服务状态
 */
export type ServiceStatus = "idle" | "starting" | "ready" | "partial" | "failed";

/**
 * 挂件会话信息
 */
export interface OpenCodeWidgetSession {
  id: string;
  title?: string;
  updatedAt?: string | number | Date;
  meta?: string;
  directory?: string;
}

/**
 * 挂件选中的元素
 */
export interface OpenCodeSelectedElement {
  filePath: string | null;
  line: number | null;
  column: number | null;
  innerText: string;
  description?: string;
}

/**
 * 删除选中节点的载荷
 */
export interface OpenCodeRemoveSelectedPayload {
  element: OpenCodeSelectedElement;
  index: number;
  source: "panel" | "bubble";
}

/**
 * 挂件会话列表项
 */
export interface OpenCodeWidgetSessionItem {
  key: string;
  id: string;
  title: string;
  meta: string;
  active: boolean;
  session: OpenCodeWidgetSession;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * 选中元素列表项
 */
export interface OpenCodeSelectedElementItem {
  key: string;
  description: string;
  bubbleFileText: string;
  panelFileText: string;
  element: OpenCodeSelectedElement;
}

/**
 * 挂件组件 Props
 */
export interface OpenCodeWidgetProps {
  position?: OpenCodeWidgetPosition;
  open?: boolean;
  theme?: OpenCodeWidgetTheme;
  title?: string;
  hotkeyLabel?: string;
  selectShortcutLabel?: string;
  selectMode?: boolean;
  sessionListCollapsed?: boolean;
  sessionKey?: string;
  frameLoading?: boolean;
  loadingSessionList?: boolean;
  showSessionListSkeleton?: boolean;
  showEmptyState?: boolean;
  showError?: boolean;
  emptyStateText?: string;
  emptyStateActionText?: string;
  iframeSrc?: string;
  sessions?: OpenCodeWidgetSession[];
  currentSessionId?: string | null;
  selectedElements?: OpenCodeSelectedElement[];
  showClearAll?: boolean;
  selectEnabled?: boolean;
}

/**
 * 挂件组件事件
 */
export type OpenCodeWidgetEmits = {
  (e: "update:open", value: boolean): void;
  (e: "update:selectMode", value: boolean): void;
  (e: "update:sessionListCollapsed", value: boolean): void;
  (e: "update:currentSessionId", value: string | null): void;
  (e: "update:selectedElements", value: OpenCodeSelectedElement[]): void;
  (e: "update:theme", value: OpenCodeWidgetTheme): void;
  (e: "toggle", value: boolean): void;
  (e: "close"): void;
  (e: "toggle-session-list", value: boolean): void;
  (e: "toggle-select-mode", value: boolean): void;
  (e: "toggle-theme", value: OpenCodeWidgetTheme): void;
  (e: "create-session"): void;
  (e: "select-session", session: OpenCodeWidgetSession): void;
  (e: "delete-session", session: OpenCodeWidgetSession): void;
  (e: "click-selected-node", element: OpenCodeSelectedElement): void;
  (e: "remove-selected-node", payload: OpenCodeRemoveSelectedPayload): void;
  (e: "clear-selected-nodes"): void;
  (e: "empty-action"): void;
};
