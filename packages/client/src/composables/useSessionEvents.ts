import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
  AIPanelSessionStatusType,
  AIPanelSessionThinkingState,
  ProviderEvent,
} from "@aipanel/core";

/**
 * 会话更新数据（标题/时间变化）
 */
export interface SessionEventUpdate {
  id: string;
  title?: string;
  time?: {
    created?: number;
    updated?: number;
  };
}

/**
 * 消费 Provider 归一化事件（SESSION_EVENT）的会话状态
 * 事件由 useServerSSE 的 onSessionEvent 转发进来
 */
export interface UseSessionEventsOptions {
  /** 当前 session ID (响应式) */
  currentSessionId: Ref<string | null>;
  /** Session 更新回调（标题变化等） */
  onSessionUpdate?: (session: SessionEventUpdate) => void;
}

/**
 * 视为"正在处理"的会话状态（thinking 指示器应保持的集合）。
 * 终态/空闲（completed / idle）均复位 thinking=false，避免 UI 动画悬挂。
 * 集合语义对齐 core SessionStatus 联合（"idle" | "running" | "streaming" | "completed"）。
 */
const ACTIVE_SESSION_STATUSES: ReadonlySet<AIPanelSessionStatusType> = new Set([
  "running",
  "streaming",
]);

export function useSessionEvents(options: UseSessionEventsOptions) {
  const { currentSessionId, onSessionUpdate } = options;

  // 所有 session 的状态映射
  const sessionStates = ref<Record<string, AIPanelSessionThinkingState>>({});

  /**
   * 处理归一化后的 Provider 事件
   */
  function handleEvent(event: ProviderEvent): void {
    switch (event.type) {
      case "session.updated": {
        const s = event.session;
        onSessionUpdate?.({
          id: s.id,
          title: s.title,
          time: { created: s.createdAt, updated: s.updatedAt },
        });
        break;
      }
      case "session.status": {
        const statusType = event.status;
        sessionStates.value[event.sessionId] = {
          thinking: ACTIVE_SESSION_STATUSES.has(statusType),
          statusType,
          hasPending: false,
        };
        break;
      }
      case "thinking": {
        const current = sessionStates.value[event.sessionId] || {
          thinking: false,
          statusType: "idle",
          hasPending: false,
        };
        sessionStates.value[event.sessionId] = { ...current, thinking: event.thinking };
        break;
      }
      case "connected":
        break;
    }
  }

  /**
   * 当前 session 的 thinking 状态
   */
  const currentThinking: ComputedRef<boolean> = computed(() => {
    const id = currentSessionId.value;
    if (!id) return false;
    return sessionStates.value[id]?.thinking ?? false;
  });

  /**
   * 当前 session 的完整状态
   */
  const currentSessionState: ComputedRef<AIPanelSessionThinkingState | null> = computed(() => {
    const id = currentSessionId.value;
    if (!id) return null;
    return sessionStates.value[id] || null;
  });

  /**
   * 判断任意 session 是否正在思考
   */
  const hasAnyThinking: ComputedRef<boolean> = computed(() => {
    return Object.values(sessionStates.value).some((state) => state.thinking);
  });

  /**
   * 获取正在思考的 session 数量
   */
  const thinkingSessionCount: ComputedRef<number> = computed(() => {
    return Object.values(sessionStates.value).filter((state) => state.thinking).length;
  });

  /**
   * 清除指定 session 状态
   */
  function clearSessionState(sessionID: string): void {
    delete sessionStates.value[sessionID];
  }

  /**
   * 清除所有 session 状态
   */
  function clearAllSessionStates(): void {
    sessionStates.value = {};
  }

  return {
    sessionStates,
    currentThinking,
    currentSessionState,
    hasAnyThinking,
    thinkingSessionCount,
    handleEvent,
    clearSessionState,
    clearAllSessionStates,
  };
}
