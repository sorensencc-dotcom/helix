import { z } from "zod";

export function isLoopbackHost(value: string): boolean {
  return (
    value === "127.0.0.1" ||
    value === "localhost" ||
    value === "::1" ||
    (Boolean(process.env.HELIX_CONTAINER_MODE) && value === "0.0.0.0")
  );
}

const configSchema = z.object({
  host: z
    .string()
    .refine(isLoopbackHost, "HELIX_HOST must be loopback")
    .default("127.0.0.1"),
  port: z.coerce.number().int().min(1).max(65_535).default(8787),
  version: z.string().min(1).default("0.1.0"),
  taskDatabasePath: z.string().min(1).default("helix.sqlite"),
  icfResolveUrl: z.string().url().optional(),
  kbSyncKnowledgeDbPath: z.string().min(1).optional(),
  sigilExecuteUrl: z.string().url().optional(),
  whichLlmUrl: z.string().url().optional(),
  whichLlmArtifactPath: z.string().min(1).optional(),
  ollamaUrl: z.string().url().optional(),
  windowsBridgeUrl: z.string().url(),
  windowsBridgeCommand: z.string().min(1),
});

export type HelixConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HelixConfig {
  if (!env.HELIX_WINDOWS_BRIDGE_URL) {
    throw new Error("WINDOWS_BRIDGE_URL_REQUIRED");
  }
  if (!env.HELIX_WINDOWS_BRIDGE_COMMAND) {
    throw new Error("WINDOWS_BRIDGE_COMMAND_REQUIRED");
  }
  return configSchema.parse({
    host: env.HELIX_HOST,
    port: env.HELIX_PORT,
    version: env.HELIX_VERSION,
    taskDatabasePath: env.HELIX_TASK_DATABASE_PATH,
    windowsBridgeUrl: env.HELIX_WINDOWS_BRIDGE_URL,
    windowsBridgeCommand: env.HELIX_WINDOWS_BRIDGE_COMMAND,
    ...(env.HELIX_ICF_RESOLVE_URL
      ? { icfResolveUrl: env.HELIX_ICF_RESOLVE_URL }
      : {}),
    ...(env.HELIX_KB_SYNC_DB_PATH
      ? { kbSyncKnowledgeDbPath: env.HELIX_KB_SYNC_DB_PATH }
      : {}),
    ...(env.HELIX_SIGIL_EXECUTE_URL
      ? { sigilExecuteUrl: env.HELIX_SIGIL_EXECUTE_URL }
      : {}),
    ...(env.HELIX_WHICHLLM_URL ? { whichLlmUrl: env.HELIX_WHICHLLM_URL } : {}),
    ...(env.HELIX_WHICHLLM_ARTIFACT_PATH
      ? { whichLlmArtifactPath: env.HELIX_WHICHLLM_ARTIFACT_PATH }
      : {}),
    ...(env.HELIX_OLLAMA_URL ? { ollamaUrl: env.HELIX_OLLAMA_URL } : {}),
  });
}
