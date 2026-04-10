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

function extractTextFromResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  // 处理 { parts: [{ type: "text", text: "..." }] } 格式
  const obj = data as Record<string, unknown>;
  if (obj.parts && Array.isArray(obj.parts)) {
    const textParts = obj.parts
      .filter(
        (p: unknown) =>
          p && typeof p === "object" && (p as Record<string, unknown>).type === "text",
      )
      .map((p: unknown) => (p as Record<string, unknown>).text as string)
      .filter(Boolean);
    if (textParts.length > 0) return textParts.join("");
  }

  // 处理 { text: "..." } 格式
  if (obj.text && typeof obj.text === "string") {
    return obj.text;
  }

  // 处理 { content: "..." } 格式
  if (obj.content && typeof obj.content === "string") {
    return obj.content;
  }

  // 处理 { message: "..." } 格式
  if (obj.message && typeof obj.message === "string") {
    return obj.message;
  }

  // 直接字符串
  if (typeof data === "string") {
    return data;
  }

  return null;
}

export class OpenCodeAPI {
  constructor(
    private hostname: string,
    private getPort: () => number,
    private warmupChromeMcpConfig: boolean = false,
  ) {}

  private createHttpRequest<T>(
    options: http.RequestOptions,
    body?: string,
    timeout?: number,
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
      if (timeout) {
        req.setTimeout(timeout, () => {
          timer.end("❌ Request timeout");
          req.destroy();
          reject(new Error(`Request timeout after ${timeout}ms`));
        });
      }
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

      const prompt = [
        "Call the browser tool list_pages immediately to establish the Chrome DevTools MCP connection.",
        viteOrigin
          ? `If there are no pages, call new_page with ${viteOrigin}.`
          : "If there are no pages, call new_page with about:blank.",
        "Do not read or modify project files.",
        "Do not use any non-browser tools.",
        "After the tool call is complete, reply with exactly: ready",
        "If the tool call fails, reply with exactly: fail",
      ].join(" ");

      const WARMUP_TIMEOUT = 30000;
      const data = await this.createHttpRequest<unknown>(
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
          parts: [{ type: "text", text: prompt }],
        }),
        WARMUP_TIMEOUT,
      );

      // 检查响应内容，确认是否真的返回了 "ready"
      const responseText = extractTextFromResponse(data);
      if (!responseText?.toLowerCase().includes("ready")) {
        throw new Error(`Chrome MCP warmup failed: ${responseText || "No response"}`);
      }

      timer.end("Chrome MCP warmed up");
    } catch (e) {
      log.warn("Failed to warm up Chrome MCP", { error: e });
      timer.end("Chrome MCP warmup skipped");
      throw e;
    } finally {
      if (warmupSessionId) {
        try {
          // Increase retries for deleting the warmup session to ensure it's deleted
          await this.deleteSession(warmupSessionId, 5);
        } catch (e) {
          log.warn("Failed to delete warmup session after retries", {
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

  async retryWarmupChromeMcp(viteOrigin?: string): Promise<boolean> {
    const timer = log.timer("retryWarmupChromeMcp", { viteOrigin });
    let warmupSessionId: string | null = null;

    try {
      const warmupSession = await this.createSession(DEFAULT_RETRIES, "__chrome_mcp_warmup__");
      warmupSessionId = warmupSession.id;

      const prompt = [
        "Call the browser tool list_pages immediately to establish the Chrome DevTools MCP connection.",
        viteOrigin
          ? `If there are no pages, call new_page with ${viteOrigin}.`
          : "If there are no pages, call new_page with about:blank.",
        "Do not read or modify project files.",
        "Do not use any non-browser tools.",
        "After the tool call is complete, reply with exactly: ready",
        "If the tool call fails, reply with exactly: fail",
      ].join(" ");

      const WARMUP_TIMEOUT = 60000; // 增加到 60 秒
      const data = await this.createHttpRequest<unknown>(
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
          parts: [{ type: "text", text: prompt }],
        }),
        WARMUP_TIMEOUT,
      );
      log.debug("Chrome MCP warmup response:", { data });

      // 检查响应内容，确认是否真的返回了 "ready"
      const responseText = extractTextFromResponse(data);
      if (!responseText?.toLowerCase().includes("ready")) {
        throw new Error(`Chrome MCP warmup failed: ${responseText || "No response"}`);
      }

      timer.end("Chrome MCP warmed up successfully");
      return true;
    } catch (e) {
      log.warn("Failed to retry warm up Chrome MCP", { error: e });
      timer.end("Chrome MCP warmup retry failed");
      return false;
    } finally {
      if (warmupSessionId) {
        try {
          await this.deleteSession(warmupSessionId, 5);
        } catch (e) {
          log.warn("Failed to delete warmup session after retries", {
            error: e,
            warmupSessionId,
          });
        }
      }
    }
  }
}
