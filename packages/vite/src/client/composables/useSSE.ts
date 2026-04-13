import { ref, onUnmounted } from "vue";
import { ServiceStartupTask } from "@vite-plugin-opencode-assistant/shared";

const MAX_SSE_RETRIES = 10;
const SSE_RETRY_DELAY = 1000;

interface SSEStatusSyncData {
  type: "STATUS_SYNC";
  isStarted?: boolean;
  task: ServiceStartupTask;
  sessionUrl?: string;
  errorType?: string;
  errorMessage?: string;
}

interface SSETaskUpdateData {
  type: "TASK_UPDATE";
  task: ServiceStartupTask;
  sessionUrl?: string;
  errorType?: string;
  errorMessage?: string;
}

export function useSSE(
  onStatusSync: (data: SSEStatusSyncData) => void,
  onTaskUpdate: (data: SSETaskUpdateData) => void,
  onClearElements: () => void,
  onConnected: () => void,
) {
  const sseConnection = ref<EventSource | null>(null);
  const sseRetryCount = ref(0);

  const setupSSE = () => {
    if (sseConnection.value) return;

    try {
      sseConnection.value = new EventSource("/__opencode_events__");

      sseConnection.value.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "CONNECTED") {
            onConnected();
            sseRetryCount.value = 0;
          } else if (data.type === "STATUS_SYNC") {
            onStatusSync(data);
          } else if (data.type === "TASK_UPDATE") {
            onTaskUpdate(data);
          } else if (data.type === "CLEAR_ELEMENTS") {
            onClearElements();
          }
        } catch {
          // ignore
        }
      };

      sseConnection.value.onerror = () => {
        sseConnection.value?.close();
        sseConnection.value = null;

        if (sseRetryCount.value < MAX_SSE_RETRIES) {
          sseRetryCount.value++;
          setTimeout(setupSSE, SSE_RETRY_DELAY * sseRetryCount.value);
        }
      };
    } catch {
      sseConnection.value = null;
      if (sseRetryCount.value < MAX_SSE_RETRIES) {
        sseRetryCount.value++;
        setTimeout(setupSSE, SSE_RETRY_DELAY * sseRetryCount.value);
      }
    }
  };

  const closeSSE = () => {
    if (sseConnection.value) {
      sseConnection.value.close();
      sseConnection.value = null;
    }
  };

  onUnmounted(() => {
    closeSSE();
  });

  return {
    setupSSE,
    closeSSE,
    sseRetryCount,
  };
}
