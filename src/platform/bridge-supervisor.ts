import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";

/**
 * Splits a command line into argv, honoring double-quoted segments so a
 * configured command like `dotnet "C:\path with spaces\bridge.dll"` parses
 * as two argv entries rather than four.
 */
export function splitCommandLine(command: string): string[] {
  const matches = command.match(/"[^"]*"|\S+/g) ?? [];
  return matches.map((token) =>
    token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token,
  );
}

function tcpReady(url: string, timeoutMs: number): Promise<boolean> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({
      host: hostname,
      port: Number(port),
      timeout: timeoutMs,
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export interface BridgeSupervisorOptions {
  readonly command: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly readyUrl: string;
  readonly readyTimeoutMs?: number;
  readonly readyPollIntervalMs?: number;
  readonly onExit?: (
    code: number | null,
    signal: NodeJS.Signals | null,
  ) => void;
}

/**
 * Supervises the native windows-bridge process: spawns it, waits for its
 * loopback listener to accept connections before declaring readiness, and
 * reports unexpected exits so the daemon can fail closed rather than keep
 * serving requests against a dead bridge.
 */
export class BridgeSupervisor {
  private child: ChildProcess | null = null;
  private stopCurrent: (() => void) | null = null;

  public constructor(private readonly options: BridgeSupervisorOptions) {}

  public async start(): Promise<void> {
    if (this.child) throw new Error("BRIDGE_ALREADY_STARTED");
    const [command, ...args] = splitCommandLine(this.options.command);
    if (!command) throw new Error("BRIDGE_COMMAND_INVALID");
    const child = spawn(command, args, {
      windowsHide: true,
      env: this.options.env ?? process.env,
    });
    let stoppedDeliberately = false;
    this.child = child;
    this.stopCurrent = () => {
      stoppedDeliberately = true;
      child.kill();
    };
    // Closures capture `child` rather than reading `this.child`, so a
    // stale handler from a killed process can never clobber a since-spawned
    // replacement (this.child is only cleared when it still points at us).
    child.on("exit", (code, signal) => {
      if (this.child === child) this.child = null;
      if (!stoppedDeliberately) this.options.onExit?.(code, signal);
    });
    child.on("error", () => {
      if (this.child === child) this.child = null;
    });
    await this.waitUntilReady(child);
  }

  private async waitUntilReady(child: ChildProcess): Promise<void> {
    const timeoutMs = this.options.readyTimeoutMs ?? 10_000;
    const intervalMs = this.options.readyPollIntervalMs ?? 100;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.child !== child) throw new Error("BRIDGE_EXITED_BEFORE_READY");
      if (await tcpReady(this.options.readyUrl, intervalMs)) return;
    }
    this.stop();
    throw new Error("BRIDGE_READY_TIMEOUT");
  }

  public stop(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
    this.child = null;
  }

  public isRunning(): boolean {
    return this.child !== null;
  }
}
