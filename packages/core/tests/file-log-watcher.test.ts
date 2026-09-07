/**
 * @fileoverview 日志文件读取单测（packages/core/src/node/file-log-watcher.ts，node 环境）
 * 全部用例只使用临时目录 + 真实 fs，不涉及网络/进程/服务器。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLogFile, readLogFileTail } from "../src/node/file-log-watcher";

let tmpDir: string;
let logFilePath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aipanel-core-logwatcher-"));
  logFilePath = path.join(tmpDir, "sample.log");
  fs.writeFileSync(
    logFilePath,
    [
      "everything is fine",
      "WARNING: disk space is low",
      "fatal error occurred",
      "",
      "another info line",
      "An error occurred during request",
    ].join("\n") + "\n",
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readLogFile", () => {
  it("reads all non-empty lines with detected levels", async () => {
    const entries = await readLogFile({ name: "sample", filePath: logFilePath });
    expect(entries).toEqual([
      { level: "info", message: "everything is fine", source: "file:sample" },
      { level: "warn", message: "WARNING: disk space is low", source: "file:sample" },
      { level: "error", message: "fatal error occurred", source: "file:sample" },
      { level: "info", message: "another info line", source: "file:sample" },
      { level: "error", message: "An error occurred during request", source: "file:sample" },
    ]);
  });

  it("returns [] when the file does not exist", async () => {
    const entries = await readLogFile({
      name: "missing",
      filePath: path.join(tmpDir, "nope.log"),
    });
    expect(entries).toEqual([]);
  });

  it("filters by level (single value and list)", async () => {
    const errors = await readLogFile({ name: "sample", filePath: logFilePath, level: "error" });
    expect(errors.map((e) => e.message)).toEqual([
      "fatal error occurred",
      "An error occurred during request",
    ]);
    const warnErr = await readLogFile({
      name: "sample",
      filePath: logFilePath,
      level: ["warn", "error"],
    });
    expect(warnErr.map((e) => e.level)).toEqual(["warn", "error", "error"]);
  });

  it("applies the limit to the newest entries", async () => {
    const entries = await readLogFile({ name: "sample", filePath: logFilePath, limit: 2 });
    expect(entries.map((e) => e.message)).toEqual([
      "another info line",
      "An error occurred during request",
    ]);
  });

  it("resolves relative paths against projectRoot", async () => {
    const entries = await readLogFile({
      name: "sample",
      filePath: "sample.log",
      projectRoot: tmpDir,
    });
    expect(entries.length).toBe(5);
  });
});

describe("readLogFileTail", () => {
  it("returns [] for a missing file", async () => {
    const entries = await readLogFileTail({
      name: "missing",
      filePath: path.join(tmpDir, "nope.log"),
    });
    expect(entries).toEqual([]);
  });

  it("keeps the requested trailing window (may include extra short lines)", async () => {
    // 实现按字符数估算多余行，短行场景会多保留若干行；保证末尾为真实文件行序列
    const sourceLines = fs
      .readFileSync(logFilePath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    const entries = await readLogFileTail({
      name: "sample",
      filePath: logFilePath,
      lines: 2,
    });
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.map((e) => e.message)).toEqual(sourceLines.slice(-entries.length));
    expect(entries[entries.length - 1].message).toBe(sourceLines[sourceLines.length - 1]);
  });

  it("reads across chunk boundaries for a large file", async () => {
    const big = path.join(tmpDir, "big.log");
    const lineCount = 1500;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      // 每行 ~80 字节，使文件 > 16KB 单 chunk
      lines.push("line-" + String(i).padStart(4, "0") + "-" + "x".repeat(64));
    }
    fs.writeFileSync(big, lines.join("\n") + "\n");

    const tail = 20;
    const entries = await readLogFileTail({ name: "big", filePath: big, lines: tail });
    // 尾部窗口保证覆盖目标行数，短行场景可能多保留；始终是真实行序列的尾部
    expect(entries.length).toBeGreaterThanOrEqual(tail);
    expect(entries.length).toBeLessThan(lines.length);
    expect(entries.map((e) => e.message)).toEqual(lines.slice(-entries.length));
    expect(entries[entries.length - 1].message).toBe(lines[lines.length - 1]);
    expect(entries[0].source).toBe("file:big");
  });

  it("filters tail entries by level", async () => {
    const file = path.join(tmpDir, "mixed.log");
    fs.writeFileSync(file, ["info a", "warning b", "info c", "error d"].join("\n") + "\n");
    const entries = await readLogFileTail({ name: "mixed", filePath: file, level: "error" });
    expect(entries.map((e) => e.message)).toEqual(["error d"]);
  });

  it("defaults lines to 200 and limits output", async () => {
    const file = path.join(tmpDir, "many.log");
    const lines: string[] = [];
    for (let i = 0; i < 300; i++) lines.push("m" + i);
    fs.writeFileSync(file, lines.join("\n") + "\n");
    const entries = await readLogFileTail({ name: "many", filePath: file, limit: 5 });
    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.message)).toEqual(lines.slice(-5));
  });
});
