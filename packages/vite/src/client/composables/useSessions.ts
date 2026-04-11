import { ref } from "vue";
import type { OpenCodeWidgetSession } from "@vite-plugin-opencode-assistant/shared";

export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
  return btoa(binString);
}

export function extractSessionId(url: string) {
  if (!url) return null;
  const match = url.match(/\/session\/([^/?]+)/);
  return match ? match[1] : null;
}

export function useSessions(
  cwd: string,
  proxyUrl: string,
  showNotification: (msg: string) => void,
) {
  const sessions = ref<OpenCodeWidgetSession[]>([]);
  const loadingSessionList = ref<boolean | undefined>(undefined);
  const currentSessionId = ref<string | null>(null);
  const iframeSrc = ref("");
  const iframeLoading = ref(false);

  const loadSessions = async () => {
    loadingSessionList.value = true;
    try {
      const response = await fetch("/__opencode_sessions__");
      const data = await response.json();
      sessions.value = data
        .filter((s: any) => s.directory === cwd && s.title !== "__chrome_mcp_warmup__")
        .map((s: any) => ({
          ...s,
          updatedAt: s.time?.updated || Date.now(),
        }));
    } catch (e) {
      console.error("[OpenCode] Failed to load sessions:", e);
    } finally {
      loadingSessionList.value = false;
    }
  };

  const createSession = async () => {
    try {
      const response = await fetch("/__opencode_sessions__", { method: "POST" });
      const newSession = await response.json();
      sessions.value.unshift({
        id: newSession.id,
        title: "新会话",
        updatedAt: Date.now(),
      });
      currentSessionId.value = newSession.id;
      iframeLoading.value = true;
      iframeSrc.value = `${proxyUrl}/${utf8ToBase64(cwd)}/session/${newSession.id}`;
      loadSessions();
    } catch {
      showNotification("创建会话失败");
    }
  };

  const deleteSession = async (session: OpenCodeWidgetSession) => {
    try {
      await fetch(`/__opencode_sessions__?id=${session.id}`, { method: "DELETE" });
      await loadSessions();
      showNotification("会话已删除");
      if (currentSessionId.value === session.id) {
        if (sessions.value.length > 0) {
          const nextSession = sessions.value[0];
          currentSessionId.value = nextSession.id;
          iframeLoading.value = true;
          iframeSrc.value = `${proxyUrl}/${utf8ToBase64(cwd)}/session/${nextSession.id}`;
        } else {
          currentSessionId.value = null;
          iframeSrc.value = "";
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
    iframeSrc.value = `${proxyUrl}/${utf8ToBase64(cwd)}/session/${session.id}`;
  };

  const setSessionUrl = (url: string) => {
    if (!iframeSrc.value && url) {
      iframeSrc.value = url;
      currentSessionId.value = extractSessionId(url);
    }
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
    setSessionUrl,
  };
}
