# 常见问题

## AI 引擎

### 支持哪些 AI 引擎？

- **OpenCode CLI**：默认引擎，插件已内置适配，无需额外安装 provider 包（但仍需安装 opencode CLI，见快速开始）
- **DeepSeek Harness (dsh)**：从 v1.2.0 起支持，需额外安装 `@aipanel/provider-deepseek` 与 dsh CLI

通过插件配置的 `provider` 字段切换（默认 `"default"`，等价 `"opencode"`）：

```ts
aipanelAssistant({
  provider: "deepseek",
});
```

使用 DeepSeek 引擎还需要：

```bash
npm install -D @aipanel/provider-deepseek  # 插件的可选依赖，不随主包自动安装
npm install -g @deepseek-ai/dsh             # dsh CLI（需 ≥ 0.1.2-rc.1）
```

> 部分功能会因引擎而异。例如代码审查面板（Header 的 `</>` 按钮）仅 OpenCode 引擎支持，切换为 dsh 时该按钮自动隐藏。

### 切换引擎后提示引擎未安装？

插件**不会自动探测**已安装的引擎，引擎由 `provider` 字段决定。请确认：

- OpenCode：`opencode --version`
- DeepSeek Harness：`dsh --version`，并确认项目已安装 `@aipanel/provider-deepseek`

## 组件关系

### 浏览器扩展和 Vite 插件是什么关系？

两者配合使用，缺一不可：

- **Vite 插件** — 安装在项目里，负责启动 AIPanel Web 服务（AI 对话后端）
- **浏览器扩展** — 安装在浏览器里，提供侧边栏对话界面，连接 Vite 插件启动的服务

简单来说：Vite 插件是「发动机」，浏览器扩展是「方向盘」。

### 只装扩展不装 Vite 插件能用吗？

不能。扩展本身不含 AI 引擎，需要连接 Vite 插件启动的 AIPanel Web 服务。装完扩展后打开侧边栏，如果显示「未检测到服务」，说明对应项目的 Vite 插件未安装或开发服务器未启动。

## 安装与连接问题

### 插件安装后无法使用

按顺序检查：

1. **AI 引擎已安装**（见「切换引擎后提示引擎未安装？」）
2. **Vite 插件已配置**：检查 `vite.config.ts` 是否引入了 `vite-plugin-aipanel`
3. **开发服务器在运行**：确保 `npm run dev` 已启动
4. **页面地址**：浏览器打开的是 `localhost` 地址（插件仅对本地开发页面生效）

### 侧边栏显示「未检测到服务」

常见原因：

1. 所选 AI 引擎未安装或版本过低
2. 当前页面不是 `localhost` 地址
3. Vite 开发服务器未启动
4. 项目未安装/配置 Vite 插件

尝试重启开发服务器后再次打开侧边栏。

### 端口冲突怎么办？

AIPanel 服务（`webPort`，默认 5097）与代理（`proxyPort`，默认 6097）被占用时会**自动查找可用端口**，一般无需处理。需要固定端口时手动指定：

```ts
// vite.config.ts
aipanelAssistant({
  webPort: 5001,
  proxyPort: 5002,
});
```

## 使用细节

### 如何删除会话？

在面板的会话列表中，将鼠标悬停在目标会话上，点击条目右侧出现的 **×** 按钮并确认即可。注意会话删除是删除而非关闭，无法恢复。

### 快捷键不生效？

快捷键只在焦点位于页面（非输入框/编辑器内部需要转义场景）时触发，且需先打开过面板。检查：

1. 面板已成功连接服务（未连接时快捷键不响应）
2. 自定义快捷键写法正确，如 `"ctrl+k"` / `"cmd+k"`

### 元素选择器无法使用？

1. 确认项目是 Vue 项目（选择器依赖 `unplugin-vue-inspector`）
2. 确认 Vite 插件已正确安装并启动
3. 使用快捷键 `Ctrl/Cmd + P` 或 Header 的「选择元素」按钮进入选择模式

如果选中元素后文件路径显示为空，说明该元素可能是纯 HTML 元素而非 Vue 组件。这不一定是错误，AI 会通过 Chrome DevTools 工具自行定位。

### 审查面板（</>）按钮没有显示？

该按钮仅当所选引擎声明支持审查能力时显示。默认的 OpenCode 引擎支持；DeepSeek Harness (dsh) 引擎不显示该按钮，属正常现象。

### 提示「Chrome DevTools MCP 连接失败」/ AI 无法操作浏览器？

想让 AI 截图页面、点击元素、读取控制台与网络请求等（`chrome-devtools_*` 工具）时，需要为当前 Chrome 开启远程调试：

1. 在 Chrome 地址栏输入 `chrome://inspect/#remote-debugging` 并回车
2. 勾选 **Allow remote debugging for this browser instance** 选项
3. 重新启动浏览器
4. 回到面板点击 **重试连接**（或重启 `vite dev`）

如果只是聊天、不打算让 AI 操作浏览器，可在插件配置中关闭启动预热（`warmupChromeMcp: false`）以跳过连接检查；使用自定义调试端口时同步配置 `chromeDevtoolsPort`（默认 9222）。详见「使用指南」与「配置项」。

## 多项目

### 多个项目同时开发怎么区分？

每个不同的项目页面地址（host + 端口，如 `localhost:5173` 与 `localhost:5174`）会被识别为独立项目，切换标签页时自动切换对应项目的会话与上下文。多个 Vite 项目同时运行时无需额外配置：端口被占用时服务会自动换用可用端口，扩展按各自项目自动连接。

## 兼容性

### 支持哪些浏览器？

所有 Chromium 内核浏览器：

- Google Chrome
- Microsoft Edge
- Arc Browser
- Brave
- 其他基于 Chromium 的浏览器

Firefox 和 Safari 暂不支持。

## 隐私与数据

### 插件会把代码上传到哪里？

插件本身**只在你本机运行**：本地启动服务、与本地 AI 引擎通信。但你发出的对话内容（含页面上下文与选中的代码片段）会发送给你所选引擎配置的模型服务（例如 DeepSeek API 或你在 OpenCode 中配置的模型提供方），用于生成回复。

- 代码、上下文仅在你的开发机与所选模型服务之间传输
- 插件不收集、不上报任何使用数据或遥测
- 涉及敏感代码时，请遵循你所在团队的数据合规要求，或使用本地模型/私有部署的提供方

## 卸载

在浏览器扩展管理页面（`chrome://extensions/`）找到 AIPanel Assistant，点击「移除」；Vite 插件通过 `npm uninstall vite-plugin-aipanel` 卸载。
