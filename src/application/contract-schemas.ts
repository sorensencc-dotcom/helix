import { z } from "zod";

const correlationId = z.string().min(1).max(128);
const taskCorrelationId = z
  .string()
  .regex(/^corr_[a-z0-9-]+$/)
  .max(128);
const governanceState = z.enum(["ordinary", "governed"]);
const persistenceMode = z.enum(["encrypted-sqlite", "ram-only"]);
const retrievalState = z.enum(["success", "degraded", "fail-closed"]);
const overrideState = z.enum(["auto", "operator"]);

export const modelDecisionSchema = z
  .object({
    selectedModel: z.string().min(1).max(256),
    availableModels: z.array(z.string().min(1).max(256)).max(100),
    reason: z.string().min(1).max(2_000),
    overrideStatus: overrideState,
  })
  .strict();

export const effectiveScopeSchema = z
  .object({
    governanceState,
    sourceSelection: z.enum(["automatic", "constrained"]),
    requestedSources: z.array(z.string().min(1).max(512)).max(100).optional(),
    sourcesUsed: z.array(z.string().min(1).max(512)).max(100),
    sourceState: retrievalState,
  })
  .strict();

export const responseDisclosureSchema = z
  .object({
    governed: z.boolean(),
    governanceState,
    persistenceMode,
    sourceState: retrievalState,
    overrideState,
    sourcesUsed: z.array(z.string().min(1).max(512)).max(100),
    lineageId: z.string().min(1).max(256).optional(),
  })
  .strict();

export const approvalMetadataSchema = z
  .object({
    proposedAction: z.unknown().optional(),
    approvalState: z.enum([
      "not-required",
      "approval-required",
      "denied",
      "unknown",
    ]),
    receiptState: z.enum(["persisted", "unpersisted", "unknown"]),
    sigilReference: z.unknown().optional(),
  })
  .strict();

export const responseResultSchema = z
  .object({
    correlationId,
    answer: z.unknown(),
    proposedActions: z.array(z.unknown()).max(100).optional(),
    sourcesUsed: z.array(z.string().min(1).max(512)).max(100),
    modelUsed: z.string().min(1).max(256),
    confidence: z.number().finite().min(0).max(1).optional(),
    lineageId: z.string().min(1).max(256).optional(),
    stateDisclosures: z
      .object({
        persistenceMode,
        sourceState: retrievalState,
        overrideState,
      })
      .strict(),
  })
  .strict();

export const daemonResponseSchema = z
  .object({
    correlationId,
    answer: z.unknown(),
    sourcesUsed: z.array(z.string().min(1).max(512)).max(100),
    modelUsed: z.string().min(1).max(256),
    confidence: z.number().finite().min(0).max(1).optional(),
    lineageId: z.string().min(1).max(256).optional(),
    governanceState,
    persistenceMode,
    proposedActions: z.array(z.unknown()).max(100).optional(),
    modelDecision: modelDecisionSchema,
    effectiveScope: effectiveScopeSchema,
    responseDisclosure: responseDisclosureSchema,
  })
  .strict();

export const windowsOperatorSchema = z
  .object({
    sid: z.string().min(1).max(256),
    upn: z.string().min(1).max(512).optional(),
    groups: z.array(z.string().min(1).max(512)).max(256),
  })
  .strict();

export const taskMetadataSchema = z
  .object({
    taskId: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128),
    operator: windowsOperatorSchema,
    ...approvalMetadataSchema.shape,
  })
  .strict();

export const storedTaskSchema = z
  .object({
    id: z.string().min(1).max(128),
    state: z.enum(["QUEUED", "CANCELLED", "COMPLETED", "FAILED"]),
    sessionId: z.string().min(1).max(128),
    correlationId: taskCorrelationId,
    response: daemonResponseSchema.optional(),
    metadata: taskMetadataSchema.optional(),
  })
  .strict();

export type ContractModelDecision = z.infer<typeof modelDecisionSchema>;
export type ContractEffectiveScope = z.infer<typeof effectiveScopeSchema>;
export type ContractResponseDisclosure = z.infer<
  typeof responseDisclosureSchema
>;
export type ContractApprovalMetadata = z.infer<typeof approvalMetadataSchema>;
export type ContractDaemonResponse = z.infer<typeof daemonResponseSchema>;
export type ContractTaskMetadata = z.infer<typeof taskMetadataSchema>;
