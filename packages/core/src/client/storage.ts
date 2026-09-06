/**
 * 浏览器存储辅助（window.localStorage/sessionStorage，仅 client 端；通过 @aipanel/core/client 导出）
 */

function storageArea(area: "local" | "session"): Storage | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return area === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * 安全读取浏览器存储（JSON 解码；不可用/异常返回 null）
 */
export function storageGet<T>(area: "local" | "session", key: string): T | null {
  try {
    const raw = storageArea(area)?.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

/**
 * 安全写入浏览器存储（JSON 序列化；异常忽略）
 */
export function storageSet(area: "local" | "session", key: string, value: unknown): void {
  try {
    storageArea(area)?.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用时安静忽略
  }
}

/**
 * 安全删除浏览器存储项
 */
export function storageRemove(area: "local" | "session", key: string): void {
  try {
    storageArea(area)?.removeItem(key);
  } catch {
    // 存储不可用时安静忽略
  }
}
