/**
 * useExtensionContext 单元测试
 * 覆盖：onMessage 注册/反注册、onMounted 查询 active tab 并发 REQUEST_PAGE_CONTEXT、
 * PAGE_CONTEXT 按 serviceInstanceId + activeTabId 过滤与采纳、TAB_SWITCHED 切换、
 * 上下文 POST 载荷（含 tabId/tabIndex/sessionId/selectedElements）、idle 跳过。
 * chrome.runtime/tabs 用可控 stub 手动触发监听。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { CONTEXT_API_PATH, EXT_MSG } from "@aipanel/core";
import type { AIPanelSelectedElement, ServiceStatus } from "@aipanel/core";
import { useExtensionContext } from "../src/composables/useExtensionContext";
import { mountComposable } from "./test-utils";

interface ContextMessage {
  type: string;
  serviceInstanceId?: string;
  tabId?: number;
  windowId?: number;
  ctx?: { url: string; title: string; sessionId?: string };
}

const fetchMock = vi.fn();
let listeners: Array<(msg: ContextMessage) => void>;
let chromeStub: ReturnType<typeof makeChrome>;

function makeChrome(tabs: Array<{ id?: number; index?: number; url?: string }>) {
  return {
    runtime: {
      onMessage: {
        addListener: vi.fn((h: (msg: ContextMessage) => void) => listeners.push(h)),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      query: vi.fn(async () => tabs),
      sendMessage: vi.fn(async () => ({})),
    },
  };
}

function lastBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  listeners = [];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true } as Response);
  vi.stubGlobal("fetch", fetchMock);
  chromeStub = makeChrome([{ id: 10, index: 1, url: "http://target/" }]);
  vi.stubGlobal("chrome", chromeStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useExtensionContext", () => {
  it("挂载时注册监听、查询活跃 tab 并请求页面上下文；卸载移除监听", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper } = mountComposable(() =>
      useExtensionContext(status, selected, "http://127.0.0.1:5099", "inst-1"),
    );
    expect(chromeStub.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    await flushPromises();
    expect(chromeStub.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(10, {
      type: EXT_MSG.REQUEST_PAGE_CONTEXT,
    });
    wrapper.unmount();
    expect(chromeStub.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    expect(chromeStub.runtime.onMessage.removeListener.mock.calls[0][0]).toBe(listeners[0]);
  });

  it("PAGE_CONTEXT（活跃 tab）POST 上下文到服务端", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([
      { filePath: "/a.ts", line: 1, column: 2, innerText: "" },
    ]);
    const { wrapper } = mountComposable(() =>
      useExtensionContext(status, selected, "http://127.0.0.1:5099", "inst-1"),
    );
    await flushPromises();
    const msg: ContextMessage = {
      type: EXT_MSG.PAGE_CONTEXT,
      serviceInstanceId: "inst-1",
      tabId: 10,
      windowId: 1,
      ctx: { url: "http://target/page", title: "目标页", sessionId: "sess-9" },
    };
    listeners[0](msg);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://127.0.0.1:5099" + CONTEXT_API_PATH);
    expect(lastBody()).toEqual({
      url: "http://target/page",
      title: "目标页",
      sessionId: "sess-9",
      active: true,
      tabId: 10,
      tabIndex: 1,
      selectedElements: selected.value,
    });
    wrapper.unmount();
  });

  it("TAB_SWITCHED 后只接受新活跃 tab 的上下文", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper } = mountComposable(() => useExtensionContext(status, selected, "", "inst-1"));
    await flushPromises();

    listeners[0]({
      type: EXT_MSG.TAB_SWITCHED,
      serviceInstanceId: "inst-1",
      tabId: 12,
      windowId: 1,
    });
    listeners[0]({
      type: EXT_MSG.PAGE_CONTEXT,
      serviceInstanceId: "inst-1",
      tabId: 10,
      ctx: { url: "http://stale/", title: "旧 tab" },
    });
    expect(fetchMock).not.toHaveBeenCalled();

    listeners[0]({
      type: EXT_MSG.PAGE_CONTEXT,
      serviceInstanceId: "inst-1",
      tabId: 12,
      ctx: { url: "http://active/", title: "新 tab" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody().url).toBe("http://active/");
    wrapper.unmount();
  });

  it("serviceInstanceId 不匹配时忽略上下文", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper } = mountComposable(() => useExtensionContext(status, selected, "", "inst-1"));
    await flushPromises();
    listeners[0]({
      type: EXT_MSG.PAGE_CONTEXT,
      serviceInstanceId: "inst-2",
      tabId: 10,
      ctx: { url: "http://x/", title: "x" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("serviceStatus 为 idle 时不发送上下文", async () => {
    const status = ref<ServiceStatus>("idle");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper } = mountComposable(() => useExtensionContext(status, selected, "", "inst-1"));
    await flushPromises();
    listeners[0]({
      type: EXT_MSG.PAGE_CONTEXT,
      serviceInstanceId: "inst-1",
      tabId: 10,
      ctx: { url: "http://x/", title: "x" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("卸载时移除已注册的 onMessage 监听", async () => {
    const status = ref<ServiceStatus>("ready");
    const selected = ref<AIPanelSelectedElement[]>([]);
    const { wrapper } = mountComposable(() => useExtensionContext(status, selected, "", "inst-1"));
    await flushPromises();
    const handler = listeners[0];
    wrapper.unmount();
    expect(chromeStub.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
    expect(chromeStub.runtime.onMessage.removeListener.mock.calls[0][0]).toBe(handler);
  });
});
