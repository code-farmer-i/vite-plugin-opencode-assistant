<script setup lang="ts">
import { useOpenCodeWidgetContext } from "../context";

const {
  bubbleVisible: visible,
  selectedElementItems: items,
  handleRemoveSelectedNode,
} = useOpenCodeWidgetContext();
</script>

<template>
  <div
    class="opencode-selected-bubbles"
    :class="{ visible }"
    role="list"
    aria-label="已选元素列表"
  >
    <div
      v-if="items.length === 0"
      class="opencode-bubble-empty"
    >暂无选中元素</div>

    <div
      v-for="(item, index) in items"
      v-else
      :key="item.key"
      class="opencode-selected-bubble"
      role="listitem"
    >
      <span class="opencode-bubble-text">{{ item.description }}</span>
      <span
        v-if="item.bubbleFileText"
        class="opencode-bubble-file"
      >
        {{ item.bubbleFileText }}
      </span>
      <button
        class="opencode-bubble-remove"
        type="button"
        :aria-label="`移除元素: ${item.description}`"
        @click.stop="handleRemoveSelectedNode({ item, index, source: 'bubble' })"
      >
        ×
      </button>
    </div>
  </div>
</template>

<style>
.opencode-selected-bubbles {
  position: absolute;
  bottom: 44px;
  right: 0;
  display: none;
  flex-direction: column;
  gap: 6px;
  max-width: 220px;
  max-height: 300px;
  overflow-y: auto;
}

.opencode-selected-bubbles.visible {
  display: flex;
}

.opencode-selected-bubble {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: var(--oc-bg-main);
  border: 1px solid var(--oc-border-primary);
  border-radius: 8px;
  font-size: 12px;
  box-shadow: var(--oc-shadow-sm);
  position: relative;
}

.opencode-bubble-text {
  color: var(--oc-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opencode-bubble-file {
  color: var(--oc-text-placeholder);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opencode-bubble-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--oc-text-placeholder);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.2s;
}

.opencode-bubble-remove:hover {
  background: var(--oc-danger);
  color: white;
}

.opencode-bubble-empty {
  padding: 8px 12px;
  background: var(--oc-bg-main);
  border: 1px dashed var(--oc-border-secondary);
  border-radius: 8px;
  color: var(--oc-text-placeholder);
  font-size: 12px;
  text-align: center;
}
</style>
