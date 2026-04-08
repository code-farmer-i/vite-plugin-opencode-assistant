/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { ref, watch, onMounted, onUnmounted, type Ref } from "vue";
import type { OpenCodeSelectedElement } from "../src/types";

interface VueInspector {
  getTargetNode: (e: MouseEvent) => {
    targetNode: Element | null;
    params: { file?: string; line?: number; column?: number } | null;
  };
  handleClick: (e: MouseEvent) => void;
  enable: () => void;
  disable: () => void;
  __opencode_hooked?: boolean;
}

declare global {
  interface Window {
    __VUE_INSPECTOR__?: VueInspector;
  }
}

interface UseInspectorOptions {
  selectMode: Ref<boolean>;
  onAddSelectedNode: (element: OpenCodeSelectedElement) => void;
  onExitSelectMode: () => void;
}

function truncate(str: string, maxLength: number): string {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}

function getDirectText(element: Element): string {
  let text = "";
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent || "";
    }
  }
  return text.trim();
}

function getElementDescription(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const parts = [tag];

  const id = element.id;
  if (id) parts.push(`#${id}`);

  if (typeof element.className === "string") {
    const className = element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    if (className) parts.push(`.${className}`);
  }

  const name = element.getAttribute("name");
  if (name) parts.push(`[name="${name}"]`);

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) parts.push(`[placeholder="${placeholder.substring(0, 20)}"]`);

  const src = element.getAttribute("src");
  if (src) parts.push(`[src]`);

  const href = element.getAttribute("href");
  if (href && href !== "#") parts.push(`[href]`);

  return parts.join("");
}

export function useInspector(options: UseInspectorOptions) {
  const highlightVisible = ref(false);
  const highlightStyle = ref({ top: "0px", left: "0px", width: "0px", height: "0px" });

  const tooltipVisible = ref(false);
  const tooltipStyle = ref({ top: "0px", left: "0px" });
  const tooltipContent = ref({ description: "", fileInfo: "" });

  const INSPECTOR_CHECK_INTERVAL = 500;
  let inspectorCheckTimer: number | null = null;

  function handleMouseMove(e: MouseEvent) {
    if (!options.selectMode.value) return;

    const inspector = window.__VUE_INSPECTOR__;
    if (!inspector) return;

    const { targetNode, params } = inspector.getTargetNode(e);

    if (targetNode && params) {
      const rect = targetNode.getBoundingClientRect();

      highlightVisible.value = true;
      highlightStyle.value = {
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      };

      const description = getElementDescription(targetNode);
      const fileName = params.file ? params.file.split("/").pop() : "";
      let lineInfo = "";
      if (params.line) {
        lineInfo = `:${params.line}`;
        if (params.column) {
          lineInfo += `:${params.column}`;
        }
      }

      tooltipContent.value = {
        description,
        fileInfo: fileName ? `${fileName}${lineInfo}` : "",
      };
      tooltipVisible.value = true;

      // Ensure tooltip stays on screen
      // Assuming a default tooltip height/width since it's not rendered yet
      const tooltipHeight = 50;
      const tooltipWidth = 200;

      let tooltipTop = rect.top - tooltipHeight - 8;
      let tooltipLeft = rect.left;

      if (tooltipTop < 10) {
        tooltipTop = rect.bottom + 8;
      }
      if (tooltipLeft + tooltipWidth > window.innerWidth - 10) {
        tooltipLeft = window.innerWidth - tooltipWidth - 10;
      }

      tooltipStyle.value = {
        top: `${tooltipTop}px`,
        left: `${tooltipLeft}px`,
      };
    } else {
      highlightVisible.value = false;
      tooltipVisible.value = false;
    }
  }

  function setupInspectorHook() {
    const inspector = window.__VUE_INSPECTOR__;
    if (!inspector || inspector.__opencode_hooked) return;

    const originalHandleClick = inspector.handleClick.bind(inspector);

    inspector.handleClick = function (e: MouseEvent) {
      if (options.selectMode.value) {
        const { targetNode, params } = inspector.getTargetNode(e);
        if (targetNode && params) {
          const innerText = getDirectText(targetNode);
          const description = getElementDescription(targetNode);

          const elementInfo: OpenCodeSelectedElement = {
            filePath: params.file ?? null,
            line: params.line ?? null,
            column: params.column ?? null,
            innerText: truncate(innerText, 200),
            description,
          };

          options.onAddSelectedNode(elementInfo);
        }
        return;
      }

      return originalHandleClick.call(inspector, e);
    };

    inspector.__opencode_hooked = true;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && options.selectMode.value) {
      e.preventDefault();
      e.stopPropagation();
      options.onExitSelectMode();
    }
  }

  watch(options.selectMode, (newVal) => {
    const inspector = window.__VUE_INSPECTOR__;
    if (newVal) {
      if (inspector) {
        inspector.enable();
      }
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("keydown", handleKeydown, true);
    } else {
      if (inspector) {
        inspector.disable();
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("keydown", handleKeydown, true);
      highlightVisible.value = false;
      tooltipVisible.value = false;
    }
  });

  onMounted(() => {
    if (window.__VUE_INSPECTOR__) {
      setupInspectorHook();
    } else {
      inspectorCheckTimer = window.setInterval(() => {
        if (window.__VUE_INSPECTOR__) {
          setupInspectorHook();
          if (inspectorCheckTimer) {
            window.clearInterval(inspectorCheckTimer);
            inspectorCheckTimer = null;
          }
        }
      }, INSPECTOR_CHECK_INTERVAL);
    }
  });

  onUnmounted(() => {
    if (inspectorCheckTimer) {
      window.clearInterval(inspectorCheckTimer);
    }
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("keydown", handleKeydown, true);
  });

  return {
    highlightVisible,
    highlightStyle,
    tooltipVisible,
    tooltipStyle,
    tooltipContent,
  };
}
