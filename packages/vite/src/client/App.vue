<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { OpenCodeWidget } from "@vite-plugin-opencode-assistant/components";
import type { OpenCodeWidgetPosition, OpenCodeWidgetTheme, OpenCodeSelectedElement } from "@vite-plugin-opencode-assistant/shared";
import type { WidgetOptions } from "@vite-plugin-opencode-assistant/shared";

import { useHotkey } from "./composables/useHotkey";
import { useSSE } from "./composables/useSSE";
import { useSessions } from "./composables/useSessions";
import { useTheme } from "./composables/useTheme";
import { useSelectedElements } from "./composables/useSelectedElements";
import { useServiceStatus } from "./composables/useServiceStatus";
import { useContext } from "./composables/useContext";
import LoadingContent from "./components/LoadingContent.vue";
import ChromeWarmupError from "./components/ChromeWarmupError.vue";

const props = defineProps<{
  config: Partial<WidgetOptions>;
}>();

const open = ref(false);
const selectMode = ref(false);
const sessionListCollapsed = ref(true);
const loading = ref(false);
const widgetRef = ref<InstanceType<typeof OpenCodeWidget> | null>(null);
const retryingWarmup = ref(false);

const {
  position = "bottom-right",
  theme: initialTheme = "auto",
  open: autoOpen = false,
  hotkey = "ctrl+k",
} = props.config;

const widgetPosition = position as OpenCodeWidgetPosition;
const widgetTheme = initialTheme as OpenCodeWidgetTheme;

const showNotification = (msg: string) => {
  widgetRef.value?.showNotification?.(msg);
};

const {
  serviceStatus,
  chromeMcpFailed,
  chromeMcpErrorType,
  chromeMcpErrorMessage,
  thinking,
  loadingText,
  updateStatusFromTask,
  setStarting,
  setThinking,
} = useServiceStatus();

const {
  selectedElements,
  addElement,
  removeElement,
  clearElements,
} = useSelectedElements();

const {
  theme,
  sendThemeToIframe,
} = useTheme(widgetTheme, widgetRef);

const {
  sessions,
  loadingSessionList,
  currentSessionId,
  iframeSrc,
  iframeLoading,
  loadSessions,
  createSession,
  deleteSession,
  selectSession,
} = useSessions(showNotification);

const { updateContext } = useContext(serviceStatus, selectedElements);

const showSessionListSkeleton = computed(() => serviceStatus.value === "starting");
const computedLoading = computed(() => {
  return serviceStatus.value === "starting" || iframeLoading.value;
});

const retryWarmup = async () => {
  retryingWarmup.value = true;

  try {
    const res = await fetch("/__opencode_warmup__", { method: "POST" });
    const data = await res.json();
    if (data.success) {
      chromeMcpFailed.value = false;
      serviceStatus.value = "ready";
      showNotification("Chrome DevTools MCP 连接成功");
    } else {
      if (data.errorType === 'AI_TIMEOUT') {
        showNotification("AI 响应超时，请检查 OpenCode AI 模型配置");
      } else if (data.errorType === 'AI_RESPONSE_ERROR') {
        showNotification("AI 响应错误，请检查 OpenCode AI 模型配置");
      } else if (data.errorType === 'CHROME_NOT_CONNECTED') {
        showNotification("Chrome 远程调试未开启，请按照提示操作");
      } else {
        showNotification(data.error || "重试失败，请确认 Chrome 远程调试已开启");
      }
    }
  } catch (e) {
    console.error("[OpenCode] Retry warmup failed:", e);
    showNotification("重试失败，请稍后再试");
  } finally {
    retryingWarmup.value = false;
  }
};

const { setupSSE } = useSSE(
  (data) => {
    if (data.isStarted !== undefined && data.isStarted && serviceStatus.value === "idle") {
      setStarting();
    }
    if (data.task) {
      updateStatusFromTask(data.task, data.errorType, data.errorMessage);
    }
    if (serviceStatus.value !== "idle") {
      loadSessions();
    }
  },
  (data) => {
    updateStatusFromTask(data.task, data.errorType, data.errorMessage);
  },
  () => clearElements(),
  () => updateContext(true),
);

const ensureServicesStarted = async () => {
  if (serviceStatus.value !== "idle") return true;
  try {
    const res = await fetch("/__opencode_start__");
    const data = await res.json();
    if (data.success) {
      setStarting();
      setupSSE();
      return true;
    }
  } catch {
    // ignore
  }
  return false;
};

useHotkey(hotkey, (e) => {
  e.preventDefault();
  handleToggle(!open.value);
});

useHotkey("ctrl+p", (e) => {
  e.preventDefault();
  const win = window as typeof window & { __VUE_INSPECTOR__?: unknown; };
  if (win.__VUE_INSPECTOR__) {
    selectMode.value = !selectMode.value;
  } else {
    showNotification("Vue Inspector 未加载，无法使用元素选择功能");
  }
});

onMounted(() => {
  if (serviceStatus.value !== "idle") {
    loadSessions();
    setupSSE();
    updateContext(true);
  }
  if (autoOpen && serviceStatus.value !== "idle") {
    setTimeout(() => {
      open.value = true;
    }, 1000);
  }

  const handleIframeMessage = (event: MessageEvent) => {
    if (event.data?.type === "OPENCODE_THINKING_STATE") {
      setThinking(event.data.thinking);
    }
    if (event.data?.type === "OPENCODE_READY") {
      sendThemeToIframe();
    }
  };
  window.addEventListener("message", handleIframeMessage);
});

const handleToggle = async (val: boolean) => {
  if (serviceStatus.value === "idle" && val) {
    loading.value = true;
    const started = await ensureServicesStarted();
    loading.value = false;
    if (!started) {
      showNotification("服务启动失败");
      return;
    }
  }
  open.value = val;
  if (val) updateContext();
  if (val) {
    iframeLoading.value = false;
  }
};

const handleSelectNode = (element: OpenCodeSelectedElement) => {
  const added = addElement(element);
  if (added) {
    showNotification(`已选中元素 (${selectedElements.value.length}个)`);
    updateContext(true);
  } else {
    showNotification("该元素已选中");
  }
};

const handleClearSelected = () => {
  clearElements();
  updateContext(true);
  showNotification("已清除所有选中元素");
};

const handleSelectModeChange = (val: boolean) => {
  selectMode.value = val;
  if (!val && !open.value) {
    open.value = true;
  }
};

const handleSessionListCollapsedChange = (val: boolean) => {
  sessionListCollapsed.value = val;
};

const handleThemeChange = (val: OpenCodeWidgetTheme) => {
  theme.value = val;
};

const handleRemoveSelectedNode = ({ index }: { index: number; }) => {
  removeElement(index);
  updateContext(true);
};

const handleFrameLoaded = () => {
  iframeLoading.value = false;
};
</script>

<template>
  <OpenCodeWidget
    ref="widgetRef"
    :position="widgetPosition"
    :theme="theme"
    :open="open"
    :select-mode="selectMode"
    :session-list-collapsed="sessionListCollapsed"
    :frame-loading="computedLoading"
    :loading-session-list="loadingSessionList"
    :show-session-list-skeleton="showSessionListSkeleton"
    :show-error="chromeMcpFailed"
    :iframe-src="iframeSrc"
    :current-session-id="currentSessionId"
    :sessions="sessions"
    session-key="id"
    :selected-elements="selectedElements"
    :hotkey-label="hotkey"
    :thinking="thinking"
    @update:open="handleToggle"
    @update:select-mode="handleSelectModeChange"
    @update:session-list-collapsed="handleSessionListCollapsedChange"
    @update:theme="handleThemeChange"
    @toggle-theme="handleThemeChange"
    @create-session="createSession"
    @delete-session="deleteSession"
    @select-session="selectSession"
    @click-selected-node="handleSelectNode"
    @clear-selected-nodes="handleClearSelected"
    @remove-selected-node="handleRemoveSelectedNode"
    @empty-action="createSession"
    @frame-loaded="handleFrameLoaded"
  >
    <template #loading>
      <LoadingContent :loading-text="loadingText" />
    </template>
    <template #error>
      <ChromeWarmupError
        v-if="chromeMcpFailed"
        :retrying="retryingWarmup"
        :error-type="chromeMcpErrorType"
        :error-message="chromeMcpErrorMessage"
        @retry="retryWarmup"
      />
    </template>
  </OpenCodeWidget>
</template>
