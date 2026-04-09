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
  padding: 14px 20px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  box-shadow:
    0 6px 20px rgba(239, 68, 68, 0.5),
    0 0 0 3px rgba(239, 68, 68, 0.3);
  z-index: 9999999;
  display: none;
  align-items: center;
  gap: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.opencode-select-mode-hint.visible {
  display: flex;
  animation:
    slideDown 0.3s ease,
    pulseHint 2s ease-in-out infinite;
}

.opencode-hint-shortcut {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

@keyframes pulseHint {
  0%,
  100% {
    box-shadow:
      0 6px 20px rgba(239, 68, 68, 0.5),
      0 0 0 3px rgba(239, 68, 68, 0.3);
  }
  50% {
    box-shadow:
      0 6px 20px rgba(239, 68, 68, 0.6),
      0 0 0 6px rgba(239, 68, 68, 0.4);
  }
}
</style>
