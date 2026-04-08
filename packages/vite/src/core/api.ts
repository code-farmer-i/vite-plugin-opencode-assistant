import http from "http";
import type { SessionInfo } from "@vite-plugin-opencode-assistant/shared";
import {
  PerformanceTimer,
  createLogger,
  DEFAULT_RETRIES,
  RETRY_DELAY,
} from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("API");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64Encode(str: string): string {
  return Buffer.from(str).toString("base64");
}

export class OpenCodeAPI {
  constructor(
    private hostname: string,
    private getPort: () => number,
    private warmupChromeMcpConfig: boolean = false
  ) {}

  private createHttpRequest<T>(options: http.RequestOptions, body?: string): Promise<T> {
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
          } catch {
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

  async getSessions(retries = DEFAULT_RETRIES): Promise<SessionInfo[]> {
    const timer = log.timer("getSessions", { retries });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, { operation: "getSessions" });
        const sessions = await this.createHttpRequest<SessionInfo[]>({
          hostname: this.hostname,
          port: this.getPort(),
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

  async createSession(retries = DEFAULT_RETRIES, title?: string): Promise<SessionInfo> {
    const timer = log.timer("createSession", { retries, title });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "createSession",
          title,
        });
        const requestBody = title ? JSON.stringify({ title }) : undefined;
        const session = await this.createHttpRequest<SessionInfo>(
          {
            hostname: this.hostname,
            port: this.getPort(),
            path: "/session",
            method: "POST",
            headers: requestBody ? { "Content-Type": "application/json" } : undefined,
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

  async deleteSession(sessionId: string, retries = DEFAULT_RETRIES): Promise<void> {
    const timer = log.timer("deleteSession", { sessionId, retries });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "deleteSession",
          sessionId,
        });
        await this.createHttpRequest<void>({
          hostname: this.hostname,
          port: this.getPort(),
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

  async getToolIds(retries = DEFAULT_RETRIES): Promise<string[]> {
    const timer = log.timer("getToolIds", { retries });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "getToolIds",
        });
        const toolIds = await this.createHttpRequest<string[]>({
          hostname: this.hostname,
          port: this.getPort(),
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

  async warmupChromeMcp(viteOrigin?: string): Promise<void> {
    if (!this.warmupChromeMcpConfig) return;

    const timer = log.timer("warmupChromeMcp", { viteOrigin });
    let warmupSessionId: string | null = null;

    try {
      const warmupSession = await this.createSession(DEFAULT_RETRIES, "__chrome_mcp_warmup__");
      warmupSessionId = warmupSession.id;
      let chromeToolIds: string[] | undefined;

      try {
        const toolIds = await this.getToolIds();
        chromeToolIds = toolIds.filter((toolId) => /chrome[-_]?devtools/i.test(toolId));
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

      await this.createHttpRequest<unknown>(
        {
          hostname: this.hostname,
          port: this.getPort(),
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
          await this.deleteSession(warmupSessionId);
        } catch (e) {
          log.debug("Failed to delete warmup session", {
            error: e,
            warmupSessionId,
          });
        }
      }
    }
  }

  async getOrCreateSession(): Promise<string> {
    const timer = log.timer("getOrCreateSession");
    const projectDir = process.cwd();

    log.debug("Getting sessions...", { projectDir });
    const sessions = await this.getSessions();
    log.debug(`Found ${sessions.length} sessions`, {
      sessions: sessions.map((s) => ({ id: s.id, directory: s.directory })),
    });

    const matchingSession = sessions.find((s) => s.directory === projectDir);

    if (matchingSession) {
      const url = `http://${this.hostname}:${this.getPort()}/${base64Encode(projectDir)}/session/${matchingSession.id}`;
      timer.end(`Using existing session: ${matchingSession.id}`);
      return url;
    }

    log.debug("Creating new session...", { projectDir });
    const newSession = await this.createSession();
    const url = `http://${this.hostname}:${this.getPort()}/${base64Encode(projectDir)}/session/${newSession.id}`;
    timer.end(`Created new session: ${newSession.id}`);
    return url;
  }
}
