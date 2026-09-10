export type Identity = {
  readonly windows: string;
  readonly icf?: string;
  readonly sigil?: string;
};
export type Capability =
  "context.read" | "source.list" | "status.read" | "evidence.read";

const allowed = new Set<Capability>([
  "context.read",
  "source.list",
  "status.read",
  "evidence.read",
]);

export function authorize(
  capability: string,
  identity: Identity,
  scope: string,
): boolean {
  return (
    allowed.has(capability as Capability) &&
    identity.windows.length > 0 &&
    scope.trim().length > 0
  );
}

export function redact(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/(Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
      .replace(/(password|secret|token)=([^&\s]+)/gi, "$1=[REDACTED]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        /password|secret|token|credential/i.test(key) ? key : key,
        /password|secret|token|credential/i.test(key)
          ? "[REDACTED]"
          : redact(item),
      ]),
    );
  return value;
}
