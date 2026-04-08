import { computed, type Ref } from "vue";
import type { OpenCodeWidgetSession, OpenCodeWidgetSessionItem } from "../src/types";

function formatSessionMeta(session: OpenCodeWidgetSession): string {
  if (session.meta) {
    return session.meta;
  }

  if (!session.updatedAt) {
    return "";
  }

  const date = new Date(session.updatedAt);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export interface UseSessionOptions {
  sessions: Ref<OpenCodeWidgetSession[]>;
  currentSessionId: Ref<string | number | null>;
  onCreateSession: () => void;
  onSelectSession: (session: OpenCodeWidgetSession) => void;
  onDeleteSession: (session: OpenCodeWidgetSession) => void;
  showConfirmDialog: (message: string) => Promise<boolean>;
}

export function useSession(options: UseSessionOptions) {
  const sessionItems = computed<OpenCodeWidgetSessionItem[]>(() =>
    (options.sessions.value || []).map((session: OpenCodeWidgetSession) => ({
      key: session.id,
      title: session.title || "新会话",
      meta: formatSessionMeta(session),
      active: session.id === options.currentSessionId.value,
      session,
    })),
  );

  function handleCreateSession(): void {
    options.onCreateSession();
  }

  function handleSelectSession(item: OpenCodeWidgetSessionItem): void {
    options.onSelectSession(item.session);
  }

  async function handleDeleteSession(item: OpenCodeWidgetSessionItem): Promise<void> {
    const confirmed = await options.showConfirmDialog(`确定要删除会话 "${item.title}" 吗？`);
    if (confirmed) {
      options.onDeleteSession(item.session);
    }
  }

  return {
    sessionItems,
    handleCreateSession,
    handleDeleteSession,
    handleSelectSession,
  };
}
