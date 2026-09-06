/**
 * Provider 运行环境检查与进程管理（CLI 安装/版本/孤儿进程清理）
 * 统一实现复用 @aipanel/core/node（checkCliInstalled/getCliVersion/killOrphanCliProcesses）。
 */
import { checkCliInstalled, getCliVersion, killOrphanCliProcesses } from "@aipanel/core/node";

export function checkOpenCodeInstalled(): Promise<boolean> {
  return checkCliInstalled("opencode");
}

export function getOpenCodeVersion(): Promise<string | null> {
  return getCliVersion("opencode");
}

export function killOrphanOpenCodeProcesses(): Promise<number> {
  return killOrphanCliProcesses("opencode", { match: "opencode", winName: "opencode.exe", label: "opencode" });
}
