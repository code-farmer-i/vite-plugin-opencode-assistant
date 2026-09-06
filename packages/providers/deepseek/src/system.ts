/**
 * Provider 运行环境检查与进程管理（CLI 安装/版本/孤儿进程清理）
 * 统一实现复用 @aipanel/core/node（checkCliInstalled/getCliVersion/killOrphanCliProcesses）；
 * semver 比较（dsh 专属）保留于本文件。
 */
import { checkCliInstalled, getCliVersion, killOrphanCliProcesses } from "@aipanel/core/node";

export function checkDeepSeekInstalled(): Promise<boolean> {
  return checkCliInstalled("dsh");
}

export function getDeepSeekVersion(): Promise<string | null> {
  return getCliVersion("dsh");
}

export function killOrphanDeepSeekProcesses(): Promise<number> {
  return killOrphanCliProcesses("dsh", { match: "dsh", winName: "node.exe", label: "dsh" });
}

/** 本 provider 要求的 dsh 最低版本（0.1.2 起：browser-session 认证 + {args} Remote RPC + remote.mux，协议不向下兼容） */
export const MIN_DSH_VERSION = "0.1.2-rc.1";

/**
 * 解析 dsh --version 输出（如 "0.1.2-rc.1"，容忍 v 前缀与尾部换行）。
 * @returns {major,minor,patch,pre}；无法解析时返回 null。
 */
function parseDshVersion(
  version: string,
): { major: number; minor: number; patch: number; pre: string | undefined } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4],
  };
}

/**
 * 判定 version 是否 >= minimum（semver 风格，含 pre-release 比较：0.1.2 > 0.1.2-rc.1）。
 * @returns true/false；任一版本无法解析时返回 null（调用方按“无法确认”放行）。
 */
export function isDeepSeekVersionAtLeast(
  version: string,
  minimum = MIN_DSH_VERSION,
): boolean | null {
  const a = parseDshVersion(version);
  const b = parseDshVersion(minimum);
  if (!a || !b) return null;
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] > b[key];
  }
  // 核心版本相同：无 pre-release > 有 pre-release
  if (a.pre === undefined && b.pre === undefined) return true;
  if (a.pre === undefined) return true;
  if (b.pre === undefined) return false;
  // pre-release 逐段比较（数值段按数字、否则按字符串）
  const pa = a.pre.split(".");
  const pb = b.pre.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return true; // a 更短：a < b
    if (y === undefined) return false;
    const xn = /^\d+$/.test(x) ? Number(x) : NaN;
    const yn = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!Number.isNaN(xn) && !Number.isNaN(yn)) {
      if (xn !== yn) return xn > yn;
    } else if (x !== y) {
      return x > y;
    }
  }
  return true;
}
