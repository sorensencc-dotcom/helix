import type { IncomingMessage } from "node:http";
import { z } from "zod";
import {
  windowsOperatorIdentity,
  type IdentityEnvelope,
} from "../domain/identity.js";
import type { WindowsPrincipalResolver } from "../daemon/auth.js";

export type WindowsOperator = IdentityEnvelope["windows"];

/**
 * Host-owned IIS/HTTP.sys identity bridge.
 *
 * The bridge is the only component allowed to read the native authenticated
 * principal. Helix deliberately does not inspect request headers or fabricate
 * a Windows identity.
 */
export type HostPrincipalReader = (
  request: IncomingMessage,
) => WindowsOperator | undefined | Promise<WindowsOperator | undefined>;

export class WindowsAuthenticationError extends Error {
  public constructor(
    public readonly code: "WINDOWS_AUTH_REQUIRED" | "WINDOWS_IDENTITY_INVALID",
  ) {
    super(code);
    this.name = "WindowsAuthenticationError";
  }
}

export class IisHttpSysPrincipalResolver implements WindowsPrincipalResolver {
  public constructor(
    private readonly readHostPrincipal?: HostPrincipalReader,
  ) {}

  public async resolve(request: IncomingMessage): Promise<WindowsOperator> {
    if (!this.readHostPrincipal) {
      throw new WindowsAuthenticationError("WINDOWS_AUTH_REQUIRED");
    }

    const principal = await this.readHostPrincipal(request);
    const parsed = windowsOperatorIdentity.safeParse(principal);
    if (!parsed.success) {
      throw new WindowsAuthenticationError("WINDOWS_IDENTITY_INVALID");
    }
    return parsed.data;
  }
}

const windowsBridgeResponse = z
  .object({
    contract: z.literal("helix.windows-principal.v1"),
    identity: windowsOperatorIdentity,
  })
  .strict();

export function parseWindowsBridgeResponse(value: unknown): WindowsOperator {
  const parsed = windowsBridgeResponse.safeParse(value);
  if (!parsed.success) {
    throw new WindowsAuthenticationError("WINDOWS_IDENTITY_INVALID");
  }
  return parsed.data.identity;
}

/**
 * An already-authenticated fetch (e.g. Negotiate/SSPI credentials attached by
 * the caller). This resolver never attaches credentials or reads headers
 * itself -- the native `windows-bridge` process owns authentication.
 */
export type AuthenticatedFetch = (url: string) => Promise<{
  readonly ok: boolean;
  json(): Promise<unknown>;
}>;

export class WindowsBridgePrincipalResolver implements WindowsPrincipalResolver {
  public constructor(
    private readonly bridgeUrl: string,
    private readonly authenticatedFetch?: AuthenticatedFetch,
  ) {}

  public async resolve(): Promise<WindowsOperator> {
    if (!this.authenticatedFetch) {
      throw new WindowsAuthenticationError("WINDOWS_AUTH_REQUIRED");
    }

    let response: { readonly ok: boolean; json(): Promise<unknown> };
    try {
      response = await this.authenticatedFetch(this.bridgeUrl);
    } catch {
      throw new WindowsAuthenticationError("WINDOWS_AUTH_REQUIRED");
    }
    if (!response.ok) {
      throw new WindowsAuthenticationError("WINDOWS_AUTH_REQUIRED");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WindowsAuthenticationError("WINDOWS_IDENTITY_INVALID");
    }
    return parseWindowsBridgeResponse(body);
  }
}
