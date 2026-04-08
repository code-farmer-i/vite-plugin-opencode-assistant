export type OpenCodeWidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export type OpenCodeWidgetTheme = "light" | "dark" | "auto";

export interface OpenCodeWidgetSession {
  id: string;
  title?: string;
  updatedAt?: string | number | Date;
  meta?: string;
  directory?: string;
}

export interface OpenCodeSelectedElement {
  filePath: string | null;
  line: number | null;
  column: number | null;
  innerText: string;
  description: string;
}

export interface OpenCodeWidgetProps {
  position?: OpenCodeWidgetPosition;
  open?: boolean;
  theme?: OpenCodeWidgetTheme;
  title?: string;
  hotkeyLabel?: string;
  selectShortcutLabel?: string;
  selectMode?: boolean;
  sessionListCollapsed?: boolean;
  sessionKey?: string;
  loading?: boolean;
  loadingSessionList?: boolean;
  showEmptyState?: boolean;
  iframeSrc?: string;
  sessions?: OpenCodeWidgetSession[];
  currentSessionId?: string | null;
  selectedElements?: OpenCodeSelectedElement[];
  showClearAll?: boolean;
  selectEnabled?: boolean;
  emptyStateText?: string;
  emptyStateActionText?: string;
}

export type OpenCodeWidgetEmits = {
  (e: "update:open", value: boolean): void;
  (e: "update:selectMode", value: boolean): void;
  (e: "update:sessionListCollapsed", value: boolean): void;
  (e: "update:currentSessionId", value: string | null): void;
  (e: "update:selectedElements", value: OpenCodeSelectedElement[]): void;
  (e: "toggle", value: boolean): void;
  (e: "close"): void;
  (e: "toggle-session-list", value: boolean): void;
  (e: "toggle-select-mode", value: boolean): void;
  (e: "create-session"): void;
  (e: "select-session", session: OpenCodeWidgetSession): void;
  (e: "delete-session", session: OpenCodeWidgetSession): void;
  (e: "click-selected-node", element: OpenCodeSelectedElement): void;
  (e: "remove-selected-node", payload: OpenCodeRemoveSelectedPayload): void;
  (e: "clear-selected-nodes"): void;
  (e: "empty-action"): void;
};

export interface OpenCodeRemoveSelectedPayload {
  element: OpenCodeSelectedElement;
  index: number;
  source: "panel" | "bubble";
}

export interface OpenCodeWidgetSessionItem {
  key: string;
  title: string;
  meta: string;
  active: boolean;
  session: OpenCodeWidgetSession;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface OpenCodeSelectedElementItem {
  key: string;
  description: string;
  bubbleFileText: string;
  panelFileText: string;
  element: OpenCodeSelectedElement;
}
