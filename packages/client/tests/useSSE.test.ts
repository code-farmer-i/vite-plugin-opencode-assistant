/**
 * useSSE 单元测试
 * 覆盖：connect/onopen/onmessage（JSON 解析与原始文本回退）、重复连接防护、
 * disconnect/reconnect、错误重试（fake timers 推进）、重试耗尽、enabled 开关、
 * autoConnect、unmount 自动断开。EventSource 用可控 Fake 类 stub。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref } from "vue";
import { useSSE } from "../src/composables/useSSE";
import { mountComposable } from "./test-utils";

const instances: FakeEventSource[] = [];

class FakeEventSource {
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  instances.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSSE", () => {
  it("connect 建立连接，onopen 后置为 connected", () => {
    const onConnected = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/events", autoConnect: false, onConnected }),
    );
    expect(api.status.value).toBe("idle");
    api.connect();
    expect(api.status.value).toBe("connecting");
    expect(instances).toHaveLength(1);
    expect(instances[0].url).toBe("/events");

    instances[0].onopen?.();
    expect(api.status.value).toBe("connected");
    expect(api.isConnected.value).toBe(true);
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(api.retryCount.value).toBe(0);
    wrapper.unmount();
  });

  it("onmessage 解析 JSON 对象，非 JSON 原样透传", () => {
    const onMessage = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/events", autoConnect: false, onMessage }),
    );
    api.connect();
    const es = instances[0];
    es.onmessage?.({ data: '{"a":1}' } as MessageEvent);
    expect(onMessage).toHaveBeenLastCalledWith({ a: 1 });
    es.onmessage?.({ data: "plain-text" } as MessageEvent);
    expect(onMessage).toHaveBeenLastCalledWith("plain-text");
    expect(onMessage).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("重复 connect 只创建单个连接", () => {
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/events", autoConnect: false }),
    );
    api.connect();
    api.connect();
    expect(instances).toHaveLength(1);
    wrapper.unmount();
  });

  it("disconnect 关闭连接并触发 onDisconnected", () => {
    const onDisconnected = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/events", autoConnect: false, onDisconnected }),
    );
    api.connect();
    instances[0].onopen?.();
    api.disconnect();
    expect(api.status.value).toBe("disconnected");
    expect(api.isConnected.value).toBe(false);
    expect(instances[0].closed).toBe(true);
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("reconnect = disconnect + connect，建立全新连接", () => {
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/events", autoConnect: false }),
    );
    api.connect();
    instances[0].onopen?.();
    api.reconnect();
    expect(instances).toHaveLength(2);
    expect(instances[1].url).toBe("/events");
    expect(api.status.value).toBe("connecting");
    instances[1].onopen?.();
    expect(api.status.value).toBe("connected");
    wrapper.unmount();
  });

  it("autoConnect 默认立即连接", () => {
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/auto", onConnected: vi.fn() }),
    );
    expect(instances).toHaveLength(1);
    expect(api.status.value).toBe("connecting");
    instances[0].onopen?.();
    expect(api.isConnected.value).toBe(true);
    wrapper.unmount();
  });

  it("enabled=false 时不连接，置回 true 后可手动连接", () => {
    const enabled = ref(false);
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/gated", autoConnect: true, enabled }),
    );
    expect(instances).toHaveLength(0);
    expect(api.status.value).toBe("idle");
    api.connect();
    expect(instances).toHaveLength(0);

    enabled.value = true;
    api.connect();
    expect(instances).toHaveLength(1);
    wrapper.unmount();
  });

  it("断线后按退避重试并在重连成功后复位计数", () => {
    const onError = vi.fn();
    const onDisconnected = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useSSE({
        endpoint: "/retry",
        autoConnect: false,
        maxRetries: 2,
        retryDelay: 10,
        onError,
        onDisconnected,
      }),
    );
    api.connect();
    instances[0].onopen?.();
    instances[0].onerror?.();
    expect(api.status.value).toBe("error");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(instances[0].closed).toBe(true);
    expect(api.retryCount.value).toBe(1);

    vi.advanceTimersByTime(10);
    expect(instances).toHaveLength(2);
    expect(api.status.value).toBe("connecting");
    instances[1].onopen?.();
    expect(api.status.value).toBe("connected");
    expect(api.retryCount.value).toBe(0);
    expect(onDisconnected).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("重试耗尽后停止重连，onDisconnected 仅在主动断开时触发", () => {
    const onError = vi.fn();
    const onDisconnected = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useSSE({
        endpoint: "/exhaust",
        autoConnect: false,
        maxRetries: 1,
        retryDelay: 5,
        onError,
        onDisconnected,
      }),
    );
    api.connect();
    instances[0].onopen?.();
    instances[0].onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5);
    expect(instances).toHaveLength(2);
    // 重连尝试未成功（无 open）即再次失败：达到 maxRetries，不再调度
    instances[1].onerror?.();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onDisconnected).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);
    expect(api.status.value).toBe("error");
    wrapper.unmount();
  });

  it("从未连接成功过则重试耗尽不触发 onDisconnected", () => {
    const onDisconnected = vi.fn();
    const onError = vi.fn();
    const { wrapper, api } = mountComposable(() =>
      useSSE({
        endpoint: "/never",
        autoConnect: false,
        maxRetries: 1,
        retryDelay: 5,
        onError,
        onDisconnected,
      }),
    );
    api.connect();
    instances[0].onerror?.();
    expect(onError).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5);
    instances[1].onerror?.();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onDisconnected).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("unmount 自动断开活动连接", () => {
    const { wrapper, api } = mountComposable(() =>
      useSSE({ endpoint: "/cleanup", autoConnect: false }),
    );
    api.connect();
    instances[0].onopen?.();
    wrapper.unmount();
    expect(instances[0].closed).toBe(true);
    expect(api.status.value).toBe("disconnected");
  });
});
