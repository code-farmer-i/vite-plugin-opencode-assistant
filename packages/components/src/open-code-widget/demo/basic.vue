<script setup lang="ts">
import { ref, onMounted } from "vue";

import type { OpenCodeSelectedElement } from "../src/types";

const open = ref(false);
const loading = ref(true);
const selectMode = ref(false);
const theme = ref<"light" | "dark">("light");
const currentSessionId = ref<string | null>(null);
const sessions = ref<{ id: string; title: string; updatedAt: number }[]>([]);
const selectedElements = ref<OpenCodeSelectedElement[]>([]);

onMounted(() => {
  // 模拟异步加载数据
  setTimeout(() => {
    sessions.value = [
      { id: "1", title: "如何使用 Vue 3 的 Composition API？", updatedAt: Date.now() },
      { id: "2", title: "解释一下这段代码的含义", updatedAt: Date.now() - 86400000 },
    ];
    currentSessionId.value = "1";

    selectedElements.value = [
      {
        description: "span.text",
        filePath: "/Users/test/basic.vue",
        line: 4,
        column: 14,
        innerText: "ref(false)",
      },
    ];

    loading.value = false;
  }, 1500);
});

const handleUpdateOpen = (val: boolean) => {
  open.value = val;
};

const handleToggleSelectMode = (val: boolean) => {
  selectMode.value = val;
};

const handleSelectSession = (session: { id: string }) => {
  loading.value = true;
  // 模拟异步加载会话内容
  setTimeout(() => {
    currentSessionId.value = session.id;
    loading.value = false;
  }, 500);
};

const handleDeleteSession = (session: { id: string }) => {
  loading.value = true;
  // 模拟异步删除会话
  setTimeout(() => {
    sessions.value = sessions.value.filter((s) => s.id !== session.id);
    if (currentSessionId.value === session.id && sessions.value.length > 0) {
      currentSessionId.value = sessions.value[0].id;
    }
    loading.value = false;
  }, 500);
};

const handleCreateSession = () => {
  loading.value = true;
  // 模拟异步创建会话
  setTimeout(() => {
    const id = Date.now().toString();
    sessions.value.unshift({
      id,
      title: "新会话",
      updatedAt: Date.now(),
    });
    currentSessionId.value = id;
    loading.value = false;
  }, 500);
};

const handleClickSelectedNode = (element: OpenCodeSelectedElement) => {
  // If element is not already in the list, add it
  const exists = selectedElements.value.find(
    (e) =>
      e.filePath === element.filePath && e.line === element.line && e.column === element.column,
  );
  if (!exists) {
    selectedElements.value.push(element);
  }
};

const handleRemoveSelectedNode = (payload: {
  element: OpenCodeSelectedElement;
  index: number;
  source: "bubble" | "panel";
}) => {
  selectedElements.value = selectedElements.value.filter(
    (e) =>
      !(
        e.filePath === payload.element.filePath &&
        e.line === payload.element.line &&
        e.column === payload.element.column
      ),
  );
};

const handleClearSelectedNodes = () => {
  selectedElements.value = [];
};
</script>

<template>
  <div class="demo-container" :class="[theme === 'dark' ? 'demo-dark' : '']">
    <div class="controls">
      <button @click="open = !open">切换挂件 (当前: {{ open ? "打开" : "关闭" }})</button>
      <button @click="selectMode = !selectMode">
        切换选择模式 (当前: {{ selectMode ? "开启" : "关闭" }})
      </button>
      <button @click="theme = theme === 'light' ? 'dark' : 'light'">
        切换主题 (当前: {{ theme === "light" ? "亮色" : "暗色" }})
      </button>
      <button @click="loading = !loading">
        切换加载状态 (当前: {{ loading ? "加载中" : "空闲" }})
      </button>
    </div>

    <opencode-widget
      :open="open"
      :loading="loading"
      :theme="theme"
      :select-mode="selectMode"
      :sessions="sessions"
      :current-session-id="currentSessionId"
      :selected-elements="selectedElements"
      :show-empty-state="sessions.length === 0"
      title="Trae AI"
      iframe-src="about:blank"
      @update:open="handleUpdateOpen"
      @toggle-select-mode="handleToggleSelectMode"
      @select-session="handleSelectSession"
      @delete-session="handleDeleteSession"
      @create-session="handleCreateSession"
      @click-selected-node="handleClickSelectedNode"
      @remove-selected-node="handleRemoveSelectedNode"
      @clear-selected-nodes="handleClearSelectedNodes"
      @empty-action="handleCreateSession"
    />
  </div>
</template>

<style scoped>
.demo-container {
  height: 600px;
  position: relative;
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s;
}

.demo-dark {
  background: #141414;
  border-color: #333;
}

.demo-dark button {
  background: #2a2a2a;
  border-color: #444;
  color: #e0e0e0;
}

.demo-dark button:hover {
  background: #333;
  border-color: #1890ff;
  color: #1890ff;
}

.controls {
  padding: 16px;
  display: flex;
  gap: 12px;
}

button {
  padding: 8px 16px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.2s;
}

button:hover {
  background: #f0f0f0;
  border-color: #1890ff;
  color: #1890ff;
}
</style>
