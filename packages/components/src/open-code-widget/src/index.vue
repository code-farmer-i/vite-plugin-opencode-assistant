<script setup lang="ts">
import { useSlots, toRef, ref, watch } from "vue";
import Frame from "./components/Frame.vue";
import Header from "./components/Header.vue";
import SelectHint from "./components/SelectHint.vue";
import SelectedBubbles from "./components/SelectedBubbles.vue";
import SelectedNodes from "./components/SelectedNodes.vue";
import SessionList from "./components/SessionList.vue";
import Trigger from "./components/Trigger.vue";
import { useSelection } from "../composables/use-selection";
import { useSession } from "../composables/use-session";
import { useWidget } from "../composables/use-widget";
import { useInspector } from "../composables/use-inspector";
import type { OpenCodeWidgetEmits, OpenCodeWidgetProps } from "./types";
import { provideOpenCodeWidgetContext } from "./context";

defineOptions({
  name: "OpencodeWidget",
});

const props = withDefaults(defineProps<OpenCodeWidgetProps>(), {
  position: "bottom-right",
  open: false,
  theme: "light",
  title: "AI 助手",
  hotkeyLabel: "Ctrl+K",
  selectShortcutLabel: "按 ESC 或 Ctrl+P 退出",
  selectMode: false,
  sessionListCollapsed: true,
  loading: false,
  showEmptyState: false,
  iframeSrc: "",
  currentSessionId: null,
  sessions: () => [],
  selectedElements: () => [],
  showClearAll: true,
  selectEnabled: true,
  emptyStateText: "当前项目暂无会话",
  emptyStateActionText: "立即创建",
});

const emit = defineEmits<OpenCodeWidgetEmits>();
const slots = useSlots();

// Notification state
const notificationMessage = ref("");
const notificationVisible = ref(false);
let notificationTimer: ReturnType<typeof setTimeout> | null = null;

const showNotification = (message: string, duration = 3000) => {
  notificationMessage.value = message;
  notificationVisible.value = true;
  if (notificationTimer) clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    notificationVisible.value = false;
  }, duration);
};

// Dialog state
const dialogVisible = ref(false);
const dialogMessage = ref("");
let dialogResolve: ((value: boolean) => void) | null = null;

const showConfirmDialog = (message: string): Promise<boolean> => {
  dialogMessage.value = message;
  dialogVisible.value = true;
  return new Promise((resolve) => {
    dialogResolve = resolve;
  });
};

const handleDialogConfirm = () => {
  dialogVisible.value = false;
  if (dialogResolve) dialogResolve(true);
};

const handleDialogCancel = () => {
  dialogVisible.value = false;
  if (dialogResolve) dialogResolve(false);
};

defineExpose({
  showNotification,
  showConfirmDialog,
});

const localSessionListCollapsed = ref(props.sessionListCollapsed);
watch(() => props.sessionListCollapsed, (val: boolean) => {
  localSessionListCollapsed.value = val;
});

const {
  buttonActive,
  containerClasses,
  iframeSource,
  sessionListTitle,
  handleClose,
  handleEmptyAction,
  handleToggle,
  handleToggleSessionList,
} = useWidget({
  position: toRef(props, "position"),
  theme: toRef(props, "theme"),
  open: toRef(props, "open"),
  selectMode: toRef(props, "selectMode"),
  iframeSrc: toRef(props, "iframeSrc"),
  sessionListCollapsed: localSessionListCollapsed,
  onToggle: (nextOpen) => {
    emit("update:open", nextOpen);
    emit("toggle", nextOpen);
  },
  onToggleSelectMode: (mode) => {
    emit("update:selectMode", mode);
    emit("toggle-select-mode", mode);
  },
  onClose: () => {
    emit("update:open", false);
    emit("close");
  },
  onToggleSessionList: (collapsed) => {
    localSessionListCollapsed.value = collapsed;
    emit("update:sessionListCollapsed", collapsed);
    emit("toggle-session-list", collapsed);
  },
  onEmptyAction: () => {
    emit("empty-action");
  },
});

const {
  sessionItems,
  handleCreateSession,
  handleDeleteSession,
  handleSelectSession,
} = useSession({
  sessions: toRef(props, "sessions"),
  currentSessionId: toRef(props, "currentSessionId"),
  onCreateSession: () => emit("create-session"),
  onSelectSession: (session) => {
    emit("update:currentSessionId", session.id);
    emit("select-session", session);
  },
  onDeleteSession: (session) => emit("delete-session", session),
  showConfirmDialog,
});

const {
  bubbleVisible,
  hasSelectedElements,
  selectedElementItems,
  handleClearSelectedNodes,
  handleClickSelectedNode,
  handleRemoveSelectedNode,
  handleToggleSelectMode,
} = useSelection({
  selectMode: toRef(props, "selectMode"),
  selectedElements: toRef(props, "selectedElements"),
  onToggleSelectMode: (mode) => {
    emit("update:selectMode", mode);
    emit("toggle-select-mode", mode);
  },
  onRemoveSelectedNode: (payload) => {
    emit("remove-selected-node", payload);
    const newElements = [...props.selectedElements];
    newElements.splice(payload.index, 1);
    emit("update:selectedElements", newElements);
  },
  onClearSelectedNodes: () => {
    emit("clear-selected-nodes");
    emit("update:selectedElements", []);
  },
  showConfirmDialog,
});

const {
  highlightVisible,
  highlightStyle,
  tooltipVisible,
  tooltipStyle,
  tooltipContent,
} = useInspector({
  selectMode: toRef(props, "selectMode"),
  onAddSelectedNode: (element) => {
    emit("click-selected-node", element);
  },
  onExitSelectMode: () => {
    emit("update:selectMode", false);
    emit("toggle-select-mode", false);
  }
});

provideOpenCodeWidgetContext({
  theme: toRef(props, "theme"),
  title: toRef(props, "title"),
  hotkeyLabel: toRef(props, "hotkeyLabel"),
  selectShortcutLabel: toRef(props, "selectShortcutLabel"),
  selectMode: toRef(props, "selectMode"),
  selectEnabled: toRef(props, "selectEnabled"),
  sessionListCollapsed: localSessionListCollapsed,
  loading: toRef(props, "loading"),
  loadingSessionList: toRef(props, "loadingSessionList"),
  showEmptyState: toRef(props, "showEmptyState"),
  emptyStateText: toRef(props, "emptyStateText"),
  emptyStateActionText: toRef(props, "emptyStateActionText"),
  showClearAll: toRef(props, "showClearAll"),
  open: toRef(props, "open"),
  iframeSource,
  buttonActive,
  sessionListTitle,
  bubbleVisible,
  hasSelectedElements,
  sessionItems,
  selectedElementItems,
  handleToggle,
  handleClose,
  handleToggleSessionList,
  handleEmptyAction,
  handleCreateSession,
  handleSelectSession,
  handleDeleteSession,
  handleToggleSelectMode,
  handleClickSelectedNode,
  handleRemoveSelectedNode: (payload) => handleRemoveSelectedNode(payload.item, payload.index, payload.source),
  handleClearSelectedNodes,
});
</script>

<template>
  <div :class="containerClasses">
    <Trigger>
      <template
        v-if="slots['button-icon']"
        #default
      >
        <slot name="button-icon" />
      </template>
    </Trigger>

    <SelectedBubbles v-if="bubbleVisible" />

    <div
      v-show="!selectMode"
      class="opencode-chat"
      :class="{ open }"
    >
      <Header>
        <template
          v-if="slots['session-toggle-icon']"
          #session-toggle-icon
        >
          <slot name="session-toggle-icon" />
        </template>

        <template
          v-if="slots['select-icon']"
          #select-icon
        >
          <slot name="select-icon" />
        </template>

        <template
          v-if="slots['close-icon']"
          #close-icon
        >
          <slot name="close-icon" />
        </template>
      </Header>

      <!-- Notification -->
      <div
        v-if="notificationVisible"
        class="opencode-notification"
        role="alert"
      >
        {{ notificationMessage }}
      </div>

      <div class="opencode-chat-content">
        <SessionList>
          <template #empty>
            <slot name="sessions-empty">
              <div class="opencode-session-empty">暂无会话</div>
            </slot>
          </template>
        </SessionList>

        <Frame>
          <template
            v-if="slots['empty-state']"
            #empty-state
          >
            <slot name="empty-state" />
          </template>

          <template
            v-if="slots.loading"
            #loading
          >
            <slot name="loading" />
          </template>

          <template
            v-if="slots.content"
            #content
          >
            <slot name="content" />
          </template>
        </Frame>

        <SelectedNodes />
      </div>
    </div>

    <SelectHint />

    <!-- Inspector Highlight -->
    <div
      v-show="highlightVisible"
      class="opencode-element-highlight"
      :style="{
        display: highlightVisible ? 'block' : 'none',
        ...highlightStyle
      }"
    />

    <!-- Inspector Tooltip -->
    <div
      v-show="tooltipVisible"
      class="opencode-element-tooltip"
      :style="{
        display: tooltipVisible ? 'block' : 'none',
        ...tooltipStyle
      }"
    >
      <div class="opencode-tooltip-tag">
        {{ tooltipContent.description }}
      </div>
      <div class="opencode-tooltip-file">
        {{ tooltipContent.fileInfo }}
      </div>
    </div>

    <!-- Dialog -->
    <div
      v-if="dialogVisible"
      class="opencode-dialog-overlay"
    >
      <div
        class="opencode-dialog"
        role="alertdialog"
        aria-modal="true"
      >
        <div class="opencode-dialog-content">
          <div class="opencode-dialog-message">{{ dialogMessage }}</div>
        </div>
        <div class="opencode-dialog-actions">
          <button
            class="opencode-dialog-btn cancel"
            @click="handleDialogCancel"
          >
            取消
          </button>
          <button
            class="opencode-dialog-btn confirm"
            @click="handleDialogConfirm"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.opencode-widget {
  /* Colors - Light Theme */
  --oc-bg-main: #ffffff;
  --oc-bg-secondary: #f8f9fa;
  --oc-bg-tertiary: #f3f4f6;
  --oc-overlay-bg: rgba(255, 255, 255, 0.9);
  --oc-bg-inverse: #1e1e1e;

  --oc-text-primary: #282828;
  --oc-text-secondary: #4b5563;
  --oc-text-tertiary: #6b7280;
  --oc-text-placeholder: #9ca3af;
  --oc-text-inverse: #ffffff;

  --oc-border-primary: #e5e7eb;
  --oc-border-secondary: #d1d5db;

  --oc-primary: #3b82f6;
  --oc-primary-hover: #2563eb;
  --oc-primary-bg: rgba(59, 130, 246, 0.1);

  --oc-danger: #ef4444;
  --oc-danger-hover: #dc2626;
  --oc-danger-active: #b91c1c;

  --oc-success: #10b981;

  --oc-overlay: rgba(0, 0, 0, 0.5);
  --oc-tooltip-bg: #1e1e1e;
  --oc-dialog-overlay: rgba(0, 0, 0, 0.5);

  /* Skeleton */
  --oc-skeleton-bg: #e5e7eb;
  --oc-skeleton-gradient: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);

  /* Shadows */
  --oc-shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.1);
  --oc-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
  --oc-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
  --oc-shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.3);
  --oc-shadow-primary: 0 2px 4px rgba(59, 130, 246, 0.2);
  --oc-shadow-primary-hover: 0 4px 6px rgba(59, 130, 246, 0.3);
  --oc-shadow-danger: 0 4px 12px rgba(239, 68, 68, 0.3);

  /* Trigger */
  --oc-trigger-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --oc-trigger-bg-hover: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  --oc-trigger-bg-active: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --oc-trigger-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  --oc-trigger-shadow-hover: 0 6px 20px rgba(102, 126, 234, 0.6);
  --oc-trigger-shadow-active: 0 6px 20px rgba(240, 147, 251, 0.4);

  position: fixed;
  z-index: 999999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.opencode-widget.opencode-theme-dark {
  /* Colors - Dark Theme */
  --oc-bg-main: #1a1a1a;
  --oc-bg-secondary: #1e1e1e;
  --oc-bg-tertiary: #282828;
  --oc-overlay-bg: rgba(26, 26, 26, 0.9);
  --oc-bg-inverse: #ffffff;

  --oc-text-primary: #f3f4f6;
  --oc-text-secondary: #d1d5db;
  --oc-text-tertiary: #9ca3af;
  --oc-text-placeholder: #6b7280;
  --oc-text-inverse: #282828;

  --oc-border-primary: #282828;
  --oc-border-secondary: #4b5563;

  --oc-primary: #3b82f6;
  --oc-primary-hover: #2563eb;
  --oc-primary-bg: rgba(59, 130, 246, 0.15);

  --oc-danger: #ef4444;
  --oc-danger-hover: #dc2626;
  --oc-danger-active: #b91c1c;

  --oc-success: #10b981;

  --oc-overlay: rgba(26, 26, 26, 0.9);
  --oc-tooltip-bg: #282828;
  --oc-dialog-overlay: rgba(0, 0, 0, 0.7);

  /* Skeleton */
  --oc-skeleton-bg: #151515;
  --oc-skeleton-gradient: linear-gradient(90deg, #282828 25%, #4b5563 50%, #282828 75%);

  /* Shadows */
  --oc-shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.3);
  --oc-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --oc-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
  --oc-shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.6);
  --oc-shadow-primary: 0 2px 4px rgba(59, 130, 246, 0.3);
  --oc-shadow-primary-hover: 0 4px 6px rgba(59, 130, 246, 0.4);
  --oc-shadow-danger: 0 4px 12px rgba(239, 68, 68, 0.4);

  /* Trigger */
  --oc-trigger-bg: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --oc-trigger-bg-hover: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
  --oc-trigger-bg-active: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --oc-trigger-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
  --oc-trigger-shadow-hover: 0 6px 20px rgba(102, 126, 234, 0.7);
  --oc-trigger-shadow-active: 0 6px 20px rgba(240, 147, 251, 0.5);
}

.opencode-widget.bottom-right {
  bottom: 20px;
  right: 20px;
}

.opencode-widget.bottom-left {
  bottom: 20px;
  left: 20px;
}

.opencode-widget.top-right {
  top: 20px;
  right: 20px;
}

.opencode-widget.top-left {
  top: 20px;
  left: 20px;
}



.opencode-chat {
  position: absolute;
  width: 700px;
  height: 86vh;
  background: var(--oc-bg-main);
  border-radius: 16px;
  box-shadow: var(--oc-shadow-lg);
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  transform: translateY(20px) scale(0.95);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.opencode-chat-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.opencode-widget.bottom-right .opencode-chat {
  bottom: 56px;
  right: 0;
}

.opencode-widget.bottom-left .opencode-chat {
  bottom: 56px;
  left: 0;
}

.opencode-widget.top-right .opencode-chat {
  top: 56px;
  right: 0;
}

.opencode-widget.top-left .opencode-chat {
  top: 56px;
  left: 0;
}

.opencode-widget.bottom-right .opencode-selected-bubbles {
  bottom: 56px;
  right: 0;
}

.opencode-widget.bottom-left .opencode-selected-bubbles {
  bottom: 56px;
  left: 0;
}

.opencode-widget.top-right .opencode-selected-bubbles {
  top: 56px;
  bottom: auto;
  right: 0;
}

.opencode-widget.top-left .opencode-selected-bubbles {
  top: 56px;
  bottom: auto;
  left: 0;
}

.opencode-chat.open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}

.opencode-notification {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  background: var(--oc-bg-main);
  color: var(--oc-text-primary);
  border: 1px solid var(--oc-border-primary);
  border-radius: 8px;
  font-size: 14px;
  box-shadow: var(--oc-shadow-lg);
  animation: slideDown 0.3s ease;
  z-index: 10000000;
}

.opencode-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--oc-dialog-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999999;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.opencode-dialog {
  background: var(--oc-bg-main);
  border-radius: 12px;
  padding: 24px;
  min-width: 320px;
  max-width: 400px;
  box-shadow: var(--oc-shadow-xl);
  animation: scaleIn 0.2s ease;
}

@keyframes scaleIn {
  from {
    transform: scale(0.9);
    opacity: 0;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.opencode-dialog-content {
  margin-bottom: 20px;
}

.opencode-dialog-message {
  font-size: 15px;
  color: var(--oc-text-primary);
  line-height: 1.5;
}

.opencode-dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.opencode-dialog-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.opencode-dialog-btn.cancel {
  background: var(--oc-bg-tertiary);
  color: var(--oc-text-primary);
}

.opencode-dialog-btn.cancel:hover {
  background: var(--oc-text-primary);
  color: var(--oc-bg-main);
}

.opencode-dialog-btn.confirm {
  background: var(--oc-danger);
  color: white;
}

.opencode-dialog-btn.confirm:hover {
  background: var(--oc-danger-hover);
}

@keyframes slideDown {
  from {
    transform: translateX(-50%) translateY(-100%);
    opacity: 0;
  }

  to {
    transform: translateX(-50%) translateY(0px);
    opacity: 1;
  }
}

.opencode-element-highlight {
  position: fixed;
  pointer-events: none;
  z-index: 999998;
  display: none;
  transition: all 0.1s ease;
  border-radius: 4px;
}

#vue-inspector-container {
  display: none !important;
}

.opencode-element-tooltip {
  position: fixed;
  background: var(--oc-tooltip-bg);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  z-index: 9999998;
  display: none;
  box-shadow: var(--oc-shadow-md);
  max-width: 300px;
  pointer-events: none;
}

.opencode-tooltip-tag {
  font-weight: 500;
  margin-bottom: 4px;
  word-break: break-all;
}

.opencode-tooltip-file {
  font-size: 11px;
  color: var(--oc-text-placeholder);
  word-break: break-all;
}

.opencode-element-highlight-temp {
  position: absolute;
  pointer-events: none;
  z-index: 999998;
  border-radius: 4px;
  animation: highlight-pulse 2s ease-out forwards;
}

@keyframes highlight-pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.8;
    transform: scale(1.02);
  }

  100% {
    opacity: 0;
    transform: scale(1);
  }
}

@media (max-width: 768px) {
  .opencode-chat {
    width: calc(100vw - 40px);
    height: calc(100vh - 100px);
  }
}
</style>
