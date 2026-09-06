import { ref, watch } from "vue";
import type { AIPanelSelectedElement } from "@aipanel/core";
import { SELECTED_ELEMENTS_KEY } from "@aipanel/core";
import { storageGet, storageSet } from "@aipanel/core/client";

export function useSelectedElements(serviceInstanceId = "") {
  const storageKey = serviceInstanceId
    ? `${SELECTED_ELEMENTS_KEY}_${serviceInstanceId}`
    : SELECTED_ELEMENTS_KEY;
  const selectedElements = ref<AIPanelSelectedElement[]>([]);

  const stored = storageGet<AIPanelSelectedElement[]>("session", storageKey);
  if (stored) {
    selectedElements.value = stored;
  }

  watch(
    selectedElements,
    (val) => {
      storageSet("session", storageKey, val);
    },
    { deep: true },
  );

  const addElement = (element: AIPanelSelectedElement) => {
    const exists = selectedElements.value.some(
      (el) => el.filePath === element.filePath && el.line === element.line,
    );
    if (!exists) {
      selectedElements.value.push(element);
      return true;
    }
    return false;
  };

  const removeElement = (index: number) => {
    selectedElements.value.splice(index, 1);
  };

  const clearElements = () => {
    selectedElements.value = [];
  };

  return {
    selectedElements,
    addElement,
    removeElement,
    clearElements,
  };
}
