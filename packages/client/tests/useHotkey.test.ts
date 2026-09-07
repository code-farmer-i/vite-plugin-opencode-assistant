/**
 * useHotkey 单元测试
 * 覆盖：parseHotkey / matchHotkey 纯逻辑；useHotkey 的 add/removeEventListener 生命周期
 * （jsdom 派发 KeyboardEvent，shell 组件驱动 onMounted/onUnmounted）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  useHotkey,
  parseHotkey,
  matchHotkey,
  type HotkeyConfig,
} from "../src/composables/useHotkey";
import { mountComposable } from "./test-utils";

function dispatchKeydown(init: KeyboardEventInit): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseHotkey", () => {
  it("解析 ctrl+shift+k", () => {
    expect(parseHotkey("ctrl+shift+k")).toEqual({ ctrl: true, shift: true, alt: false, key: "k" });
  });

  it("大小写不敏感并兼容 meta（按 ctrl 处理）", () => {
    expect(parseHotkey("Meta+Shift+P")).toEqual({ ctrl: true, shift: true, alt: false, key: "p" });
    expect(parseHotkey("ctrl+alt+x")).toEqual({ ctrl: true, shift: false, alt: true, key: "x" });
  });

  it("无修饰键的普通键", () => {
    expect(parseHotkey("F5")).toEqual({ ctrl: false, shift: false, alt: false, key: "f5" });
  });

  it("空串回退到默认快捷键 ctrl+k", () => {
    expect(parseHotkey("")).toEqual({ ctrl: true, shift: false, alt: false, key: "k" });
  });

  it("只有  时 key 回退到 k", () => {
    expect(parseHotkey("ctrl+")).toEqual({ ctrl: true, shift: false, alt: false, key: "k" });
  });
});

describe("matchHotkey", () => {
  const cfg: HotkeyConfig = { ctrl: true, shift: true, alt: false, key: "k" };

  it("全部命中返回 true（ctrlKey 与 metaKey 任一即可）", () => {
    expect(
      matchHotkey(new KeyboardEvent("keydown", { ctrlKey: true, shiftKey: true, key: "K" }), cfg),
    ).toBe(true);
    expect(
      matchHotkey(new KeyboardEvent("keydown", { metaKey: true, shiftKey: true, key: "k" }), cfg),
    ).toBe(true);
  });

  it("缺修饰键/键不匹配返回 false", () => {
    expect(matchHotkey(new KeyboardEvent("keydown", { ctrlKey: true, key: "k" }), cfg)).toBe(false);
    expect(
      matchHotkey(new KeyboardEvent("keydown", { ctrlKey: true, shiftKey: true, key: "j" }), cfg),
    ).toBe(false);
    expect(
      matchHotkey(new KeyboardEvent("keydown", { altKey: true, shiftKey: true, key: "k" }), cfg),
    ).toBe(false);
  });

  it("无修饰键配置要求按下时无 ctrl/meta/shift/alt", () => {
    const plain: HotkeyConfig = { ctrl: false, shift: false, alt: false, key: "q" };
    expect(matchHotkey(new KeyboardEvent("keydown", { key: "q" }), plain)).toBe(true);
    expect(matchHotkey(new KeyboardEvent("keydown", { ctrlKey: true, key: "q" }), plain)).toBe(
      false,
    );
    expect(matchHotkey(new KeyboardEvent("keydown", { shiftKey: true, key: "q" }), plain)).toBe(
      false,
    );
  });
});

describe("useHotkey", () => {
  it("命中快捷键时调用回调，未命中不调用", () => {
    const callback = vi.fn();
    const { api, wrapper } = mountComposable(() => useHotkey("ctrl+shift+k", callback));
    expect(api.hotkeyConfig).toEqual({ ctrl: true, shift: true, alt: false, key: "k" });

    dispatchKeydown({ ctrlKey: true, shiftKey: true, key: "k" });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent);

    dispatchKeydown({ ctrlKey: true, shiftKey: true, key: "x" });
    dispatchKeydown({ shiftKey: true, key: "k" });
    expect(callback).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("unmount 后移除 keydown 监听，不再触发回调", () => {
    const callback = vi.fn();
    const { wrapper } = mountComposable(() => useHotkey("ctrl+k", callback));
    wrapper.unmount();
    dispatchKeydown({ ctrlKey: true, key: "k" });
    expect(callback).not.toHaveBeenCalled();
  });
});
