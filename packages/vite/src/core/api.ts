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
  private failedFreeModels: Set<string> = new Set();

  constructor(
    private hostname: string,
    private getPort: () => number,
    private getProxyPort: () => number,
    private warmupChromeMcpConfig: boolean = false,
  ) {}

  markModelAsFailed(providerID: string, modelID: string): void {
    const key = `${providerID}:${modelID}`;
    this.failedFreeModels.add(key);
    log.debug("Marked model as failed", {
      providerID,
      modelID,
      key,
      failedCount: this.failedFreeModels.size,
    });
  }

  clearFailedModels(): void {
    this.failedFreeModels.clear();
    log.debug("Cleared failed models cache");
  }

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

  async getSessions(projectDir: string, retries = DEFAULT_RETRIES): Promise<SessionInfo[]> {
    const timer = log.timer("getSessions", { retries, projectDir });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, { operation: "getSessions", projectDir });
        const sessions = await this.createHttpRequest<SessionInfo[]>({
          hostname: this.hostname,
          port: this.getPort(),
          path: `/session?directory=${encodeURIComponent(projectDir)}`,
        });
        const sessionsWithUrl = sessions.map((s) => ({
          ...s,
          url: s.directory
            ? `http://${this.hostname}:${this.getProxyPort()}/${base64Encode(s.directory)}/session/${s.id}`
            : "",
        }));
        timer.end(`Found ${sessions.length} sessions`);
        return sessionsWithUrl;
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

  async createSession(
    projectDir: string,
    retries = DEFAULT_RETRIES,
    title?: string,
  ): Promise<SessionInfo> {
    const timer = log.timer("createSession", { retries, title, projectDir });
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        log.debug(`Attempt ${i + 1}/${retries}`, {
          operation: "createSession",
          title,
          projectDir,
        });
        const requestBody = title ? JSON.stringify({ title }) : undefined;
        const session = await this.createHttpRequest<SessionInfo>(
          {
            hostname: this.hostname,
            port: this.getPort(),
            path: "/session",
            method: "POST",
            headers: {
              ...(requestBody ? { "Content-Type": "application/json" } : {}),
            },
          },
          requestBody,
        );
        const sessionWithUrl = {
          ...session,
          url: `http://${this.hostname}:${this.getProxyPort()}/${base64Encode(projectDir)}/session/${session.id}`,
        };
        timer.end(`Created session: ${session.id}`);
        return sessionWithUrl;
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

  async getCheapestModel(): Promise<{ providerID: string; modelID: string } | null> {
    try {
      const response = await this.createHttpRequest<{
        all: Array<{
          id: string;
          models: Record<
            string,
            {
              name?: string;
              cost?: { input: number; output: number };
              // xxxx-xx-xx
              release_date: string;
            }
          >;
        }>;
        connected: string[];
      }>({
        hostname: this.hostname,
        port: this.getPort(),
        path: "/provider",
        method: "GET",
      });

      const connectedProviders = new Set(response.connected);

      interface ModelInfo {
        providerID: string;
        modelID: string;
        name?: string;
        inputCost: number;
        releaseDate: string;
      }

      const allModels: ModelInfo[] = [];

      for (const provider of response.all) {
        if (provider.id === "opencode") continue;

        if (!connectedProviders.has(provider.id)) {
          log.debug("Skipping not connected provider", { providerID: provider.id });
          continue;
        }

        for (const [modelID, model] of Object.entries(provider.models)) {
          allModels.push({
            providerID: provider.id,
            modelID,
            name: model.name,
            inputCost: model.cost?.input ?? 0,
            releaseDate: model.release_date,
          });
        }
      }

      allModels.sort((a, b) => a.inputCost - b.inputCost);

      const availableModel = allModels.find(
        (model) => !this.failedFreeModels.has(`${model.providerID}:${model.modelID}`),
      );

      if (!availableModel) {
        log.debug("All models have failed", {
          totalModels: allModels.length,
          failedModels: this.failedFreeModels.size,
          connectedProviders: response.connected,
        });
        return null;
      }

      log.debug("Found cheapest available model for warmup", {
        providerID: availableModel.providerID,
        modelID: availableModel.modelID,
        name: availableModel.name,
        inputCost: availableModel.inputCost,
        releaseDate: availableModel.releaseDate,
        totalModels: allModels.length,
        failedModels: this.failedFreeModels.size,
        connectedProviders: response.connected,
      });

      return {
        providerID: availableModel.providerID,
        modelID: availableModel.modelID,
      };
    } catch (error) {
      log.warn("Failed to get cheapest model", { error });
      return null;
    }
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

  async warmupChromeMcp(projectDir: string, viteOrigin?: string): Promise<void> {
    if (!this.warmupChromeMcpConfig) return;

    const timer = log.timer("warmupChromeMcp", { viteOrigin });
    let warmupSessionId: string | null = null;
    let freeModel: { providerID: string; modelID: string } | null = null;

    const chromeAvailable = await checkChromeDevToolsAvailable();
    if (!chromeAvailable) {
      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED,
        "Chrome DevTools Protocol is not available",
        "Chrome remote debugging is not enabled or not running on port 9222. Please enable Chrome remote debugging first.",
      );
      log.warn("Chrome DevTools not available", {
        port: CHROME_DEVTOOLS_PORT,
        hint: "Enable Chrome remote debugging at chrome://inspect/#remote-debugging",
      });
      timer.end("Chrome DevTools not available");
      throw error;
    }

    log.debug("Chrome DevTools is available, proceeding with warmup");

    try {
      const warmupSession = await this.createSession(
        projectDir,
        DEFAULT_RETRIES,
        "__chrome_mcp_warmup__",
      );
      warmupSessionId = warmupSession.id;

      freeModel = await this.getCheapestModel();
      if (freeModel) {
        log.debug("Using cheapest model for warmup", {
          providerID: freeModel.providerID,
          modelID: freeModel.modelID,
        });
      } else {
        log.debug("No model available, using default model");
      }

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
          parts: [
            {
              type: "text",
              text: "Test if the chrome-devtools_list_pages tool is available. If available, reply with: ready. If not available, explain why.",
            },
          ],
          ...(freeModel && {
            model: {
              providerID: freeModel.providerID,
              modelID: freeModel.modelID,
            },
          }),
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
        if (e.type === ChromeMcpWarmupErrorType.SESSION_ERROR) {
          timer.end("Session creation failed");
        }
        log.warn(`Chrome MCP warmup failed: ${e.type}`, {
          message: e.message,
          details: e.details,
          ...(freeModel && {
            model: `${freeModel.providerID}/${freeModel.modelID}`,
          }),
        });
        timer.end(`Chrome MCP warmup failed: ${e.type}`);
        throw e;
      }

      if (freeModel) {
        this.markModelAsFailed(freeModel.providerID, freeModel.modelID);
        log.debug("Marked model as failed due to warmup error", {
          providerID: freeModel.providerID,
          modelID: freeModel.modelID,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const errorMessage = e instanceof Error ? e.message : String(e);

      if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        const error = new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_TIMEOUT,
          "AI response timeout",
          "AI did not respond within 30 seconds. Please check if the OpenCode AI model is properly configured and available.",
        );
        log.warn("Chrome MCP warmup timeout", {
          error: errorMessage,
          ...(freeModel && {
            model: `${freeModel.providerID}/${freeModel.modelID}`,
          }),
        });
        timer.end("Chrome MCP warmup timeout");
        throw error;
      }

      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.UNKNOWN,
        "Unknown error during Chrome MCP warmup",
        errorMessage,
      );
      log.warn("Chrome MCP warmup failed with unknown error", {
        error: errorMessage,
        ...(freeModel && {
          model: `${freeModel.providerID}/${freeModel.modelID}`,
        }),
      });
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

  async getOrCreateSession(projectDir: string): Promise<string> {
    const timer = log.timer("getOrCreateSession", { projectDir });

    log.debug("Getting sessions...", { projectDir });
    const sessions = await this.getSessions(projectDir);
    log.debug(`Found ${sessions.length} sessions`, {
      sessions: sessions.map((s) => ({ id: s.id, directory: s.directory })),
    });

    const matchingSession = sessions.find((s) => s.directory === projectDir);

    if (matchingSession) {
      const url = `http://${this.hostname}:${this.getProxyPort()}/${base64Encode(projectDir)}/session/${matchingSession.id}`;
      timer.end(`Using existing session: ${matchingSession.id}`);
      return url;
    }

    log.debug("Creating new session...", { projectDir });
    const newSession = await this.createSession(projectDir);
    const url = `http://${this.hostname}:${this.getProxyPort()}/${base64Encode(projectDir)}/session/${newSession.id}`;
    timer.end(`Created new session: ${newSession.id}`);
    return url;
  }

  async retryWarmupChromeMcp(
    projectDir: string,
    viteOrigin?: string,
  ): Promise<{ success: boolean; error?: ChromeMcpWarmupError }> {
    const timer = log.timer("retryWarmupChromeMcp", { viteOrigin });
    let warmupSessionId: string | null = null;
    let freeModel: { providerID: string; modelID: string } | null = null;

    const chromeAvailable = await checkChromeDevToolsAvailable();
    if (!chromeAvailable) {
      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.CHROME_NOT_CONNECTED,
        "Chrome DevTools Protocol is not available",
        "Chrome remote debugging is not enabled or not running on port 9222. Please enable Chrome remote debugging first.",
      );
      log.warn("Chrome DevTools not available for retry", {
        port: CHROME_DEVTOOLS_PORT,
        hint: "Enable Chrome remote debugging at chrome://inspect/#remote-debugging",
      });
      timer.end("Chrome DevTools not available for retry");
      return { success: false, error };
    }

    log.debug("Chrome DevTools is available, proceeding with retry warmup");

    try {
      const warmupSession = await this.createSession(
        projectDir,
        DEFAULT_RETRIES,
        "__chrome_mcp_warmup__",
      );
      warmupSessionId = warmupSession.id;

      freeModel = await this.getCheapestModel();
      if (freeModel) {
        log.debug("Using cheapest model for retry warmup", {
          providerID: freeModel.providerID,
          modelID: freeModel.modelID,
        });
      } else {
        log.debug("No model available for retry, using default model");
      }

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
          parts: [
            {
              type: "text",
              text: "Test if the chrome-devtools_list_pages tool is available. If available, reply with: ready. If not available, explain why.",
            },
          ],
          ...(freeModel && {
            model: {
              providerID: freeModel.providerID,
              modelID: freeModel.modelID,
            },
          }),
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
        if (e.type === ChromeMcpWarmupErrorType.SESSION_ERROR) {
          timer.end("Session creation failed");
        }
        log.warn(`Chrome MCP warmup retry failed: ${e.type}`, {
          message: e.message,
          details: e.details,
          ...(freeModel && {
            model: `${freeModel.providerID}/${freeModel.modelID}`,
          }),
        });
        timer.end(`Chrome MCP warmup retry failed: ${e.type}`);
        return { success: false, error: e };
      }

      if (freeModel) {
        this.markModelAsFailed(freeModel.providerID, freeModel.modelID);
        log.debug("Marked model as failed due to retry warmup error", {
          providerID: freeModel.providerID,
          modelID: freeModel.modelID,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const errorMessage = e instanceof Error ? e.message : String(e);

      if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        const error = new ChromeMcpWarmupError(
          ChromeMcpWarmupErrorType.AI_TIMEOUT,
          "AI response timeout",
          "AI did not respond within 60 seconds. Please check if the OpenCode AI model is properly configured and available.",
        );
        log.warn("Chrome MCP warmup retry timeout", {
          error: errorMessage,
          ...(freeModel && {
            model: `${freeModel.providerID}/${freeModel.modelID}`,
          }),
        });
        timer.end("Chrome MCP warmup retry timeout");
        return { success: false, error };
      }

      const error = new ChromeMcpWarmupError(
        ChromeMcpWarmupErrorType.UNKNOWN,
        "Unknown error during Chrome MCP warmup retry",
        errorMessage,
      );
      log.warn("Chrome MCP warmup retry failed with unknown error", {
        error: errorMessage,
        ...(freeModel && {
          model: `${freeModel.providerID}/${freeModel.modelID}`,
        }),
      });
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
