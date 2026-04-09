import { createApp, ref, watch, onMounted, h, computed } from "vue";
import { OpenCodeWidget } from "@vite-plugin-opencode-assistant/components";
import "@vite-plugin-opencode-assistant/components/style.css";
import {
  CONFIG_DATA_ATTR,
  SERVICE_STARTUP_TASKS,
  type ServiceStartupTask,
} from "@vite-plugin-opencode-assistant/shared";
import type { WidgetOptions } from "@vite-plugin-opencode-assistant/shared";

interface HotkeyConfig {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

function parseHotkey(hotkeyStr: string): HotkeyConfig {
  if (!hotkeyStr) return { ctrl: true, shift: false, alt: false, key: "k" };

  const parts = hotkeyStr.toLowerCase().split("+");
  const key = parts.pop();

  return {
    ctrl: parts.includes("ctrl") || parts.includes("cmd") || parts.includes("meta"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: key || "k",
  };
}

function matchHotkey(e: KeyboardEvent, hotkeyConfig: HotkeyConfig): boolean {
  const ctrlMatch = hotkeyConfig.ctrl ? e.ctrlKey || e.metaKey : !(e.ctrlKey || e.metaKey);
  const shiftMatch = hotkeyConfig.shift ? e.shiftKey : !e.shiftKey;
  const altMatch = hotkeyConfig.alt ? e.altKey : !e.altKey;
  const keyMatch = e.key.toLowerCase() === hotkeyConfig.key.toLowerCase();

  return ctrlMatch && shiftMatch && altMatch && keyMatch;
}

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

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
  return btoa(binString);
}

let proxyUrl = "";

function toProxyUrl(url: string): string {
  if (!url || !proxyUrl) return url;
  try {
    const urlObj = new URL(url, window.location.origin);
    return `${proxyUrl}${urlObj.pathname}${urlObj.search}`;
  } catch {
    return url;
  }
}

// 提取配置
let config: Partial<WidgetOptions> & { lazy?: boolean } = {};
const scriptTag = document.querySelector(`script[${CONFIG_DATA_ATTR}]`);
if (scriptTag) {
  const configBase64 = scriptTag.getAttribute(CONFIG_DATA_ATTR);
  if (configBase64) {
    try {
      const decoded = new TextDecoder().decode(
        Uint8Array.from(atob(configBase64), (c) => c.charCodeAt(0)),
      );
      config = JSON.parse(decoded);
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
    const showSessionListSkeleton = ref(true);
    const loading = ref(false);
    const loadingSessionList = ref<boolean | undefined>(undefined);
    const iframeSrc = ref("");
    const currentSessionId = ref<string | null>(null);
    const sessions = ref<OpenCodeWidgetSession[]>([]);
    const selectedElements = ref<OpenCodeSelectedElement[]>([]);
    const widgetRef = ref<InstanceType<typeof OpenCodeWidget> | null>(null);
    const chromeMcpWarmupFailed = ref(false);
    const currentTask = ref<ServiceStartupTask | "">("");

    const loadingText = computed(() => {
      if (!currentTask.value) return "加载中...";
      return SERVICE_STARTUP_TASKS[currentTask.value] || "加载中...";
    });

    const retryingWarmup = ref(false);

    const retryWarmup = async () => {
      retryingWarmup.value = true;
      try {
        const res = await fetch("/__opencode_warmup__", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          chromeMcpWarmupFailed.value = false;
          showNotification("Chrome DevTools MCP 连接成功");
          
          // 重试成功后，如果 iframe 还没有加载，尝试加载会话
          if (!iframeSrc.value) {
            try {
              const sessionRes = await fetch("/__opencode_sessions__");
              const sessions = await sessionRes.json();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const currentDirSession = sessions.find((s: any) => s.directory === cwd);
              if (currentDirSession) {
                iframeSrc.value = `${proxyUrl}/${utf8ToBase64(cwd)}/session/${currentDirSession.id}`;
                currentSessionId.value = currentDirSession.id;
              }
            } catch {
              // ignore
            }
          }
        } else {
          showNotification(data.error || "重试失败，请确认 Chrome 远程调试已开启");
        }
      } catch (e) {
        console.error("[OpenCode] Retry warmup failed:", e);
        showNotification("重试失败，请稍后再试");
      } finally {
        retryingWarmup.value = false;
      }
    };

    const {
      position = "bottom-right" as OpenCodeWidgetPosition,
      theme: initialTheme = "auto" as OpenCodeWidgetTheme,
      open: autoOpen = false,
      sessionUrl: initialSessionUrl = "",
      proxyUrl: configProxyUrl = "",
      lazy = false,
      hotkey = "ctrl+k",
      cwd = "",
    } = config;

    if (configProxyUrl) {
      proxyUrl = configProxyUrl;
    }

    const theme = ref<OpenCodeWidgetTheme>(initialTheme as OpenCodeWidgetTheme);

    const isWaitingForSession = ref(!initialSessionUrl);
    const computedLoading = computed(() => {
      return (loading.value || isWaitingForSession.value) && !chromeMcpWarmupFailed.value;
    });

    let servicesStarted = !lazy;

    const extractSessionId = (url: string) => {
      if (!url) return null;
      const match = url.match(/\/session\/([^/?]+)/);
      return match ? match[1] : null;
    };

    currentSessionId.value = extractSessionId(initialSessionUrl);
    if (servicesStarted && initialSessionUrl) {
      iframeSrc.value = toProxyUrl(initialSessionUrl);
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
      loadingSessionList.value = true;
      try {
        const response = await fetch("/__opencode_sessions__");
        const data = await response.json();
        // format session data
        sessions.value = data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((s: any) => s.directory === cwd && s.title !== "__chrome_mcp_warmup__")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      loading.value = true;
      iframeSrc.value = `${proxyUrl}/${utf8ToBase64(cwd)}/session/${session.id}`;
      setTimeout(() => {
        loading.value = false;
      }, 500);
    };

    let sseConnection: EventSource | null = null;
    let sseRetryCount = 0;
    const MAX_SSE_RETRIES = 10;
    const SSE_RETRY_DELAY = 1000;

    const setupSSE = () => {
      if (!servicesStarted || sseConnection) return;

      try {
        sseConnection = new EventSource("/__opencode_events__");

        sseConnection.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "CONNECTED") {
              updateContext(true);
              sseRetryCount = 0;
            } else if (data.type === "TASK_UPDATE") {
              currentTask.value = data.task;
              if (data.task === "ready") {
                showSessionListSkeleton.value = false;
              }
            } else if (data.type === "SESSION_READY") {
              if (data.sessionUrl && !iframeSrc.value) {
                iframeSrc.value = toProxyUrl(data.sessionUrl);
                currentSessionId.value = extractSessionId(data.sessionUrl);
              }
              isWaitingForSession.value = false;
              sseRetryCount = 0;
            } else if (data.type === "CLEAR_ELEMENTS") {
              selectedElements.value = [];
            } else if (data.type === "CHROME_MCP_WARMUP_FAILED") {
              chromeMcpWarmupFailed.value = true;
              isWaitingForSession.value = false;
            }
          } catch {
            // ignore
          }
        };

        sseConnection.onerror = () => {
          sseConnection?.close();
          sseConnection = null;

          if (sseRetryCount < MAX_SSE_RETRIES) {
            sseRetryCount++;
            setTimeout(setupSSE, SSE_RETRY_DELAY);
          }
        };
      } catch {
        sseConnection = null;
        if (sseRetryCount < MAX_SSE_RETRIES) {
          sseRetryCount++;
          setTimeout(setupSSE, SSE_RETRY_DELAY);
        }
      }
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
            iframeSrc.value = toProxyUrl(data.sessionUrl);
            currentSessionId.value = extractSessionId(data.sessionUrl);
            isWaitingForSession.value = false;
          }
          setupSSE();
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    const mainHotkey = parseHotkey(hotkey);
    const selectHotkey = parseHotkey("ctrl+p");

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

      // 注册全局快捷键
      const handleKeydown = (e: KeyboardEvent) => {
        if (matchHotkey(e, mainHotkey)) {
          e.preventDefault();
          handleToggle(!open.value);
        }

        if (matchHotkey(e, selectHotkey)) {
          e.preventDefault();
          const win = window as typeof window & { __VUE_INSPECTOR__?: unknown };
          if (win.__VUE_INSPECTOR__) {
            selectMode.value = !selectMode.value;
          } else {
            showNotification("Vue Inspector 未加载，无法使用元素选择功能");
          }
        }
      };

      document.addEventListener("keydown", handleKeydown);

      // 返回清理函数
      return () => {
        document.removeEventListener("keydown", handleKeydown);
      };
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
      return h(
        OpenCodeWidget,
        {
          ref: widgetRef,
          position: position as OpenCodeWidgetPosition,
          theme: theme.value,
          open: open.value,
          selectMode: selectMode.value,
          sessionListCollapsed: sessionListCollapsed.value,
          frameLoading: computedLoading.value,
          loadingSessionList: loadingSessionList.value,
          showSessionListSkeleton: showSessionListSkeleton.value,
          iframeSrc: iframeSrc.value,
          currentSessionId: currentSessionId.value,
          sessions: sessions.value,
          sessionKey: "id",
          selectedElements: selectedElements.value,
          hotkeyLabel: hotkey,
          "onUpdate:open": handleToggle,
          "onUpdate:selectMode": (val: boolean) => {
            selectMode.value = val;
            // 退出选择模式时自动打开面板
            if (!val && !open.value) {
              open.value = true;
            }
          },
          "onUpdate:sessionListCollapsed": (val: boolean) => {
            sessionListCollapsed.value = val;
          },
          "onUpdate:theme": (val: OpenCodeWidgetTheme) => {
          theme.value = val;
        },
        "onToggle-theme": (val: OpenCodeWidgetTheme) => {
          theme.value = val;
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
      },
      {
        loading: () =>
          h("div", { class: "opencode-custom-loading" }, [
            h("div", { class: "opencode-loading-spinner" }),
            h("div", { class: "opencode-loading-text" }, loadingText.value),
          ]),
        error: () =>
          chromeMcpWarmupFailed.value
            ? h("div", { class: "opencode-chrome-warmup-failed" }, [
                h("div", { class: "opencode-chrome-warmup-failed-icon" }, [
                  h("svg", {
                    viewBox: "0 0 24 24",
                    width: "48",
                    height: "48",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "1.5",
                  }, [
                    h("path", {
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
                    }),
                  ]),
                ]),
                h("div", { class: "opencode-chrome-warmup-failed-title" }, "Chrome DevTools MCP 连接失败"),
                h("div", { class: "opencode-chrome-warmup-failed-text" }, [
                  h("p", {}, "请按以下步骤开启 Chrome 远程调试："),
                  h("ol", { class: "opencode-chrome-warmup-steps" }, [
                    h("li", {}, [
                      "在 Chrome 地址栏输入 ",
                      h("code", { class: "opencode-chrome-warmup-code" }, "chrome://inspect/#remote-debugging"),
                    ]),
                    h("li", {}, "勾选 'Allow remote debugging for this browser instance' 选项"),
                    h("li", {}, "完成后点击下方按钮重试"),
                  ]),
                ]),
                h("div", { class: "opencode-chrome-warmup-failed-actions" }, [
                  h(
                    "button",
                    {
                      class: "opencode-chrome-warmup-failed-btn primary",
                      disabled: retryingWarmup.value,
                      onClick: retryWarmup,
                    },
                    retryingWarmup.value ? "连接中..." : "重试连接",
                  ),
                ]),
              ])
            : null,
      },
    );
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

const style = document.createElement("style");
style.textContent = `
.opencode-custom-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.opencode-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--oc-border);
  border-top-color: var(--oc-primary);
  border-radius: 50%;
  animation: opencode-spin 0.8s linear infinite;
}

@keyframes opencode-spin {
  to { transform: rotate(360deg); }
}

.opencode-loading-text {
  margin-top: 12px;
  color: var(--oc-text-secondary);
  font-size: 14px;
}

.opencode-chrome-warmup-failed {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--oc-bg-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 15;
}

.opencode-chrome-warmup-failed-icon {
  color: var(--oc-warning, #f59e0b);
  margin-bottom: 16px;
}

.opencode-chrome-warmup-failed-title {
  color: var(--oc-text-primary);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.opencode-chrome-warmup-failed-text {
  color: var(--oc-text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
  text-align: left;
  max-width: 400px;
  line-height: 1.6;
  text-align: center;
}

.opencode-chrome-warmup-failed-text p {
  margin: 0 0 12px 0;
  font-weight: 500;
  color: var(--oc-text-primary);
}

.opencode-chrome-warmup-steps {
  margin: 0;
  padding-left: 20px;
}

.opencode-chrome-warmup-steps li {
  margin-bottom: 8px;
  color: var(--oc-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.opencode-chrome-warmup-steps li:last-child {
  margin-bottom: 0;
}

.opencode-chrome-warmup-code {
  display: inline-block;
  background: var(--oc-bg-tertiary);
  color: var(--oc-primary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  word-break: break-all;
  margin: 0 2px;
}

.opencode-chrome-warmup-failed-actions {
  display: flex;
  gap: 12px;
}

.opencode-chrome-warmup-failed-btn {
  padding: 10px 24px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.opencode-chrome-warmup-failed-btn.primary {
  background: var(--oc-primary);
  color: white;
  box-shadow: var(--oc-shadow-primary);
}

.opencode-chrome-warmup-failed-btn.primary:hover:not(:disabled) {
  background: var(--oc-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--oc-shadow-primary-hover);
}

.opencode-chrome-warmup-failed-btn.primary:active:not(:disabled) {
  transform: translateY(0);
}

.opencode-chrome-warmup-failed-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
`;
document.head.appendChild(style);
