/**
 * useSessionEvents 单元测试
 * 覆盖：session.status / thinking / session.updated / connected 事件处理、
 * currentThinking / currentSessionState / hasAnyThinking / thinkingSessionCount 计算、
 * clearSessionState / clearAllSessionStates。无生命周期钩子，直接调用。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { ref } from "vue";
import { useSessionEvents } from "../src/composables/useSessionEvents";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSessionEvents", () => {
  it("初始：无当前会话时为 false / null / 0", () => {
    const currentSessionId = ref<string | null>(null);
    const api = useSessionEvents({ currentSessionId });
    expect(api.currentThinking.value).toBe(false);
    expect(api.currentSessionState.value).toBeNull();
    expect(api.hasAnyThinking.value).toBe(false);
    expect(api.thinkingSessionCount.value).toBe(0);
  });

  it("session.status：仅进行中（running/streaming）置 thinking；completed/idle 复位", () => {
    const currentSessionId = ref<string | null>("s1");
    const api = useSessionEvents({ currentSessionId });
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "running" });
    expect(api.sessionStates.value.s1).toEqual({
      thinking: true,
      statusType: "running",
      hasPending: false,
    });
    expect(api.currentThinking.value).toBe(true);
    expect(api.hasAnyThinking.value).toBe(true);
    expect(api.thinkingSessionCount.value).toBe(1);
    expect(api.currentSessionState.value?.statusType).toBe("running");

    // 终态 completed：状态类型切换为 completed，同时复位 thinking（结束即不再"思考中"）
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "completed" });
    expect(api.sessionStates.value.s1.statusType).toBe("completed");
    expect(api.sessionStates.value.s1.thinking).toBe(false);
    expect(api.currentThinking.value).toBe(false);
    expect(api.hasAnyThinking.value).toBe(false);

    // streaming 仍属进行中
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "streaming" });
    expect(api.sessionStates.value.s1.thinking).toBe(true);

    // idle 复位
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "idle" });
    expect(api.sessionStates.value.s1.thinking).toBe(false);
    expect(api.currentThinking.value).toBe(false);
  });

  it("thinking 事件只更新 thinking 字段，保留既有状态", () => {
    const currentSessionId = ref<string | null>("s1");
    const api = useSessionEvents({ currentSessionId });
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "streaming" });
    api.handleEvent({ type: "thinking", sessionId: "s1", thinking: false });
    expect(api.sessionStates.value.s1).toEqual({
      thinking: false,
      statusType: "streaming",
      hasPending: false,
    });
    // 未知会话的 thinking 事件也安全创建
    api.handleEvent({ type: "thinking", sessionId: "s9", thinking: true });
    expect(api.sessionStates.value.s9.thinking).toBe(true);
    expect(api.thinkingSessionCount.value).toBe(1);
  });

  it("session.updated 通过 onSessionUpdate 回调透出会话元数据", () => {
    const currentSessionId = ref<string | null>(null);
    const onSessionUpdate = vi.fn();
    const api = useSessionEvents({ currentSessionId, onSessionUpdate });
    api.handleEvent({
      type: "session.updated",
      session: { id: "s1", title: "新标题", createdAt: 1, updatedAt: 2 },
    });
    expect(onSessionUpdate).toHaveBeenCalledTimes(1);
    expect(onSessionUpdate).toHaveBeenCalledWith({
      id: "s1",
      title: "新标题",
      time: { created: 1, updated: 2 },
    });
  });

  it("connected 事件不产生副作用", () => {
    const currentSessionId = ref<string | null>("s1");
    const api = useSessionEvents({ currentSessionId });
    api.handleEvent({ type: "connected" });
    expect(api.sessionStates.value).toEqual({});
    expect(api.hasAnyThinking.value).toBe(false);
  });

  it("clearSessionState 与 clearAllSessionStates 清理状态", () => {
    const currentSessionId = ref<string | null>("s1");
    const api = useSessionEvents({ currentSessionId });
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "running" });
    api.handleEvent({ type: "session.status", sessionId: "s2", status: "streaming" });
    expect(api.thinkingSessionCount.value).toBe(2);

    api.clearSessionState("s1");
    expect(api.sessionStates.value.s1).toBeUndefined();
    expect(api.currentThinking.value).toBe(false);
    expect(api.thinkingSessionCount.value).toBe(1);

    api.clearAllSessionStates();
    expect(api.sessionStates.value).toEqual({});
    expect(api.thinkingSessionCount.value).toBe(0);
  });

  it("currentSessionState 对未知当前会话返回 null", () => {
    const currentSessionId = ref<string | null>("missing");
    const api = useSessionEvents({ currentSessionId });
    api.handleEvent({ type: "session.status", sessionId: "s1", status: "running" });
    expect(api.currentSessionState.value).toBeNull();
  });
});
