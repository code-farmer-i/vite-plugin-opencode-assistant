import type { ResultPromise } from "execa";
import type http from "http";
import { prepareOpenCodeRuntime, startOpenCodeWeb } from "@vite-plugin-opencode-assistant/opencode";
import type { OpenCodeOptions } from "@vite-plugin-opencode-assistant/shared";
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

      this.actualWebPort = await findAvailablePort(this.config.webPort, this.config.hostname);
      this.onPortAllocated(this.actualWebPort);

      if (this.actualWebPort !== this.config.webPort) {
        log.info(`Port ${this.config.webPort} is in use, using ${this.actualWebPort} instead`);
      } else {
        log.debug(`Using port ${this.actualWebPort}`);
      }

      timer.checkpoint("Port allocated");

      const configDir = prepareOpenCodeRuntime(process.cwd());

      timer.checkpoint("Plugin setup complete");

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

      await waitForServer(webUrl, SERVER_START_TIMEOUT);
      log.info(`OpenCode Web started at ${webUrl}`);

      this.actualProxyPort = await findAvailablePort(
        this.config.proxyPort ?? DEFAULT_PROXY_PORT,
        this.config.hostname,
      );
      this.onProxyPortAllocated(this.actualProxyPort);

      if (this.actualProxyPort !== (this.config.proxyPort ?? DEFAULT_PROXY_PORT)) {
        log.info(
          `Proxy port ${this.config.proxyPort ?? DEFAULT_PROXY_PORT} is in use, using ${this.actualProxyPort} instead`,
        );
      } else {
        log.debug(`Using proxy port ${this.actualProxyPort}`);
      }

      this.proxyServer = startProxyServer(webUrl, this.actualProxyPort, {
        theme: this.config.theme,
        language: this.config.language,
        settings: this.config.settings,
      });
      timer.checkpoint("Proxy server started");

      await this.api.warmupChromeMcp(viteOrigin);
      timer.checkpoint("Chrome MCP warmup complete");

      try {
        this.sessionUrl = await this.api.getOrCreateSession();
        timer.checkpoint("Session created");
        log.debug(`Session URL: ${this.sessionUrl}`);

        this.sseClients.forEach((client) => {
          try {
            client.write(
              `data: ${JSON.stringify({ type: "SESSION_READY", sessionUrl: this.sessionUrl })}\n\n`,
            );
          } catch (e) {
            log.debug("Failed to send SESSION_READY event", { error: e });
          }
        });
      } catch (e) {
        log.warn("Failed to get/create session", { error: e });
      }

      this.isStarted = true;
      log.debug(`OpenCode services started successfully: ${this.sessionUrl || webUrl}`);
      timer.end("✓ Services started successfully");
    })();

    return this.startPromise;
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
