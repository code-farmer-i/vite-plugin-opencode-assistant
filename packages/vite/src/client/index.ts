import { createApp, ref, watch, onMounted, h } from "vue";
import { OpenCodeWidget } from "@vite-plugin-opencode-assistant/components";
import "@vite-plugin-opencode-assistant/components/style.css";
import { CONFIG_DATA_ATTR } from "@vite-plugin-opencode-assistant/shared";
import type { WidgetOptions } from "@vite-plugin-opencode-assistant/shared";

type OpenCodeWidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type OpenCodeWidgetTheme = "light" | "dark" | "auto";
interface OpenCodeWidgetSession {
  id: string;
  title?: string;
  updatedAt?: string | number | Date;
  meta?: string;
  directory?: string;
}
interface OpenCodeSelectedElement {
  filePath: string | null;
  line: number | null;
  column: number | null;
  innerText: string;
  description: string;
}

// 提取配置
let config: Partial<WidgetOptions> & { lazy?: boolean } = {};
const scriptTag = document.querySelector(`script[${CONFIG_DATA_ATTR}]`);
if (scriptTag) {
  const configBase64 = scriptTag.getAttribute(CONFIG_DATA_ATTR);
  if (configBase64) {
    try {
      config = JSON.parse(atob(configBase64));
    } catch (e) {
      console.error("[OpenCode] Failed to parse config:", e);
    }
  }
}

const App = {
  setup() {
    const open = ref(false);
    const selectMode = ref(false);
    const sessionListCollapsed = ref(true);
    const loading = ref(false);
    const iframeSrc = ref("");
    const currentSessionId = ref<string | null>(null);
    const sessions = ref<OpenCodeWidgetSession[]>([]);
    const selectedElements = ref<OpenCodeSelectedElement[]>([]);
    const widgetRef = ref<InstanceType<typeof OpenCodeWidget> | null>(null);

    const {
      webUrl = "",
      position = "bottom-right" as OpenCodeWidgetPosition,
      theme = "auto" as OpenCodeWidgetTheme,
      open: autoOpen = false,
      sessionUrl: initialSessionUrl = "",
      lazy = false,
      hotkey = "ctrl+k",
      cwd = "",
    } = config;

    let servicesStarted = !lazy;

    const extractSessionId = (url: string) => {
      if (!url) return null;
      const match = url.match(/\/session\/([^/?]+)/);
      return match ? match[1] : null;
    };

    currentSessionId.value = extractSessionId(initialSessionUrl);
    if (servicesStarted && initialSessionUrl) {
      iframeSrc.value = initialSessionUrl;
    }

    try {
      const stored = sessionStorage.getItem("__opencode_selected_elements__");
      if (stored) {
        selectedElements.value = JSON.parse(stored);
      }
    } catch {
      // ignore
    }

    watch(
      selectedElements,
      (val) => {
        sessionStorage.setItem("__opencode_selected_elements__", JSON.stringify(val));
      },
      { deep: true },
    );

    const showNotification = (msg: string) => {
      widgetRef.value?.showNotification?.(msg);
    };

    const loadSessions = async () => {
      try {
        const response = await fetch("/__opencode_sessions__");
        const data = await response.json();
        // format session data
        sessions.value = data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((s: any) => s.directory === cwd)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((s: any) => ({
            ...s,
            updatedAt: s.time?.updated || Date.now(),
          }));
      } catch (e) {
        console.error("[OpenCode] Failed to load sessions:", e);
      }
    };

    const createSession = async () => {
      try {
        const response = await fetch("/__opencode_sessions__", { method: "POST" });
        const newSession = await response.json();
        await loadSessions();
        currentSessionId.value = newSession.id;
        iframeSrc.value = `${webUrl}/${btoa(cwd)}/session/${newSession.id}`;
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
            iframeSrc.value = `${webUrl}/${btoa(cwd)}/session/${nextSession.id}`;
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
      loading.value = true;
      iframeSrc.value = `${webUrl}/${btoa(cwd)}/session/${session.id}`;
      // iframe loaded event should clear loading, but for simplicity we can use a timeout or let it be
      setTimeout(() => {
        loading.value = false;
      }, 500);
    };

    let sseConnection: EventSource | null = null;
    const setupSSE = () => {
      if (!servicesStarted || sseConnection) return;
      sseConnection = new EventSource("/__opencode_events__");
      sseConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "CONNECTED") {
            updateContext(true);
          } else if (data.type === "SESSION_READY") {
            if (data.sessionUrl && !iframeSrc.value) {
              iframeSrc.value = data.sessionUrl;
              currentSessionId.value = extractSessionId(data.sessionUrl);
            }
          } else if (data.type === "CLEAR_ELEMENTS") {
            selectedElements.value = [];
          }
        } catch {
          // ignore
        }
      };
    };

    let currentPageUrl = "";
    let currentPageTitle = "";
    const updateContext = (force = false) => {
      if (!servicesStarted) return;
      const newUrl = window.location.href;
      const newTitle = document.title;
      if (force || newUrl !== currentPageUrl || newTitle !== currentPageTitle) {
        currentPageUrl = newUrl;
        currentPageTitle = newTitle;
        fetch("/__opencode_context__", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: newUrl,
            title: newTitle,
            selectedElements: selectedElements.value,
          }),
        }).catch(() => {});
      }
    };

    const ensureServicesStarted = async () => {
      if (servicesStarted) return true;
      try {
        const res = await fetch("/__opencode_start__");
        const data = await res.json();
        if (data.success) {
          servicesStarted = true;
          if (data.sessionUrl) {
            iframeSrc.value = data.sessionUrl;
            currentSessionId.value = extractSessionId(data.sessionUrl);
          }
          setupSSE();
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    onMounted(() => {
      if (servicesStarted) {
        loadSessions();
        setupSSE();
        updateContext(true);
      }
      if (autoOpen && servicesStarted) {
        setTimeout(() => {
          open.value = true;
        }, 1000);
      }

      // 监听路由变化
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      history.pushState = function (...args) {
        originalPushState.apply(this, args);
        setTimeout(updateContext, 0);
      };
      history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        setTimeout(updateContext, 0);
      };
      window.addEventListener("popstate", () => setTimeout(updateContext, 0));
      window.addEventListener("hashchange", () => setTimeout(updateContext, 0));

      const titleObserver = new MutationObserver(() => {
        if (document.title !== currentPageTitle) updateContext();
      });
      if (document.head) {
        titleObserver.observe(document.head, { childList: true, subtree: true });
      }
    });

    const handleToggle = async (val: boolean) => {
      if (lazy && !servicesStarted && val) {
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
    };

    const handleSelectNode = (element: OpenCodeSelectedElement) => {
      const exists = selectedElements.value.some(
        (el: OpenCodeSelectedElement) =>
          el.filePath === element.filePath && el.line === element.line,
      );
      if (!exists) {
        selectedElements.value.push(element);
        showNotification(`已选中元素 (${selectedElements.value.length}个)`);
        updateContext(true);
      } else {
        showNotification("该元素已选中");
      }
    };

    const handleClearSelected = () => {
      selectedElements.value = [];
      updateContext(true);
      showNotification("已清除所有选中元素");
    };

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return h(OpenCodeWidget as any, {
        ref: widgetRef,
        position: position as OpenCodeWidgetPosition,
        theme: theme as OpenCodeWidgetTheme,
        open: open.value,
        selectMode: selectMode.value,
        sessionListCollapsed: sessionListCollapsed.value,
        loading: loading.value,
        iframeSrc: iframeSrc.value,
        currentSessionId: currentSessionId.value,
        sessions: sessions.value,
        selectedElements: selectedElements.value,
        hotkeyLabel: hotkey,
        "onUpdate:open": handleToggle,
        "onUpdate:selectMode": (val: boolean) => {
          selectMode.value = val;
        },
        "onUpdate:sessionListCollapsed": (val: boolean) => {
          sessionListCollapsed.value = val;
        },
        "onCreate-session": createSession,
        "onDelete-session": deleteSession,
        "onSelect-session": selectSession,
        "onClick-selected-node": handleSelectNode,
        "onClear-selected-nodes": handleClearSelected,
        "onRemove-selected-node": ({ index }: { index: number }) => {
          selectedElements.value.splice(index, 1);
          updateContext(true);
        },
        "onEmpty-action": createSession,
      });
    };
  },
};

const INIT_MARKER = "__OPENCODE_INITIALIZED__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(window as any)[INIT_MARKER]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any)[INIT_MARKER] = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  createApp(App).mount(container);
}
