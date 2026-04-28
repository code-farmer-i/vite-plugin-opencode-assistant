import fs from "fs";
import path from "path";
import { createLogger } from "./logger";

const log = createLogger("FileLogWatcher");

export interface FileLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
  source: string;
}

export interface FileLogBufferOptions {
  name: string;
  filePath: string;
  maxBufferSize?: number;
  watchExisting?: boolean;
}

class FileLogBuffer {
  private buffer: FileLogEntry[] = [];
  private maxSize: number;
  private name: string;
  private filePath: string;
  private lastPosition: number = 0;
  private watcher: fs.FSWatcher | null = null;
  private enabled: boolean = false;

  constructor(options: FileLogBufferOptions) {
    this.name = options.name;
    this.filePath = options.filePath;
    this.maxSize = options.maxBufferSize ?? 200;
    this.enabled = true;
  }

  start(projectRoot?: string): void {
    const resolvedPath = this.resolvePath(projectRoot);

    if (!fs.existsSync(resolvedPath)) {
      log.debug(`Log file does not exist: ${resolvedPath}`);
      return;
    }

    const stat = fs.statSync(resolvedPath);
    this.lastPosition = stat.size;

    this.watcher = fs.watch(resolvedPath, (eventType) => {
      if (eventType === "change") {
        this.readNewLogs(resolvedPath);
      }
    });

    this.watcher.on("error", (err) => {
      log.error(`Error watching file ${resolvedPath}`, { error: err });
    });

    log.info(`Started watching log file: ${resolvedPath}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      log.debug(`Stopped watching log file: ${this.filePath}`);
    }
  }

  private resolvePath(projectRoot?: string): string {
    if (path.isAbsolute(this.filePath)) {
      return this.filePath;
    }

    if (projectRoot) {
      return path.resolve(projectRoot, this.filePath);
    }

    return path.resolve(process.cwd(), this.filePath);
  }

  private readNewLogs(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);

      if (stat.size <= this.lastPosition) {
        return;
      }

      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(stat.size - this.lastPosition);
      fs.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
      fs.closeSync(fd);

      this.lastPosition = stat.size;

      const content = buffer.toString("utf-8").trim();
      if (content) {
        this.processLogContent(content);
      }
    } catch (err) {
      log.error(`Error reading log file ${filePath}`, { error: err });
    }
  }

  private processLogContent(content: string): void {
    const lines = content.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      this.addEntry({
        level: this.detectLogLevel(line),
        message: line,
        timestamp: new Date().toISOString(),
        source: `file:${this.name}`,
      });
    }
  }

  private detectLogLevel(line: string): "info" | "warn" | "error" {
    const lowerLine = line.toLowerCase();

    if (lowerLine.includes("error") || lowerLine.includes("err") || lowerLine.includes("fatal")) {
      return "error";
    }

    if (lowerLine.includes("warn") || lowerLine.includes("warning")) {
      return "warn";
    }

    return "info";
  }

  addEntry(entry: FileLogEntry): void {
    if (!this.enabled) return;

    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }

    this.buffer.push(entry);
  }

  getLogs(
    options: {
      level?: FileLogEntry["level"] | FileLogEntry["level"][];
      limit?: number;
      since?: string;
    } = {},
  ): FileLogEntry[] {
    let logs = [...this.buffer];

    if (options.level) {
      const levels = Array.isArray(options.level) ? options.level : [options.level];
      logs = logs.filter((log) => levels.includes(log.level));
    }

    if (options.since) {
      const sinceDate = new Date(options.since);
      logs = logs.filter((log) => new Date(log.timestamp) >= sinceDate);
    }

    if (options.limit && options.limit > 0) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  clear(): void {
    this.buffer = [];
  }

  size(): number {
    return this.buffer.length;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getName(): string {
    return this.name;
  }

  getFilePath(): string {
    return this.filePath;
  }
}

export class ServiceLogWatcher {
  private buffers: Map<string, FileLogBuffer> = new Map();
  private projectRoot: string | null = null;

  setProjectRoot(root: string): void {
    this.projectRoot = root;
  }

  addLogFile(options: FileLogBufferOptions): void {
    if (this.buffers.has(options.name)) {
      log.warn(`Log file "${options.name}" already exists, skipping`);
      return;
    }

    const buffer = new FileLogBuffer(options);
    buffer.start(this.projectRoot ?? undefined);
    this.buffers.set(options.name, buffer);

    log.info(`Added log file watcher: ${options.name} -> ${options.filePath}`);
  }

  removeLogFile(name: string): void {
    const buffer = this.buffers.get(name);
    if (buffer) {
      buffer.stop();
      this.buffers.delete(name);
      log.info(`Removed log file watcher: ${name}`);
    }
  }

  getBuffer(name: string): FileLogBuffer | undefined {
    return this.buffers.get(name);
  }

  getAllBuffers(): Map<string, FileLogBuffer> {
    return this.buffers;
  }

  stopAll(): void {
    for (const [name, buffer] of this.buffers) {
      buffer.stop();
      log.debug(`Stopped log file watcher: ${name}`);
    }
    this.buffers.clear();
  }

  getLogFileNames(): string[] {
    return Array.from(this.buffers.keys());
  }
}

let globalWatcher: ServiceLogWatcher | null = null;

export function getServiceLogWatcher(): ServiceLogWatcher {
  if (!globalWatcher) {
    globalWatcher = new ServiceLogWatcher();
  }
  return globalWatcher;
}
