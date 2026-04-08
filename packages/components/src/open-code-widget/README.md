# OpenCode Widget

`OpenCodeWidget` 是一个可悬浮在页面右下角的助手组件，主要用于在浏览器中呈现 OpenCode 聊天界面和选中代码节点的信息。

## 代码演示

::::demo

### 基础用法

这是挂件的基础用法说明，支持打开/关闭、暗黑模式切换以及页面节点选择。

:::demo-preview

basic

:::

::::

## API 参考

### Props

| 属性名 | 说明 | 类型 | 默认值 |
| --- | --- | --- | --- |
| `position` | 挂件显示的位置 | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `'bottom-right'` |
| `open` | 挂件是否打开 | `boolean` | `false` |
| `theme` | 主题模式 | `'light' \| 'dark' \| 'auto'` | `'light'` |
| `title` | 助手头部显示的标题 | `string` | `'AI 助手'` |
| `iframeSrc` | Web UI 的 URL 来源 | `string` | `''` |
| `selectMode` | 是否进入选择页面元素模式 | `boolean` | `false` |
| `loading` | 是否显示加载状态 | `boolean` | `false` |
| `sessions` | 会话列表数据 | `OpenCodeWidgetSessionItem[]` | `[]` |
| `currentSessionId` | 当前选中的会话 ID | `string \| null` | `null` |
| `selectedElements` | 已选中的元素列表 | `OpenCodeSelectedElement[]` | `[]` |

### Events

| 事件名 | 说明 | 回调参数 |
| --- | --- | --- |
| `update:open` | 当挂件打开或关闭时触发 | `(open: boolean)` |
| `toggle` | 点击触发挂件开关 | `(open: boolean)` |
| `close` | 点击关闭按钮时触发 | - |
| `toggle-select-mode` | 点击选择模式切换按钮时触发 | `(mode: boolean)` |
| `click-selected-node` | 点击已选中的气泡或节点卡片时触发 | `(element: OpenCodeSelectedElement)` |
| `remove-selected-node` | 删除已选中的元素时触发 | `(payload: OpenCodeRemoveSelectedPayload)` |
| `clear-selected-nodes` | 清空所有选中元素时触发 | - |
| `create-session` | 点击创建新会话时触发 | - |
| `select-session` | 选中某个历史会话时触发 | `(session: OpenCodeWidgetSessionItem)` |
| `delete-session` | 删除某个历史会话时触发 | `(session: OpenCodeWidgetSessionItem)` |

