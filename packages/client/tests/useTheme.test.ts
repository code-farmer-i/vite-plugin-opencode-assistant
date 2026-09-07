/**
 * useTheme 单元测试
 * 覆盖：theme ref、resolvedTheme 由 resolveWidgetTheme 折算、sendThemeToIframe 调用
 * widgetRef.sendMessageToIframe 且消息类型为 WIDGET_MSG.SET_THEME、auto 下 matchMedia
 * change 触发重发、主题 watch 变化重发、onUnmounted 移除 matchMedia 监听。
 * jsdom 无 matchMedia，自建可触发 change 的可控 MediaQueryList stub。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import { WIDGET_MSG } from "@aipanel/core";
import { resolveWidgetTheme } from "@aipanel/core/client";
import { useTheme } from "../src/composables/useTheme";
import { mountComposable } from "./test-utils";

type ChangeHandler = (ev?: unknown) => void;

let systemDark = false;
let changeHandlers: ChangeHandler[] = [];

function installMatchMedia(): void {
  changeHandlers = [];
  const mm = vi.fn((query: string) => ({
    matches: systemDark,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (type: string, cb: ChangeHandler) => {
      if (type === "change") changeHandlers.push(cb);
    },
    removeEventListener: (type: string, cb: ChangeHandler) => {
      if (type === "change") changeHandlers = changeHandlers.filter((h) => h !== cb);
    },
    dispatchEvent: () => false,
  }));
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: mm });
}

function fireSystemThemeChange(): void {
  for (const handler of [...changeHandlers]) handler({ matches: systemDark });
}

function makeWidget() {
  const sendMessageToIframe = vi.fn();
  const widgetRef = { value: { sendMessageToIframe } };
  return { sendMessageToIframe, widgetRef };
}

beforeEach(() => {
  systemDark = false;
  installMatchMedia();
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  vi.restoreAllMocks();
});

describe("resolveWidgetTheme", () => {
  it("auto 按系统主题折算，其余原样返回", () => {
    expect(resolveWidgetTheme("auto", "dark")).toBe("dark");
    expect(resolveWidgetTheme("auto", "light")).toBe("light");
    expect(resolveWidgetTheme("light", "dark")).toBe("light");
    expect(resolveWidgetTheme("dark", "light")).toBe("dark");
  });
});

describe("useTheme", () => {
  it("resolvedTheme 由 theme 折算（系统暗色时 auto→dark）", () => {
    const { wrapper, api } = mountComposable(() => useTheme("auto", { value: null }));
    expect(api.resolvedTheme.value).toBe("light");
    wrapper.unmount();
  });

  it("系统暗色下 auto → dark，显式 light/dark 原样", () => {
    systemDark = true;
    const autoApi = mountComposable(() => useTheme("auto", { value: null }));
    expect(autoApi.api.resolvedTheme.value).toBe("dark");
    autoApi.wrapper.unmount();

    const darkApi = mountComposable(() => useTheme("dark", { value: null }));
    expect(darkApi.api.resolvedTheme.value).toBe("dark");
    darkApi.wrapper.unmount();

    const lightApi = mountComposable(() => useTheme("light", { value: null }));
    expect(lightApi.api.resolvedTheme.value).toBe("light");
    lightApi.wrapper.unmount();
  });

  it("sendThemeToIframe 发送 WIDGET_MSG.SET_THEME 与折算后主题", () => {
    const { sendMessageToIframe, widgetRef } = makeWidget();
    const { wrapper, api } = mountComposable(() => useTheme("dark", widgetRef));
    api.sendThemeToIframe();
    expect(sendMessageToIframe).toHaveBeenCalledTimes(1);
    expect(sendMessageToIframe).toHaveBeenCalledWith(WIDGET_MSG.SET_THEME, { theme: "dark" });
    wrapper.unmount();
  });

  it("挂载后主题变化触发 watch 重发主题消息", async () => {
    const { sendMessageToIframe, widgetRef } = makeWidget();
    const { wrapper, api } = mountComposable(() => useTheme("light", widgetRef));
    expect(sendMessageToIframe).not.toHaveBeenCalled();

    api.theme.value = "dark";
    await nextTick();
    expect(sendMessageToIframe).toHaveBeenCalledTimes(1);
    expect(sendMessageToIframe).toHaveBeenCalledWith(WIDGET_MSG.SET_THEME, { theme: "dark" });

    api.theme.value = "light";
    await nextTick();
    expect(sendMessageToIframe).toHaveBeenCalledTimes(2);
    expect(sendMessageToIframe).toHaveBeenLastCalledWith(WIDGET_MSG.SET_THEME, { theme: "light" });
    wrapper.unmount();
  });

  it("auto 下系统主题 change 事件触发重发（payload 为缓存折算值）", async () => {
    const { sendMessageToIframe, widgetRef } = makeWidget();
    const { wrapper, api } = mountComposable(() => useTheme("auto", widgetRef));
    // 先读取一次触发 computed 缓存：此时系统为 light，折算 light
    expect(api.resolvedTheme.value).toBe("light");

    systemDark = true;
    fireSystemThemeChange();
    expect(sendMessageToIframe).toHaveBeenCalledTimes(1);
    expect(sendMessageToIframe).toHaveBeenCalledWith(WIDGET_MSG.SET_THEME, { theme: "light" });
    wrapper.unmount();
  });

  it("unmount 移除 matchMedia 监听，之后主题变化不再发送", async () => {
    const { sendMessageToIframe, widgetRef } = makeWidget();
    const { wrapper, api } = mountComposable(() => useTheme("auto", widgetRef));
    expect(changeHandlers).toHaveLength(1);
    wrapper.unmount();
    expect(changeHandlers).toHaveLength(0);

    fireSystemThemeChange();
    api.theme.value = "dark";
    await nextTick();
    expect(sendMessageToIframe).not.toHaveBeenCalled();
  });

  it("widgetRef.value 为 null 时主题变化不抛错、不发送", async () => {
    const { wrapper, api } = mountComposable(() => useTheme("dark", { value: null }));
    api.theme.value = "light";
    await nextTick();
    expect(api.resolvedTheme.value).toBe("light");
    wrapper.unmount();
  });
});
