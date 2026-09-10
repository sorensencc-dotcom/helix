import type { ContextPacket, ModelDecision } from "../domain/contracts.js";
export interface IcfPort {
  retrieve(query: string): Promise<ContextPacket>;
  recordEvidence(id: string): Promise<void>;
}
export interface WhichLlmPort {
  select(cloudEnabled: boolean): Promise<ModelDecision>;
}
export interface SigilPort {
  propose(
    capability: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{
    readonly id: string;
    readonly state: "APPROVAL_REQUIRED" | "DENIED";
  }>;
}

export const contractVersion = "v1" as const;
