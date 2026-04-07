# vite-plugin-opencode-assistant

一个面向 Vite 开发环境的插件：在页面内注入 OpenCode 对话挂件，自动启动 OpenCode Web，并把当前页面 URL、标题以及选中的页面节点同步给 AI，便于一边聊天一边改代码、立即通过 HMR 看到结果。

## 它能做什么

- 在 `vite serve` 时自动注入一个悬浮 AI 按钮和对话面板
- 自动启动本地 OpenCode Web 服务，并为当前项目复用或创建会话
- 把当前页面 URL、标题同步到 OpenCode 会话上下文
- 支持把页面上选中的节点信息同步给 AI，帮助它直接定位组件文件与行号
- 内置会话列表，可在挂件中切换、新建、删除当前项目的 OpenCode 会话
- 支持快捷键、主题、初始展开状态、悬浮位置等配置
- 支持启动后预热 Chrome DevTools MCP，减少首次使用浏览器工具时的等待

## 工作方式

启动 Vite 开发服务器后，插件会做这几件事：

1. 在 HTML 中注入浏览器端挂件脚本
2. 检查本机是否已安装 `opencode`
3. 启动 OpenCode Web 服务，默认使用 `127.0.0.1:4097`
4. 在当前项目目录下查找已有会话；如果没有，则创建新会话
5. 把页面上下文通过本地接口同步给 OpenCode
6. 页面代码被 OpenCode 修改后，由 Vite HMR 立即刷新效果

当前实现只在开发模式生效：

- 仅在 `vite serve` 时启用
- `build` 阶段不会注入挂件
- `enabled` 默认值是 `false`，需要显式开启

## 安装

```bash
npm install -D vite-plugin-opencode-assistant
```

## 前置条件

本插件依赖本机已安装 [OpenCode](https://opencode.ai) CLI。

推荐安装方式：

```bash
curl -fsSL https://opencode.ai/install | bash
```

也可以使用包管理器：

```bash
npm i -g opencode-ai@latest
brew install anomalyco/tap/opencode
```

如果你保留默认的 `warmupChromeMcp: true`，首次启动时还会通过 `npx` 拉起 `chrome-devtools-mcp` 来预热浏览器工具链。

## 快速开始

由于当前实现默认 `enabled: false`，最小可用配置如下：

```ts
import { defineConfig } from "vite";
import opencodeAssistant from "vite-plugin-opencode-assistant";

export default defineConfig({
  plugins: [
    opencodeAssistant({
      enabled: true,
    }),
  ],
});
```

启动开发服务器：

```bash
npm run dev
```

启动后页面右下角会出现悬浮按钮，点击即可打开 OpenCode 面板。

## 推荐配置示例

```ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import opencodeAssistant from "vite-plugin-opencode-assistant";

export default defineConfig({
  plugins: [
    vue(),
    opencodeAssistant({
      enabled: true,
      webPort: 4097,
      hostname: "127.0.0.1",
      position: "bottom-right",
      theme: "auto",
      open: false,
      autoReload: true,
      verbose: false,
      hotkey: "ctrl+k",
      warmupChromeMcp: true,
    }),
  ],
});
```

## 配置项

```ts
interface OpenCodeOptions {
  enabled?: boolean;
  webPort?: number;
  hostname?: string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  theme?: "light" | "dark" | "auto";
  open?: boolean;
  autoReload?: boolean;
  verbose?: boolean;
  hotkey?: string;
  warmupChromeMcp?: boolean;
}
```

配置说明：

| 配置项            | 默认值           | 说明                                                                |
| ----------------- | ---------------- | ------------------------------------------------------------------- |
| `enabled`         | `false`          | 是否启用插件。当前版本必须手动设为 `true` 才会生效                  |
| `webPort`         | `4097`           | OpenCode Web 端口。如果端口被占用，会从当前端口开始向后寻找可用端口 |
| `hostname`        | `127.0.0.1`      | OpenCode Web 绑定地址                                               |
| `position`        | `"bottom-right"` | 悬浮挂件位置                                                        |
| `theme`           | `"auto"`         | 挂件主题，`auto` 会跟随系统明暗色                                   |
| `open`            | `false`          | 页面初始化后是否自动展开挂件                                        |
| `autoReload`      | `true`           | 控制挂件侧的自动重载提示行为                                        |
| `verbose`         | `false`          | 是否输出更详细的插件日志                                            |
| `hotkey`          | `"ctrl+k"`       | 切换挂件的快捷键，macOS 下同样支持 `cmd+k`                          |
| `warmupChromeMcp` | `true`           | 启动后是否预热 Chrome DevTools MCP                                  |

## 使用说明

### 1. 打开对话挂件

- 点击页面右下角悬浮按钮
- 或使用默认快捷键 `Ctrl/Cmd + K`

### 2. 切换会话

挂件左侧带有当前项目的会话列表，支持：

- 查看当前项目下已有会话
- 新建会话
- 切换会话
- 删除会话

### 3. 同步页面上下文

挂件会自动同步以下信息：

- 当前页面 URL
- 当前页面标题
- 当前选中的页面节点

它会监听：

- `history.pushState`
- `history.replaceState`
- `popstate`
- `hashchange`
- `document.title` 变化

这意味着在 SPA 场景下切页后，上下文也会自动更新。

### 4. 选择页面节点

当前实现支持把页面节点作为上下文传给 AI，节点信息包括：

- 源文件路径
- 行号和列号
- 节点文本
- 节点描述

默认通过 `Ctrl/Cmd + P` 进入选择模式。

需要注意：

- 这项能力依赖页面中可用的 Vue Inspector 钩子
- 如果页面中没有可用的 Inspector，挂件会提示“Vue Inspector 未加载，无法使用元素选择功能”
- 选中的节点会暂存在 `sessionStorage` 中

## 浏览器端全局 API

挂件会暴露一个全局对象：

```js
window.OpenCodeWidget.open();
window.OpenCodeWidget.close();
window.OpenCodeWidget.toggle();
window.OpenCodeWidget.showNotification("Code updated!");
window.OpenCodeWidget.updateContext();
```

适用场景：

- 从你自己的调试面板中主动打开挂件
- 在页面状态发生重要变化后手动触发一次上下文同步
- 在自定义流程中复用现有的通知能力

## 本地接口

插件会在 Vite 开发服务器上挂出几个内部接口，供挂件与 OpenCode 协作使用：

| 路径                      | 说明                                       |
| ------------------------- | ------------------------------------------ |
| `/__opencode_widget__.js` | 浏览器端挂件脚本                           |
| `/__opencode_start__`     | 返回当前服务启动状态与会话地址             |
| `/__opencode_context__`   | 读写页面上下文、清空已选节点               |
| `/__opencode_sessions__`  | 查询、创建、删除 OpenCode 会话             |
| `/__opencode_events__`    | SSE 事件流，用于同步会话就绪和节点清空事件 |

这些接口是插件内部实现细节，通常不需要业务代码直接调用。

## 常见问题

### OpenCode not installed

如果控制台提示未安装 OpenCode，先确认命令行里可以正常执行：

```bash
opencode --version
```

若无法执行，请先完成 OpenCode CLI 安装。

### 端口冲突

当前实现只开放了 `webPort` 配置项，没有单独暴露 server 端口配置。

如果默认端口被占用，可以改成：

```ts
opencodeAssistant({
  enabled: true,
  webPort: 5001,
});
```

如果你不改配置，插件也会从 `webPort` 开始继续向后寻找可用端口。

### 页面里没有节点选择能力

这通常意味着当前页面里没有可用的 Vue Inspector 钩子。挂件仍然可以正常聊天和同步 URL/标题，只是无法通过页面点选节点来辅助定位代码。

### 构建产物里为什么没有挂件

这是当前实现的预期行为。插件只在开发服务器模式下工作，不会影响生产构建结果。

## 示例项目

仓库自带了一个 `example` 工作区用于本地联调。

由于示例直接引用 `../dist/vite/index`，请先在仓库根目录构建插件：

```bash
npm install
npm run build
cd example
npm install
npm run dev
```

## 开发

```bash
npm run build
npm test
```

## License

MIT

## 相关链接

- [OpenCode](https://opencode.ai)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Vite Plugin API](https://vite.dev/guide/api-plugin.html)
