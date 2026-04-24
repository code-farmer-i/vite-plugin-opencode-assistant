<script setup lang="ts">
import { ref, computed } from "vue";
import { ChromeMcpWarmupErrorType, type ModelInfo } from "@vite-plugin-opencode-assistant/shared";

const props = defineProps<{
  retrying: boolean;
  errorType?: string;
  errorMessage?: string;
  models?: ModelInfo[];
}>();

const emit = defineEmits<{
  retry: [selectedModel?: { providerID: string; modelID: string; }];
}>();

const selectedModelIndex = ref<number>(0);

const shouldShowModelSelector = computed(() => {
  return (
    props.errorType === ChromeMcpWarmupErrorType.AI_TIMEOUT ||
    props.errorType === ChromeMcpWarmupErrorType.AI_RESPONSE_ERROR ||
    props.errorType === ChromeMcpWarmupErrorType.UNKNOWN
  );
});

const hasModels = computed(() => props.models && props.models.length > 0);

const handleRetry = () => {
  if (shouldShowModelSelector.value && hasModels.value && props.models) {
    const selectedModel = props.models[selectedModelIndex.value];
    emit("retry", {
      providerID: selectedModel.providerID,
      modelID: selectedModel.modelID,
    });
  } else {
    emit("retry");
  }
};
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

    <!-- Chrome 远程调试未开启 -->
    <template v-if="errorType === ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED">
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
    </template>

    <!-- AI 响应超时 -->
    <template v-else-if="errorType === ChromeMcpWarmupErrorType.AI_TIMEOUT">
      <div class="opencode-chrome-warmup-failed-title">AI 响应超时</div>
      <div class="opencode-chrome-warmup-failed-text">
        <p>AI 模型响应超时，可能的原因：</p>
        <ol class="opencode-chrome-warmup-steps">
          <li>当前选择的 AI 模型服务不可用或响应缓慢</li>
          <li>网络连接问题</li>
          <li>模型配置不正确</li>
        </ol>
        <p
          v-if="hasModels"
          style="margin-top: 12px; font-weight: 500;"
        >可选择其他模型重试：</p>
      </div>
    </template>

    <!-- AI 响应错误 -->
    <template v-else-if="errorType === ChromeMcpWarmupErrorType.AI_RESPONSE_ERROR">
      <div class="opencode-chrome-warmup-failed-title">AI 响应错误</div>
      <div class="opencode-chrome-warmup-failed-text">
        <p>AI 模型返回了意外的响应：</p>
        <div class="opencode-chrome-warmup-error-details">
          {{ errorMessage || '未知错误' }}
        </div>
        <p
          v-if="hasModels"
          style="margin-top: 12px;"
        >可选择其他模型重试：</p>
      </div>
    </template>

    <!-- 其他错误 -->
    <template v-else>
      <div class="opencode-chrome-warmup-failed-title">Chrome DevTools MCP 连接失败</div>
      <div class="opencode-chrome-warmup-failed-text">
        <p v-if="errorMessage">{{ errorMessage }}</p>
        <p v-else>连接失败，请重试</p>
        <p
          v-if="hasModels"
          style="margin-top: 12px;"
        >可选择模型重试：</p>
      </div>
    </template>

    <!-- 模型选择器 -->
    <div
      v-if="shouldShowModelSelector && hasModels"
      class="opencode-model-selector"
    >
      <select
        v-model.number="selectedModelIndex"
        class="opencode-model-select"
        :disabled="retrying"
      >
        <option
          v-for="(model, index) in models"
          :key="index"
          :value="index"
        >
          {{ model.name || model.modelID }} ({{ model.providerID }})
          - ${{ model.inputCost.toFixed(4) }}/1M tokens
        </option>
      </select>
    </div>

    <div class="opencode-chrome-warmup-failed-actions">
      <button
        class="opencode-chrome-warmup-failed-btn primary"
        :disabled="retrying"
        @click="handleRetry"
      >
        {{ retrying ? '连接中...' : '重试连接' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.opencode-chrome-warmup-error-details {
  margin-top: 8px;
  padding: 12px;
  background: var(--oc-bg-tertiary);
  border-radius: 6px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  color: var(--oc-text-secondary);
  max-height: 120px;
  overflow-y: auto;
  word-break: break-word;
}

.opencode-model-selector {
  margin-top: 12px;
  width: 100%;
}

.opencode-model-select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--oc-border-primary);
  background: var(--oc-bg-primary);
  color: var(--oc-text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.opencode-model-select:hover {
  border-color: var(--oc-border-hover);
}

.opencode-model-select:focus {
  border-color: var(--oc-border-active);
}

.opencode-model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
