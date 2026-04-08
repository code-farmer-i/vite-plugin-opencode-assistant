<script setup lang="ts">
import { useOpenCodeWidgetContext } from "../context";

const { selectMode: visible, selectShortcutLabel: shortcutLabel } = useOpenCodeWidgetContext();
</script>

<template>
  <div class="opencode-select-mode-hint" :class="{ visible }">
    <span>🎯 选择模式已开启 - 点击元素进行选择</span>
    <span class="opencode-hint-shortcut">{{ shortcutLabel }}</span>
  </div>
</template>

<style>
.opencode-select-mode-hint {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 16px;
  background: var(--oc-danger);
  color: white;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: var(--oc-shadow-danger);
  z-index: 9999999;
  display: none;
  align-items: center;
  gap: 12px;
}

.opencode-select-mode-hint.visible {
  display: flex;
  animation: slideDown 0.3s ease;
}

.opencode-hint-shortcut {
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 12px;
}
</style>
