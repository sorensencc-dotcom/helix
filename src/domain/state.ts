export type OperationalState =
  | "READY"
  | "DEGRADED"
  | "QUEUED"
  | "APPROVAL_REQUIRED"
  | "MODEL_UNAVAILABLE"
  | "DENIED"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";
const transitions: Record<OperationalState, readonly OperationalState[]> = {
  READY: ["DEGRADED", "QUEUED", "APPROVAL_REQUIRED", "COMPLETED", "FAILED"],
  DEGRADED: ["READY", "QUEUED", "FAILED"],
  QUEUED: ["COMPLETED", "DENIED", "EXPIRED", "CANCELLED", "FAILED"],
  APPROVAL_REQUIRED: ["QUEUED", "DENIED", "CANCELLED"],
  MODEL_UNAVAILABLE: ["READY", "FAILED"],
  DENIED: [],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: [],
};
export function canTransition(
  from: OperationalState,
  to: OperationalState,
): boolean {
  return transitions[from].includes(to);
}
