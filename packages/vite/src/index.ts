import type { Plugin, ViteDevServer } from "vite";
import type { ResultPromise } from "execa";
import fs from "fs";
import http from "http";
import { createRequire } from "module";
import path from "path";
import Inspector from "unplugin-vue-inspector/vite";
import {
  prepareOpenCodeRuntime,
  startOpenCodeWeb,
} from "@vite-plugin-opencode-assistant/opencode";
import type {
  OpenCodeOptions,
  PageContext,
  SessionInfo,
} from "@vite-plugin-opencode-assistant/shared";
import {
  CONTEXT_API_PATH,
  DEFAULT_CONFIG,
  DEFAULT_RETRIES,
  RETRY_DELAY,
  SESSIONS_API_PATH,
  SERVER_START_TIMEOUT,
  SSE_EVENTS_PATH,
  START_API_PATH,
  WIDGET_SCRIPT_PATH,
} from "@vite-plugin-opencode-assistant/shared";
import {
  PerformanceTimer,
  RequestContext,
  createLogger,
  setVerbose,
} from "@vite-plugin-opencode-assistant/shared";

const require = createRequire(path.join(process.cwd(), "package.json"));
const packageDir = resolvePackageDir();
import { injectWidget } from "./injector.js";
import {
  checkOpenCodeInstalled,
  findAvailablePort,
  killOrphanOpenCodeProcesses,
  waitForServer,
} from "./utils.js";

export default function opencodePlugin(
  options: OpenCodeOptions = {},
): Plugin[] {
  const plugins: Plugin[] = [];

  plugins.push(
    ...Inspector({
      enabled: false,
      toggleButtonVisibility: "never",
      toggleComboKey: false,
    }),
  );

  plugins.push(createOpenCodePlugin(options));

  return plugins;
}

function createOpenCodePlugin(options: OpenCodeOptions = {}): Plugin {
  let webProcess: ResultPromise | null = null;
  let sessionUrl: string | null = null;
  let actualWebPort: number = DEFAULT_CONFIG.webPort;
  let isStarted = false;
  let startPromise: Promise<void> | null = null;
  let pageContext: PageContext = { url: "", title: "" };

  const sseClients: Set<http.ServerResponse> = new Set();

  const config = { ...DEFAULT_CONFIG, ...options };

  setVerbose(config.verbose);

  const log = createLogger("Plugin");

  function base64Encode(str: string): string {
    return Buffer.from(str).toString("base64");
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createHttpRequest<T>(
    options: http.RequestOptions,
    body?: string,
  ): Promise<T> {
    const timer = new PerformanceTimer("HTTP Request", {
      operation: `${options.method || "GET"} ${options.path}`,
    });

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            timer.end(`✓ Status: ${res.statusCode}`);
            resolve(result);
          } catch (e) {
            timer.end("❌ JSON parse error");
            reject(new Error(`JSON parse error: ${data.substring(0, 100)}`));
          }
        });
      });
      req.on("error", (e) => {
        timer.end("❌ Request failed");
        reject(e);
      });
      if (body) req.write(body);
      req.end();
    });
  }

  async function getSessions(
    retries = DEFAULT_RETRIES,
  ): Promise<SessionInfo[]> {
    const timer = log.timer("getSessions", { retries });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, { operation: "getSessions" });
        const sessions = await createHttpRequest<SessionInfo[]>({
          hostname: config.hostname,
          port: actualWebPort,
          path: "/session",
        });
        timer.end(`Found ${sessions.length} sessions`);
        return sessions;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        log.debug(`Attempt ${i + 1} failed: ${lastError.message}`, {
          operation: "getSessions",
        });
        if (i < retries - 1) {
          log.debug(`Retrying in ${RETRY_DELAY}ms...`, {
            operation: "getSessions",
          });
          await sleep(RETRY_DELAY);
        }
      }
    }

    timer.end("❌ All retries exhausted");
    throw lastError;
  }

  async function createSession(
    retries = DEFAULT_RETRIES,
    title?: string,
  ): Promise<SessionInfo> {
    const timer = log.timer("createSession", { retries, title });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "createSession",
          title,
        });
        const requestBody = title ? JSON.stringify({ title }) : undefined;
        const session = await createHttpRequest<SessionInfo>(
          {
            hostname: config.hostname,
            port: actualWebPort,
            path: "/session",
            method: "POST",
            headers: requestBody
              ? { "Content-Type": "application/json" }
              : undefined,
          },
          requestBody,
        );
        timer.end(`Created session: ${session.id}`);
        return session;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        log.debug(`Attempt ${i + 1} failed: ${lastError.message}`, {
          operation: "createSession",
        });
        if (i < retries - 1) {
          log.debug(`Retrying in ${RETRY_DELAY}ms...`, {
            operation: "createSession",
          });
          await sleep(RETRY_DELAY);
        }
      }
    }

    timer.end("❌ All retries exhausted");
    throw lastError;
  }

  async function deleteSession(
    sessionId: string,
    retries = DEFAULT_RETRIES,
  ): Promise<void> {
    const timer = log.timer("deleteSession", { sessionId, retries });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "deleteSession",
          sessionId,
        });
        await createHttpRequest<void>({
          hostname: config.hostname,
          port: actualWebPort,
          path: `/session/${sessionId}`,
          method: "DELETE",
        });
        timer.end(`Deleted session: ${sessionId}`);
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        log.debug(`Attempt ${i + 1} failed: ${lastError.message}`, {
          operation: "deleteSession",
          sessionId,
        });
        if (i < retries - 1) {
          log.debug(`Retrying in ${RETRY_DELAY}ms...`, {
            operation: "deleteSession",
            sessionId,
          });
          await sleep(RETRY_DELAY);
        }
      }
    }

    timer.end("❌ All retries exhausted");
    throw lastError;
  }

  async function getToolIds(retries = DEFAULT_RETRIES): Promise<string[]> {
    const timer = log.timer("getToolIds", { retries });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "getToolIds",
        });
        const toolIds = await createHttpRequest<string[]>({
          hostname: config.hostname,
          port: actualWebPort,
          path: "/experimental/tool/ids",
        });
        timer.end(`Found ${toolIds.length} tools`);
        return toolIds;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        log.debug(`Attempt ${i + 1} failed: ${lastError.message}`, {
          operation: "getToolIds",
        });
        if (i < retries - 1) {
          log.debug(`Retrying in ${RETRY_DELAY}ms...`, {
            operation: "getToolIds",
          });
          await sleep(RETRY_DELAY);
        }
      }
    }

    timer.end("❌ All retries exhausted");
    throw lastError;
  }

  async function warmupChromeMcp(viteOrigin?: string): Promise<void> {
    if (!config.warmupChromeMcp) return;

    const timer = log.timer("warmupChromeMcp", { viteOrigin });
    let warmupSessionId: string | null = null;

    try {
      const warmupSession = await createSession(
        DEFAULT_RETRIES,
        "__chrome_mcp_warmup__",
      );
      warmupSessionId = warmupSession.id;
      let chromeToolIds: string[] | undefined;

      try {
        const toolIds = await getToolIds();
        chromeToolIds = toolIds.filter((toolId) =>
          /chrome[-_]?devtools/i.test(toolId),
        );
        log.debug("Resolved Chrome MCP tool ids", {
          chromeToolIds,
        });
      } catch (e) {
        log.debug("Failed to resolve Chrome MCP tool ids", { error: e });
      }

      const prompt = [
        "Call the browser tool list_pages immediately to establish the Chrome DevTools MCP connection.",
        viteOrigin
          ? `If there are no pages, call new_page with ${viteOrigin}.`
          : "If there are no pages, call new_page with about:blank.",
        "Do not read or modify project files.",
        "Do not use any non-browser tools.",
        "After the tool call is complete, reply with exactly: ready",
      ].join(" ");

      await createHttpRequest<unknown>(
        {
          hostname: config.hostname,
          port: actualWebPort,
          path: `/session/${warmupSessionId}/message`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        JSON.stringify({
          system:
            "You are warming up Chrome DevTools MCP during startup. You must use the available browser tools immediately before replying.",
          tools: chromeToolIds?.length ? chromeToolIds : undefined,
          parts: [{ type: "text", text: prompt }],
        }),
      );

      timer.end("Chrome MCP warmed up");
    } catch (e) {
      log.warn("Failed to warm up Chrome MCP", { error: e });
      timer.end("Chrome MCP warmup skipped");
    } finally {
      if (warmupSessionId) {
        try {
          await deleteSession(warmupSessionId);
        } catch (e) {
          log.debug("Failed to delete warmup session", {
            error: e,
            warmupSessionId,
          });
        }
      }
    }
  }

  async function getOrCreateSession(): Promise<string> {
    const timer = log.timer("getOrCreateSession");
    const projectDir = process.cwd();

    log.debug("Getting sessions...", { projectDir });
    const sessions = await getSessions();
    log.debug(`Found ${sessions.length} sessions`, {
      sessions: sessions.map((s) => ({ id: s.id, directory: s.directory })),
    });

    const matchingSession = sessions.find((s) => s.directory === projectDir);

    if (matchingSession) {
      const url = `http://${config.hostname}:${actualWebPort}/${base64Encode(projectDir)}/session/${matchingSession.id}`;
      timer.end(`Using existing session: ${matchingSession.id}`);
      return url;
    }

    log.debug("Creating new session...", { projectDir });
    const newSession = await createSession();
    const url = `http://${config.hostname}:${actualWebPort}/${base64Encode(projectDir)}/session/${newSession.id}`;
    timer.end(`Created new session: ${newSession.id}`);
    return url;
  }

  async function startServices(
    corsOrigins?: string[],
    contextApiUrl?: string,
    viteOrigin?: string,
  ): Promise<void> {
    if (isStarted && webProcess) {
      log.debug("Services already started, skipping");
      return;
    }
    if (startPromise) {
      log.debug("Waiting for existing start promise");
      return startPromise;
    }

    startPromise = (async () => {
      const timer = log.timer("startServices", {
        corsOrigins,
        contextApiUrl,
        viteOrigin,
      });
      log.info("Starting OpenCode services...");

      const orphanCount = await killOrphanOpenCodeProcesses();
      if (orphanCount > 0) {
        log.debug(`Killed ${orphanCount} orphan OpenCode process(es)`);
      }

      if (!(await checkOpenCodeInstalled())) {
        log.error(`OpenCode is not installed!

Please install OpenCode first:

  # YOLO
  curl -fsSL https://opencode.ai/install | bash

  # Package managers
  npm i -g opencode-ai@latest        # or bun/pnpm/yarn
  scoop install opencode             # Windows
  choco install opencode             # Windows
  brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
  brew install opencode              # macOS and Linux (official brew formula, updated less)
  sudo pacman -S opencode            # Arch Linux (Stable)
  paru -S opencode-bin               # Arch Linux (Latest from AUR)
  mise use -g opencode               # Any OS
  nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
        `);
        timer.end("❌ OpenCode not installed");
        return;
      }

      timer.checkpoint("OpenCode installation verified");

      actualWebPort = await findAvailablePort(config.webPort, config.hostname);
      if (actualWebPort !== config.webPort) {
        log.info(
          `Port ${config.webPort} is in use, using ${actualWebPort} instead`,
        );
      } else {
        log.debug(`Using port ${actualWebPort}`);
      }

      timer.checkpoint("Port allocated");

      const configDir = prepareOpenCodeRuntime(process.cwd());

      timer.checkpoint("Plugin setup complete");

      log.debug("Starting OpenCode Web process...", {
        port: actualWebPort,
        hostname: config.hostname,
        configDir,
      });

      webProcess = startOpenCodeWeb({
        port: actualWebPort,
        hostname: config.hostname,
        serverUrl: "",
        cwd: process.cwd(),
        configDir,
        corsOrigins,
        contextApiUrl,
      });

      timer.checkpoint("Web process started");
      const webUrl = `http://${config.hostname}:${actualWebPort}`;
      log.info(`Waiting for OpenCode Web to become ready at ${webUrl}...`);

      await waitForServer(webUrl, SERVER_START_TIMEOUT);
      log.info(`OpenCode Web started at ${webUrl}`);

      await warmupChromeMcp(viteOrigin);
      timer.checkpoint("Chrome MCP warmup complete");

      try {
        sessionUrl = await getOrCreateSession();
        timer.checkpoint("Session created");
        log.debug(`Session URL: ${sessionUrl}`);

        sseClients.forEach((client) => {
          try {
            client.write(
              `data: ${JSON.stringify({ type: "SESSION_READY", sessionUrl })}\n\n`,
            );
          } catch (e) {
            log.debug("Failed to send SESSION_READY event", { error: e });
          }
        });
      } catch (e) {
        log.warn("Failed to get/create session", { error: e });
      }

      isStarted = true;
      log.debug(
        `OpenCode services started successfully: ${sessionUrl || webUrl}`,
      );
      timer.end("✓ Services started successfully");
    })();

    return startPromise;
  }

  async function stopServices(): Promise<void> {
    const timer = log.timer("stopServices");
    log.info("Stopping OpenCode services...");

    if (webProcess) {
      log.debug("Killing web process", { pid: webProcess.pid });
      webProcess.kill("SIGTERM");
      webProcess = null;
    }

    isStarted = false;
    startPromise = null;
    timer.end("✓ Services stopped");
  }

  function handleContextRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    const ctx = new RequestContext(req.method || "GET", CONTEXT_API_PATH);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      ctx.end(200);
      return;
    }

    if (req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify(pageContext));
      ctx.end(200);
      return;
    }

    if (req.method === "DELETE") {
      pageContext.selectedElements = [];
      log.debug("Selected elements cleared", { sseClients: sseClients.size });

      let sentCount = 0;
      sseClients.forEach((client) => {
        try {
          client.write(
            `data: ${JSON.stringify({ type: "CLEAR_ELEMENTS" })}\n\n`,
          );
          sentCount++;
        } catch (e) {
          log.debug("Failed to send SSE message", { error: e });
        }
      });
      log.debug("SSE messages sent", {
        count: sentCount,
        totalClients: sseClients.size,
      });

      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
      ctx.end(200);
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          pageContext = {
            url: data.url || "",
            title: data.title || "",
            selectedElements: data.selectedElements || [],
          };
          log.debug("Context updated", {
            url: pageContext.url,
            title: pageContext.title,
            selectedElementsCount: pageContext.selectedElements?.length || 0,
          });

          if (
            pageContext.selectedElements &&
            pageContext.selectedElements.length > 0
          ) {
            log.debug("Selected elements details", {
              elements: pageContext.selectedElements.map((el) => ({
                filePath: el.filePath,
                line: el.line,
                text: el.innerText?.substring(0, 50),
              })),
            });
          }

          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
          ctx.end(200);
        } catch (e) {
          log.debug("Invalid JSON in request body", { error: e });
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          ctx.end(400);
        }
      });
      return;
    }

    res.writeHead(405);
    res.end(JSON.stringify({ error: "Method not allowed" }));
    ctx.end(405);
  }

  return {
    name: "vite-plugin-opencode",
    apply(_viteConfig, env) {
      if (!config.enabled) return false;

      return env.command === "serve" && process.env.NODE_ENV !== "test";
    },

    async configureServer(server: ViteDevServer) {
      const timer = log.timer("configureServer");

      server.middlewares.use(WIDGET_SCRIPT_PATH, async (_req, res) => {
        const ctx = new RequestContext("GET", WIDGET_SCRIPT_PATH);
        const widgetPath = resolveWidgetPath();

        if (fs.existsSync(widgetPath)) {
          res.setHeader("Content-Type", "application/javascript");
          res.setHeader("Access-Control-Allow-Origin", "*");
          fs.createReadStream(widgetPath).pipe(res);
          ctx.end(200);
        } else {
          res.writeHead(404);
          res.end("Widget script not found");
          ctx.end(404);
        }
      });

      server.middlewares.use(CONTEXT_API_PATH, async (req, res) => {
        handleContextRequest(req as http.IncomingMessage, res);
      });

      server.middlewares.use(START_API_PATH, async (_req, res) => {
        const ctx = new RequestContext("GET", START_API_PATH);

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, sessionUrl }));
        ctx.end(200);
      });

      server.middlewares.use(SSE_EVENTS_PATH, async (req, res) => {
        const ctx = new RequestContext("GET", SSE_EVENTS_PATH);

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        sseClients.add(res);
        log.debug("SSE client connected", { totalClients: sseClients.size });

        res.write(`data: ${JSON.stringify({ type: "CONNECTED" })}\n\n`);

        if (sessionUrl) {
          res.write(
            `data: ${JSON.stringify({ type: "SESSION_READY", sessionUrl })}\n\n`,
          );
        }

        req.on("close", () => {
          sseClients.delete(res);
          log.debug("SSE client disconnected", {
            totalClients: sseClients.size,
          });
        });

        ctx.end(200);
      });

      server.middlewares.use(SESSIONS_API_PATH, async (req, res) => {
        const ctx = new RequestContext(req.method || "GET", SESSIONS_API_PATH);

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, DELETE, OPTIONS",
        );
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
          res.writeHead(200);
          res.end();
          ctx.end(200);
          return;
        }

        try {
          if (req.method === "GET") {
            ctx.checkpoint("Fetching sessions");
            const sessions = await getSessions();
            res.writeHead(200);
            res.end(JSON.stringify(sessions));
            ctx.end(200);
          } else if (req.method === "POST") {
            ctx.checkpoint("Creating session");
            const newSession = await createSession();
            res.writeHead(200);
            res.end(JSON.stringify(newSession));
            ctx.end(200);
          } else if (req.method === "DELETE") {
            const url = new URL(req.url || "", `http://${req.headers.host}`);
            const sessionId = url.searchParams.get("id");

            if (!sessionId) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: "Session ID is required" }));
              ctx.end(400);
              return;
            }

            ctx.checkpoint(`Deleting session: ${sessionId}`);
            await deleteSession(sessionId);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            ctx.end(200);
          } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            ctx.end(405);
          }
        } catch (e) {
          log.error("Session API error", { error: e, method: req.method });
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(e) }));
          ctx.error(e);
        }
      });

      server.httpServer?.on("listening", async () => {
        log.debug("Vite server listening event fired");

        const address = server.httpServer?.address();
        let vitePort: number;
        let viteHost: string;

        if (address && typeof address === "object") {
          vitePort = address.port;
          const addr = address.address;
          if (addr === "::" || addr === "::1" || addr === "0.0.0.0" || !addr) {
            viteHost = "localhost";
          } else {
            viteHost = addr;
          }
        } else {
          const host = server.config.server.host;
          vitePort = server.config.server.port || 5173;
          viteHost =
            typeof host === "string" &&
            host !== "0.0.0.0" &&
            host !== "::" &&
            host !== "::1"
              ? host
              : "localhost";
        }

        const viteOrigin = `http://${viteHost}:${vitePort}`;
        const contextApiUrl = `http://${viteHost}:${vitePort}${CONTEXT_API_PATH}`;

        log.debug("Vite server ready", {
          vitePort,
          viteHost,
          viteOrigin,
          contextApiUrl,
        });

        try {
          await startServices([viteOrigin], contextApiUrl, viteOrigin);
        } catch (e) {
          log.error("Failed to start services", { error: e });
        }
      });

      server.httpServer?.on("close", () => {
        log.debug("HTTP server closing");
        stopServices();
      });

      const cleanup = async () => {
        log.debug("Process cleanup triggered");
        await stopServices();
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      timer.end("✓ Server configured");
    },

    transformIndexHtml(html) {
      const timer = log.timer("transformIndexHtml");

      const widget = injectWidget({
        webUrl: `http://${config.hostname}:${actualWebPort}`,
        serverUrl: `http://${config.hostname}:${actualWebPort}`,
        position: config.position,
        theme: config.theme,
        open: config.open,
        autoReload: config.autoReload,
        cwd: process.cwd(),
        sessionUrl: sessionUrl || undefined,
        hotkey: config.hotkey,
      });

      timer.end();
      return html.replace("</body>", `${widget}</body>`);
    },
  };
}

function resolvePackageDir(): string {
  const entryPath = require.resolve("vite-plugin-opencode-assistant");
  return path.resolve(path.dirname(entryPath), "..");
}

function resolveWidgetPath(): string {
  const candidatePaths = [
    path.join(packageDir, "es", "client.js"),
    path.join(packageDir, "lib", "client.js"),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return candidatePaths[0];
}
