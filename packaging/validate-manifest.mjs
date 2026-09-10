import { readFile } from "node:fs/promises";

const manifest = await readFile(new URL("./AppxManifest.xml", import.meta.url), "utf8");
const required = ["<Identity ", "<Applications>", "<Application ", "Version=\"0.1.0.0\""];
const missing = required.filter((value) => !manifest.includes(value));
if (missing.length > 0) {
  console.error(`manifest missing required fields: ${missing.join(", ")}`);
  process.exit(1);
}
if (!manifest.includes("UNSIGNED-HELIX")) {
  console.error("manifest must remain explicitly unsigned until a publisher identity is supplied");
  process.exit(1);
}
console.log("unsigned MSIX manifest validation passed");
