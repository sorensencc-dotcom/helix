import { z } from "zod";

const configSchema = z.object({
  host: z.string().min(1).default("127.0.0.1"),
  port: z.coerce.number().int().min(1).max(65_535).default(8787),
  version: z.string().min(1).default("0.1.0"),
});

export type HelixConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HelixConfig {
  return configSchema.parse({
    host: env.HELIX_HOST,
    port: env.HELIX_PORT,
    version: env.HELIX_VERSION,
  });
}
