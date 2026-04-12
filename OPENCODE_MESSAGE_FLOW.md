# OpenCode 消息处理流程

本文档详细描述 OpenCode 从用户输入到 AI 响应再到消息显示的完整处理流程。

## 流程概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              【前端 - 输入阶段】                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. 用户在输入框输入内容                                                       │
│     ↓                                                                        │
│  2. parseFromDOM() 解析 DOM                                                  │
│     - data-type="file" → FileAttachmentPart { path, content, start, end }   │
│     - data-type="agent" → AgentPart { name, content, start, end }           │
│     - 文本节点 → TextPart { content }                                         │
│     ↓                                                                        │
│  3. 存储到 prompt signal (响应式状态)                                          │
│     ↓                                                                        │
│  4. 用户点击发送                                                               │
│     ↓                                                                        │
│  5. buildRequestParts() 构建请求                                              │
│     - TextPart → { type: "text", text: "用户输入" }                          │
│     - FilePart → { type: "file", url: "file:///path?start=1&end=10" }       │
│     - AgentPart → { type: "agent", name: "agent_name" }                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              【后端 - 处理阶段】                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  6. 接收请求，创建 UserMessage                                                │
│     - message.info: { role: "user", id, sessionID, ... }                    │
│     - message.parts: Part[] (text, file, agent...)                          │
│     ↓                                                                        │
│  7. 存储到数据库 (SQLite)                                                     │
│     ↓                                                                        │
│  8. 触发插件钩子 experimental.chat.messages.transform                        │
│     ↓                                                                        │
│     plugin.trigger("experimental.chat.messages.transform", {}, {            │
│       messages: [{ info: Message, parts: Part[] }]                          │
│     })                                                                       │
│     ↓                                                                        │
│  9. 插件可以修改 message.parts 中的内容                                        │
│     - 修改 textPart.text                                                     │
│     - 添加/删除 parts                                                         │
│     ↓                                                                        │
│  10. toModelMessagesEffect() 转换为 AI 模型格式                               │
│      - TextPart → { role: "user", content: "文本内容" }                      │
│      - FilePart → 读取文件内容，拼接成上下文                                   │
│      ↓                                                                       │
│  11. 发送给 AI (LLM.stream)                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              【前端 - 渲染阶段】                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  12. 接收 AI 响应，存储 AssistantMessage                                      │
│      ↓                                                                       │
│  13. 前端从数据库/同步获取消息列表                                             │
│      ↓                                                                       │
│  14. UserMessageDisplay 渲染用户消息                                          │
│      - textPart: 找到第一个非 synthetic 的 text part                         │
│      - files: 过滤 type === "file" 的 parts                                  │
│      - agents: 过滤 type === "agent" 的 parts                                │
│      ↓                                                                       │
│  15. HighlightedText 高亮显示                                                 │
│      - FilePart: 根据 source.text.start/end 高亮 @filepath                  │
│      - AgentPart: 根据 source.start/end 高亮 @agent_name                    │
│      - 其他: 普通文本                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 关键数据结构

### 前端 Prompt (输入框内容)

```typescript
type Prompt = ContentPart[]

type ContentPart = 
  | { type: "text", content: string, start: number, end: number }
  | { type: "file", path: string, content: string, start: number, end: number }
  | { type: "agent", name: string, content: string, start: number, end: number }
```

### 后端 Message (存储格式)

```typescript
type Message = {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: {
    created: number
    completed?: number
  }
  // ...其他字段
}

type Part = 
  | TextPart
  | FilePart
  | AgentPart
  | ToolPart
  | ReasoningPart
  // ...

type TextPart = {
  id: string
  type: "text"
  text: string
  synthetic?: boolean  // 如果为 true，表示系统生成的文本，不显示给用户
  metadata?: Record<string, unknown>
}

type FilePart = {
  id: string
  type: "file"
  url: string  // file:///path/to/file?start=1&end=10
  filename: string
  source: {
    type: "file"
    text: {
      value: string   // 显示的文本，如 "@src/App.vue"
      start: number   // 在原始文本中的起始位置
      end: number     // 在原始文本中的结束位置
    }
    path: string
  }
}

type AgentPart = {
  id: string
  type: "agent"
  name: string
  source: {
    value: string   // 显示的文本，如 "@agent_name"
    start: number
    end: number
  }
}
```

## 核心文件

### 前端

| 文件 | 功能 |
|-----|------|
| `packages/app/src/components/prompt-input.tsx` | 输入框组件，包含 `parseFromDOM()` |
| `packages/app/src/components/prompt-input/build-request-parts.ts` | 构建请求 parts |
| `packages/app/src/context/prompt.tsx` | Prompt 状态管理 |
| `packages/ui/src/components/message-part.tsx` | 消息渲染组件 |
| `packages/ui/src/components/session-turn.tsx` | 会话轮次组件 |

### 后端

| 文件 | 功能 |
|-----|------|
| `packages/opencode/src/session/prompt.ts` | 消息处理主逻辑，触发插件钩子 |
| `packages/opencode/src/session/message-v2.ts` | Message 数据结构和转换 |
| `packages/plugin/src/index.ts` | 插件钩子类型定义 |

## 插件钩子

### experimental.chat.messages.transform

在消息发送给 AI 之前触发，允许插件修改消息内容。

```typescript
"experimental.chat.messages.transform"?: (
  input: {},
  output: {
    messages: {
      info: Message
      parts: Part[]
    }[]
  }
) => Promise<void>
```

**使用示例：**

```typescript
export const MyPlugin: Plugin = async () => {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      for (const msg of output.messages) {
        if (msg.info.role !== "user") continue;
        
        const textPart = msg.parts.find(p => p.type === "text");
        if (!textPart || !("text" in textPart)) continue;
        
        // 修改文本内容
        textPart.text = "前缀内容\n\n" + textPart.text;
      }
    }
  }
}
```

### experimental.chat.system.transform

在构建系统提示时触发，允许插件添加自定义系统提示。

```typescript
"experimental.chat.system.transform"?: (
  input: { sessionID?: string; model: Model },
  output: {
    system: string[]
  }
) => Promise<void>
```

**使用示例：**

```typescript
export const MyPlugin: Plugin = async () => {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      output.system.push("你是一个专业的开发助手...");
    }
  }
}
```

## 消息渲染逻辑

### UserMessageDisplay

```typescript
function UserMessageDisplay(props: { message: UserMessage; parts: Part[] }) {
  // 找到用户输入的文本（排除 synthetic 的）
  const textPart = props.parts?.find(p => 
    p.type === "text" && !(p as TextPart).synthetic
  );
  
  // 找到文件附件
  const files = props.parts?.filter(p => p.type === "file") as FilePart[];
  
  // 找到 agent 引用
  const agents = props.parts?.filter(p => p.type === "agent") as AgentPart[];
  
  // 渲染
  return (
    <div data-component="user-message">
      {/* 文件附件预览 */}
      {attachments().length > 0 && (
        <div data-slot="user-message-attachments">
          <For each={attachments()}>
            {(file) => <FileAttachment file={file} />}
          </For>
        </div>
      )}
      
      {/* 文本内容（带高亮） */}
      <div data-slot="user-message-text">
        <HighlightedText 
          text={textPart?.text || ""} 
          references={files}
          agents={agents}
        />
      </div>
    </div>
  );
}
```

### HighlightedText

```typescript
function HighlightedText(props: { 
  text: string; 
  references: FilePart[]; 
  agents: AgentPart[] 
}) {
  // 根据 source.text.start/end 找到需要高亮的位置
  const segments = createMemo(() => {
    const allRefs = [
      ...props.references
        .filter(r => r.source?.text?.start !== undefined)
        .map(r => ({ 
          start: r.source.text.start, 
          end: r.source.text.end, 
          type: "file" as const 
        })),
      ...props.agents
        .filter(a => a.source?.start !== undefined)
        .map(a => ({ 
          start: a.source.start, 
          end: a.source.end, 
          type: "agent" as const 
        })),
    ].sort((a, b) => a.start - b.start);
    
    // 分割文本，标记高亮区域
    const result = [];
    let lastIndex = 0;
    
    for (const ref of allRefs) {
      if (ref.start > lastIndex) {
        result.push({ text: props.text.slice(lastIndex, ref.start) });
      }
      result.push({ text: props.text.slice(ref.start, ref.end), type: ref.type });
      lastIndex = ref.end;
    }
    
    if (lastIndex < props.text.length) {
      result.push({ text: props.text.slice(lastIndex) });
    }
    
    return result;
  });
  
  // 渲染，data-highlight 属性用于 CSS 样式
  return (
    <For each={segments()}>
      {(segment) => (
        <span data-highlight={segment.type}>
          {segment.text}
        </span>
      )}
    </For>
  );
}
```

## 标签处理流程

### 输入框标签格式

```html
<!-- 文件标签 -->
<span 
  data-type="file" 
  data-path="/src/App.vue"
  contenteditable="false"
>
  @/src/App.vue
</span>

<!-- Agent 标签 -->
<span 
  data-type="agent" 
  data-name="my-agent"
  contenteditable="false"
>
  @my-agent
</span>
```

### 解析流程

```typescript
// prompt-input.tsx
const parseFromDOM = () => {
  const parts: ContentPart[] = [];
  let position = 0;
  
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      // 文本节点
      const content = node.textContent ?? "";
      parts.push({ type: "text", content, start: position, end: position + content.length });
      position += content.length;
      return;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    
    const el = node as HTMLElement;
    
    if (el.dataset.type === "file") {
      // 文件标签
      const content = el.textContent ?? "";
      parts.push({
        type: "file",
        path: el.dataset.path!,
        content,
        start: position,
        end: position + content.length,
      });
      position += content.length;
      return;
    }
    
    if (el.dataset.type === "agent") {
      // Agent 标签
      const content = el.textContent ?? "";
      parts.push({
        type: "agent",
        name: el.dataset.name!,
        content,
        start: position,
        end: position + content.length,
      });
      position += content.length;
      return;
    }
    
    // 递归处理子节点
    for (const child of Array.from(el.childNodes)) {
      visit(child);
    }
  };
  
  // 遍历输入框的所有子节点
  for (const child of Array.from(editorRef.childNodes)) {
    visit(child);
  }
  
  return parts;
};
```

## 自定义标签实现方案

### 方案：在插件钩子中解析

1. **输入框插入自定义格式标签**

```typescript
// 格式: @element|file:line:column|selector
const tag = `@element|src/App.vue:15:7|div.className`;
```

2. **在插件钩子中解析并转换**

```typescript
"experimental.chat.messages.transform": async (_input, output) => {
  for (const msg of output.messages) {
    if (msg.info.role !== "user") continue;
    
    const textPart = msg.parts.find(p => p.type === "text");
    if (!textPart || !("text" in textPart)) continue;
    
    // 解析自定义标签
    const pattern = /@element\|([^:|]+):(\d+):(\d+)\|([^|\s]+)/g;
    const matches = [...textPart.text.matchAll(pattern)];
    
    if (matches.length > 0) {
      const contextParts: string[] = ["【用户选中的元素】\n"];
      
      for (const match of matches) {
        const [fullMatch, file, line, column, selector] = match;
        
        // 替换显示文本
        textPart.text = textPart.text.replace(fullMatch, `@${selector}`);
        
        // 添加上下文信息
        contextParts.push(`### 元素: \`${selector}\``);
        contextParts.push(`- **文件**: \`${file}\``);
        contextParts.push(`- **位置**: 第 ${line} 行，第 ${column} 列`);
        contextParts.push("");
      }
      
      // 在消息前面添加上下文
      textPart.text = contextParts.join("\n") + "\n---\n\n" + textPart.text;
    }
  }
}
```

### 效果

| 用户看到 | AI 收到 |
|---------|--------|
| `@div.className 帮我修改样式` | `【用户选中的元素】\n### 元素: div.className\n- 文件: src/App.vue\n- 位置: 第 15 行，第 7 列\n\n---\n\n@div.className 帮我修改样式` |

## 总结

| 阶段 | 位置 | 数据格式 |
|-----|------|---------|
| 输入框 | 前端 DOM | `<span data-type="file" data-path="...">` |
| 解析后 | 前端 Prompt | `ContentPart[]` |
| 发送请求 | 前端→后端 | `PromptRequestPart[]` |
| 存储格式 | 后端数据库 | `Message + Part[]` |
| 插件钩子 | 后端 | `messages: { info, parts }[]` |
| AI 请求 | 后端→AI | `{ role, content }[]` |
| 消息显示 | 前端渲染 | `HighlightedText` |
