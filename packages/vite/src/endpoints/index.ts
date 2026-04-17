import type { ViteDevServer } from "vite";
import type { EndpointContext } from "./types.js";
import { setupWidgetEndpoints } from "./widget.js";
import { setupContextEndpoint } from "./context.js";
import { setupStartEndpoint } from "./start.js";
import { setupSseEndpoint } from "./sse.js";
import { setupSessionsEndpoint } from "./sessions.js";
import { setupWarmupEndpoint } from "./warmup.js";
import { setupLogsEndpoint, LOGS_API_PATH } from "./logs.js";

export * from "./types.js";
export { LOGS_API_PATH };

export function setupMiddlewares(server: ViteDevServer, ctx: EndpointContext) {
  setupWidgetEndpoints(server, ctx);
  setupContextEndpoint(server, ctx);
  setupStartEndpoint(server);
  setupSseEndpoint(server, ctx);
  setupSessionsEndpoint(server, ctx);
  setupWarmupEndpoint(server, ctx);
  setupLogsEndpoint(server);
}
