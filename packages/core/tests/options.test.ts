/**
 * @fileoverview 插件通用配置单测（packages/core/src/common/options.ts）
 * 期望值一律引用 DEFAULT_PLUGIN_OPTIONS / constants 单一来源，不散落字面量。
 */
import { describe, expect, it } from "vitest";
import { CHROME_DEVTOOLS_PORT, DEFAULT_HOSTNAME, DEFAULT_WEB_PORT } from "../src/common/constants";
import {
  DEFAULT_PLUGIN_OPTIONS,
  type PluginOptions,
  resolvePluginConfig,
} from "../src/common/options";

describe("DEFAULT_PLUGIN_OPTIONS", () => {
  it("holds single-source constants for ports/hostname", () => {
    expect(DEFAULT_PLUGIN_OPTIONS.webPort).toBe(DEFAULT_WEB_PORT);
    expect(DEFAULT_PLUGIN_OPTIONS.hostname).toBe(DEFAULT_HOSTNAME);
    expect(DEFAULT_PLUGIN_OPTIONS.chromeDevtoolsPort).toBe(CHROME_DEVTOOLS_PORT);
  });

  it("carries sane feature toggles", () => {
    expect(DEFAULT_PLUGIN_OPTIONS.enabled).toBe(true);
    expect(DEFAULT_PLUGIN_OPTIONS.provider).toBe("default");
    expect(DEFAULT_PLUGIN_OPTIONS.open).toBe(false);
    expect(DEFAULT_PLUGIN_OPTIONS.mcpOnly).toBe(false);
    expect(DEFAULT_PLUGIN_OPTIONS.verbose).toBe(false);
    expect(DEFAULT_PLUGIN_OPTIONS.hotkey).toBe("ctrl+k");
    expect(DEFAULT_PLUGIN_OPTIONS.warmupChromeMcp).toBe(true);
  });
});

describe("resolvePluginConfig", () => {
  it("fills every default when no options are given", () => {
    const resolved = resolvePluginConfig();
    expect(resolved).toEqual({
      ...DEFAULT_PLUGIN_OPTIONS,
      providerOptions: {},
    });
  });

  it("shallow-merges user options over the defaults", () => {
    const resolved = resolvePluginConfig({
      enabled: false,
      webPort: 8888,
      theme: "light",
      providerOptions: { language: "zh" },
    });
    expect(resolved.enabled).toBe(false);
    expect(resolved.webPort).toBe(8888);
    expect(resolved.theme).toBe("light");
    expect(resolved.hostname).toBe(DEFAULT_HOSTNAME); // 未覆盖项保持默认
    expect(resolved.providerOptions).toEqual({ language: "zh" });
  });

  it("always materializes providerOptions as an object", () => {
    const resolved = resolvePluginConfig({});
    expect(resolved.providerOptions).toEqual({});
    const withUndef = resolvePluginConfig({ providerOptions: undefined });
    expect(withUndef.providerOptions).toEqual({});
  });

  it("does not mutate the input or alias the providerOptions reference", () => {
    const opts = { providerOptions: { a: 1 } } as PluginOptions;
    const resolved = resolvePluginConfig(opts);
    expect(opts.providerOptions).toEqual({ a: 1 });
    expect(resolved.providerOptions).toEqual({ a: 1 });
    expect(resolved.providerOptions).not.toBe(opts.providerOptions);
    expect(resolved).not.toBe(opts);
  });

  it("keeps deprecated top-level fields for provider fallback", () => {
    const resolved = resolvePluginConfig({ language: "zh", settings: { lint: true } });
    expect(resolved.language).toBe("zh");
    expect(resolved.settings).toEqual({ lint: true });
  });
});
