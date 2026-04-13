import type { ViteDevServer } from "vite";
import type { EndpointContext } from "./types.js";
import { setupWidgetEndpoints } from "./widget.js";
import { setupContextEndpoint } from "./context.js";
import { setupStartEndpoint } from "./start.js";
import { setupSseEndpoint } from "./sse.js";
import { setupSessionsEndpoint } from "./sessions.js";
import { setupWarmupEndpoint } from "./warmup.js";

export * from "./types.js";

export function setupMiddlewares(server: ViteDevServer, ctx: EndpointContext) {
  setupWidgetEndpoints(server, ctx);
  setupContextEndpoint(server, ctx);
  setupStartEndpoint(server);
  setupSseEndpoint(server, ctx);
  setupSessionsEndpoint(server, ctx);
  setupWarmupEndpoint(server, ctx);
}
