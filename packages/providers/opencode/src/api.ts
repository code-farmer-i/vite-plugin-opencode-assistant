import http from "http";
import type { SessionInfo } from "./types";
import {
  DEFAULT_RETRIES,
  RETRY_DELAY,
  CHROME_DEVTOOLS_PORT,
  withRetries,
  base64Encode,
} from "@aipanel/core";
import { PerformanceTimer, createLogger } from "@aipanel/core/node";

const log = createLogger("API");

export class OpenCodeAPI {
  constructor(
    private hostname: string,
    private getPort: () => number,
    private getProxyPort: () => number,
    private chromeDevtoolsPort: number = CHROME_DEVTOOLS_PORT,
  ) {}

  /** 构建代理 iframe URL（旧版格式：/{base64(projectDir)}/session/{id}） */
  buildSessionProxyUrl(projectDir: string, sessionId: string): string {
    return `http://${this.hostname}:${this.getProxyPort()}/${base64Encode(projectDir)}/session/${sessionId}`;
  }

  private createHttpRequest<T>(
    options: http.RequestOptions,
    body?: string,
    timeout?: number,
  ): Promise<T> {
    const timer = new PerformanceTimer("HTTP Request", {
      operation: `${options.method || "GET"} ${options.path}`
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

  private retryLog(operation: string, n: number, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    log.debug(`Attempt ${n} failed: ${message}, retrying in ${RETRY_DELAY}ms`, { operation });
  }

  async getSessions(projectDir: string, retries = DEFAULT_RETRIES): Promise<SessionInfo[]> {
    return withRetries(
      async (attempt) => {
        log.debug(`Attempt ${attempt + 1}/${retries}`, { operation: "getSessions", projectDir });
        const sessions = await this.createHttpRequest<SessionInfo[]>({
          hostname: this.hostname,
          port: this.getPort(),
          path: `/session?directory=${encodeURIComponent(projectDir)}`,
        });
        const sessionsWithUrl = sessions.map((s) => ({
          ...s,
          url: s.directory && s.id ? this.buildSessionProxyUrl(s.directory, s.id) : "",
        }));
        log.debug(`Found ${sessions.length} sessions`, { operation: "getSessions" });
        return sessionsWithUrl;
      },
      { attempts: retries, onRetry: (n, e) => this.retryLog("getSessions", n, e) },
    );
  }

  async createSession(
    projectDir: string,
    retries = DEFAULT_RETRIES,
    title?: string,
  ): Promise<SessionInfo> {
    return withRetries(
      async (attempt) => {
        log.debug(`Attempt ${attempt + 1}/${retries}`, {
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
          url: this.buildSessionProxyUrl(projectDir, session.id),
        };
        log.debug(`Created session: ${session.id}`, { operation: "createSession" });
        return sessionWithUrl;
      },
      { attempts: retries, onRetry: (n, e) => this.retryLog("createSession", n, e) },
    );
  }

  async deleteSession(sessionId: string, retries = DEFAULT_RETRIES): Promise<void> {
    await withRetries(
      async (attempt) => {
        log.debug(`Attempt ${attempt + 1}/${retries}`, {
          operation: "deleteSession",
          sessionId,
        });
        await this.createHttpRequest<void>({
          hostname: this.hostname,
          port: this.getPort(),
          path: `/session/${sessionId}`,
          method: "DELETE",
        });
        log.debug(`Deleted session: ${sessionId}`, { operation: "deleteSession" });
      },
      { attempts: retries, onRetry: (n, e) => this.retryLog("deleteSession", n, e) },
    );
  }

  async getToolIds(retries = DEFAULT_RETRIES): Promise<string[]> {
    return withRetries(
      async (attempt) => {
        log.debug(`Attempt ${attempt + 1}/${retries}`, { operation: "getToolIds" });
        const toolIds = await this.createHttpRequest<string[]>({
          hostname: this.hostname,
          port: this.getPort(),
          path: "/experimental/tool/ids",
        });
        log.debug(`Found ${toolIds.length} tools`, { operation: "getToolIds" });
        return toolIds;
      },
      { attempts: retries, onRetry: (n, e) => this.retryLog("getToolIds", n, e) },
    );
  }

  async getOrCreateSession(projectDir: string): Promise<string> {
    log.debug("Getting sessions...", { projectDir });
    const sessions = await this.getSessions(projectDir);
    log.debug(`Found ${sessions.length} sessions`, {
      sessions: sessions.map((s) => ({ id: s.id, directory: s.directory })),
    });
    const matchingSession = sessions.find((s) => s.directory === projectDir);
    if (matchingSession) {
      const url = this.buildSessionProxyUrl(projectDir, matchingSession.id);
      log.debug(`Using existing session: ${matchingSession.id}`, { operation: "getOrCreateSession" });
      return url;
    }
    log.debug("Creating new session...", { projectDir });
    const newSession = await this.createSession(projectDir);
    const url = this.buildSessionProxyUrl(projectDir, newSession.id);
    log.debug(`Created new session: ${newSession.id}`, { operation: "getOrCreateSession" });
    return url;
  }
}
