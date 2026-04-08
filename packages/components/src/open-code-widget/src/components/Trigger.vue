<script setup lang="ts">
import { useOpenCodeWidgetContext } from "../context";

const { buttonActive: active, open, hotkeyLabel, handleToggle } = useOpenCodeWidgetContext();
</script>

<template>
  <button
    class="opencode-button"
    :class="{ active }"
    type="button"
    :aria-expanded="open"
    aria-label="打开 AI 助手"
    :title="`AI 助手 (${hotkeyLabel})`"
    @click="handleToggle"
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
        <path
          d="M512 981.33H85.34c-15.85 0-30.38-8.77-37.77-22.81a42.624 42.624 0 0 1 2.6-44.02L135 791.08C75.25 710.5 42.67 612.6 42.67 512 42.67 253.21 253.21 42.67 512 42.67S981.34 253.21 981.34 512 770.8 981.33 512 981.33zM166.44 896H512c211.73 0 384-172.27 384-384S723.73 128 512 128 128 300.27 128 512c0 91.29 32.83 179.9 92.46 249.46 12.58 14.69 13.73 36 2.77 51.94L166.44 896z"
          fill="white"
          p-id="5391"
        ></path>
        <path
          d="M384 448m-64 0a64 64 0 1 0 128 0 64 64 0 1 0 -128 0Z"
          fill="white"
          p-id="5392"
        ></path>
        <path
          d="M640 448m-64 0a64 64 0 1 0 128 0 64 64 0 1 0 -128 0Z"
          fill="white"
          p-id="5393"
        ></path>
      </svg>
    </slot>
  </button>
</template>

<style>
.opencode-button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--oc-trigger-bg);
  border: none;
  cursor: pointer;
  box-shadow: var(--oc-trigger-shadow);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  padding: 0;
  position: relative;
}

.opencode-button::before {
  content: "";
  position: absolute;
  top: -8px;
  left: -8px;
  right: -8px;
  bottom: -8px;
  border-radius: 50%;
}

.opencode-button:hover {
  transform: scale(1.1);
  box-shadow: var(--oc-trigger-shadow-hover);
  background: var(--oc-trigger-bg-hover);
}

.opencode-button.active {
  background: var(--oc-trigger-bg-active);
  box-shadow: var(--oc-trigger-shadow-active);
}

.opencode-button.active svg {
  transform: rotate(180deg);
}

.opencode-button svg {
  transition: transform 0.3s ease;
}

.opencode-button.loading {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}
</style>
