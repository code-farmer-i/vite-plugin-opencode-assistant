import http from "http";
import type { SessionInfo } from "@vite-plugin-opencode-assistant/shared";
import {
  PerformanceTimer,
  createLogger,
  DEFAULT_RETRIES,
  RETRY_DELAY,
  ChromeMcpWarmupErrorType,
  ChromeMcpWarmupError,
  CHROME_DEVTOOLS_PORT,
  checkChromeDevToolsAvailable,
  sleep,
  base64Encode,
  extractTextFromResponse,
} from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("API");

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

    // 先检查 Chrome DevTools 是否可用
    const chromeAvailable = await checkChromeDevToolsAvailable();
    if (!chromeAvailable) {
      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED,
        "Chrome DevTools Protocol is not available",
        "Chrome remote debugging is not enabled or not running on port 9222. Please enable Chrome remote debugging first.",
      );
      log.warn("Chrome DevTools not available", { 
        port: CHROME_DEVTOOLS_PORT,
        hint: "Enable Chrome remote debugging at chrome://inspect/#remote-debugging"
      });
      timer.end("Chrome DevTools not available");
      throw error;
    }

    log.debug("Chrome DevTools is available, proceeding with warmup");

    try {
      const warmupSession = await this.createSession(DEFAULT_RETRIES, "__chrome_mcp_warmup__");
      warmupSessionId = warmupSession.id;
    } catch (e) {
      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.SESSION_ERROR,
        "Failed to create warmup session",
        e instanceof Error ? e.message : String(e),
      );
      timer.end("Session creation failed");
      throw error;
    }

    try {
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

      const responseText = extractTextFromResponse(data);
      
      if (!responseText) {
        throw new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_RESPONSE_ERROR,
          "AI did not respond to the warmup request",
          "Empty response from AI",
        );
      }

      const lowerResponse = responseText.toLowerCase();
      
      if (lowerResponse.includes("fail")) {
        throw new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED,
          "Chrome DevTools MCP is not connected",
          "AI reported that browser tools are not available. This should not happen if Chrome DevTools check passed.",
        );
      }

      if (!lowerResponse.includes("ready")) {
        throw new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_RESPONSE_ERROR,
          "AI response does not indicate success",
          `AI responded with: ${responseText.substring(0, 200)}`,
        );
      }

      timer.end("Chrome MCP warmed up");
    } catch (e) {
      if (e instanceof ChromeMcpWarmupError) {
        log.warn(`Chrome MCP warmup failed: ${e.type}`, { 
          message: e.message, 
          details: e.details 
        });
        timer.end(`Chrome MCP warmup failed: ${e.type}`);
        throw e;
      }

      const errorMessage = e instanceof Error ? e.message : String(e);
      
      if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        const error = new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_TIMEOUT,
          "AI response timeout",
          "AI did not respond within 30 seconds. Please check if the OpenCode AI model is properly configured and available.",
        );
        log.warn("Chrome MCP warmup timeout", { error: errorMessage });
        timer.end("Chrome MCP warmup timeout");
        throw error;
      }

      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.UNKNOWN,
        "Unknown error during Chrome MCP warmup",
        errorMessage,
      );
      log.warn("Chrome MCP warmup failed with unknown error", { error: errorMessage });
      timer.end("Chrome MCP warmup failed");
      throw error;
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

  async retryWarmupChromeMcp(viteOrigin?: string): Promise<{ success: boolean; error?: ChromeMcpWarmupError }> {
    const timer = log.timer("retryWarmupChromeMcp", { viteOrigin });
    let warmupSessionId: string | null = null;

    // 先检查 Chrome DevTools 是否可用
    const chromeAvailable = await checkChromeDevToolsAvailable();
    if (!chromeAvailable) {
      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED,
        "Chrome DevTools Protocol is not available",
        "Chrome remote debugging is not enabled or not running on port 9222. Please enable Chrome remote debugging first.",
      );
      log.warn("Chrome DevTools not available for retry", { 
        port: CHROME_DEVTOOLS_PORT,
        hint: "Enable Chrome remote debugging at chrome://inspect/#remote-debugging"
      });
      timer.end("Chrome DevTools not available for retry");
      return { success: false, error };
    }

    log.debug("Chrome DevTools is available, proceeding with retry warmup");

    try {
      const warmupSession = await this.createSession(DEFAULT_RETRIES, "__chrome_mcp_warmup__");
      warmupSessionId = warmupSession.id;
    } catch (e) {
      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.SESSION_ERROR,
        "Failed to create warmup session",
        e instanceof Error ? e.message : String(e),
      );
      timer.end("Session creation failed");
      return { success: false, error };
    }

    try {
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

      const WARMUP_TIMEOUT = 60000;
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

      const responseText = extractTextFromResponse(data);
      
      if (!responseText) {
        throw new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_RESPONSE_ERROR,
          "AI did not respond to the warmup request",
          "Empty response from AI",
        );
      }

      const lowerResponse = responseText.toLowerCase();
      
      if (lowerResponse.includes("fail")) {
        throw new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED,
          "Chrome DevTools MCP is not connected",
          "AI reported that browser tools are not available. This should not happen if Chrome DevTools check passed.",
        );
      }

      if (!lowerResponse.includes("ready")) {
        throw new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_RESPONSE_ERROR,
          "AI response does not indicate success",
          `AI responded with: ${responseText.substring(0, 200)}`,
        );
      }

      timer.end("Chrome MCP warmed up successfully");
      return { success: true };
    } catch (e) {
      if (e instanceof ChromeMcpWarmupError) {
        log.warn(`Chrome MCP warmup retry failed: ${e.type}`, { 
          message: e.message, 
          details: e.details 
        });
        timer.end(`Chrome MCP warmup retry failed: ${e.type}`);
        return { success: false, error: e };
      }

      const errorMessage = e instanceof Error ? e.message : String(e);
      
      if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        const error = new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_TIMEOUT,
          "AI response timeout",
          "AI did not respond within 60 seconds. Please check if the OpenCode AI model is properly configured and available.",
        );
        log.warn("Chrome MCP warmup retry timeout", { error: errorMessage });
        timer.end("Chrome MCP warmup retry timeout");
        return { success: false, error };
      }

      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.UNKNOWN,
        "Unknown error during Chrome MCP warmup retry",
        errorMessage,
      );
      log.warn("Chrome MCP warmup retry failed with unknown error", { error: errorMessage });
      timer.end("Chrome MCP warmup retry failed");
      return { success: false, error };
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
