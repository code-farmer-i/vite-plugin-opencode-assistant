import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { OpenCodeWidgetTheme } from "@vite-plugin-opencode-assistant/shared";

export function useTheme(
  initialTheme: OpenCodeWidgetTheme,
  widgetRef: { value: any },
) {
  const theme = ref<OpenCodeWidgetTheme>(initialTheme);

  const resolvedTheme = computed(() => {
    if (theme.value === "auto") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return theme.value;
  });

  const sendThemeToIframe = () => {
    widgetRef.value?.sendMessageToIframe("OPENCODE_SET_THEME", {
      theme: resolvedTheme.value,
    });
  };

  let mediaQuery: MediaQueryList | null = null;

  const handleSystemThemeChange = () => {
    if (theme.value === "auto") {
      sendThemeToIframe();
    }
  };

  onMounted(() => {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", handleSystemThemeChange);

    watch(resolvedTheme, () => {
      sendThemeToIframe();
    });
  });

  onUnmounted(() => {
    if (mediaQuery) {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    }
  });

  return {
    theme,
    resolvedTheme,
    sendThemeToIframe,
  };
}
