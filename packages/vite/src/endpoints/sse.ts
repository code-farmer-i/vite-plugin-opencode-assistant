import type { ViteDevServer } from "vite";
import { SSE_EVENTS_PATH } from "@vite-plugin-opencode-assistant/shared";
import { RequestContext, createLogger } from "@vite-plugin-opencode-assistant/shared";
import type { EndpointContext } from "./types.js";

const log = createLogger("Endpoints:SSE");

export function setupSseEndpoint(server: ViteDevServer, ctx: EndpointContext) {
  server.middlewares.use(SSE_EVENTS_PATH, async (req, res) => {
    const reqCtx = new RequestContext("GET", SSE_EVENTS_PATH);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    ctx.sseClients.add(res);
    log.debug("SSE client connected", { totalClients: ctx.sseClients.size });

    res.write(`data: ${JSON.stringify({ type: "CONNECTED" })}\n\n`);

    if (ctx.sessionUrl) {
      res.write(
        `data: ${JSON.stringify({ type: "SESSION_READY", sessionUrl: ctx.sessionUrl })}\n\n`,
      );
    }

    req.on("close", () => {
      ctx.sseClients.delete(res);
      log.debug("SSE client disconnected", {
        totalClients: ctx.sseClients.size,
      });
    });

    reqCtx.end(200);
  });
}
