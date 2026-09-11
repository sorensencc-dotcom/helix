import { createDaemon } from "./daemon/server.js";
import { loadConfig } from "./infrastructure/config.js";
import { SqliteTaskStore } from "./infrastructure/task-store.js";

const config = loadConfig();
const taskStore = new SqliteTaskStore(config.taskDatabasePath);
const server = createDaemon(config, { taskStore });
server.listen(config.port, config.host);

function shutdown(): void {
  server.close(() => taskStore.close());
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
