import type { Hooks } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import type { LogFileConfig, FileLogEntry } from "@vite-plugin-opencode-assistant/shared";
import { createLogger, getServiceLogWatcher } from "@vite-plugin-opencode-assistant/shared";

const log = createLogger("ServiceLogsPlugin");

export const ServiceLogsPlugin = async (): Promise<Hooks> => {
  log.debug("ServiceLogsPlugin loading...");

  const logFilesJson = process.env.OPENCODE_LOG_FILES_JSON;
  log.debug("Log files JSON from env:", { logFilesJson: logFilesJson ? "set" : "not set" });

  if (!logFilesJson) {
    log.debug("OPENCODE_LOG_FILES_JSON is not set, service logs plugin will not register tools");
    return {};
  }

  let logFiles: LogFileConfig[];
  try {
    logFiles = JSON.parse(logFilesJson) as LogFileConfig[];
    log.debug("Parsed log files config", { count: logFiles.length });
  } catch (e) {
    log.error("Failed to parse OPENCODE_LOG_FILES_JSON", { error: e });
    return {};
  }

  if (!logFiles || logFiles.length === 0) {
    log.debug("No log files configured, plugin will not register any tools");
    return {};
  }

  const watcher = getServiceLogWatcher();
  watcher.setProjectRoot(process.cwd());

  for (const logFileConfig of logFiles) {
    watcher.addLogFile({
      name: logFileConfig.name,
      filePath: logFileConfig.path,
      maxBufferSize: logFileConfig.maxBufferSize,
      watchExisting: logFileConfig.watchExisting,
    });
    log.debug(`Added log file watcher: ${logFileConfig.name} -> ${logFileConfig.path}`);
  }

  const tools: Record<string, ReturnType<typeof tool>> = {};

  for (const logFileConfig of logFiles) {
    const toolName = `get_${logFileConfig.name}_logs`;

    const description = `获取 ${logFileConfig.name} 的日志。

**何时使用此工具**：
${logFileConfig.description}

**日志内容**：
- 来自日志文件 ${logFileConfig.path} 的实时日志
- 最多保留 ${logFileConfig.maxBufferSize ?? 200} 条日志`;

    const getLogsTool = tool({
      description,
      args: {
        level: tool.schema
          .string()
          .optional()
          .describe(
            "日志级别过滤：error(错误)、warn(警告)、info(信息)。多个用逗号分隔，如 'error,warn'",
          ),
        limit: tool.schema
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .default(50)
          .describe("返回条数，默认 50，最大 200"),
        since: tool.schema
          .string()
          .optional()
          .describe("起始时间（ISO 格式），获取此时间之后的日志"),
      },
      async execute(args, context) {
        const { level, limit, since } = args;

        log.debug(`${toolName} called`, {
          args,
          sessionID: context.sessionID,
          directory: context.directory,
        });

        const buffer = watcher.getBuffer(logFileConfig.name);

        if (!buffer) {
          return `日志文件 "${logFileConfig.name}" 未找到。请检查配置。`;
        }

        const logs = buffer.getLogs({
          level: level
            ? (level.split(",").map((l) => l.trim()) as ("info" | "warn" | "error")[])
            : undefined,
          limit,
          since,
        });

        if (logs.length === 0) {
          return `当前没有符合条件的日志（缓冲区共 ${buffer.size()} 条）。

建议：
- 不指定参数获取所有日志
- 使用 level=error,warn 获取错误和警告`;
        }

        const formattedLogs = logs
          .map((entry: FileLogEntry) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const levelIcon = entry.level === "error" ? "❌" : entry.level === "warn" ? "⚠️" : "ℹ️";
            return `${time} ${levelIcon} ${entry.message}`;
          })
          .join("\n");

        return `${logFileConfig.name} 日志（${logs.length}/${buffer.size()} 条）：

${formattedLogs}`;
      },
    });

    tools[toolName] = getLogsTool;
    log.debug(`Registered tool: ${toolName}`);
  }

  log.debug(`Plugin initialized with ${Object.keys(tools).length} log tools`);

  return {
    tool: tools,
  };
};

export default ServiceLogsPlugin;
