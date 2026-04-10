import type { ResultPromise } from "execa";
import type http from "http";
import { prepareOpenCodeRuntime, startOpenCodeWeb } from "@vite-plugin-opencode-assistant/opencode";
import type { OpenCodeOptions, ServiceStartupTask } from "@vite-plugin-opencode-assistant/shared";
import {
  DEFAULT_PROXY_PORT,
  SERVER_START_TIMEOUT,
  createLogger,
} from "@vite-plugin-opencode-assistant/shared";
import {
  checkOpenCodeInstalled,
  findAvailablePort,
  killOrphanOpenCodeProcesses,
  waitForServer,
} from "../utils/system.js";
import type { OpenCodeAPI } from "./api.js";
import { startProxyServer } from "./proxy-server.js";

const log = createLogger("Service");

export class OpenCodeService {
  public webProcess: ResultPromise | null = null;
  public actualWebPort: number;
  public actualProxyPort: number;
  public isStarted = false;
  private startPromise: Promise<void> | null = null;
  public sessionUrl: string | null = null;
  private proxyServer: http.Server | null = null;
  public chromeMcpWarmupFailed = false;
  public currentTask: { task: ServiceStartupTask; data?: Record<string, unknown> } | null = null;

  constructor(
    private config: Required<OpenCodeOptions>,
    private api: OpenCodeAPI,
    private sseClients: Set<http.ServerResponse>,
    private onPortAllocated: (port: number) => void,
    private onProxyPortAllocated: (port: number) => void,
  ) {
    this.actualWebPort = config.webPort;
    this.actualProxyPort = config.proxyPort ?? DEFAULT_PROXY_PORT;
  }

  private sendTaskUpdate(task: ServiceStartupTask, data?: Record<string, unknown>) {
    this.currentTask = { task, ...data };
    this.sseClients.forEach((client) => {
      try {
        client.write(`data: ${JSON.stringify({ type: "TASK_UPDATE", task, ...data })}\n\n`);
      } catch (e) {
        log.debug("Failed to send TASK_UPDATE event", { error: e });
      }
    });
  }

  async start(corsOrigins?: string[], contextApiUrl?: string, viteOrigin?: string): Promise<void> {
    if (this.isStarted && this.webProcess) {
      log.debug("Services already started, skipping");
      return;
    }
    if (this.startPromise) {
      log.debug("Waiting for existing start promise");
      return this.startPromise;
    }

    this.startPromise = (async () => {
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

      this.sendTaskUpdate("checking_opencode");
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
        this.sendTaskUpdate("opencode_not_installed");
        this.startPromise = null;
        timer.end("❌ OpenCode not installed");
        return;
      }

      timer.checkpoint("OpenCode installation verified");

      this.sendTaskUpdate("allocating_port");
      this.actualWebPort = await findAvailablePort(this.config.webPort, this.config.hostname);
      this.onPortAllocated(this.actualWebPort);

      if (this.actualWebPort !== this.config.webPort) {
        log.info(`Port ${this.config.webPort} is in use, using ${this.actualWebPort} instead`);
      } else {
        log.debug(`Using port ${this.actualWebPort}`);
      }

      timer.checkpoint("Port allocated");

      this.sendTaskUpdate("preparing_runtime");
      const configDir = prepareOpenCodeRuntime(process.cwd());

      timer.checkpoint("Plugin setup complete");

      this.sendTaskUpdate("starting_web");
      log.debug("Starting OpenCode Web process...", {
        port: this.actualWebPort,
        hostname: this.config.hostname,
        configDir,
      });

      this.webProcess = startOpenCodeWeb({
        port: this.actualWebPort,
        hostname: this.config.hostname,
        serverUrl: "",
        cwd: process.cwd(),
        configDir,
        corsOrigins,
        contextApiUrl,
      });

      timer.checkpoint("Web process started");
      const webUrl = `http://${this.config.hostname}:${this.actualWebPort}`;
      log.info(`Waiting for OpenCode Web to become ready at ${webUrl}...`);

      this.sendTaskUpdate("waiting_web_ready");
      try {
        await waitForServer(webUrl, SERVER_START_TIMEOUT, this.webProcess);

        if (this.webProcess?.exitCode !== null && this.webProcess?.exitCode !== undefined) {
          throw new Error(`OpenCode process exited with code ${this.webProcess.exitCode}`);
        }

        log.info(`OpenCode Web started at ${webUrl}`);
      } catch (e) {
        log.error("OpenCode Web failed to start", { error: e });
        this.sendTaskUpdate("web_start_timeout");
        this.startPromise = null;
        timer.end("❌ Web start timeout");
        return;
      }

      this.sendTaskUpdate("starting_proxy");
      let proxyStartPort = this.config.proxyPort ?? DEFAULT_PROXY_PORT;
      if (proxyStartPort === this.actualWebPort) {
        proxyStartPort = this.actualWebPort + 1;
        log.debug(`Proxy start port conflicts with web port, using ${proxyStartPort} instead`);
      }
      this.actualProxyPort = await findAvailablePort(proxyStartPort, this.config.hostname);
      this.onProxyPortAllocated(this.actualProxyPort);

      if (this.actualProxyPort !== (this.config.proxyPort ?? DEFAULT_PROXY_PORT)) {
        log.info(
          `Proxy port ${this.config.proxyPort ?? DEFAULT_PROXY_PORT} is in use, using ${this.actualProxyPort} instead`,
        );
      } else {
        log.debug(`Using proxy port ${this.actualProxyPort}`);
      }

      try {
        const result = await startProxyServer(webUrl, this.actualProxyPort, {
          theme: this.config.theme,
          language: this.config.language,
          settings: this.config.settings,
        });
        this.proxyServer = result.server;
        if (result.actualPort !== this.actualProxyPort) {
          log.info(
            `Proxy port ${this.actualProxyPort} was taken, using ${result.actualPort} instead`,
          );
          this.actualProxyPort = result.actualPort;
          this.onProxyPortAllocated(this.actualProxyPort);
        }
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === "EADDRINUSE") {
          log.warn(`Proxy port ${this.actualProxyPort} became unavailable, trying next port...`);
          const nextPort = await findAvailablePort(this.actualProxyPort + 1, this.config.hostname);
          const result = await startProxyServer(webUrl, nextPort, {
            theme: this.config.theme,
            language: this.config.language,
            settings: this.config.settings,
          });
          this.proxyServer = result.server;
          this.actualProxyPort = result.actualPort;
          this.onProxyPortAllocated(this.actualProxyPort);
          log.info(`Proxy server started on fallback port ${this.actualProxyPort}`);
        } else {
          throw err;
        }
      }
      timer.checkpoint("Proxy server started");

      this.sendTaskUpdate("warming_up_chrome");
      let warmupFailed = false;
      try {
        await this.api.warmupChromeMcp(viteOrigin);
        timer.checkpoint("Chrome MCP warmup complete");
      } catch (e) {
        log.warn("Chrome MCP warmup failed", { error: e });
        this.chromeMcpWarmupFailed = true;
        warmupFailed = true;
      }

      this.sendTaskUpdate("creating_session");
      let sessionFailed = false;
      try {
        this.sessionUrl = await this.api.getOrCreateSession();
        timer.checkpoint("Session created");
        log.debug(`Session URL: ${this.sessionUrl}`);
      } catch (e) {
        log.warn("Failed to get/create session", { error: e });
        sessionFailed = true;
      }

      if (sessionFailed) {
        this.sendTaskUpdate("session_creation_failed");
        this.isStarted = false;
        this.startPromise = null; // 清理启动 Promise，允许重试
      } else if (warmupFailed) {
        this.sendTaskUpdate("chrome_mcp_failed", { sessionUrl: this.sessionUrl }); // 传递 sessionUrl 让客户端可用
        this.isStarted = true;
      } else {
        this.sendTaskUpdate("ready", { sessionUrl: this.sessionUrl });
      }
      if (!sessionFailed) {
        this.isStarted = true;
      } else {
        this.sessionUrl = null; // 失败时清理 sessionUrl
      }
      log.debug(`OpenCode services started successfully: ${this.sessionUrl || webUrl}`);
      timer.end("✓ Services started successfully");
    })();

    return this.startPromise;
  }

  async retryWarmupChromeMcp(viteOrigin?: string): Promise<boolean> {
    const success = await this.api.retryWarmupChromeMcp(viteOrigin);
    if (success) {
      this.chromeMcpWarmupFailed = false;
      this.sendTaskUpdate("ready", { sessionUrl: this.sessionUrl });
    }
    return success;
  }

  async stop(): Promise<void> {
    const timer = log.timer("stopServices");
    log.info("Stopping OpenCode services...");

    if (this.proxyServer) {
      log.debug("Closing proxy server");
      this.proxyServer.close();
      this.proxyServer = null;
    }

    if (this.webProcess) {
      log.debug("Killing web process", { pid: this.webProcess.pid });
      this.webProcess.kill("SIGTERM");
      this.webProcess = null;
    }

    this.isStarted = false;
    this.startPromise = null;
    timer.end("✓ Services stopped");
  }
}
