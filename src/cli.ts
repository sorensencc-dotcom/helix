#!/usr/bin/env node
import { loadConfig } from "./infrastructure/config.js";

const command = process.argv[2] ?? "status";
const config = loadConfig();
const result =
  command === "status" || command === "doctor"
    ? {
        command,
        status: "READY",
        endpoint: `http://${config.host}:${config.port}`,
        version: config.version,
      }
    : {
        command,
        status: "UNSUPPORTED",
        message:
          "Lifecycle command requires the installed Windows service adapter.",
      };
console.log(JSON.stringify(result));
