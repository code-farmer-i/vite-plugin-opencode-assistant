import { createApp, ref, watch, onMounted, h, computed } from "vue";
import { OpenCodeWidget } from "@vite-plugin-opencode-assistant/components";
import "@vite-plugin-opencode-assistant/components/style.css";
import {
  CONFIG_DATA_ATTR,
  SERVICE_STARTUP_TASKS,
  type ServiceStartupTask,
  type OpenCodeWidgetPosition,
  type OpenCodeWidgetTheme,
  type OpenCodeWidgetSession,
  type OpenCodeSelectedElement,
  type ServiceStatus,
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
let config: Partial<WidgetOptions> = {};
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
    const loading = ref(false);
    const loadingSessionList = ref<boolean | undefined>(undefined);
    const iframeSrc = ref("");
    const currentSessionId = ref<string | null>(null);
    const sessions = ref<OpenCodeWidgetSession[]>([]);
    const selectedElements = ref<OpenCodeSelectedElement[]>([]);
    const widgetRef = ref<InstanceType<typeof OpenCodeWidget> | null>(null);
    const chromeMcpFailed = ref(false);
    const currentTask = ref<ServiceStartupTask | "">("");
    const serviceStatus = ref<ServiceStatus>("idle");

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
          chromeMcpFailed.value = false;
          serviceStatus.value = "ready";
          showNotification("Chrome DevTools MCP 连接成功");
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
      // sessionUrl 不再从配置读取，完全依赖 SSE 状态同步
      proxyUrl: configProxyUrl = "",
      hotkey = "ctrl+k",
      cwd = "",
    } = config;

    if (configProxyUrl) {
      proxyUrl = configProxyUrl;
    }

    const theme = ref<OpenCodeWidgetTheme>(initialTheme as OpenCodeWidgetTheme);

    const showSessionListSkeleton = computed(() => serviceStatus.value === "starting");
    // 分离服务启动状态和 iframe 加载状态
    const iframeLoading = ref(false);
    const computedLoading = computed(() => {
      // starting: 服务启动中
      // iframeLoading: iframe 页面加载中
      return serviceStatus.value === "starting" || iframeLoading.value;
    });

    const extractSessionId = (url: string) => {
      if (!url) return null;
      const match = url.match(/\/session\/([^/?]+)/);
      return match ? match[1] : null;
    };

    // 初始状态：不预设任何状态，完全依赖 SSE 同步
    // sessionUrl 不再从初始配置读取，而是通过 SSE 在 ready 或 chrome_mcp_failed 时推送

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
      iframeLoading.value = true;
      iframeSrc.value = `${proxyUrl}/${utf8ToBase64(cwd)}/session/${session.id}`;
    };

    let sseConnection: EventSource | null = null;
    let sseRetryCount = 0;
    const MAX_SSE_RETRIES = 10;
    const SSE_RETRY_DELAY = 1000;

    const setupSSE = () => {
      if (sseConnection) return;

      try {
        sseConnection = new EventSource("/__opencode_events__");

        sseConnection.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "CONNECTED") {
              updateContext(true);
              sseRetryCount = 0;
            } else if (data.type === "STATUS_SYNC") {
              // 处理服务端推送的完整状态同步
              if (data.isStarted !== undefined) {
                if (data.isStarted && serviceStatus.value === "idle") {
                  serviceStatus.value = "starting";
                }
              }
              if (data.task) {
                currentTask.value = data.task;
                if (data.task === "ready") {
                  serviceStatus.value = "ready";
                  chromeMcpFailed.value = false;
                  if (data.sessionUrl && !iframeSrc.value) {
                    iframeSrc.value = toProxyUrl(data.sessionUrl as string);
                    currentSessionId.value = extractSessionId(data.sessionUrl as string);
                  }
                } else if (data.task === "chrome_mcp_failed") {
                  serviceStatus.value = "partial";
                  chromeMcpFailed.value = true;
                } else if (
                  data.task === "session_creation_failed" ||
                  data.task === "opencode_not_installed" ||
                  data.task === "web_start_timeout"
                ) {
                  serviceStatus.value = "failed";
                } else if (serviceStatus.value === "idle") {
                  serviceStatus.value = "starting";
                }
              }
              // 状态同步后加载会话列表
              if (serviceStatus.value !== "idle") {
                loadSessions();
              }
            } else if (data.type === "TASK_UPDATE") {
              currentTask.value = data.task;

              if (data.task === "ready") {
                serviceStatus.value = "ready";
                chromeMcpFailed.value = false;
                if (data.sessionUrl && !iframeSrc.value) {
                  iframeSrc.value = toProxyUrl(data.sessionUrl);
                  currentSessionId.value = extractSessionId(data.sessionUrl);
                }
              } else if (data.task === "chrome_mcp_failed") {
                serviceStatus.value = "partial";
                chromeMcpFailed.value = true;
              } else if (
                data.task === "session_creation_failed" ||
                data.task === "opencode_not_installed" ||
                data.task === "web_start_timeout"
              ) {
                serviceStatus.value = "failed";
              } else if (serviceStatus.value === "idle") {
                serviceStatus.value = "starting";
              }
            } else if (data.type === "CLEAR_ELEMENTS") {
              selectedElements.value = [];
            }
          } catch {
            // ignore
          }
        };

        sseConnection.onerror = () => {
          sseConnection?.close();
          sseConnection = null;

          // 连接断开时标记状态为可能不可用，等待重连恢复
          if (serviceStatus.value === "ready" || serviceStatus.value === "partial") {
            serviceStatus.value = "starting";
          }

          if (sseRetryCount < MAX_SSE_RETRIES) {
            sseRetryCount++;
            setTimeout(setupSSE, SSE_RETRY_DELAY * sseRetryCount); // 指数退避
          }
        };
      } catch {
        sseConnection = null;
        if (sseRetryCount < MAX_SSE_RETRIES) {
          sseRetryCount++;
          setTimeout(setupSSE, SSE_RETRY_DELAY * sseRetryCount); // 指数退避
        }
      }
    };

    let currentPageUrl = "";
    let currentPageTitle = "";
    const updateContext = (force = false) => {
      if (serviceStatus.value === "idle") return;
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
      if (serviceStatus.value !== "idle") return true;
      try {
        const res = await fetch("/__opencode_start__");
        const data = await res.json();
        if (data.success) {
          serviceStatus.value = "starting";
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

      // 监听路由变化 - 使用 requestAnimationFrame 确保在框架导航完成后执行
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      const scheduleContextUpdate = () => {
        requestAnimationFrame(() => updateContext());
      };
      history.pushState = function (...args) {
        originalPushState.apply(this, args);
        scheduleContextUpdate();
      };
      history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        scheduleContextUpdate();
      };
      window.addEventListener("popstate", scheduleContextUpdate);
      window.addEventListener("hashchange", scheduleContextUpdate);

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
      // 打开面板时重置 iframe 加载状态
      if (val) {
        iframeLoading.value = false;
      }
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
          showError: chromeMcpFailed.value,
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
            chromeMcpFailed.value
              ? h("div", { class: "opencode-chrome-warmup-failed" }, [
                  h("div", { class: "opencode-chrome-warmup-failed-icon" }, [
                    h(
                      "svg",
                      {
                        viewBox: "0 0 24 24",
                        width: "48",
                        height: "48",
                        fill: "none",
                        stroke: "currentColor",
                        strokeWidth: "1.5",
                      },
                      [
                        h("path", {
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
                        }),
                      ],
                    ),
                  ]),
                  h(
                    "div",
                    { class: "opencode-chrome-warmup-failed-title" },
                    "Chrome DevTools MCP 连接失败",
                  ),
                  h("div", { class: "opencode-chrome-warmup-failed-text" }, [
                    h("p", {}, "请按以下步骤开启 Chrome 远程调试："),
                    h("ol", { class: "opencode-chrome-warmup-steps" }, [
                      h("li", {}, [
                        "在 Chrome 地址栏输入 ",
                        h(
                          "code",
                          { class: "opencode-chrome-warmup-code" },
                          "chrome://inspect/#remote-debugging",
                        ),
                      ]),
                      h("li", {}, "勾选 'Allow remote debugging for this browser instance' 选项"),
                      h("li", {}, "重新启动浏览器"),
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
  const app = createApp(App);
  app.mount(container);

  // 添加清理函数到 window，便于热更新或测试时清理
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__OPENCODE_CLEANUP__ = () => {
    app.unmount();
    container.remove();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[INIT_MARKER] = false;
  };
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
