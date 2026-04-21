# vite-plugin-opencode-assistant

在 Vite 开发环境中嵌入 OpenCode AI 助手，实现边聊天边改代码、即时预览的开发体验。

## 它能做什么

- **悬浮 AI 面板** - 在页面右下角注入悬浮按钮，支持拖拽定位和边缘磁吸
- **自动启动服务** - 自动启动本地 OpenCode Web 服务，无需手动操作
- **智能会话管理** - 自动复用当前项目的会话，支持创建、切换、删除会话
- **实时状态显示** - 会话列表显示思考状态指示器，了解 AI 当前工作状态
- **页面上下文同步** - 自动同步当前页面 URL、标题给 AI，SPA 路由切换时实时更新
- **元素选择器** - 通过快捷键在页面上点选元素，将组件源码位置信息传给 AI
- **主题同步** - 挂件主题与 OpenCode Web 主题实时同步
- **代理服务** - 内置代理服务器解决 iframe 跨域限制，确保 OpenCode Web 功能完整
- **Chrome DevTools 预热** - 启动时自动预热浏览器工具链，减少首次使用等待
- **日志查看** - 提供日志接口，方便 Agent 获取开发服务器输出

## 效果演示

启动 Vite 开发服务器后：

1. 页面右下角出现悬浮按钮
2. 点击按钮展开 OpenCode 对话面板
3. 直接在面板中与 AI 对话，修改代码
4. Vite HMR 即时刷新，立即看到修改效果

## 安装

```bash
npm install -D vite-plugin-opencode-assistant
```

## 前置条件

需要本机已安装 [OpenCode](https://opencode.ai) CLI：

```bash
curl -fsSL https://opencode.ai/install | bash
```

或使用包管理器：

```bash
npm i -g opencode-ai@latest
brew install anomalyco/tap/opencode
```

验证安装：

```bash
opencode --version
```

## 快速开始

### 最小配置

```ts
import { defineConfig } from "vite";
import opencodeAssistant from "vite-plugin-opencode-assistant";

export default defineConfig({
  plugins: [opencodeAssistant()],
});
```

### 完整配置示例

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import opencodeAssistant from "vite-plugin-opencode-assistant";

export default defineConfig({
  plugins: [
    vue(),
    opencodeAssistant({
      enabled: true, // 是否启用插件
      webPort: 5097, // OpenCode Web 服务端口
      proxyPort: 6097, // 代理服务端口
      hostname: "127.0.0.1", // 服务绑定地址
      position: "bottom-right", // 悬浮按钮位置
      theme: "auto", // 主题: light | dark | auto
      open: false, // 是否自动展开面板
      autoReload: true, // 是否启用自动重载提示
      verbose: false, // 是否输出详细日志
      hotkey: "ctrl+k", // 切换面板的快捷键
      warmupChromeMcp: true, // 是否预热 Chrome DevTools MCP

      // OpenCode 界面语言（可选）
      language: "zh",

      // OpenCode 内部设置（可选）
      settings: {
        general: {
          showReasoningSummaries: true,
          followup: "suggest",
        },
        appearance: {
          fontSize: 14,
        },
      },
    }),
  ],
});
```

启动开发服务器：

```bash
npm run dev
```

## 配置项

| 配置项            | 类型      | 默认值           | 说明                                                                       |
| ----------------- | --------- | ---------------- | -------------------------------------------------------------------------- |
| `enabled`         | `boolean` | `true`           | 是否启用插件                                                               |
| `webPort`         | `number`  | `5097`           | OpenCode Web 服务端口，被占用时自动向后寻找可用端口                        |
| `proxyPort`       | `number`  | `6097`           | 代理服务端口，用于解决 iframe 跨域限制                                     |
| `hostname`        | `string`  | `"127.0.0.1"`    | 服务绑定地址                                                               |
| `position`        | `string`  | `"bottom-right"` | 悬浮按钮位置：`bottom-right` \| `bottom-left` \| `top-right` \| `top-left` |
| `theme`           | `string`  | `"auto"`         | 挂件主题：`light` \| `dark` \| `auto`（跟随系统）                          |
| `open`            | `boolean` | `false`          | 页面加载后是否自动展开面板                                                 |
| `autoReload`      | `boolean` | `true`           | 是否显示自动重载提示                                                       |
| `verbose`         | `boolean` | `false`          | 是否输出详细调试日志                                                       |
| `hotkey`          | `string`  | `"ctrl+k"`       | 切换面板的快捷键，macOS 支持 `cmd+k`                                       |
| `warmupChromeMcp` | `boolean` | `true`           | 启动后是否预热 Chrome DevTools MCP                                         |
| `language`        | `string`  | -                | OpenCode 界面语言，如 `zh`、`en`、`ja` 等                                  |
| `settings`        | `object`  | -                | OpenCode 内部设置，详见下方说明                                            |

### OpenCode 设置

`settings` 配置项用于自定义 OpenCode Web 的内部行为：

```ts
{
  general: {
    autoSave?: boolean;              // 自动保存
    releaseNotes?: boolean;          // 显示更新说明
    followup?: "steer" | "suggest" | "none";  // 后续动作模式
    showReasoningSummaries?: boolean; // 显示推理摘要
    shellToolPartsExpanded?: boolean; // 默认展开 shell 工具
    editToolPartsExpanded?: boolean;  // 默认展开编辑工具
  },
  appearance: {
    fontSize?: number;   // 界面字体大小
    mono?: string;       // 代码字体
    sans?: string;       // 界面字体
  },
  permissions: {
    autoApprove?: boolean;  // 自动批准权限请求
  },
  notifications: {
    agent?: boolean;      // 智能体完成时通知
    permissions?: boolean; // 权限请求时通知
    errors?: boolean;     // 错误时通知
  },
  sounds: {
    agentEnabled?: boolean;       // 启用智能体音效
    agent?: string;               // 智能体音效
    permissionsEnabled?: boolean; // 启用权限音效
    permissions?: string;         // 权限音效
    errorsEnabled?: boolean;      // 启用错误音效
    errors?: string;              // 错误音效
  },
}
```

## 使用指南

### 打开对话面板

- 点击页面右下角悬浮按钮
- 或使用快捷键 `Ctrl/Cmd + K`

### 会话管理

面板左侧显示当前项目的会话列表，支持：

- 查看已有会话
- 新建会话
- 切换会话
- 删除会话

### 页面上下文同步

挂件自动同步以下信息：

- 当前页面 URL
- 当前页面标题
- 选中的页面元素

监听的事件包括：

- `history.pushState` / `history.replaceState`
- `popstate` / `hashchange`
- `document.title` 变化

### 元素选择模式

通过快捷键（默认 `Ctrl/Cmd + P`）进入选择模式：

1. 按下快捷键，鼠标变为选择状态
2. 点击页面上的元素
3. 元素信息（文件路径、行号、文本内容）自动传给 AI

**注意**：元素选择依赖 Vue Inspector，如果页面中没有可用的 Inspector，会提示无法使用该功能。

## 内部接口

插件在 Vite 开发服务器上注册以下内部接口：

| 路径                      | 说明                                       |
| ------------------------- | ------------------------------------------ |
| `/__opencode_widget__.js` | 浏览器端挂件脚本                           |
| `/__opencode_start__`     | 服务启动状态与会话地址                     |
| `/__opencode_context__`   | 页面上下文读写                             |
| `/__opencode_sessions__`  | 会话查询、创建、删除                       |
| `/__opencode_events__`    | SSE 事件流（会话就绪、节点清空等）         |
| `/__opencode_logs__`      | 日志查询（OpenCode 进程输出、Vite 日志等） |

## 常见问题

### OpenCode not installed

确认命令行可以正常执行：

```bash
opencode --version
```

### 端口冲突

如果默认端口被占用，插件会自动向后寻找可用端口。也可以手动指定：

```ts
opencodeAssistant({
  webPort: 5001,
  proxyPort: 5002,
});
```

### 元素选择不可用

需要页面中有 Vue Inspector 钩子。插件已内置 `unplugin-vue-inspector`，无需额外配置。

### 生产构建不包含挂件

这是预期行为。插件仅在开发模式（`vite serve`）下工作，不会影响生产构建。

## License

MIT

## 相关链接

- [OpenCode](https://opencode.ai)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Vite Plugin API](https://vite.dev/guide/api-plugin.html)
