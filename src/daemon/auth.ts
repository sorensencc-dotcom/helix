import type { IncomingMessage } from "node:http";
import {
  createIdentityEnvelope,
  type IdentityEnvelope,
} from "../domain/identity.js";

export interface WindowsPrincipalResolver {
  resolve(request: IncomingMessage): Promise<unknown>;
}

export interface DaemonAuthContext {
  readonly identity: IdentityEnvelope;
}

export async function authenticateRequest(
  request: IncomingMessage,
  resolver: WindowsPrincipalResolver,
  session: unknown,
): Promise<DaemonAuthContext> {
  const windows = await resolver.resolve(request);
  return { identity: createIdentityEnvelope(windows, session) };
}
