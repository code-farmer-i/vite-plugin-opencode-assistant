import { execa } from "execa";
import type { ResultPromise } from "execa";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import type { WebOptions } from "@vite-plugin-opencode-assistant/shared";
import { createLogger } from "@vite-plugin-opencode-assistant/shared";

const require = createRequire(path.join(process.cwd(), "package.json"));
const packageDir = resolvePackageDir();

const log = createLogger("OpenCodeWeb");

export function prepareOpenCodeRuntime(cwd: string): string {
  const cacheDir = path.join(cwd, "node_modules", ".cache", "opencode");
  const pluginsDir = path.join(cacheDir, "plugins");

  log.debug("Setting up OpenCode runtime", { cacheDir, pluginsDir });

  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
  }

  const pluginSourcePath = resolvePluginSourcePath();
  const pluginTargetPath = path.join(pluginsDir, "page-context.js");

  if (!fs.existsSync(pluginSourcePath)) {
    throw new Error(`Page context plugin not found: ${pluginSourcePath}`);
  }

  fs.copyFileSync(pluginSourcePath, pluginTargetPath);

  const mcpConfigPath = path.join(cacheDir, "opencode.json");
  fs.writeFileSync(
    mcpConfigPath,
    JSON.stringify(
      {
        mcp: {
          "chrome-devtools": {
            type: "local",
            command: [
              "npx",
              "-y",
              "chrome-devtools-mcp@latest",
              "--autoConnect",
            ],
            enabled: true,
          },
        },
      },
      null,
      2,
    ),
  );

  log.debug("OpenCode runtime ready", {
    cacheDir,
    pluginTargetPath,
    mcpConfigPath,
  });

  return cacheDir;
}

export function startOpenCodeWeb(options: WebOptions): ResultPromise {
  const { port, hostname, cwd, configDir, corsOrigins, contextApiUrl } =
    options;
  const stateDir = createStateDirectory(cwd);
  const pluginPath = path.join(stateDir, "plugins", "page-context.js");

  log.debug("Building process environment", {
    stateDir,
    configDir,
    contextApiUrl,
    pluginPath,
  });

  const env = buildProcessEnv(stateDir, configDir, contextApiUrl, pluginPath);
  const args = ["serve", "--port", String(port), "--hostname", hostname];

  if (corsOrigins && corsOrigins.length > 0) {
    corsOrigins.forEach((origin: string) => {
      args.push("--cors", origin);
    });
    log.debug("CORS origins added", { origins: corsOrigins });
  }

  log.debug("Spawning OpenCode process", {
    command: "opencode",
    args: args.join(" "),
    cwd,
  });

  const proc = execa("opencode", args, {
    cwd,
    env,
    reject: false,
    cleanup: true,
  });

  proc.stdout?.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      log.debug("[OpenCode stdout]", { output });
    }
  });

  proc.stderr?.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      log.warn("[OpenCode stderr]", { output });
    }
  });

  return proc;
}

function createStateDirectory(cwd: string): string {
  const stateDir = path.join(cwd, "node_modules", ".cache", "opencode");

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
    log.debug("Created state directory", { stateDir });
  }

  return stateDir;
}

function resolvePackageDir(): string {
  const entryPath = require.resolve("@vite-plugin-opencode-assistant/opencode");
  return path.resolve(path.dirname(entryPath), "..");
}

function resolvePluginSourcePath(): string {
  const candidatePaths = [
    path.join(packageDir, "es", "plugins", "page-context.js"),
    path.join(packageDir, "lib", "plugins", "page-context.js"),
  ];

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return candidatePaths[0];
}

function buildProcessEnv(
  stateDir: string,
  configDir?: string,
  contextApiUrl?: string,
  pluginPath?: string,
): Record<string, string> {
  const env: Record<string, string> = {
    ...(Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined),
    ) as Record<string, string>),
    XDG_STATE_HOME: stateDir,
  };

  if (configDir) {
    env.OPENCODE_CONFIG_DIR = configDir;
    log.debug("Set OPENCODE_CONFIG_DIR", { configDir });
  }

  if (contextApiUrl) {
    env.OPENCODE_CONTEXT_API_URL = contextApiUrl;
    log.debug("Set OPENCODE_CONTEXT_API_URL", { contextApiUrl });
  }

  if (pluginPath) {
    env.OPENCODE_PLUGINS = pluginPath;
    log.debug("Set OPENCODE_PLUGINS", { pluginPath });
  }

  return env;
}
