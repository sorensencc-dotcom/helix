import { z } from "zod";
import type { IdentityEnvelope } from "../domain/identity.js";
import type { AdapterFailure } from "./contracts.js";

export const authorityReceipt = z
  .object({
    receiptId: z.string().min(1).max(128),
    correlationId: z
      .string()
      .regex(/^corr_[a-z0-9-]+$/)
      .max(128),
    identity: z
      .object({ sid: z.string().min(1), upn: z.string().min(1) })
      .strict(),
    channel: z.string().min(1).max(128),
    timestamp: z.string().datetime({ offset: true }),
    integrity: z.boolean(),
  })
  .strict();

export type AuthorityReceipt = z.infer<typeof authorityReceipt>;

export interface AdapterTransport<Request, Response> {
  send(
    request: Request,
    identity: IdentityEnvelope,
  ): Promise<Response | AdapterFailure>;
}

export class HttpAdapterTransport<
  Request extends object,
  Response,
> implements AdapterTransport<Request, Response> {
  public constructor(
    private readonly endpoint: string,
    private readonly parse: (value: unknown) => Response | AdapterFailure,
    private readonly timeoutMs = 10_000,
  ) {
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      throw new Error("CONFIG_INVALID_ADAPTER_ENDPOINT");
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
      throw new Error("CONFIG_INVALID_ADAPTER_TIMEOUT");
    }
  }

  public async send(
    request: Request,
    identity: IdentityEnvelope,
  ): Promise<Response | AdapterFailure> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, identity }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          status: "failure",
          code: "UNAVAILABLE",
          message: `Adapter returned HTTP ${response.status}.`,
        };
      }
      return this.parse(await response.json());
    } catch (error) {
      return {
        status: "failure",
        code:
          error instanceof Error && error.name === "AbortError"
            ? "TIMEOUT"
            : "UNAVAILABLE",
        message: "Adapter transport request failed.",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class UnavailableAdapterTransport<
  Request,
  Response,
> implements AdapterTransport<Request, Response> {
  public constructor(private readonly authority: string) {}

  public async send(
    _request: Request,
    _identity: IdentityEnvelope,
  ): Promise<Response | AdapterFailure> {
    return {
      status: "failure",
      code: "UNAVAILABLE",
      message: `${this.authority} transport is not configured.`,
    };
  }
}

export function bindReceipt(
  receipt: unknown,
  identity: IdentityEnvelope,
): AuthorityReceipt | AdapterFailure {
  const parsed = authorityReceipt.safeParse(receipt);
  if (!parsed.success) {
    return {
      status: "failure",
      code: "MALFORMED_RESPONSE",
      message: "Authority receipt failed the approved schema.",
    };
  }
  if (
    parsed.data.correlationId !== identity.helixSession.correlationId ||
    parsed.data.identity.sid !== identity.windows.sid
  ) {
    return {
      status: "failure",
      code: "DENIED",
      message: "Authority receipt identity does not match the Helix envelope.",
    };
  }
  return parsed.data;
}
