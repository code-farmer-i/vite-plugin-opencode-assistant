/**
 * usePageContext 单元测试
 * 覆盖：idle 状态跳过、force 首推、URL/标题去重、history.pushState/replaceState 拦截
 * （rAF stub 同步执行）、viteBaseUrl 前缀、unmount 后监听与 history 方法恢复。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { CONTEXT_API_PATH } from "@aipanel/core";
import type { AIPanelSelectedElement, ServiceStatus } from "@aipanel/core";
import { usePageContext } from "../src/composables/usePageContext";
import { mountComposable } from "./test-utils";

const fetchMock = vi.fn();

beforeEach(() => {
  document.title = "";
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true } as Response);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function lastBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe("usePageContext", () => {
  it("idle 状态不发送上下文", () => {
    const status = ref<ServiceStatus>("idle");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper, api } = mountComposable(() => usePageContext(status, selected));
    api.updateContext(true);
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("force 首推带 url/title/selectedElements；内容不变再去重跳过", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([
      { filePath: "/a.ts", line: 3, column: 1, innerText: "x" },
    ]);
    const { wrapper, api } = mountComposable(() => usePageContext(status, selected));

    document.title = "首页";
    api.updateContext(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(CONTEXT_API_PATH);
    expect(lastBody()).toEqual({
      url: "http://localhost/",
      title: "首页",
      selectedElements: selected.value,
    });

    // 内容未变：非 force 调用不重复发送
    api.updateContext();
    await macrotask();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 标题变化触发发送
    document.title = "第二页";
    api.updateContext();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastBody().title).toBe("第二页");
    wrapper.unmount();
  });

  it("pushState/replaceState 拦截触发上下文刷新", () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper, api } = mountComposable(() => usePageContext(status, selected));
    api.updateContext(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    window.history.pushState({}, "", "/page-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastBody().url).toBe("http://localhost/page-a");

    window.history.replaceState({}, "", "/page-b");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastBody().url).toBe("http://localhost/page-b");
    wrapper.unmount();
  });

  it("viteBaseUrl 前缀拼接到上下文 API", () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper, api } = mountComposable(() =>
      usePageContext(status, selected, "http://127.0.0.1:5099"),
    );
    api.updateContext(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://127.0.0.1:5099" + CONTEXT_API_PATH);
    wrapper.unmount();
  });

  it("unmount 后恢复 history 方法并移除监听", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper, api } = mountComposable(() => usePageContext(status, selected));
    api.updateContext(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    window.history.pushState({}, "", "/after-unmount");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new Event("hashchange"));
    document.title = "卸载后标题";
    await flushPromises();
    await macrotask();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
