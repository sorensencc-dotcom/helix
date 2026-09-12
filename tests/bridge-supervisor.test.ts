import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  BridgeSupervisor,
  splitCommandLine,
} from "../src/platform/bridge-supervisor.js";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function writeScript(
  body: string,
): Promise<{ command: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "helix-bridge-supervisor-"));
  const path = join(dir, "bridge.js");
  await writeFile(path, body, "utf8");
  return {
    command: `"${process.execPath}" "${path}"`,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

describe("splitCommandLine", () => {
  it("splits plain args on whitespace", () => {
    expect(splitCommandLine("node script.js")).toEqual(["node", "script.js"]);
  });

  it("keeps quoted segments with spaces intact", () => {
    expect(
      splitCommandLine('dotnet "C:\\path with spaces\\bridge.dll"'),
    ).toEqual(["dotnet", "C:\\path with spaces\\bridge.dll"]);
  });
});

describe("BridgeSupervisor", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) await cleanup();
    }
  });

  it("becomes ready once the bridge process opens its listener", async () => {
    const port = await freePort();
    const script = await writeScript(
      `require('net').createServer((s)=>s.end()).listen(${port}, '127.0.0.1');`,
    );
    cleanups.push(script.cleanup);
    const supervisor = new BridgeSupervisor({
      command: script.command,
      readyUrl: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 5000,
      readyPollIntervalMs: 50,
    });
    await expect(supervisor.start()).resolves.toBeUndefined();
    expect(supervisor.isRunning()).toBe(true);
    supervisor.stop();
    expect(supervisor.isRunning()).toBe(false);
  });

  it("fails closed with BRIDGE_EXITED_BEFORE_READY when the process exits before opening its listener", async () => {
    const port = await freePort();
    const script = await writeScript("process.exit(1);");
    cleanups.push(script.cleanup);
    const supervisor = new BridgeSupervisor({
      command: script.command,
      readyUrl: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 2000,
      readyPollIntervalMs: 50,
    });
    await expect(supervisor.start()).rejects.toThrow(
      "BRIDGE_EXITED_BEFORE_READY",
    );
    expect(supervisor.isRunning()).toBe(false);
  });

  it("reports unexpected exits that happen after a successful start", async () => {
    const port = await freePort();
    const script = await writeScript(
      `require('net').createServer((s)=>s.end()).listen(${port}, '127.0.0.1');\nsetTimeout(() => process.exit(1), 200);`,
    );
    cleanups.push(script.cleanup);
    let exitInfo:
      { code: number | null; signal: NodeJS.Signals | null } | undefined;
    const supervisor = new BridgeSupervisor({
      command: script.command,
      readyUrl: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 5000,
      readyPollIntervalMs: 50,
      onExit: (code, signal) => {
        exitInfo = { code, signal };
      },
    });
    await supervisor.start();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(exitInfo?.code).toBe(1);
    expect(supervisor.isRunning()).toBe(false);
  });

  it("does not report exit when stop() was called deliberately", async () => {
    const port = await freePort();
    const script = await writeScript(
      `require('net').createServer((s)=>s.end()).listen(${port}, '127.0.0.1');`,
    );
    cleanups.push(script.cleanup);
    let exited = false;
    const supervisor = new BridgeSupervisor({
      command: script.command,
      readyUrl: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 5000,
      readyPollIntervalMs: 50,
      onExit: () => {
        exited = true;
      },
    });
    await supervisor.start();
    supervisor.stop();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(exited).toBe(false);
  });

  it("supports a stop-then-restart cycle against the same listener contract", async () => {
    const port = await freePort();
    const script = await writeScript(
      `require('net').createServer((s)=>s.end()).listen(${port}, '127.0.0.1');`,
    );
    cleanups.push(script.cleanup);
    const first = new BridgeSupervisor({
      command: script.command,
      readyUrl: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 5000,
      readyPollIntervalMs: 50,
    });
    await first.start();
    first.stop();
    expect(first.isRunning()).toBe(false);

    const second = new BridgeSupervisor({
      command: script.command,
      readyUrl: `http://127.0.0.1:${port}`,
      readyTimeoutMs: 5000,
      readyPollIntervalMs: 50,
    });
    await expect(second.start()).resolves.toBeUndefined();
    expect(second.isRunning()).toBe(true);
    second.stop();
  });
});
