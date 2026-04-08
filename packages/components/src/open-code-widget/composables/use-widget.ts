import { computed, type Ref } from "vue";

export interface UseWidgetOptions {
  position: Ref<string>;
  theme: Ref<string>;
  open: Ref<boolean>;
  selectMode: Ref<boolean>;
  iframeSrc: Ref<string>;
  sessionListCollapsed: Ref<boolean>;
  onToggle: (nextOpen: boolean) => void;
  onClose: () => void;
  onToggleSessionList: (collapsed: boolean) => void;
  onEmptyAction: () => void;
}

export function useWidget(options: UseWidgetOptions) {
  const containerClasses = computed(() => [
    "opencode-widget",
    options.position.value,
    `opencode-theme-${options.theme.value}`,
  ]);

  const buttonActive = computed(() => !!(options.open.value || options.selectMode.value));

  const iframeSource = computed(() => options.iframeSrc.value || "about:blank");

  const sessionListTitle = computed(() =>
    options.sessionListCollapsed.value ? "展开会话列表" : "折叠会话列表",
  );

  function handleToggle(): void {
    const nextOpen = !options.open.value;
    options.onToggle(nextOpen);
  }

  function handleClose(): void {
    options.onClose();
  }

  function handleToggleSessionList(): void {
    options.onToggleSessionList(!options.sessionListCollapsed.value);
  }

  function handleEmptyAction(): void {
    options.onEmptyAction();
  }

  return {
    buttonActive,
    containerClasses,
    iframeSource,
    sessionListTitle,
    handleClose,
    handleEmptyAction,
    handleToggle,
    handleToggleSessionList,
  };
}
