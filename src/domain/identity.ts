import { z } from "zod";

export const windowsOperatorIdentity = z
  .object({
    sid: z.string().min(1),
    upn: z.string().min(1),
    groups: z.array(z.string().min(1)).max(256),
  })
  .strict();

export const helixSessionIdentity = z
  .object({
    sessionId: z.string().min(1).max(128),
    correlationId: z
      .string()
      .regex(/^corr_[a-z0-9-]+$/)
      .max(128),
    createdAt: z.string().datetime({ offset: true }),
    governed: z.boolean(),
  })
  .strict();

export const identityEnvelope = z
  .object({
    windows: windowsOperatorIdentity,
    helixSession: helixSessionIdentity,
    icf: z
      .object({ id: z.string().min(1), version: z.string().min(1) })
      .strict()
      .optional(),
    sigil: z
      .object({ id: z.string().min(1), version: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();

export type IdentityEnvelope = z.infer<typeof identityEnvelope>;

export function createIdentityEnvelope(
  windows: unknown,
  session: unknown,
  authorities?: {
    icf?: { id: string; version: string };
    sigil?: { id: string; version: string };
  },
): IdentityEnvelope {
  return identityEnvelope.parse({
    windows,
    helixSession: session,
    ...authorities,
  });
}
