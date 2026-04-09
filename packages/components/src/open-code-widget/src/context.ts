import { inject, provide, type Ref } from "vue";
import type {
  OpenCodeWidgetSessionItem,
  OpenCodeSelectedElementItem,
  OpenCodeRemoveSelectedPayload,
} from "./types";

export interface OpenCodeWidgetContext {
  // Config & State
  theme: Ref<string>;
  resolvedTheme: Ref<"light" | "dark">;
  title: Ref<string>;
  hotkeyLabel: Ref<string>;
  selectShortcutLabel: Ref<string>;
  selectMode: Ref<boolean>;
  selectEnabled: Ref<boolean>;
  sessionListCollapsed: Ref<boolean>;
  sessionKey: Ref<string>;
  loading: Ref<boolean>;
  loadingSessionList: Ref<boolean | undefined>;
  showEmptyState: Ref<boolean>;
  emptyStateText: Ref<string>;
  emptyStateActionText: Ref<string>;
  showClearAll: Ref<boolean>;
  open: Ref<boolean>;

  // Computed
  iframeSource: Ref<string>;
  buttonActive: Ref<boolean>;
  sessionListTitle: Ref<string>;
  bubbleVisible: Ref<boolean>;
  hasSelectedElements: Ref<boolean>;
  sessionItems: Ref<OpenCodeWidgetSessionItem[]>;
  selectedElementItems: Ref<OpenCodeSelectedElementItem[]>;

  // Actions
  handleToggle: () => void;
  handleClose: () => void;
  handleToggleSessionList: () => void;
  handleToggleTheme: () => void;
  handleEmptyAction: () => void;
  handleCreateSession: () => void;
  handleSelectSession: (item: OpenCodeWidgetSessionItem) => void;
  handleDeleteSession: (item: OpenCodeWidgetSessionItem) => void;
  handleToggleSelectMode: () => void;
  handleClickSelectedNode: (item: OpenCodeSelectedElementItem) => void;
  handleRemoveSelectedNode: (payload: {
    item: OpenCodeSelectedElementItem;
    index: number;
    source: OpenCodeRemoveSelectedPayload["source"];
  }) => void;
  handleClearSelectedNodes: () => void;
}

const CONTEXT_KEY = Symbol("OpenCodeWidgetContext");

export function provideOpenCodeWidgetContext(context: OpenCodeWidgetContext) {
  provide(CONTEXT_KEY, context);
}

export function useOpenCodeWidgetContext(): OpenCodeWidgetContext {
  const context = inject<OpenCodeWidgetContext>(CONTEXT_KEY);
  if (!context) {
    throw new Error("useOpenCodeWidgetContext must be used within OpenCodeWidget");
  }
  return context;
}
