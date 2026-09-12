import { createDaemon } from "./daemon/server.js";
import { loadConfig } from "./infrastructure/config.js";
import { SqliteTaskStore } from "./infrastructure/task-store.js";
import { createSessionService } from "./application/composition-root.js";
import { WindowsBridgePrincipalResolver } from "./adapters/windows-principal.js";
import {
  CurlNegotiateFetch,
  WindowsBridgeCryptoProvider,
} from "./platform/windows-integrations.js";
import { BridgeSupervisor } from "./platform/bridge-supervisor.js";

const config = loadConfig();

const bridgeSupervisor = new BridgeSupervisor({
  command: config.windowsBridgeCommand,
  env: {
    ...process.env,
    HELIX_WINDOWS_BRIDGE_PREFIX: `${config.windowsBridgeUrl}/`,
  },
  readyUrl: config.windowsBridgeUrl,
  onExit: (code, signal) => {
    console.error(
      `windows-bridge exited unexpectedly (code=${code}, signal=${signal}); shutting down`,
    );
    shutdown();
  },
});
await bridgeSupervisor.start();

const taskStore = new SqliteTaskStore(config.taskDatabasePath);
const negotiateFetch = new CurlNegotiateFetch();
const cryptoProvider = new WindowsBridgeCryptoProvider(
  config.windowsBridgeUrl,
  (url, init) => negotiateFetch.fetch(url, init),
);
const principalResolver = new WindowsBridgePrincipalResolver(
  `${config.windowsBridgeUrl}/v1/principal`,
  (url) => negotiateFetch.fetch(url),
);
const composition = createSessionService(config, cryptoProvider);
const server = createDaemon(config, {
  taskStore,
  sessionService: composition.service,
  resolvePrincipal: principalResolver,
});
server.listen(config.port, config.host);

function shutdown(): void {
  bridgeSupervisor.stop();
  server.close(() => {
    composition.close();
    taskStore.close();
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
