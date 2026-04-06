/**
 * OpenCode Vite 插件配置选项
 */
export interface OpenCodeOptions {
  /** 是否启用插件，默认 true */
  enabled?: boolean
  /** Web 服务端口，默认 4097 */
  webPort?: number
  /** 服务主机名，默认 '127.0.0.1' */
  hostname?: string
  /** 挂件位置，默认 'bottom-right' */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /** 主题模式，默认 'auto' */
  theme?: 'light' | 'dark' | 'auto'
  /** 是否自动打开面板，默认 false */
  open?: boolean
  /** 是否自动重载，默认 true */
  autoReload?: boolean
  /** 是否输出详细日志，默认 false */
  verbose?: boolean
  /** 快捷键配置，默认 'ctrl+k' */
  hotkey?: string
}

/**
 * OpenCode Web 服务启动选项
 */
export interface WebOptions {
  /** 服务端口 */
  port: number
  /** 服务主机名 */
  hostname: string
  /** 服务器 URL */
  serverUrl: string
  /** 工作目录 */
  cwd: string
  /** 配置目录路径 */
  configDir?: string
  /** CORS 允许的源 */
  corsOrigins?: string[]
  /** 上下文 API URL */
  contextApiUrl?: string
}

/**
 * 挂件注入配置选项
 */
export interface WidgetOptions {
  /** Web 服务 URL */
  webUrl: string
  /** 服务器 URL */
  serverUrl: string
  /** 挂件位置 */
  position: string
  /** 主题模式 */
  theme: string
  /** 是否自动打开 */
  open: boolean
  /** 是否自动重载 */
  autoReload: boolean
  /** 工作目录 */
  cwd: string
  /** 会话 URL */
  sessionUrl?: string
  /** 快捷键配置 */
  hotkey?: string
}

/**
 * OpenCode 会话信息
 */
export interface SessionInfo {
  /** 会话 ID */
  id: string
  /** 会话标识符 */
  slug: string
  /** 项目 ID */
  projectID: string
  /** 项目目录 */
  directory: string
  /** 会话标题 */
  title: string
  /** 版本号 */
  version: string
  /** 代码变更统计 */
  summary: {
    /** 新增行数 */
    additions: number
    /** 删除行数 */
    deletions: number
    /** 修改文件数 */
    files: number
  }
  /** 时间信息 */
  time: {
    /** 创建时间戳 */
    created: number
    /** 更新时间戳 */
    updated: number
  }
}

/**
 * 选中的元素信息
 */
export interface SelectedElement {
  /** 文件路径 */
  filePath: string | null
  /** 行号 */
  line: number | null
  /** 列号 */
  column: number | null
  /** 元素内部文本 */
  innerText: string
  /** 元素描述（标签名+选择器） */
  description?: string
}

/**
 * 页面上下文数据
 */
export interface PageContext {
  /** 当前页面 URL */
  url: string
  /** 当前页面标题 */
  title: string
  /** 选中的元素列表 */
  selectedElements?: SelectedElement[]
}
