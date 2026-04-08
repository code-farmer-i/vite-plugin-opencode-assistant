import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useSession } from "../src/open-code-widget/composables/use-session";
import type { OpenCodeWidgetSession } from "../src/open-code-widget/src/types";

describe("useSession composable", () => {
  it("should format sessionItems correctly", () => {
    const mockSessions: OpenCodeWidgetSession[] = [
      {
        id: "session-1",
        title: "Session 1",
        meta: "Custom meta",
        updatedAt: Date.now() - 1000,
      },
      {
        id: "session-2",
        title: "Session 2",
        updatedAt: Date.now() - 60000,
      },
      {
        id: "session-3",
        title: "Session 3",
        // No meta and no updatedAt
      },
    ];

    const options = {
      sessions: ref(mockSessions),
      currentSessionId: ref("session-1"),
      onCreateSession: vi.fn(),
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    };

    const { sessionItems } = useSession(options);

    expect(sessionItems.value).toHaveLength(3);

    // Check active state
    expect(sessionItems.value[0].active).toBe(true);
    expect(sessionItems.value[1].active).toBe(false);
    expect(sessionItems.value[2].active).toBe(false);

    // Check formatted meta
    expect(sessionItems.value[0].meta).toBe("Custom meta");
    expect(sessionItems.value[1].meta).toMatch(/\d{1,4}\/\d{1,2}\/\d{1,2}/); // Match date part
    expect(sessionItems.value[2].meta).toBe("");
  });

  it("should trigger callbacks correctly", async () => {
    const mockSessions: OpenCodeWidgetSession[] = [{ id: "session-1", title: "Session 1" }];

    const options = {
      sessions: ref(mockSessions),
      currentSessionId: ref("session-1"),
      onCreateSession: vi.fn(),
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    };

    const { sessionItems, handleCreateSession, handleSelectSession, handleDeleteSession } =
      useSession(options);

    handleCreateSession();
    expect(options.onCreateSession).toHaveBeenCalled();

    handleSelectSession(sessionItems.value[0]);
    expect(options.onSelectSession).toHaveBeenCalledWith(mockSessions[0]);

    await handleDeleteSession(sessionItems.value[0]);
    expect(options.onDeleteSession).toHaveBeenCalledWith(mockSessions[0]);
  });
});
