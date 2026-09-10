import { createDaemon } from "./daemon/server.js";
import { loadConfig } from "./infrastructure/config.js";

const config = loadConfig();
const server = createDaemon(config);
server.listen(config.port, config.host);
