import { computed, type Ref } from "vue";
import type {
  OpenCodeRemoveSelectedPayload,
  OpenCodeSelectedElement,
  OpenCodeSelectedElementItem,
} from "../src/types";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function getElementKey(element: OpenCodeSelectedElement, index: number): string {
  if (element.filePath && element.line) {
    return `${element.filePath}:${element.line}:${element.column ?? 0}`;
  }

  return `${element.description}-${index}`;
}

function getBubbleFileText(element: OpenCodeSelectedElement): string {
  const fileName = element.filePath?.split("/").pop() || "";
  const lineInfo = element.line
    ? `:${element.line}${element.column ? `:${element.column}` : ""}`
    : "";

  return `${fileName}${lineInfo}`;
}

function getPanelFileText(element: OpenCodeSelectedElement): string {
  const fileName = element.filePath?.split("/").pop() || "未知文件";
  const lineInfo = element.line
    ? `:${element.line}${element.column ? `:${element.column}` : ""}`
    : "";
  const textPreview = element.innerText?.trim()
    ? `${truncate(element.innerText.trim(), 30)} · `
    : "";

  return `${textPreview}${fileName}${lineInfo}`;
}

export interface UseSelectionOptions {
  selectMode: Ref<boolean>;
  selectedElements: Ref<OpenCodeSelectedElement[]>;
  onToggleSelectMode: (mode: boolean) => void;
  onClickSelectedNode: (element: OpenCodeSelectedElement) => void;
  onRemoveSelectedNode: (payload: OpenCodeRemoveSelectedPayload) => void;
  onClearSelectedNodes: () => void;
  showConfirmDialog: (message: string) => Promise<boolean>;
}

export function useSelection(options: UseSelectionOptions) {
  const bubbleVisible = computed(
    () => options.selectMode.value || (options.selectedElements.value || []).length > 0,
  );

  const selectedElementItems = computed<OpenCodeSelectedElementItem[]>(() =>
    (options.selectedElements.value || []).map(
      (element: OpenCodeSelectedElement, index: number) => ({
        key: getElementKey(element, index),
        description: element.description || "未知元素",
        bubbleFileText: getBubbleFileText(element),
        panelFileText: getPanelFileText(element),
        element,
      }),
    ),
  );

  const hasSelectedElements = computed(() => selectedElementItems.value.length > 0);

  function handleToggleSelectMode(): void {
    options.onToggleSelectMode(!options.selectMode.value);
  }

  function handleClickSelectedNode(item: OpenCodeSelectedElementItem): void {
    options.onClickSelectedNode(item.element);
  }

  function handleRemoveSelectedNode(
    item: OpenCodeSelectedElementItem,
    index: number,
    source: OpenCodeRemoveSelectedPayload["source"],
  ): void {
    options.onRemoveSelectedNode({ element: item.element, index, source });
  }

  async function handleClearSelectedNodes(): Promise<void> {
    if (!options.selectedElements.value || options.selectedElements.value.length === 0) return;
    const confirmed = await options.showConfirmDialog(
      `确定要清空所有 ${options.selectedElements.value.length} 个已选节点吗？`,
    );
    if (confirmed) {
      options.onClearSelectedNodes();
    }
  }

  return {
    bubbleVisible,
    hasSelectedElements,
    selectedElementItems,
    handleClearSelectedNodes,
    handleClickSelectedNode,
    handleRemoveSelectedNode,
    handleToggleSelectMode,
  };
}
