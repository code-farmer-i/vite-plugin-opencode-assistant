<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { OpenCodeWidget } from "@vite-plugin-opencode-assistant/components";
import type { OpenCodeWidgetPosition, OpenCodeWidgetTheme } from "@vite-plugin-opencode-assistant/shared";
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
const iframeReady = ref(false);

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

const sendMessageToIframe = (type: string, data?: Record<string, unknown>) => {
  widgetRef.value?.sendMessageToIframe?.(type, data);
};

const {
  currentTask,
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
  resolvedTheme,
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
  setSessionUrl,
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
      updateStatusFromTask(data.task, data.sessionUrl, data.errorType, data.errorMessage);
      if (data.sessionUrl) {
        setSessionUrl(data.sessionUrl);
      }
    }
    if (serviceStatus.value !== "idle") {
      loadSessions();
    }
  },
  (data) => {
    updateStatusFromTask(data.task, data.sessionUrl, data.errorType, data.errorMessage);
    if (data.sessionUrl) {
      setSessionUrl(data.sessionUrl);
    }
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
  const win = window as typeof window & { __VUE_INSPECTOR__?: unknown };
  if (win.__VUE_INSPECTOR__) {
    if (!iframeReady.value) {
      showNotification("请等待 iframe 加载完成");
      return;
    }
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
    console.log('[App] Received message:', event.data?.type);
    if (event.data?.type === "OPENCODE_THINKING_STATE") {
      setThinking(event.data.thinking);
    }
    if (event.data?.type === "OPENCODE_READY") {
      console.log('[App] OPENCODE_READY received, setting iframeReady to true');
      sendThemeToIframe();
      iframeReady.value = true;
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

const handleSelectNode = (element: any) => {
  console.log('[App] handleSelectNode, iframeReady:', iframeReady.value);
  if (!iframeReady.value) {
    showNotification("请等待 iframe 加载完成");
    return;
  }
  
  const contextData = {
    id: `${element.filePath}:${element.line}:${element.column ?? 0}`,
    title: element.description || 'context',
    content: element.innerText || element.description || "",
    source: {
      file: element.filePath,
      lineStart: element.line,
      lineEnd: element.line,
      column: element.column,
    },
  };
  
  sendMessageToIframe("ADD_CONTEXT_TAG", { data: contextData });
  showNotification(`已添加到输入框`);
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

const handleRemoveSelectedNode = ({ index }: { index: number }) => {
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
    :selectMode="selectMode"
    :sessionListCollapsed="sessionListCollapsed"
    :frameLoading="computedLoading"
    :loadingSessionList="loadingSessionList"
    :showSessionListSkeleton="showSessionListSkeleton"
    :showError="chromeMcpFailed"
    :iframeSrc="iframeSrc"
    :currentSessionId="currentSessionId"
    :sessions="sessions"
    sessionKey="id"
    :selectedElements="selectedElements"
    :hotkeyLabel="hotkey"
    :thinking="thinking"
    @update:open="handleToggle"
    @update:selectMode="handleSelectModeChange"
    @update:sessionListCollapsed="handleSessionListCollapsedChange"
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
      <LoadingContent :loadingText="loadingText" />
    </template>
    <template #error>
      <ChromeWarmupError
        v-if="chromeMcpFailed"
        :retrying="retryingWarmup"
        :errorType="chromeMcpErrorType"
        :errorMessage="chromeMcpErrorMessage"
        @retry="retryWarmup"
      />
    </template>
  </OpenCodeWidget>
</template>
