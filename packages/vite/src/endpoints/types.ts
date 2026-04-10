import type {
  PageContext,
  SessionInfo,
  ServiceStartupTask,
} from "@vite-plugin-opencode-assistant/shared";
import type http from "http";

export interface EndpointContext {
  get sessionUrl(): string | null;
  get webUrl(): string | null;
  get sseClients(): Set<http.ServerResponse>;
  get pageContext(): PageContext;
  set pageContext(ctx: PageContext);
  get isServiceStarted(): boolean;
  get currentTask(): { task: ServiceStartupTask; data?: Record<string, unknown> } | null;
  getSessions: () => Promise<SessionInfo[]>;
  createSession: () => Promise<SessionInfo>;
  deleteSession: (id: string) => Promise<void>;
  resolveWidgetPath: () => string;
  resolveWidgetStylePath: () => string;
  retryWarmupChromeMcp: () => Promise<boolean>;
}
