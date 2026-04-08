/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";
import http from "http";
import net from "net";
import { spawn } from "child_process";
import { EventEmitter } from "events";
import { waitForServer, checkOpenCodeInstalled, isPortAvailable } from "../../src/utils/system.js";

vi.mock("http");
vi.mock("net");
vi.mock("child_process");

describe("system utility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("waitForServer", () => {
    it("should resolve when server is ready", async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;

      vi.mocked(http.get).mockImplementation(((url: any, cb: any) => {
        setTimeout(() => cb(mockRes), 10);
        return mockReq as any;
      }) as any);

      await expect(waitForServer("http://127.0.0.1", 1000)).resolves.toBeUndefined();
    });

    it("should retry and resolve if server becomes ready", async () => {
      const mockReq = new EventEmitter();
      const mockRes = new EventEmitter() as any;

      let attempts = 0;
      vi.mocked(http.get).mockImplementation(((url: any, cb: any) => {
        attempts++;
        if (attempts === 1) {
          setTimeout(() => mockReq.emit("error", new Error("conn refused")), 10);
        } else {
          mockRes.statusCode = 200;
          setTimeout(() => cb(mockRes), 10);
        }
        return mockReq as any;
      }) as any);

      await expect(waitForServer("http://127.0.0.1", 1000)).resolves.toBeUndefined();
      expect(attempts).toBeGreaterThan(1);
    });
  });

  describe("checkOpenCodeInstalled", () => {
    it("should return true if process exits with 0", async () => {
      const mockProc = new EventEmitter() as any;
      vi.mocked(spawn).mockReturnValue(mockProc);

      const promise = checkOpenCodeInstalled();
      setTimeout(() => mockProc.emit("close", 0), 10);

      await expect(promise).resolves.toBe(true);
    });

    it("should return false if process exits with non-zero", async () => {
      const mockProc = new EventEmitter() as any;
      vi.mocked(spawn).mockReturnValue(mockProc);

      const promise = checkOpenCodeInstalled();
      setTimeout(() => mockProc.emit("close", 1), 10);

      await expect(promise).resolves.toBe(false);
    });

    it("should return false if process errors", async () => {
      const mockProc = new EventEmitter() as any;
      vi.mocked(spawn).mockReturnValue(mockProc);

      const promise = checkOpenCodeInstalled();
      setTimeout(() => mockProc.emit("error", new Error("ENOENT")), 10);

      await expect(promise).resolves.toBe(false);
    });
  });

  describe("isPortAvailable", () => {
    it("should return true if server can listen", async () => {
      const mockServer = new EventEmitter() as any;
      mockServer.listen = vi.fn();
      mockServer.close = vi.fn();
      vi.mocked(net.createServer).mockReturnValue(mockServer);

      const promise = isPortAvailable(8080);
      setTimeout(() => mockServer.emit("listening"), 10);

      await expect(promise).resolves.toBe(true);
      expect(mockServer.close).toHaveBeenCalled();
    });

    it("should return false if server emits error", async () => {
      const mockServer = new EventEmitter() as any;
      mockServer.listen = vi.fn();
      vi.mocked(net.createServer).mockReturnValue(mockServer);

      const promise = isPortAvailable(8080);
      setTimeout(() => mockServer.emit("error", new Error("EADDRINUSE")), 10);

      await expect(promise).resolves.toBe(false);
    });
  });
});
