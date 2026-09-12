import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface NativeDpapiBridge {
  protect(value: Uint8Array, scope: "user" | "machine"): Promise<Uint8Array>;
  unprotect(value: Uint8Array, scope: "user" | "machine"): Promise<Uint8Array>;
}

export class WindowsDpapiSessionKeyProvider {
  public constructor(
    private readonly bridge?: NativeDpapiBridge,
    private readonly scope: "user" | "machine" = "user",
  ) {}

  public async getOrCreateSessionKey(sessionId: string): Promise<Buffer> {
    if (!this.bridge || !sessionId) throw new Error("DPAPI_BRIDGE_REQUIRED");
    throw new Error("DPAPI_KEY_STORAGE_UNIMPLEMENTED");
  }

  public async deleteSessionKey(sessionId: string): Promise<void> {
    if (!this.bridge || !sessionId) throw new Error("DPAPI_BRIDGE_REQUIRED");
    throw new Error("DPAPI_KEY_STORAGE_UNIMPLEMENTED");
  }

  public async getKey(): Promise<Uint8Array> {
    throw new Error(`DPAPI_KEY_STORAGE_UNIMPLEMENTED:${this.scope}`);
  }
}

export interface ResponseLike {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export class CurlNegotiateFetch {
  public constructor(
    private readonly executable = "curl.exe",
    private readonly timeoutMs = 10_000,
    private readonly maxOutputBytes = 1_048_576,
  ) {}

  public async fetch(url: string): Promise<ResponseLike> {
    if (process.platform !== "win32") throw new Error("WINDOWS_ONLY");
    const directory = await mkdtemp(join(tmpdir(), "helix-negotiate-"));
    const cookieJar = join(directory, "cookies.txt");
    try {
      const result = await this.run(url, cookieJar);
      return {
        ok: result.status >= 200 && result.status < 300,
        async json() {
          return JSON.parse(result.body);
        },
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private run(
    url: string,
    cookieJar: string,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.executable,
        [
          "--silent",
          "--show-error",
          "--negotiate",
          "-u",
          ":",
          "--cookie",
          cookieJar,
          "--cookie-jar",
          cookieJar,
          "--write-out",
          "\n%{http_code}",
          url,
        ],
        { windowsHide: true },
      );
      let output = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("NEGOTIATE_TIMEOUT"));
      }, this.timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (Buffer.byteLength(output) > this.maxOutputBytes) {
          child.kill();
          reject(new Error("NEGOTIATE_OUTPUT_TOO_LARGE"));
        }
      });
      child.on("error", () => {
        clearTimeout(timer);
        reject(new Error("NEGOTIATE_UNAVAILABLE"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error("NEGOTIATE_FAILED"));
        const match = output.match(/\n(\d{3})\s*$/);
        if (!match) return reject(new Error("NEGOTIATE_INVALID_RESPONSE"));
        resolve({
          status: Number(match[1]),
          body: output.slice(0, match.index).trimEnd(),
        });
      });
    });
  }
}
