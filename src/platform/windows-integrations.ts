import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { SessionCryptoProvider } from "../infrastructure/session-store.js";

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

export interface RequestInitLike {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
}

export class CurlNegotiateFetch {
  public constructor(
    private readonly executable = "curl.exe",
    private readonly timeoutMs = 10_000,
    private readonly maxOutputBytes = 1_048_576,
  ) {}

  public async fetch(
    url: string,
    init?: RequestInitLike,
  ): Promise<ResponseLike> {
    if (process.platform !== "win32") throw new Error("WINDOWS_ONLY");
    const directory = await mkdtemp(join(tmpdir(), "helix-negotiate-"));
    const cookieJar = join(directory, "cookies.txt");
    try {
      const result = await this.run(url, cookieJar, init);
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
    init?: RequestInitLike,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const args = [
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
      ];
      if (init?.method && init.method !== "GET") {
        args.push("-X", init.method);
      }
      if (init?.body !== undefined) {
        args.push(
          "-H",
          "Content-Type: application/json",
          "--data",
          JSON.stringify(init.body),
        );
      }
      args.push(url);
      const child = spawn(this.executable, args, { windowsHide: true });
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

const DpapiCryptoContract = "helix.dpapi-crypto.v1";

export type AuthenticatedRequestFetch = (
  url: string,
  init?: RequestInitLike,
) => Promise<ResponseLike>;

/**
 * Native-bridge-backed SessionCryptoProvider: delegates to the
 * helix.dpapi-crypto.v1 endpoints. No key material is ever held here -- the
 * bridge protects/unprotects under DataProtectionScope.CurrentUser, keyed to
 * the sessionId as DPAPI entropy.
 */
export class WindowsBridgeCryptoProvider implements SessionCryptoProvider {
  public constructor(
    private readonly bridgeUrl: string,
    private readonly authenticatedFetch: AuthenticatedRequestFetch,
  ) {}

  public async encrypt(sessionId: string, plaintext: string): Promise<string> {
    const body = await this.call("encrypt", {
      contract: DpapiCryptoContract,
      sessionId,
      plaintext: Buffer.from(plaintext, "utf8").toString("base64"),
    });
    if (typeof body.ciphertext !== "string") {
      throw new Error("DPAPI_BRIDGE_RESPONSE_INVALID");
    }
    return body.ciphertext;
  }

  public async decrypt(sessionId: string, ciphertext: string): Promise<string> {
    const body = await this.call("decrypt", {
      contract: DpapiCryptoContract,
      sessionId,
      ciphertext,
    });
    if (typeof body.plaintext !== "string") {
      throw new Error("DPAPI_BRIDGE_RESPONSE_INVALID");
    }
    return Buffer.from(body.plaintext, "base64").toString("utf8");
  }

  private async call(
    path: "encrypt" | "decrypt",
    requestBody: unknown,
  ): Promise<Record<string, unknown>> {
    let response: ResponseLike;
    try {
      response = await this.authenticatedFetch(
        `${this.bridgeUrl}/v1/crypto/${path}`,
        { method: "POST", body: requestBody },
      );
    } catch {
      throw new Error("DPAPI_BRIDGE_UNAVAILABLE");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("DPAPI_BRIDGE_RESPONSE_INVALID");
    }
    if (
      typeof body !== "object" ||
      body === null ||
      (body as { contract?: unknown }).contract !== DpapiCryptoContract
    ) {
      throw new Error("DPAPI_BRIDGE_RESPONSE_INVALID");
    }
    if (!response.ok) {
      const code = (body as { error?: unknown }).error;
      throw new Error(
        `DPAPI_BRIDGE_${typeof code === "string" ? code : "REQUEST_FAILED"}`,
      );
    }
    return body as Record<string, unknown>;
  }
}
