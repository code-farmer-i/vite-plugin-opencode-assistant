<script setup lang="ts">
defineProps<{
  retrying: boolean;
}>();

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="opencode-chrome-warmup-failed">
    <div class="opencode-chrome-warmup-failed-icon">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        width="48"
        height="48"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    </div>
    <div class="opencode-chrome-warmup-failed-title">Chrome DevTools MCP 连接失败</div>
    <div class="opencode-chrome-warmup-failed-text">
      <p>请按以下步骤开启 Chrome 远程调试：</p>
      <ol class="opencode-chrome-warmup-steps">
        <li>
          在 Chrome 地址栏输入
          <code class="opencode-chrome-warmup-code">chrome://inspect/#remote-debugging</code>
        </li>
        <li>勾选 'Allow remote debugging for this browser instance' 选项</li>
        <li>重新启动浏览器</li>
        <li>完成后点击下方按钮重试</li>
      </ol>
    </div>
    <div class="opencode-chrome-warmup-failed-actions">
      <button
        class="opencode-chrome-warmup-failed-btn primary"
        :disabled="retrying"
        @click="emit('retry')"
      >
        {{ retrying ? '连接中...' : '重试连接' }}
      </button>
    </div>
  </div>
</template>
