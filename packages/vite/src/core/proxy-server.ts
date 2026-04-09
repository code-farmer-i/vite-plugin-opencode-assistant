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
  });

  // === 就绪通知 ===
  window.addEventListener("load", function() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "OPENCODE_READY" }, "*");
    }
  });
})();
`;
}

export function startProxyServer(
  targetUrl: string,
  port: number,
  options: ProxyServerOptions = {},
): http.Server {
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

    const options: http.RequestOptions = {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
        // Don't accept compressed responses so we can modify HTML
        "accept-encoding": "identity",
      },
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const rawContentType = proxyRes.headers["content-type"];
      const contentType = Array.isArray(rawContentType)
        ? (rawContentType[0] ?? "")
        : (rawContentType ?? "");

      // For HTML responses, inject PostMessage bridge script
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

          // Remove content-encoding since we're sending uncompressed modified content
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

    req.pipe(proxyReq);
  });

  server.listen(port, () => {
    log.info(`Proxy server started on port ${port} -> ${targetUrl}`);
  });

  return server;
}
