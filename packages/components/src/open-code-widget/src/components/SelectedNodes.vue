<script setup lang="ts">
import { useOpenCodeWidgetContext } from "../context";

const {
  selectedElementItems: items,
  showClearAll,
  handleClickSelectedNode,
  handleRemoveSelectedNode,
  handleClearSelectedNodes,
} = useOpenCodeWidgetContext();
</script>

<template>
  <div
    class="opencode-right-toolbar"
    :class="{ collapsed: items.length === 0 }"
  >
    <div class="opencode-selected-nodes-header">
      <div class="opencode-selected-nodes-title">已选节点</div>
      <div class="opencode-selected-nodes-desc">
        选中的节点会在对话时一起发送给助手
      </div>
    </div>

    <div
      class="opencode-selected-nodes"
      role="list"
      aria-label="已选元素列表"
    >
      <div
        v-for="(item, index) in items"
        :key="item.key"
        class="opencode-selected-node"
        role="listitem"
        @click="handleClickSelectedNode(item)"
      >
        <div class="opencode-node-content">
          <span class="opencode-node-text">{{ item.description }}</span>
          <span class="opencode-node-file">{{ item.panelFileText }}</span>
        </div>
        <button
          class="opencode-node-remove"
          type="button"
          :aria-label="`移除元素: ${item.description}`"
          @click.stop="handleRemoveSelectedNode({ item, index, source: 'panel' })"
        >
          ×
        </button>
      </div>
    </div>

    <button
      v-if="showClearAll && items.length > 0"
      class="opencode-clear-all-btn"
      type="button"
      aria-label="清空所有已选节点"
      @click="handleClearSelectedNodes"
    >
      一键清空
    </button>
  </div>
</template>

<style>
.opencode-right-toolbar {
  width: 140px;
  background: var(--oc-bg-secondary);
  border-left: 1px solid var(--oc-border-primary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
  overflow: hidden;
}

.opencode-right-toolbar.collapsed {
  width: 0;
  overflow: hidden;
}

.opencode-right-toolbar.collapsed .opencode-selected-nodes-header,
.opencode-right-toolbar.collapsed .opencode-selected-nodes,
.opencode-right-toolbar.collapsed .opencode-clear-all-btn {
  display: none;
}

.opencode-selected-nodes-header {
  padding: 12px 8px 8px;
  border-bottom: 1px solid var(--oc-border-primary);
}

.opencode-selected-nodes-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--oc-text-primary);
  margin-bottom: 4px;
}

.opencode-selected-nodes-desc {
  font-size: 11px;
  color: var(--oc-text-placeholder);
  line-height: 1.4;
}

.opencode-selected-nodes {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 6px;
  overflow-y: auto;
  overflow-x: hidden;
}

.opencode-selected-nodes:empty::before {
  content: '暂无选中元素';
  color: var(--oc-text-placeholder);
  font-size: 12px;
  text-align: center;
  padding: 20px 10px;
}

.opencode-selected-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--oc-bg-main);
  border: 1px solid var(--oc-border-primary);
  border-radius: 6px;
  font-size: 12px;
  transition: all 0.2s;
}

.opencode-selected-node:hover {
  border-color: var(--oc-primary);
  box-shadow: var(--oc-shadow-primary);
}

.opencode-node-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.opencode-node-text {
  color: var(--oc-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opencode-node-file {
  color: var(--oc-text-placeholder);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opencode-node-remove {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--oc-text-placeholder);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.opencode-node-remove:hover {
  background: var(--oc-danger);
  color: white;
}

.opencode-clear-all-btn {
  width: calc(100% - 16px);
  margin: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  border: none;
  background: var(--oc-danger);
  color: white;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.2s;
}

.opencode-clear-all-btn:hover {
  background: var(--oc-danger-hover);
  transform: scale(1.02);
}
</style>
