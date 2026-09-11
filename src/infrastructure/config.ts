import { z } from "zod";

export function isLoopbackHost(value: string): boolean {
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

const configSchema = z.object({
  host: z
    .string()
    .refine(isLoopbackHost, "HELIX_HOST must be loopback")
    .default("127.0.0.1"),
  port: z.coerce.number().int().min(1).max(65_535).default(8787),
  version: z.string().min(1).default("0.1.0"),
  taskDatabasePath: z.string().min(1).default("helix.sqlite"),
});

export type HelixConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HelixConfig {
  return configSchema.parse({
    host: env.HELIX_HOST,
    port: env.HELIX_PORT,
    version: env.HELIX_VERSION,
    taskDatabasePath: env.HELIX_TASK_DATABASE_PATH,
  });
}
