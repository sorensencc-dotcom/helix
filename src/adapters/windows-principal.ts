import type { IncomingMessage } from "node:http";
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
