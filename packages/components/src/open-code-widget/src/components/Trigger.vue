<script setup lang="ts">
import { ref, watch } from "vue";
import { useOpenCodeWidgetContext } from "../context";
import FloatingBubble from "./FloatingBubble/FloatingBubble.vue";
import type { FloatingBubbleOffset } from "./FloatingBubble/types";

const {
  buttonActive: active,
  open,
  hotkeyLabel,
  thinking,
  resolvedTheme,
  handleToggle,
  bubbleOffset,
  handleBubbleOffsetChange,
} = useOpenCodeWidgetContext();

const offset = ref<FloatingBubbleOffset | undefined>(bubbleOffset.value);

const emit = defineEmits<{
  (e: "drag-start"): void;
  (e: "drag-end"): void;
}>();

const handleOffsetChange = (value: FloatingBubbleOffset | undefined) => {
  offset.value = value;
  handleBubbleOffsetChange(value);
};

watch(bubbleOffset, (newOffset) => {
  offset.value = newOffset;
});

defineExpose({
  offset,
});
</script>

<template>
  <FloatingBubble
    ref="bubbleRef"
    v-model:offset="offset"
    axis="xy"
    magnetic="x"
    :gap="24"
    @click="handleToggle"
    @offset-change="handleOffsetChange"
    @drag-start="emit('drag-start')"
    @drag-end="emit('drag-end')"
  >
    <button
      class="opencode-button"
      :class="{ active, thinking, 'opencode-theme-dark': resolvedTheme === 'dark' }"
      type="button"
      :aria-expanded="open"
      aria-label="打开 AI 助手"
      :title="`AI 助手 (${hotkeyLabel})`"
    >
      <slot>
        <svg
          t="1775402599580"
          class="icon"
          viewBox="0 0 1024 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          p-id="5390"
          xmlns:xlink="http://www.w3.org/1999/xlink"
          width="100%"
          height="100%"
        >
          <defs>
            <linearGradient
              id="opencode-logo-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop
                offset="0%"
                style="stop-color:#667eea"
              />
              <stop
                offset="100%"
                style="stop-color:#764ba2"
              />
            </linearGradient>
          </defs>
          <path
            d="M512 981.33H85.34c-15.85 0-30.38-8.77-37.77-22.81a42.624 42.624 0 0 1 2.6-44.02L135 791.08C75.25 710.5 42.67 612.6 42.67 512 42.67 253.21 253.21 42.67 512 42.67S981.34 253.21 981.34 512 770.8 981.33 512 981.33zM166.44 896H512c211.73 0 384-172.27 384-384S723.73 128 512 128 128 300.27 128 512c0 91.29 32.83 179.9 92.46 249.46 12.58 14.69 13.73 36 2.77 51.94L166.44 896z"
            fill="url(#opencode-logo-gradient)"
            p-id="5391"
          ></path>
          <path
            d="M384 448m-64 0a64 64 0 1 0 128 0 64 64 0 1 0 -128 0Z"
            fill="url(#opencode-logo-gradient)"
            p-id="5392"
          ></path>
          <path
            d="M640 448m-64 0a64 64 0 1 0 128 0 64 64 0 1 0 -128 0Z"
            fill="url(#opencode-logo-gradient)"
            p-id="5393"
          ></path>
        </svg>
      </slot>
    </button>
  </FloatingBubble>
</template>

<style>
.opencode-button {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  position: relative;
}

.opencode-button svg {
  transform: rotate(180deg) scale(1.1);
  transition: transform 0.3s ease;
  width: 100%;
  height: 100%;
  display: block;
}

.opencode-button:hover svg {
  transform: rotate(180deg) scale(1.1);
}

.opencode-button:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
}

.opencode-button.thinking {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  animation: thinking-glow 1.5s ease-in-out infinite, thinking-pulse 1.5s ease-in-out infinite;
  box-shadow:
    0 0 20px rgba(102, 126, 234, 0.6),
    0 0 40px rgba(118, 75, 162, 0.4),
    0 0 60px rgba(102, 126, 234, 0.2);
}

.opencode-button.thinking svg path {
  fill: #fff;
}

.opencode-button.thinking::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b9cf5 0%, #9d6bc7 100%);
  z-index: -1;
}

.opencode-button.thinking::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: conic-gradient(from 180deg,
      transparent,
      rgba(102, 126, 234, 0.3),
      transparent,
      rgba(118, 75, 162, 0.3),
      transparent);
  z-index: -2;
  animation: thinking-rotate 2s linear infinite reverse;
  filter: blur(8px);
}

@keyframes thinking-glow {

  0%,
  100% {
    box-shadow:
      0 0 20px rgba(102, 126, 234, 0.6),
      0 0 40px rgba(118, 75, 162, 0.4),
      0 0 60px rgba(102, 126, 234, 0.2);
  }

  50% {
    box-shadow:
      0 0 30px rgba(102, 126, 234, 0.8),
      0 0 60px rgba(118, 75, 162, 0.6),
      0 0 90px rgba(102, 126, 234, 0.3);
  }
}

@keyframes thinking-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@keyframes thinking-pulse {

  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(0.85);
  }
}

.opencode-button.opencode-theme-dark {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.opencode-button.opencode-theme-dark::before {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: linear-gradient(135deg, #8b9cf5 0%, #9d6bc7 100%);
  z-index: -1;
}

.opencode-button.opencode-theme-dark:hover {
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.opencode-button.opencode-theme-dark svg path {
  fill: #fff;
}
</style>
