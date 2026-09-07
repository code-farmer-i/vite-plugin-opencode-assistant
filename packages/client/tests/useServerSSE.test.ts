/**
 * useServerSSE 单元测试
 * 覆盖：端点拼接（SSE_EVENTS_PATH + viteBaseUrl）、onopen 置 connected、
 * 各信封消息类型分发（CONNECTED/STATUS_SYNC/TASK_UPDATE/SESSION_EVENT/CLEAR_ELEMENTS）、
 * 未知类型忽略、unmount 断开。EventSource 用可控 Fake 类 stub。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SSE_EVENTS_PATH, SSE_EVENT_TYPES } from "@aipanel/core";
import type { ProviderEvent } from "@aipanel/core";
import { useServerSSE } from "../src/composables/useServerSSE";
import { mountComposable } from "./test-utils";

const instances: FakeEventSource[] = [];

class FakeEventSource {
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close(): void {
    this.closed = true;
  }
  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
}

function pushMessage(data: Record<string, unknown>): void {
  const es = instances[instances.length - 1];
  es.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
}

beforeEach(() => {
  instances.length = 0;
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useServerSSE", () => {
  it("无 viteBaseUrl 时端点为 SSE_EVENTS_PATH", () => {
    const { wrapper, api } = mountComposable(() => useServerSSE());
    api.connect();
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe(SSE_EVENTS_PATH);
    wrapper.unmount();
  });

  it("viteBaseUrl 前缀拼接端点", () => {
    const base = "http://127.0.0.1:5099";
    const { wrapper, api } = mountComposable(() => useServerSSE({ viteBaseUrl: base }));
    api.connect();
    expect(instances[0].url).toBe(base + SSE_EVENTS_PATH);
    wrapper.unmount();
  });

  it("onopen 后 isConnected 为 true", () => {
    const { wrapper, api } = mountComposable(() => useServerSSE());
    expect(api.isConnected.value).toBe(false);
    api.connect();
    instances[0].onopen?.();
    expect(api.isConnected.value).toBe(true);
    wrapper.unmount();
  });

  it("CONNECTED 消息触发 onConnected", () => {
    const onConnected = vi.fn();
    const { wrapper, api } = mountComposable(() => useServerSSE({ onConnected }));
    api.connect();
    instances[0].onopen?.();
    pushMessage({ type: SSE_EVENT_TYPES.CONNECTED });
    expect(onConnected).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("STATUS_SYNC / TASK_UPDATE 分别触发对应回调", () => {
    const onStatusSync = vi.fn();
    const onTaskUpdate = vi.fn();
    const { wrapper, api } = mountComposable(() => useServerSSE({ onStatusSync, onTaskUpdate }));
    api.connect();
    instances[0].onopen?.();

    pushMessage({ type: SSE_EVENT_TYPES.STATUS_SYNC, task: "ready", isStarted: true });
    expect(onStatusSync).toHaveBeenCalledTimes(1);
    expect(onStatusSync.mock.calls[0][0]).toMatchObject({ task: "ready", isStarted: true });
    expect(onTaskUpdate).not.toHaveBeenCalled();

    pushMessage({ type: SSE_EVENT_TYPES.TASK_UPDATE, task: "starting_web" });
    expect(onTaskUpdate).toHaveBeenCalledTimes(1);
    expect(onTaskUpdate.mock.calls[0][0]).toMatchObject({ task: "starting_web" });
    wrapper.unmount();
  });

  it("SESSION_EVENT 解包 event 后触发 onSessionEvent", () => {
    const onSessionEvent = vi.fn();
    const { wrapper, api } = mountComposable(() => useServerSSE({ onSessionEvent }));
    api.connect();
    instances[0].onopen?.();
    const event: ProviderEvent = { type: "session.status", sessionId: "s1", status: "running" };
    pushMessage({ type: SSE_EVENT_TYPES.SESSION_EVENT, event });
    expect(onSessionEvent).toHaveBeenCalledTimes(1);
    expect(onSessionEvent).toHaveBeenCalledWith(event);
    wrapper.unmount();
  });

  it("CLEAR_ELEMENTS 消息触发 onClearElements", () => {
    const onClearElements = vi.fn();
    const { wrapper, api } = mountComposable(() => useServerSSE({ onClearElements }));
    api.connect();
    instances[0].onopen?.();
    pushMessage({ type: SSE_EVENT_TYPES.CLEAR_ELEMENTS });
    expect(onClearElements).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("未知消息类型被忽略，不触发任何回调", () => {
    const onStatusSync = vi.fn();
    const onTaskUpdate = vi.fn();
    const onSessionEvent = vi.fn();
    const onClearElements = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useServerSSE({ onStatusSync, onTaskUpdate, onSessionEvent, onClearElements }),
    );
    api.connect();
    instances[0].onopen?.();
    pushMessage({ type: "SOMETHING_ELSE", task: "ready" });
    expect(onStatusSync).not.toHaveBeenCalled();
    expect(onTaskUpdate).not.toHaveBeenCalled();
    expect(onSessionEvent).not.toHaveBeenCalled();
    expect(onClearElements).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("unmount 自动断开连接", () => {
    const { wrapper, api } = mountComposable(() => useServerSSE());
    api.connect();
    instances[0].onopen?.();
    wrapper.unmount();
    expect(instances[0].closed).toBe(true);
    expect(api.isConnected.value).toBe(false);
    expect(api.status.value).toBe("disconnected");
  });
});
