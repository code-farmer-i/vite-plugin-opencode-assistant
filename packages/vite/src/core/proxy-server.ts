import http from "http";
import {
  createLogger,
  DEFAULT_OPENCODE_SETTINGS,
  OPENCODE_STORAGE_KEYS,
  type OpenCodeSettings,
  type OpenCodeLanguage,
} from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("ProxyServer");

export interface ProxyServerOptions {
  /** 主题模式 */
  theme?: "light" | "dark" | "auto";
  /** OpenCode 界面语言 */
  language?: OpenCodeLanguage;
  /** OpenCode 内部设置 */
  settings?: OpenCodeSettings;
}

/**
 * 深度合并设置对象
 * 只合并用户提供的设置，其余让 OpenCode 自己处理
 */
function mergeSettings(
  defaultSettings: typeof DEFAULT_OPENCODE_SETTINGS,
  userSettings?: OpenCodeSettings,
): OpenCodeSettings {
  if (!userSettings) return defaultSettings;

  const result: OpenCodeSettings = { ...defaultSettings };

  // 只合并用户提供的非 undefined 设置
  if (userSettings.general) {
    result.general = { ...defaultSettings.general, ...userSettings.general };
  }
  if (userSettings.appearance) {
    result.appearance = userSettings.appearance;
  }
  if (userSettings.permissions) {
    result.permissions = userSettings.permissions;
  }
  if (userSettings.notifications) {
    result.notifications = userSettings.notifications;
  }
  if (userSettings.sounds) {
    result.sounds = userSettings.sounds;
  }

  return result;
}

/**
 * 生成 PostMessage Bridge 脚本
 */
function generateBridgeScript(options: ProxyServerOptions): string {
  const { theme = "auto", language, settings } = options;
  const mergedSettings = mergeSettings(DEFAULT_OPENCODE_SETTINGS, settings);

  return `
(function() {
  const STORAGE_KEYS = ${JSON.stringify(OPENCODE_STORAGE_KEYS)};
  const THEME_KEY = STORAGE_KEYS.COLOR_SCHEME;
  const SETTINGS_KEY = STORAGE_KEYS.SETTINGS;

  // === 初始化配置 ===
  const initialConfig = {
    theme: ${JSON.stringify(theme)},
    language: ${JSON.stringify(language || null)},
    settings: ${JSON.stringify(mergedSettings)}
  };

  // 初始化主题
  if (initialConfig.theme && initialConfig.theme !== "auto") {
    localStorage.setItem(THEME_KEY, initialConfig.theme);
    document.documentElement.setAttribute("data-color-scheme", initialConfig.theme);
  }

  // 初始化设置
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(initialConfig.settings));

  // === 主题同步函数 ===
  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || "system";
    } catch {
      return "system";
    }
  }

  function setTheme(theme) {
    try {
      const oldTheme = localStorage.getItem(THEME_KEY);
      localStorage.setItem(THEME_KEY, theme);
      document.documentElement.setAttribute('data-color-scheme', theme);

      if (oldTheme !== theme) {
        window.dispatchEvent(new StorageEvent('storage', {
          key: THEME_KEY,
          oldValue: oldTheme,
          newValue: theme,
          url: window.location.href
        }));
      }
    } catch {
      // ignore
    }
  }

  // === 消息监听 ===
  window.addEventListener("message", function(event) {
    if (event.data && event.data.type === "OPENCODE_SET_THEME") {
      setTheme(event.data.theme);
    }
    
    if (event.data && event.data.type === "OPENCODE_INSERT_FILE_PART") {
      insertFilePart(event.data.element);
    }
  });

  // === 保存输入框光标位置 ===
  let savedRange = null;
  
  function setupPromptInputListener() {
    const promptInput = document.querySelector('[data-component="prompt-input"]');
    if (!promptInput) return;
    
    promptInput.addEventListener('blur', function() {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (promptInput.contains(range.commonAncestorContainer)) {
          savedRange = range.cloneRange();
        }
      }
    });
    
    promptInput.addEventListener('focus', function() {
      savedRange = null;
    });
  }

  // === 插入 File Part 到输入框 ===
  function insertFilePart(element) {
    const promptInput = document.querySelector('[data-component="prompt-input"]');
    if (!promptInput) {
      console.warn('[OpenCode Bridge] Prompt input not found');
      return;
    }

    const { filePath, line, column, description, innerText, previewPageUrl, previewPageTitle } = element;

    const selector = description || 'element';
    let textPreview = '';
    if (innerText && innerText.trim()) {
      const trimmed = innerText.trim();
      textPreview = trimmed.length > 5 ? trimmed.substring(0, 5) + '...' : trimmed;
    }
    const displayText = '@' + selector + (textPreview ? '(' + textPreview + ')' : '');

    const jsonStr = JSON.stringify({
      pageContext: {
        url: previewPageUrl || '',
        title: previewPageTitle || '',
      },
      nodeContext: {
        filePath,
        line,
        column,
        description,
        innerText: innerText ? innerText.substring(0, 500) : ''
      }
    });

    const span = document.createElement('span');
    span.setAttribute('data-type', 'file');
    span.setAttribute('data-path', jsonStr);
    span.setAttribute('contenteditable', 'false');
    
    span.textContent = displayText;

    if (savedRange) {
      const range = savedRange;
      range.collapse(false);
      range.insertNode(span);
      
      const space = document.createTextNode('\\u00A0');
      span.parentNode.insertBefore(space, span.nextSibling);
      
      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      
      promptInput.focus();
      
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
      savedRange = null;
      
      promptInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      if (promptInput.contains(range.commonAncestorContainer)) {
        range.collapse(false);
        range.insertNode(span);
        
        const space = document.createTextNode('\\u00A0');
        span.parentNode.insertBefore(space, span.nextSibling);
        
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    promptInput.appendChild(span);
    const space = document.createTextNode('\\u00A0');
    promptInput.appendChild(space);
    
    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    const newSelection = window.getSelection();
    if (newSelection) {
      newSelection.removeAllRanges();
      newSelection.addRange(newRange);
    }
    
    promptInput.dispatchEvent(new Event('input', { bubbles: true }));
    promptInput.focus();
  }

  // === 思考状态监听 (完全复刻 OpenCode Web 实现) ===
  // OpenCode Web 核心逻辑:
  // working = !!pending() || sessionStatus().type !== "idle"
  // pending = 最后一条未完成的 assistant 消息 (time.completed 不是数字)
  // sessionStatus = sync.data.session_status[sessionID]
  
  let eventSource = null;
  const sessionStatus = {};
  const pendingMessages = {};

  function getCurrentSessionID() {
    const match = window.location.pathname.match(/\\/session\\/([^\\/]+)/);
    return match ? match[1] : null;
  }

  function isPending(message) {
    return message.role === 'assistant' && typeof message.time?.completed !== 'number';
  }

  function updateThinkingState(sessionID) {
    const status = sessionStatus[sessionID];
    const pending = pendingMessages[sessionID];
    
    const isThinking = !!pending || (status && status.type !== 'idle');
    
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'OPENCODE_THINKING_STATE',
        thinking: isThinking,
        sessionID: sessionID,
        statusType: status?.type || 'idle',
        hasPending: !!pending
      }, '*');
    }
  }

  function handleEvent(payload) {
    const type = payload.type;
    const props = payload.properties;

    switch (type) {
      case 'session.status': {
        const sessionID = props.sessionID;
        sessionStatus[sessionID] = props.status;
        updateThinkingState(sessionID);
        break;
      }
      
      case 'message.updated': {
        const info = props.info;
        if (!info || !info.sessionID) break;
        const sessionID = info.sessionID;
        
        if (info.role === 'assistant') {
          if (isPending(info)) {
            pendingMessages[sessionID] = info;
          } else {
            delete pendingMessages[sessionID];
          }
          updateThinkingState(sessionID);
        }
        break;
      }
      
      case 'message.part.delta': {
        const sessionID = props.sessionID;
        if (sessionID && !pendingMessages[sessionID]) {
          pendingMessages[sessionID] = { role: 'assistant', time: {} };
          updateThinkingState(sessionID);
        }
        break;
      }
    }
  }

  function setupThinkingListener() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/global/event');

    eventSource.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        const payload = data.payload;
        if (!payload) return;
        handleEvent(payload);
      } catch (e) {
        // ignore parse errors
      }
    };

    eventSource.onerror = function(err) {
      console.warn('[OpenCode Bridge] SSE connection error, retrying in 3s...');
      eventSource.close();
      setTimeout(setupThinkingListener, 3000);
    };

    console.log('[OpenCode Bridge] SSE listener setup complete');
  }

  // === 就绪通知 ===
  function init() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "OPENCODE_READY" }, "*");
    }
    setupThinkingListener();
    setupPromptInputListener();
    
    const observer = new MutationObserver(function(mutations) {
      const promptInput = document.querySelector('[data-component="prompt-input"]');
      if (promptInput && !promptInput._opencodeListenerAttached) {
        setupPromptInputListener();
        promptInput._opencodeListenerAttached = true;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', function() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  });
})();
`;
}

export interface ProxyServerResult {
  server: http.Server;
  actualPort: number;
}

export function startProxyServer(
  targetUrl: string,
  port: number,
  options: ProxyServerOptions = {},
): Promise<ProxyServerResult> {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const bridgeScript = generateBridgeScript(options);

    const server = http.createServer((req, res) => {
      if (req.url === "/__opencode_bridge__.js") {
        const body = bridgeScript;
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
          "content-length": Buffer.byteLength(body),
        });
        res.end(body);
        return;
      }

      const requestOptions: http.RequestOptions = {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: target.host,
          "accept-encoding": "identity",
        },
        timeout: 0,
      };

      const proxyReq = http.request(requestOptions, (proxyRes) => {
        const rawContentType = proxyRes.headers["content-type"];
        const contentType = Array.isArray(rawContentType)
          ? (rawContentType[0] ?? "")
          : (rawContentType ?? "");

        if (contentType.includes("text/html")) {
          const chunks: Buffer[] = [];

          proxyRes.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
          });

          proxyRes.on("end", () => {
            let body = Buffer.concat(chunks).toString("utf-8");

            if (body.match(/<\/head>/i)) {
              body = body.replace(
                /<\/head>/i,
                '<script src="/__opencode_bridge__.js"></script></head>',
              );
            } else if (body.match(/<\/body>/i)) {
              body = body.replace(
                /<\/body>/i,
                '<script src="/__opencode_bridge__.js"></script></body>',
              );
            } else {
              body += '<script src="/__opencode_bridge__.js"></script>';
            }

            const headers: http.OutgoingHttpHeaders = {};
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (
                value !== undefined &&
                key !== "content-encoding" &&
                key !== "transfer-encoding" &&
                key !== "content-length"
              ) {
                headers[key] = value;
              }
            }
            headers["content-length"] = Buffer.byteLength(body);

            res.writeHead(proxyRes.statusCode || 200, headers);
            res.end(body);
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        }
      });

      proxyReq.on("error", (err) => {
        log.error("Proxy error", { error: err.message, url: req.url });
        res.writeHead(502);
        res.end("Proxy error");
      });

      proxyReq.on("socket", (socket) => {
        socket.setTimeout(0);
      });

      req.on("socket", (socket) => {
        socket.setTimeout(0);
      });

      req.pipe(proxyReq);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    server.timeout = 0;
    server.keepAliveTimeout = 0;

    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      log.info(`Proxy server started on port ${actualPort} -> ${targetUrl}`);
      resolve({ server, actualPort });
    });
  });
}
