import { watch, onMounted, type Ref } from "vue";
import { storageGet, storageSet } from "@aipanel/core/client";
import type { FloatingBubbleOffset } from "../src/components/FloatingBubble/types";
import type { AIPanelWidgetTheme, DisplayMode } from "../src/types";

export interface WidgetPersistState {
  open: boolean;
  minimized: boolean;
  promptDockVisible: boolean;
  reviewPanelVisible: boolean;
  bubbleOffset?: FloatingBubbleOffset;
  theme: AIPanelWidgetTheme;
  sessionListCollapsed: boolean;
  splitPanelWidth?: number;
  displayMode?: DisplayMode;
  splitPosition?: "left" | "right";
}

const STORAGE_KEY = "aipanel-widget-state";

function loadState(): Partial<WidgetPersistState> | null {
  return storageGet<Partial<WidgetPersistState>>("local", STORAGE_KEY);
}

function saveState(state: WidgetPersistState): void {
  storageSet("local", STORAGE_KEY, state);
}

export interface UsePersistStateOptions {
  open: Ref<boolean>;
  minimized: Ref<boolean>;
  promptDockVisible: Ref<boolean>;
  reviewPanelVisible: Ref<boolean>;
  bubbleOffset: Ref<FloatingBubbleOffset | undefined>;
  theme: Ref<AIPanelWidgetTheme>;
  sessionListCollapsed: Ref<boolean>;
  splitPanelWidth?: Ref<number>;
  displayMode?: Ref<DisplayMode>;
  splitPosition?: Ref<"left" | "right">;
  onRestore?: (state: Partial<WidgetPersistState>) => void;
}

export function usePersistState(options: UsePersistStateOptions) {
  const restoreState = (): Partial<WidgetPersistState> | null => {
    const saved = loadState();
    if (options.onRestore) {
      options.onRestore(saved || {});
    }
    return saved;
  };

  const getCurrentState = (): WidgetPersistState => ({
    open: options.open.value,
    minimized: options.minimized.value,
    promptDockVisible: options.promptDockVisible.value,
    reviewPanelVisible: options.reviewPanelVisible.value,
    bubbleOffset: options.bubbleOffset.value,
    theme: options.theme.value,
    sessionListCollapsed: options.sessionListCollapsed.value,
    splitPanelWidth: options.splitPanelWidth?.value,
    displayMode: options.displayMode?.value,
    splitPosition: options.splitPosition?.value,
  });

  const persistState = () => {
    saveState(getCurrentState());
  };

  const watchers: Ref<unknown>[] = [
    options.open,
    options.minimized,
    options.promptDockVisible,
    options.reviewPanelVisible,
    options.bubbleOffset,
    options.theme,
    options.sessionListCollapsed,
  ];

  if (options.splitPanelWidth) {
    watchers.push(options.splitPanelWidth);
  }

  if (options.displayMode) {
    watchers.push(options.displayMode);
  }

  if (options.splitPosition) {
    watchers.push(options.splitPosition);
  }

  onMounted(() => {
    restoreState();

    watch(
      watchers,
      () => {
        persistState();
      },
      { deep: true },
    );
  });

  return {
    restoreState,
    persistState,
  };
}
