import { z } from "zod";
import { identityEnvelope } from "../domain/identity.js";

export const adapterVersion = "helix-adapter.v1" as const;

const baseRequest = z
  .object({
    contract: z.literal(adapterVersion),
    correlationId: z
      .string()
      .max(128)
      .regex(/^corr_[a-z0-9-]+$/),
    identity: identityEnvelope,
  })
  .strict();

const failure = z
  .object({
    status: z.literal("failure"),
    code: z.enum([
      "TIMEOUT",
      "UNAVAILABLE",
      "MALFORMED_RESPONSE",
      "DENIED",
      "VERSION_MISMATCH",
      "CONTRACT_UNAVAILABLE",
    ]),
    message: z.string().min(1),
  })
  .strict();

export const icfRequest = baseRequest
  .extend({ query: z.string().min(1).max(20_000), governed: z.boolean() })
  .strict();

export function isUsableIcfContext(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export const icfSuccess = z
  .object({
    contract: z.literal(adapterVersion),
    status: z.literal("success"),
    sources: z.array(z.string().min(1)).max(100),
    governed: z.boolean(),
    lineageId: z.string().min(1),
    context: z.unknown().optional(),
    contextPacket: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !isUsableIcfContext(value.contextPacket) &&
      !isUsableIcfContext(value.context)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ICF success response must include usable context.",
      });
    }
  });
export const icfResponse = z.union([icfSuccess, failure]);

export const whichLlmRequest = baseRequest
  .extend({
    taskClass: z.enum(["conversation", "governed"]),
    cloudEnabled: z.boolean(),
  })
  .strict();
export const whichLlmSuccess = z
  .object({
    contract: z.literal(adapterVersion),
    status: z.literal("success"),
    provider: z.string().min(1),
    model: z.string().min(1),
    availableModels: z.array(z.string().min(1)).optional(),
    cloudEnabled: z.boolean(),
  })
  .strict();
export const whichLlmResponse = z.union([whichLlmSuccess, failure]);

export const sigilRequest = baseRequest
  .extend({
    capability: z.string().regex(/^sigil\.[a-z0-9_.-]+$/),
    arguments: z
      .record(z.unknown())
      .refine((value) => Object.keys(value).length <= 64, "too many arguments"),
  })
  .strict();
export const sigilSuccess = z
  .object({
    contract: z.literal(adapterVersion),
    status: z.literal("success"),
    proposalId: z.string().regex(/^proposal_[a-z0-9-]+$/),
    state: z.enum(["APPROVAL_REQUIRED", "DENIED"]),
  })
  .strict();
export const sigilResponse = z.union([sigilSuccess, failure]);

export type AdapterFailure = z.infer<typeof failure>;
export type IcfRequest = z.infer<typeof icfRequest>;
export type WhichLlmRequest = z.infer<typeof whichLlmRequest>;
export type SigilRequest = z.infer<typeof sigilRequest>;

export function parseAdapterResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T | AdapterFailure {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  return {
    status: "failure",
    code: "MALFORMED_RESPONSE",
    message: "Adapter response failed the approved schema.",
  };
}
