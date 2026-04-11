import { ref, onMounted, onUnmounted } from "vue";
import type { OpenCodeSelectedElement, ServiceStatus } from "@vite-plugin-opencode-assistant/shared";

export function useContext(
  serviceStatus: { value: ServiceStatus },
  selectedElements: { value: OpenCodeSelectedElement[] },
) {
  let currentPageUrl = "";
  let currentPageTitle = "";

  const updateContext = (force = false) => {
    if (serviceStatus.value === "idle") return;
    const newUrl = window.location.href;
    const newTitle = document.title;
    if (force || newUrl !== currentPageUrl || newTitle !== currentPageTitle) {
      currentPageUrl = newUrl;
      currentPageTitle = newTitle;
      fetch("/__opencode_context__", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl,
          title: newTitle,
          selectedElements: selectedElements.value,
        }),
      }).catch(() => {});
    }
  };

  const scheduleContextUpdate = () => {
    requestAnimationFrame(() => updateContext());
  };

  let titleObserver: MutationObserver | null = null;
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  onMounted(() => {
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      scheduleContextUpdate();
    };
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      scheduleContextUpdate();
    };
    window.addEventListener("popstate", scheduleContextUpdate);
    window.addEventListener("hashchange", scheduleContextUpdate);

    titleObserver = new MutationObserver(() => {
      if (document.title !== currentPageTitle) updateContext();
    });
    if (document.head) {
      titleObserver.observe(document.head, { childList: true, subtree: true });
    }
  });

  onUnmounted(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", scheduleContextUpdate);
    window.removeEventListener("hashchange", scheduleContextUpdate);
    if (titleObserver) {
      titleObserver.disconnect();
    }
  });

  return {
    updateContext,
  };
}
