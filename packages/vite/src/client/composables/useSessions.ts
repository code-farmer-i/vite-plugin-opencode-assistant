import { ref, computed } from "vue";
import { SESSIONS_API_PATH } from "@vite-plugin-opencode-assistant/shared";
import type { OpenCodeWidgetSession, SessionInfo } from "@vite-plugin-opencode-assistant/shared";

export function useSessions(showNotification: (msg: string) => void) {
  const sessions = ref<OpenCodeWidgetSession[]>([]);
  const loadingSessionList = ref<boolean | undefined>(undefined);
  const currentSessionId = ref<string | null>(null);
  const iframeLoading = ref(false);

  const iframeSrc = computed(() => {
    return currentSessionId.value
      ? sessions.value.find((s) => s.id === currentSessionId.value)?.url || ""
      : "";
  });

  const loadSessions = async () => {
    loadingSessionList.value = true;
    try {
      const response = await fetch(SESSIONS_API_PATH);
      const data: SessionInfo[] = await response.json();
      sessions.value = data
        .filter((s) => s.title !== "__chrome_mcp_warmup__")
        .map((s) => ({
          ...s,
          updatedAt: s.time?.updated || Date.now(),
        }));

      if (!sessions.value.length) {
        createSession();
      }
      currentSessionId.value = sessions.value[0]?.id || null;
    } catch (e) {
      console.error("[OpenCode] Failed to load sessions:", e);
    } finally {
      loadingSessionList.value = false;
    }
  };

  const createSession = async () => {
    try {
      const response = await fetch(SESSIONS_API_PATH, { method: "POST" });
      const newSession = await response.json();
      sessions.value.unshift({
        id: newSession.id,
        title: "新会话",
        updatedAt: Date.now(),
        url: newSession.url,
      });
      currentSessionId.value = newSession.id;
      iframeLoading.value = true;
      loadSessions();
    } catch {
      showNotification("创建会话失败");
    }
  };

  const deleteSession = async (session: OpenCodeWidgetSession) => {
    try {
      await fetch(`${SESSIONS_API_PATH}?id=${session.id}`, { method: "DELETE" });
      await loadSessions();
      showNotification("会话已删除");
      if (currentSessionId.value === session.id) {
        if (sessions.value.length > 0) {
          const nextSession = sessions.value[0];
          currentSessionId.value = nextSession.id;
          iframeLoading.value = true;
        } else {
          currentSessionId.value = null;
        }
      }
    } catch {
      showNotification("删除会话失败");
    }
  };

  const selectSession = (session: OpenCodeWidgetSession) => {
    if (currentSessionId.value === session.id) return;
    currentSessionId.value = session.id;
    iframeLoading.value = true;
  };

  return {
    sessions,
    loadingSessionList,
    currentSessionId,
    iframeSrc,
    iframeLoading,
    loadSessions,
    createSession,
    deleteSession,
    selectSession,
  };
}
