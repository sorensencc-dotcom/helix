export type HealthStatus = "ready" | "degraded";

export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: "helix";
  readonly version: string;
}

export function healthResponse(version: string): HealthResponse {
  return { status: "ready", service: "helix", version };
}
