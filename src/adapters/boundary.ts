import { timingSafeEqual } from "node:crypto";
import { adapterVersion, type AdapterFailure } from "./contracts.js";
import { z } from "zod";

export type AdapterKind = "icf" | "whichllm" | "sigil";

export interface AdapterOffer {
  readonly kind: AdapterKind;
  readonly contract: typeof adapterVersion;
  readonly authentication: "bearer";
}

export type BoundaryResult =
  | { readonly ok: true; readonly offer: AdapterOffer }
  | { readonly ok: false; readonly error: AdapterFailure };

const offerSchema = z
  .object({
    kind: z.enum(["icf", "whichllm", "sigil"]),
    contract: z.literal(adapterVersion),
    authentication: z.literal("bearer"),
  })
  .strict();

function denied(code: AdapterFailure["code"], message: string): BoundaryResult {
  return { ok: false, error: { status: "failure", code, message } };
}

export function negotiateAdapter(
  offer: unknown,
  expected: AdapterKind,
): BoundaryResult {
  const parsed = offerSchema.safeParse(offer);
  if (!parsed.success) {
    if (
      offer &&
      typeof offer === "object" &&
      (offer as Record<string, unknown>).contract !== adapterVersion
    ) {
      return denied(
        "VERSION_MISMATCH",
        "Adapter contract version is not supported.",
      );
    }
    return denied(
      "MALFORMED_RESPONSE",
      "Adapter negotiation response is malformed.",
    );
  }
  if (parsed.data.kind !== expected) {
    return denied(
      "CONTRACT_UNAVAILABLE",
      "Adapter offer is not approved for this boundary.",
    );
  }
  return { ok: true, offer: parsed.data };
}

export function authenticateBearer(
  expectedToken: string,
  presentedToken: string,
): boolean {
  if (!expectedToken || !presentedToken) return false;
  const expected = Buffer.from(expectedToken, "utf8");
  const presented = Buffer.from(presentedToken, "utf8");
  return (
    expected.length === presented.length && timingSafeEqual(expected, presented)
  );
}
