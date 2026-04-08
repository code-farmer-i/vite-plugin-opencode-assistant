import { describe, expect, it } from "vitest";
import { CONFIG_DATA_ATTR, WIDGET_SCRIPT_PATH } from "@vite-plugin-opencode-assistant/shared";
import { injectWidget } from "../../src/core/injector.js";

describe("injectWidget", () => {
  it("injects script tag with encoded config", () => {
    const html = injectWidget({
      webUrl: "http://127.0.0.1:4097",
      serverUrl: "http://127.0.0.1:5173",
      position: "bottom-right",
      theme: "auto",
      open: false,
      autoReload: true,
      cwd: "/tmp/project",
      sessionUrl: "http://127.0.0.1:4097/session/1",
      hotkey: "ctrl+k",
    });

    expect(html).toContain(`<script type="module" src="${WIDGET_SCRIPT_PATH}"`);
    expect(html).toContain(`${CONFIG_DATA_ATTR}=`);

    const match = html.match(new RegExp(`${CONFIG_DATA_ATTR}="([^"]+)"`));
    expect(match?.[1]).toBeTruthy();

    const decoded = JSON.parse(Buffer.from(match![1], "base64").toString("utf8"));
    expect(decoded.webUrl).toBe("http://127.0.0.1:4097");
    expect(decoded.hotkey).toBe("ctrl+k");
  });
});
