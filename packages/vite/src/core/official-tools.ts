/**
 * 官方 chrome-devtools-mcp 工具的运行时同步与项目白名单化。
 *
 * 模型可见的 chrome-devtools_* 工具依据官方 tools/list 返回的 schema/描述（英文），
 * 按白名单过滤，并对页面级工具统一追加必填 pageId（工具层项目限制）。
 * 仅保留进程内内存单飞缓存；拉取失败时释放并在下次请求重试。
 */
import { createLogger } from "@aipanel/core/node";
import {
  MCP_PREFIX,
  OFFICIAL_NO_PAGE_TOOLS,
  PROJECT_DESCRIPTION_NOTES,
  currentOfficialShorts,
  displayToolName,
  withPageIdSchema,
  type CustomTool,
} from "./mcp-tools";
import type { McpProxy } from "./mcp-proxy";

const log = createLogger("OfficialChromeTools");

interface OfficialEntry {
  short: string;
  description: string;
  schema: CustomTool["inputSchema"];
}

type EntryMap = Map<string, OfficialEntry>;

let cached: Promise<EntryMap> | null = null;

/** 从官方 tools/list 拉取并建索（名称匹配短名/带前缀的短名） */
async function fetchOfficialEntries(mcp: McpProxy): Promise<EntryMap> {
  const res = (await mcp.call("tools/list", {})) as {
    result?: { tools?: Array<{ name?: unknown; description?: unknown; inputSchema?: unknown }> };
  };
  const map: EntryMap = new Map();
  for (const t of res?.result?.tools ?? []) {
    const raw = String(t?.name ?? "");
    const short = raw.startsWith(MCP_PREFIX) ? raw.slice(MCP_PREFIX.length) : raw;
    if (!short) continue;
    const schema = (t?.inputSchema ?? { type: "object", properties: {} }) as CustomTool["inputSchema"];
    map.set(short, { short, description: String(t?.description ?? ""), schema });
  }
  return map;
}

/** 内存单飞缓存：成功后复用，失败时释放以便下次重试 */
function ensureOfficialEntries(mcp: McpProxy): Promise<EntryMap> {
  if (!cached) {
    cached = fetchOfficialEntries(mcp).catch((e) => {
      cached = null;
      log.warn("Failed to fetch official chrome-devtools-mcp tools", {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    });
  }
  return cached;
}

/**
 * 项目白名单的官方工具集（英文 schema/描述，已追加 pageId）。
 * 官方当前版本缺失某名时跳过（名称跟随官方，不本地复制）。
 */
export async function getOfficialProjectTools(mcp: McpProxy): Promise<CustomTool[]> {
  const map = await ensureOfficialEntries(mcp);
  const tools: CustomTool[] = [];
  for (const short of currentOfficialShorts()) {
    const entry = map.get(short);
    if (!entry) {
      // 已请求但官方未注册：不静默跳过，明确告警（多为 extra 需对应官方开关/条件，如 get_tab_id 需 experimentalInteropTools）
      log.warn("Requested official tool missing from server tools/list (skip)", { short });
      continue;
    }
    const schema = OFFICIAL_NO_PAGE_TOOLS.has(short)
      ? entry.schema
      : withPageIdSchema(entry.schema);
    // 官方描述 + 项目维度特例说明（不改 schema，不写回缓存）
    const note = PROJECT_DESCRIPTION_NOTES[short];
    const description = note
      ? entry.description
        ? `${entry.description} ${note}`
        : note
      : entry.description;
    tools.push({ name: displayToolName(short), description, inputSchema: schema });
  }
  return tools;
}
